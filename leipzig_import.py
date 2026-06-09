"""
Leipzig Corpus ETL — downloads Leipzig Wortschatz corpora for all app languages,
scores sentences with GDEX-inspired criteria, and bulk-loads into:
  • corpus_sentences   — quality example sentences (searched at query time)
  • frequency_lemmas   — shared with OpenSubtitles import
  • frequency_entries  — Leipzig word frequencies as a second source

Usage:
    python leipzig_import.py [--langs en,de,fr] [--limit 50000] [--freq-limit 5000]

Options:
    --langs       Comma-separated language codes (default: all)
    --limit       Max sentences to keep per language after scoring (default: 50000)
    --freq-limit  Max words to import into frequency_entries (default: 5000)

Requirements: psycopg2-binary, requests, python-dotenv
"""

import argparse
import io
import re
import sys
import tarfile
import tempfile
import unicodedata
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from os import environ

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv()

DB_URL = (
    f"postgresql://{environ['DATABASE_ROOT_USER']}:{environ['DATABASE_ROOT_PASSWORD']}"
    f"@{environ['DATABASE_URL']}:{environ['DATABASE_PORT']}/{environ['DATABASE_NAME']}"
)

LANGUAGES = {
    "en":  "English",
    "es":  "Spanish",
    "fr":  "French",
    "de":  "German",
    "it":  "Italian",
    "ru":  "Russian",
    "he":  "Hebrew",
    "ar":  "Arabic",
    "arz": "Egyptian Arabic",
    "ja":  "Japanese",
    "zh":  "Chinese",
    "hu":  "Hungarian",
    "el":  "Greek",
}

# Leipzig uses 3-letter ISO 639-3 codes and its own naming conventions.
LEIPZIG_CODE = {
    "en":  "eng",
    "es":  "spa",
    "fr":  "fra",
    "de":  "deu",
    "it":  "ita",
    "ru":  "rus",
    "he":  "heb",
    "ar":  "ara",
    "arz": "ara",   # no separate Egyptian Arabic corpus
    "ja":  "jpn",
    "zh":  "zho",
    "hu":  "hun",
    "el":  "ell",
}

# Source types to try, in preference order. "news" = highest quality; "web" = more colloquial.
CORPUS_TYPES = ["news", "web", "wikipedia", "mixed"]
CORPUS_SIZES = ["300K", "1M", "100K", "10K"]
CORPUS_YEARS = ["2023", "2022", "2021", "2020"]

BASE_URL = "https://downloads.wortschatz-leipzig.de/corpora"

SOURCE_NAME = "leipzig"
SOURCE_URL  = "https://wortschatz.uni-leipzig.de/en/download"


# ── Normalisation (mirrors frequency_import.py) ───────────────────────────────

_HEBREW_NIQQUD     = re.compile(r"[֑-ׇ]")
_ARABIC_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]")
_PUNCT_ONLY        = re.compile(r"^[\W\d]+$")

def _base(word: str) -> str:
    return unicodedata.normalize("NFKC", word).strip().lower()

_NORMALIZERS = {
    "he":  lambda w: _HEBREW_NIQQUD.sub("", _base(w)),
    "ar":  lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
    "arz": lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
}

def normalize(lang: str, word: str) -> str:
    return _NORMALIZERS.get(lang, _base)(word)


# ── GDEX-inspired sentence scorer ────────────────────────────────────────────

CJK_LANGS = {"ja", "zh"}

