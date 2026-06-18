#!/usr/bin/env python3
"""
worker.py — vocabulary clip generator for Szól

Architecture:
  1. Fetch all pending (word, lang) pairs from backend
  2. For each lang group, search YouTube and collect unique video IDs
  3. Fetch transcript once per video (captions first, Whisper fallback)
  4. Cache transcripts locally in SQLite — reused across words and runs
  5. Match ALL pending words against each transcript in one pass
  6. Post found clips to backend

One transcript fetch can satisfy hundreds of word requests.
Whisper is only used when YouTube has no captions at all.

Dependencies:
  pip install requests youtube-transcript-api
  pip install groq yt-dlp   # optional — only needed for uncaptioned videos

Usage:
  python worker.py            # process all pending words
  python worker.py guitar en  # single word
"""

import io
import json
import os
import sqlite3
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import requests

BACKEND_URL   = os.getenv("SZOL_BACKEND_URL", "https://szol.onrender.com")
YT_API_KEY    = os.getenv("YOUTUBE_API_KEY", "")
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")

MAX_VIDEOS = 5  # YouTube search results per word
MAX_CLIPS  = 5  # clips stored per (word, video)

CACHE_DB  = Path(__file__).parent / "worker_cache.db"
SKIP_FILE = Path(__file__).parent / "clips_skipped.txt"

_CJK = {"ja", "zh", "ko", "cmn", "yue"}

# ── Local transcript cache (SQLite) ───────────────────────────────────────────

def _init_db():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transcripts (
            video_id   TEXT NOT NULL,
            lang       TEXT NOT NULL,
            segments   TEXT NOT NULL,
            source     TEXT NOT NULL,
            fetched_at REAL NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (video_id, lang)
        )
    """)
    conn.commit()
    return conn

_db = _init_db()

def _get_cached(video_id, lang):
    row = _db.execute(
        "SELECT segments FROM transcripts WHERE video_id=? AND lang=?",
        (video_id, lang)
    ).fetchone()
    return json.loads(row[0]) if row else None

def _cache(video_id, lang, segs, source):
    _db.execute(
        "INSERT OR REPLACE INTO transcripts (video_id, lang, segments, source) VALUES (?,?,?,?)",
        (video_id, lang, json.dumps(segs), source)
    )
    _db.commit()

# ── Skip list ─────────────────────────────────────────────────────────────────

def _load_skipped():
    try:
        return set(l.strip() for l in SKIP_FILE.read_text(encoding="utf-8").splitlines() if l.strip())
    except FileNotFoundError:
        return set()

_SKIPPED = _load_skipped()

def _mark_skipped(word, lang):
    key = f"{word.lower()}::{lang}"
    if key not in _SKIPPED:
        _SKIPPED.add(key)
        with open(SKIP_FILE, "a", encoding="utf-8") as f:
            f.write(key + "\n")

# ── YouTube search ────────────────────────────────────────────────────────────

class QuotaExceeded(Exception):
    pass

def yt_search(word, lang):
    # Search the stem so we find videos even when the word only appears in inflected form
    query = _stem(word.lower().replace("-", "").replace(" ", ""), lang)
    r = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "q": query, "type": "video",
            "relevanceLanguage": lang[:2],
            "videoDuration": "medium",
            "maxResults": str(MAX_VIDEOS),
            "part": "id",
            "key": YT_API_KEY,
        },
        timeout=10,
    )
    data = r.json()
    if any(e.get("reason") == "quotaExceeded" for e in data.get("error", {}).get("errors", [])):
        raise QuotaExceeded("YouTube Data API daily quota exceeded — try again tomorrow")
    ids = [item["id"]["videoId"] for item in data.get("items", []) if "videoId" in item.get("id", {})]
    label = f"'{query}'" if query != word else f"'{word}'"
    print(f"  search {label} → {ids}")
    return ids

# ── Transcript fetching ───────────────────────────────────────────────────────

def _fetch_captions(video_id, lang):
    """youtube-transcript-api v1.x: free, no download, no Whisper cost."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        ytt = YouTubeTranscriptApi()
        lang_base = lang[:2]
        transcript = ytt.fetch(video_id, languages=[lang, lang_base, "en"])
        segs = [
            {"text": e.text, "start": e.start, "end": e.start + e.duration}
            for e in transcript
        ]
        print(f"  captions OK — {len(segs)} segments")
        return segs, "captions"
    except Exception as e:
        print(f"  captions unavailable: {type(e).__name__}: {e}")
        return None, None

