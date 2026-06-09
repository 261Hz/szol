"""
Frequency list ETL — downloads OpenSubtitles word-frequency lists from the
FrequencyWords repo (hermitdave/FrequencyWords) for all 13 app languages,
normalizes each word, and bulk-loads into frequency_sources / frequency_lemmas /
frequency_entries tables.

Usage:
    python frequency_import.py [--langs en,de,fr] [--limit 5000]

Options:
    --langs   Comma-separated language codes to import (default: all)
    --limit   Max words per language (default: 5000, 0 = all ~50k)

Requirements: psycopg2-binary, requests, python-dotenv  (all in requirements.txt)
"""

import argparse
import io
import re
import sys
import unicodedata
from contextlib import contextmanager

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

# FrequencyWords repo uses zh_cn; map any divergent codes here.
REPO_CODE = {
    "zh": "zh_cn",
}

SOURCE_NAME = "opensubtitles_frequencywords"
SOURCE_URL  = "https://github.com/hermitdave/FrequencyWords"

RAW_URLS = [
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/{code}/{code}_50k.txt",
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/{code}/{code}_50k.txt",
]

# ── Normalizers ───────────────────────────────────────────────────────────────

_HEBREW_NIQQUD    = re.compile(r"[֑-ׇ]")
_ARABIC_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]")
_PUNCT_ONLY       = re.compile(r"^[\W\d]+$")


def _base(word: str) -> str:
    return unicodedata.normalize("NFKC", word).strip().lower()


NORMALIZERS = {
    "he":  lambda w: _HEBREW_NIQQUD.sub("", _base(w)),
    "ar":  lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
    "arz": lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
}


def normalize(lang: str, word: str) -> str:
    fn = NORMALIZERS.get(lang, _base)
    return fn(word)


# ── Download ──────────────────────────────────────────────────────────────────

def download_list(lang: str, limit: int) -> list[tuple[str, int, int]]:
    """Return [(raw_word, rank, count), ...] for a language."""
    code = REPO_CODE.get(lang, lang)
    resp = None
    for url_tpl in RAW_URLS:
        url = url_tpl.format(code=code)
        print(f"  Downloading {url} ...", end=" ", flush=True)
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            resp = r
            print(f"{len(r.content):,} bytes")
            break
        print(f"[{r.status_code}] trying fallback...")
    if resp is None:
        raise requests.HTTPError(f"No URL succeeded for lang={lang}")

    rows = []
    for rank, line in enumerate(resp.text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        word  = parts[0]
        count = int(parts[1])
        rows.append((word, rank, count))
        if limit and rank >= limit:
            break

    print(f"  Parsed {len(rows):,} entries")
    return rows


# ── Database helpers ──────────────────────────────────────────────────────────

@contextmanager
def get_conn():
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_tables(cur):
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


def bulk_import_language(conn, lang: str, source_id: int, rows: list[tuple[str, int, int]]):
    """Upsert lemmas then entries for one language using COPY + temp table."""
    with conn.cursor() as cur:
        # 1. Normalize and deduplicate (keep lowest rank per normalized form)
        seen:   dict[str, tuple[str, int, int]] = {}   # normalized → (raw, rank, count)
        skipped = 0
        for raw, rank, count in rows:
            norm = normalize(lang, raw)
            if not norm or _PUNCT_ONLY.match(norm):
                skipped += 1
                continue
            if norm not in seen or rank < seen[norm][1]:
                seen[norm] = (raw, rank, count)

        if skipped:
            print(f"  Skipped {skipped} punct/empty entries")

        normed_rows = list(seen.values())   # (raw, rank, count) keyed by norm
        norm_keys   = list(seen.keys())     # parallel list of normalized forms

        # 2. Bulk upsert lemmas, get back ids
        # Load normalized lemmas into a temp table, then upsert into frequency_lemmas.
        cur.execute("CREATE TEMP TABLE tmp_lemmas (normalized_lemma TEXT) ON COMMIT DROP")
        buf = io.StringIO("\n".join(norm_keys))
        cur.copy_from(buf, "tmp_lemmas", columns=("normalized_lemma",))

        cur.execute("""
            INSERT INTO frequency_lemmas (language_code, normalized_lemma)
            SELECT %s, normalized_lemma FROM tmp_lemmas
            ON CONFLICT (language_code, normalized_lemma) DO NOTHING
        """, (lang,))

        # 3. Fetch lemma ids for all our normalized forms
        cur.execute("""
            SELECT id, normalized_lemma FROM frequency_lemmas
            WHERE language_code = %s AND normalized_lemma = ANY(%s)
        """, (lang, norm_keys))
        lemma_id_map = {row[1]: row[0] for row in cur.fetchall()}

        # 4. Bulk upsert frequency_entries via temp table + INSERT … ON CONFLICT
        cur.execute("""
            CREATE TEMP TABLE tmp_entries (
                lemma_id  BIGINT,
                source_id INTEGER,
                rank      INTEGER,
                raw_count BIGINT
            ) ON COMMIT DROP
        """)
        buf = io.StringIO()
        for norm, (raw, rank, count) in seen.items():
            lid = lemma_id_map.get(norm)
            if lid is None:
                continue
            buf.write(f"{lid}\t{source_id}\t{rank}\t{count}\n")
        buf.seek(0)
        cur.copy_from(buf, "tmp_entries", columns=("lemma_id", "source_id", "rank", "raw_count"))

        cur.execute("""
            INSERT INTO frequency_entries (lemma_id, source_id, rank, raw_count)
            SELECT lemma_id, source_id, rank, raw_count FROM tmp_entries
            ON CONFLICT (lemma_id, source_id) DO UPDATE
                SET rank      = EXCLUDED.rank,
                    raw_count = EXCLUDED.raw_count
        """)

        inserted = cur.rowcount
        print(f"  Upserted {inserted:,} frequency entries")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Import OpenSubtitles frequency lists")
    parser.add_argument("--langs",  default="",   help="Comma-separated lang codes (default: all)")
    parser.add_argument("--limit",  default=5000, type=int, help="Max words per lang (0 = all ~50k)")
    args = parser.parse_args()

    target_langs = [l.strip() for l in args.langs.split(",") if l.strip()] or list(LANGUAGES.keys())
    unknown = [l for l in target_langs if l not in LANGUAGES]
    if unknown:
        print(f"Unknown language codes: {unknown}", file=sys.stderr)
        sys.exit(1)

    print(f"Importing {len(target_langs)} languages, limit={args.limit or 'all'}")
    print(f"DB: {environ['DATABASE_URL']}\n")

    with get_conn() as conn:
        with conn.cursor() as cur:
            ensure_tables(cur)
            source_id = upsert_source(cur)
            print(f"Source id={source_id} ({SOURCE_NAME})\n")
        conn.commit()  # commit DDL before language loop so a per-lang rollback can't undo it

        for lang in target_langs:
            print(f"[{lang}] {LANGUAGES[lang]}")
            try:
                rows = download_list(lang, args.limit)
                bulk_import_language(conn, lang, source_id, rows)
                conn.commit()
            except requests.HTTPError as e:
                print(f"  SKIP — download failed: {e}")
            except Exception as e:
                conn.rollback()
                print(f"  ERROR — {e}")
            print()

    print("Done.")


if __name__ == "__main__":
    main()