def score_sentence(text: str, lang: str) -> int:
    """Return an integer quality score 0–100. 0 means knock-out (discard)."""
    text = text.strip()
    if not text:
        return 0

    # CJK languages (Japanese, Chinese) don't use spaces between words, so
    # wcount on split() gives ~1 for most sentences. Use character count instead.
    if lang in CJK_LANGS:
        clen = len(text)
        if clen < 8 or clen > 120:
            return 0
        if not any(c.isalpha() for c in text):
            return 0
        score = 50
        if 15 <= clen <= 60:
            score += 20
        if re.search(r"[。！？!?]$", text):
            score += 15
        if not re.match(r"^[\d\-\*\•「」【】]", text):
            score += 15
        return min(score, 100)

    words  = text.split()
    wcount = len(words)

    # ── Knock-outs (Latin / Cyrillic / RTL scripts) ───────────────────────────
    if wcount < 4 or wcount > 35:
        return 0
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0
    if len(letters) / len(text) < 0.45:
        return 0                                       # mostly numbers/punctuation
    if re.match(r"^[A-Z\s\-–—]+$", text) and lang in ("en", "es", "fr", "de", "it"):
        return 0                                       # ALL CAPS headline
    if text.count('"') > 4 or text.count("'") > 4:
        return 0                                       # excessive quoting
    if re.match(r"^[\d\-\*\•]\s", text):
        return 0

    # ── Gradual scoring ───────────────────────────────────────────────────────
    score = 50

    # Optimal length 7–20 words
    if 7 <= wcount <= 20:
        score += 20
    elif 5 <= wcount <= 25:
        score += 10

    # Ends with proper sentence-final punctuation
    if re.search(r"[.!?。！？؟।]$", text):
        score += 10

    # No deictic expressions
    deictics = {"this", "that", "here", "there", "now", "then", "today", "yesterday",
                "هنا", "هناك", "الآن"}
    first_words = {w.lower().rstrip(".,") for w in words[:4]}
    if not first_words.intersection(deictics):
        score += 10

    # No named-entity signals (capitalised mid-sentence words in Latin-script languages)
    if lang in ("en", "es", "fr", "de", "it", "hu", "el"):
        caps_mid = sum(1 for w in words[1:] if w and w[0].isupper() and w.isalpha())
        if caps_mid == 0:
            score += 10
        elif caps_mid <= 2:
            score += 5

    return min(score, 100)


# ── Downloader ────────────────────────────────────────────────────────────────

def find_and_download(lang: str) -> tuple[list[str], list[tuple[str, int, int]]] | None:
    """
    Try corpus URL combinations until one downloads successfully.
    Returns (sentences_list, [(word, rank, count), ...]) or None.
    """
    code = LEIPZIG_CODE.get(lang)
    if not code:
        return None

    for ctype in CORPUS_TYPES:
        for year in CORPUS_YEARS:
            for size in CORPUS_SIZES:
                name = f"{code}_{ctype}_{year}_{size}"
                url  = f"{BASE_URL}/{name}.tar.gz"
                print(f"  Trying {url} ...", end=" ", flush=True)
                try:
                    r = requests.get(url, timeout=60, stream=True)
                    if r.status_code != 200:
                        print(f"[{r.status_code}]")
                        continue
                    size_bytes = int(r.headers.get("content-length", 0))
                    print(f"OK ({size_bytes // 1024:,} KB)")
                    return _extract(r, name, lang)
                except Exception as e:
                    print(f"error: {e}")
                    continue
    return None


def _extract(response, name: str, lang: str):
    """Extract sentences.txt and words.txt from a streamed tar.gz response."""
    sentences = []
    word_freq  = []  # [(word, rank, count)]

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        for chunk in response.iter_content(chunk_size=1 << 20):
            tmp.write(chunk)
        tmp_path = Path(tmp.name)

    try:
        with tarfile.open(tmp_path, "r:gz") as tf:
            for member in tf.getmembers():
                fname = member.name.lower()
                if fname.endswith("-sentences.txt") or fname.endswith("_sentences.txt"):
                    f = tf.extractfile(member)
                    if f:
                        for line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                            parts = line.rstrip("\n").split("\t")
                            if len(parts) >= 2:
                                sentences.append(parts[1])

                elif fname.endswith("-words.txt") or fname.endswith("_words.txt"):
                    f = tf.extractfile(member)
                    if f:
                        for line in io.TextIOWrapper(f, encoding="utf-8", errors="replace"):
                            parts = line.rstrip("\n").split("\t")
                            if len(parts) >= 3:
                                try:
                                    word_freq.append((parts[1], int(parts[0]), int(parts[2])))
                                except ValueError:
                                    pass
    finally:
        tmp_path.unlink(missing_ok=True)

    print(f"  Extracted {len(sentences):,} sentences, {len(word_freq):,} word-freq entries")
    return sentences, word_freq