def _fetch_whisper(video_id):
    """Download audio + Groq Whisper. Only used when YouTube has no captions."""
    if not GROQ_API_KEY:
        print("  GROQ_API_KEY not set — skipping Whisper fallback")
        return None
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--js-runtimes", "node", "--remote-components", "ejs:github",
        "--no-cache-dir", "--cookies-from-browser", "chrome",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", "-", "--quiet",
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print(f"  yt-dlp failed: {r.stderr.decode(errors='ignore').strip()[:200]}")
        return None
    mb = len(r.stdout) / 1e6
    print(f"  downloaded {mb:.1f} MB")
    if mb > 24:
        print("  too large for Groq (>24 MB) — skipping")
        return None
    try:
        from groq import Groq
        audio = io.BytesIO(r.stdout)
        result = Groq(api_key=GROQ_API_KEY).audio.transcriptions.create(
            model="whisper-large-v3",
            file=("audio.m4a", audio),
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
        segs = [
            {"text": s.get("text", ""), "start": float(s.get("start", 0)), "end": float(s.get("end", 0))}
            for s in (result.segments or [])
        ]
        print(f"  Whisper: {len(segs)} segments")
        return segs
    except Exception as e:
        print(f"  Whisper error: {e}")
        return None

def get_transcript(video_id, lang):
    """Return segments from cache, or fetch and cache them."""
    cached = _get_cached(video_id, lang)
    if cached is not None:
        print(f"  [{video_id}] ✓ cached ({len(cached)} segs)")
        return cached

    print(f"  [{video_id}] fetching…")
    segs, source = _fetch_captions(video_id, lang)
    if segs is None:
        segs = _fetch_whisper(video_id)
        source = "whisper" if segs else None

    if segs:
        _cache(video_id, lang, segs, source)
    return segs

# ── Word matching ─────────────────────────────────────────────────────────────

# Common inflectional suffixes per language (longest first so we strip the most specific one).
# Used to find stems that match across noun/adjective declensions and verb conjugations.
_SUFFIXES = {
    "de": ["esten", "sten", "erns", "ern", "ens", "em", "en", "er", "es", "e"],
    "fr": ["tion", "ment", "ons", "ent", "ant", "aux", "als", "ez", "es", "er", "e"],
    "es": ["ción", "mente", "ando", "iendo", "ados", "idas", "idos", "ado", "ida", "ido", "an", "as", "os", "a", "o"],
    "pt": ["ção", "mente", "ando", "endo", "ados", "idas", "ido", "ada", "as", "os", "a", "o"],
    "it": ["zione", "mente", "ando", "endo", "ati", "ite", "iti", "ate", "ano", "ono", "i", "e", "a", "o"],
    "nl": ["sten", "eren", "ers", "en", "es", "e"],
    "ru": ["ого", "его", "ому", "ему", "ых", "их", "ым", "им", "ой", "ей", "ий", "ая", "ое", "ые", "ый", "ами", "ах"],
    "pl": ["owych", "owego", "owym", "owe", "owy", "owa", "ią", "ie", "ę", "ą"],
}

def _stem(word, lang):
    """Strip the longest matching inflectional suffix; return root if ≥ 5 chars, else word."""
    w = word.lower().replace("-", "").replace(" ", "")
    for suf in _SUFFIXES.get(lang[:2], []):
        if w.endswith(suf) and len(w) - len(suf) >= 5:
            return w[:-len(suf)]
    return w

def find_clips(word, segments, lang=""):
    target   = word.lower()
    target_c = target.replace(" ", "").replace("-", "")
    stem     = _stem(target_c, lang)

    clips = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        tl   = text.lower()
        tl_c = tl.replace(" ", "").replace("-", "")
        if target in tl or target_c in tl_c or (len(stem) >= 5 and stem in tl_c):
            start = int(float(seg.get("start", 0)))
            end   = int(float(seg.get("end",   start + 3)))
            clips.append({"start_sec": start, "end_sec": end, "context": text})
    return clips

# ── Backend helpers ───────────────────────────────────────────────────────────

def already_has_clips(word, lang):
    try:
        return bool(requests.get(
            f"{BACKEND_URL}/vocab/clips",
            params={"word": word, "lang": lang, "limit": "1"},
            timeout=5,
        ).json())
    except Exception:
        return False

def post_clips(word, lang, video_id, clips):
    payload = [{"word": word, "lang": lang, "video_id": video_id, **c} for c in clips]
    r = requests.post(
        f"{BACKEND_URL}/vocab/clips",
        json=payload,
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=10,
    )
    print(f"  → posted {len(clips)} clips for '{word}': {r.text[:80]}")

def fetch_pending():
    return requests.get(
        f"{BACKEND_URL}/vocab/all-words",
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=10,
    ).json()

# ── Processing ────────────────────────────────────────────────────────────────

def valid_word(word, lang):
    w = word.strip()
    min_len = 1 if lang in _CJK else 2
    return min_len <= len(w) <= 40 and not (" " in w and len(w) > 20)

def run_all():
    print("Fetching pending words from backend…")
    try:
        pending = fetch_pending()
    except Exception as e:
        sys.exit(f"Could not fetch pending words: {e}")

    if not pending:
        print("Nothing to do — all vocab words already have clips.")
        return

    # Filter before doing any network work
    todo = [
        (item["word"], item["lang"])
        for item in pending
        if valid_word(item["word"], item["lang"])
        and f"{item['word'].lower()}::{item['lang']}" not in _SKIPPED
        and not already_has_clips(item["word"], item["lang"])
    ]

    print(f"{len(pending)} pending → {len(todo)} after filtering\n")
    if not todo:
        return

    # Group by language
    by_lang = defaultdict(list)
    for word, lang in todo:
        by_lang[lang].append(word)

    for lang, words in by_lang.items():
        print(f"\n══ {lang.upper()} — {len(words)} words ══════════════════════════")

        # Map: video_id → set of words that found it via search
        video_words = defaultdict(set)
        words_searched = set()  # words that had at least one YouTube result
        for word in words:
            try:
                ids = yt_search(word, lang)
            except QuotaExceeded as e:
                print(f"\n⚠  {e}")
                sys.exit(1)
            if not ids:
                _mark_skipped(word, lang)
                print(f"  no videos found for '{word}' — skipped")
                continue
            words_searched.add(word)
            for vid in ids:
                video_words[vid].add(word)

        if not video_words:
            continue

        # One transcript fetch per unique video, matched against ALL candidate words
        words_with_clips = set()
        for video_id, candidate_words in video_words.items():
            print(f"\n[{video_id}] — candidates: {', '.join(sorted(candidate_words))}")
            segs = get_transcript(video_id, lang)
            if not segs:
                print("  no transcript available — skipping")
                continue

            for word in sorted(candidate_words):
                if already_has_clips(word, lang):
                    words_with_clips.add(word)
                    print(f"  '{word}': already done")
                    continue
                clips = find_clips(word, segs, lang)
                print(f"  '{word}': {len(clips)} clip(s) found")
                if clips:
                    words_with_clips.add(word)
                    try:
                        post_clips(word, lang, video_id, clips[:MAX_CLIPS])
                    except Exception as e:
                        print(f"  post error: {e}")

        # Words that had search results but no clips in any video → skip permanently
        for word in words_searched - words_with_clips:
            _mark_skipped(word, lang)
            print(f"  '{word}': no clips in any video — skipped")

    print("\nAll done.")

def run_single(word, lang):
    print(f"Processing '{word}' ({lang})\n")
    try:
        ids = yt_search(word, lang)
    except QuotaExceeded as e:
        sys.exit(str(e))
    if not ids:
        print("No videos found.")
        return
    for vid in ids:
        segs = get_transcript(vid, lang)
        if not segs:
            continue
        clips = find_clips(word, segs, lang)
        print(f"  [{vid}] {len(clips)} clip(s)")
        if clips:
            post_clips(word, lang, vid, clips[:MAX_CLIPS])

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    missing = [v for v in ("YOUTUBE_API_KEY", "WORKER_SECRET") if not os.getenv(v)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)}")

    if len(sys.argv) == 3:
        run_single(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 1:
        run_all()
    else:
        print("Usage:\n  python worker.py              # all pending\n  python worker.py guitar en    # single word")
        sys.exit(1)
