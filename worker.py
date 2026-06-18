#!/usr/bin/env python3
"""
worker.py — vocabulary clip generator for Szól

Uses filmot.com API to search YouTube captions and find exact timestamps
where each vocab word appears. Results are cached locally in SQLite so
the 2000 req/month free tier limit is not hit repeatedly.

Usage:
  python worker.py            # process all pending words
  python worker.py guitar en  # single word
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

import requests

# Load .env if present (local dev)
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

BACKEND_URL    = os.getenv("SZOL_BACKEND_URL", "https://szol.onrender.com")
FILMOT_API_KEY = os.getenv("FILMOT_API_KEY", "")
WORKER_SECRET  = os.getenv("WORKER_SECRET", "")

MAX_CLIPS = 5

CACHE_DB  = Path(__file__).parent / "worker_cache.db"
SKIP_FILE = Path(__file__).parent / "clips_skipped.txt"

_CJK = {"ja", "zh", "ko", "cmn", "yue"}

# Languages filmot supports for the lang= filter
_FILMOT_LANGS = {
    "nl", "en", "fr", "de", "id", "it", "ko", "pt", "ru", "es",
    "tr", "vi", "ja", "hi", "iw", "ar",
}

# ── Cache ─────────────────────────────────────────────────────────────────────

def _init_db():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS filmot_cache (
            word       TEXT NOT NULL,
            lang       TEXT NOT NULL,
            clips      TEXT NOT NULL,
            fetched_at REAL NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (word, lang)
        )
    """)
    conn.commit()
    return conn

_db = _init_db()

def _get_cached(word, lang):
    row = _db.execute(
        "SELECT clips FROM filmot_cache WHERE word=? AND lang=?",
        (word.lower(), lang)
    ).fetchone()
    return json.loads(row[0]) if row else None

def _cache(word, lang, clips):
    _db.execute(
        "INSERT OR REPLACE INTO filmot_cache (word, lang, clips) VALUES (?,?,?)",
        (word.lower(), lang, json.dumps(clips))
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

# ── Filmot search ─────────────────────────────────────────────────────────────

def filmot_search(word, lang):
    """Return up to MAX_CLIPS clip dicts for word, hitting filmot API (cached)."""
    cached = _get_cached(word, lang)
    if cached is not None:
        print(f"  '{word}': cached ({len(cached)} clips)")
        return cached

    lang_code = lang[:2]
    params = {
        "query":        word,
        "hitFormat":    "0",
        "maxQueryTime": "100",
        "page":         "1",
    }
    if lang_code in _FILMOT_LANGS:
        params["lang"] = lang_code

    try:
        r = requests.get(
            "https://filmot-tube-metadata-archive.p.rapidapi.com/getsearchsubtitles",
            params=params,
            headers={
                "x-rapidapi-host": "filmot-tube-metadata-archive.p.rapidapi.com",
                "x-rapidapi-key":  FILMOT_API_KEY,
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  filmot error: {e}")
        return []

    clips = []
    for result in data.get("result", []):
        video_id = result.get("id", "")
        if not video_id:
            continue
        for hit in result.get("hits", []):
            start = float(hit.get("start", 0))
            dur   = float(hit.get("dur", 3))
            ctx   = " ".join(filter(None, [
                hit.get("ctx_before", "").strip(),
                hit.get("token",      "").strip(),
                hit.get("ctx_after",  "").strip(),
            ]))
            clips.append({
                "video_id":  video_id,
                "start_sec": int(start),
                "end_sec":   int(start + max(dur, 3)),
                "context":   ctx,
            })
        if len(clips) >= MAX_CLIPS:
            break

    clips = clips[:MAX_CLIPS]
    _cache(word, lang, clips)
    print(f"  '{word}': {len(clips)} clips (filmot total: {data.get('totalresultcount', '?')})")
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

def post_clips(word, lang, clips):
    payload = [{"word": word, "lang": lang, **c} for c in clips]
    r = requests.post(
        f"{BACKEND_URL}/vocab/clips",
        json=payload,
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=10,
    )
    print(f"  posted {len(clips)} clips for '{word}': {r.text[:80]}")

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

    todo = [
        (item["word"], item["lang"])
        for item in pending
        if valid_word(item["word"], item["lang"])
        and f"{item['word'].lower()}::{item['lang']}" not in _SKIPPED
        and not already_has_clips(item["word"], item["lang"])
    ]

    print(f"{len(pending)} pending -> {len(todo)} after filtering\n")
    if not todo:
        return

    for word, lang in todo:
        clips = filmot_search(word, lang)
        if not clips:
            _mark_skipped(word, lang)
            continue
        try:
            post_clips(word, lang, clips)
        except Exception as e:
            print(f"  post error: {e}")

    print("\nAll done.")

def run_single(word, lang):
    print(f"Processing '{word}' ({lang})\n")
    clips = filmot_search(word, lang)
    if not clips:
        print("No clips found.")
        return
    post_clips(word, lang, clips)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    missing = [v for v in ("FILMOT_API_KEY", "WORKER_SECRET") if not os.getenv(v)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)}")

    if len(sys.argv) == 3:
        run_single(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 1:
        run_all()
    else:
        print("Usage:\n  python worker.py              # all pending\n  python worker.py guitar en    # single word")
        sys.exit(1)