# ── Database helpers ──────────────────────────────────────────────────────────

def new_conn():
    return psycopg2.connect(DB_URL)


def ensure_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS corpus_sentences (
            id            BIGSERIAL PRIMARY KEY,
            language_code VARCHAR(10) NOT NULL,
            sentence      TEXT        NOT NULL,
            source        VARCHAR(50) NOT NULL DEFAULT 'leipzig',
            score         INTEGER     NOT NULL
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_corpus_lang_score
            ON corpus_sentences (language_code, score DESC)
    """)
    # Full-text search index for Latin-script languages
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_corpus_fts
            ON corpus_sentences
            USING GIN (to_tsvector('simple', sentence))
    """)
    # Trigram index for all languages (covers CJK / RTL scripts)
    cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_corpus_trgm
            ON corpus_sentences
            USING GIN (sentence gin_trgm_ops)
    """)
    # Ensure frequency tables exist (in case frequency_import.py hasn't been run yet)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frequency_sources (
            id   SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            url  TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frequency_lemmas (
            id               BIGSERIAL PRIMARY KEY,
            language_code    VARCHAR(10) NOT NULL,
            normalized_lemma TEXT        NOT NULL,
            UNIQUE (language_code, normalized_lemma)
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_freq_lemmas_lang
            ON frequency_lemmas (language_code)
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS frequency_entries (
            id        BIGSERIAL PRIMARY KEY,
            lemma_id  BIGINT  NOT NULL REFERENCES frequency_lemmas(id),
            source_id INTEGER NOT NULL REFERENCES frequency_sources(id),
            rank      INTEGER,
            raw_count BIGINT,
            UNIQUE (lemma_id, source_id)
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_freq_entries_source_rank
            ON frequency_entries (source_id, rank)
    """)


def upsert_source(cur) -> int:
    cur.execute("""
        INSERT INTO frequency_sources (name, url)
        VALUES (%s, %s)
        ON CONFLICT (name) DO UPDATE SET url = EXCLUDED.url
        RETURNING id
    """, (SOURCE_NAME, SOURCE_URL))
    return cur.fetchone()[0]


def import_sentences(conn, lang: str, sentences: list[str], limit: int):
    """Score, filter, and bulk-insert sentences for one language."""
    scored = []
    for text in sentences:
        s = score_sentence(text, lang)
        if s > 0:
            scored.append((text, s))

    # Sort best-first, keep top N
    scored.sort(key=lambda x: -x[1])
    scored = scored[:limit]
    print(f"  Sentences: {len(sentences):,} raw → {len(scored):,} after scoring (limit {limit:,})")

    if not scored:
        return

    # Delete existing sentences for this lang+source before re-importing
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM corpus_sentences WHERE language_code = %s AND source = %s",
            (lang, SOURCE_NAME)
        )
    conn.commit()

    # Insert in batches of 5,000 to stay within Supabase's statement timeout
    BATCH = 5_000
    inserted = 0
    for i in range(0, len(scored), BATCH):
        batch = scored[i : i + BATCH]
        buf = io.StringIO()
        for text, score in batch:
            safe = text.replace("\t", " ").replace("\n", " ").replace("\r", "")
            buf.write(f"{lang}\t{safe}\t{SOURCE_NAME}\t{score}\n")
        buf.seek(0)
        with conn.cursor() as cur:
            cur.copy_from(buf, "corpus_sentences",
                          columns=("language_code", "sentence", "source", "score"))
        conn.commit()
        inserted += len(batch)
        print(f"  ... {inserted:,}/{len(scored):,}", end="\r", flush=True)

    print(f"  Inserted {inserted:,} sentences          ")


def import_word_freq(conn, lang: str, source_id: int,
                     word_freq: list[tuple[str, int, int]], freq_limit: int):
    """Upsert Leipzig word frequencies into frequency_lemmas + frequency_entries."""
    if not word_freq:
        return

    # Deduplicate on normalized form
    seen: dict[str, tuple[str, int, int]] = {}
    for word, rank, count in word_freq:
        norm = normalize(lang, word)
        if not norm or _PUNCT_ONLY.match(norm):
            continue
        if norm not in seen or rank < seen[norm][1]:
            seen[norm] = (word, rank, count)

    norm_keys = list(seen.keys())[:freq_limit]

    with conn.cursor() as cur:
        # Upsert lemmas
        cur.execute("CREATE TEMP TABLE tmp_lemmas (normalized_lemma TEXT) ON COMMIT DROP")
        buf = io.StringIO("\n".join(norm_keys))
        cur.copy_from(buf, "tmp_lemmas", columns=("normalized_lemma",))

        cur.execute("""
            INSERT INTO frequency_lemmas (language_code, normalized_lemma)
            SELECT %s, normalized_lemma FROM tmp_lemmas
            ON CONFLICT (language_code, normalized_lemma) DO NOTHING
        """, (lang,))

        # Fetch ids
        cur.execute("""
            SELECT id, normalized_lemma FROM frequency_lemmas
            WHERE language_code = %s AND normalized_lemma = ANY(%s)
        """, (lang, norm_keys))
        lemma_id_map = {row[1]: row[0] for row in cur.fetchall()}

        # Upsert frequency entries
        cur.execute("""
            CREATE TEMP TABLE tmp_entries (
                lemma_id  BIGINT, source_id INTEGER, rank INTEGER, raw_count BIGINT
            ) ON COMMIT DROP
        """)
        buf = io.StringIO()
        for norm in norm_keys:
            lid = lemma_id_map.get(norm)
            if lid is None:
                continue
            _, rank, count = seen[norm]
            buf.write(f"{lid}\t{source_id}\t{rank}\t{count}\n")
        buf.seek(0)
        cur.copy_from(buf, "tmp_entries",
                      columns=("lemma_id", "source_id", "rank", "raw_count"))

        cur.execute("""
            INSERT INTO frequency_entries (lemma_id, source_id, rank, raw_count)
            SELECT lemma_id, source_id, rank, raw_count FROM tmp_entries
            ON CONFLICT (lemma_id, source_id) DO UPDATE
                SET rank = EXCLUDED.rank, raw_count = EXCLUDED.raw_count
        """)
        print(f"  Upserted {cur.rowcount:,} frequency entries")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Import Leipzig corpus")
    parser.add_argument("--langs",       default="",     help="Comma-separated lang codes (default: all)")
    parser.add_argument("--limit",       default=50000,  type=int, help="Max sentences per language")
    parser.add_argument("--freq-limit",  default=5000,   type=int, help="Max words for frequency table")
    args = parser.parse_args()

    target_langs = [l.strip() for l in args.langs.split(",") if l.strip()] or list(LANGUAGES.keys())
    unknown = [l for l in target_langs if l not in LANGUAGES]
    if unknown:
        print(f"Unknown language codes: {unknown}", file=sys.stderr)
        sys.exit(1)

    print(f"Importing {len(target_langs)} languages | sentences limit={args.limit:,} | freq limit={args.freq_limit:,}")
    print(f"DB: {environ['DATABASE_URL']}\n")

    # Setup: ensure tables and get source id using a short-lived connection
    setup_conn = new_conn()
    try:
        with setup_conn.cursor() as cur:
            ensure_tables(cur)
            source_id = upsert_source(cur)
        setup_conn.commit()
        print(f"Source id={source_id} ({SOURCE_NAME})\n")
    finally:
        setup_conn.close()

    for lang in target_langs:
        print(f"[{lang}] {LANGUAGES[lang]}")
        result = find_and_download(lang)
        if result is None:
            print(f"  SKIP — no corpus found\n")
            continue
        sentences, word_freq = result

        # Fresh connection per language — a timeout on one language can't break others
        conn = new_conn()
        try:
            import_sentences(conn, lang, sentences, args.limit)
            import_word_freq(conn, lang, source_id, word_freq, args.freq_limit)
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            print(f"  ERROR — {e}")
        finally:
            try:
                conn.close()
            except Exception:
                pass
        print()

    print("Done.")


if __name__ == "__main__":
    main()
