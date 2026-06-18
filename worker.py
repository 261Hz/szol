#!/usr/bin/env python3
"""
worker.py - local clip generator for szol

Requires:
    pip install yt-dlp groq requests

Usage:
    python worker.py guitar en   # single word
    python worker.py             # all pending vocab words
"""

import io
import os
import subprocess
import sys
import time

import requests

SKIP_FILE = os.path.join(os.path.dirname(__file__), "clips_skipped.txt")

def _load_skipped():
    try:
        with open(SKIP_FILE, encoding="utf-8") as f:
            return set(l.strip() for l in f if l.strip())
    except FileNotFoundError:
        return set()

def _mark_skipped(word, lang):
    key = f"{word.lower()}::{lang}"
    with open(SKIP_FILE, "a", encoding="utf-8") as f:
        f.write(key + "\n")
    print(f"  marked as skipped (saved to {SKIP_FILE})")

_SKIPPED = _load_skipped()

BACKEND_URL   = os.getenv("SZOL_BACKEND_URL", "https://szol.onrender.com")
YT_API_KEY    = os.getenv("YOUTUBE_API_KEY", "")
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")

MAX_VIDEOS = 5
MAX_CLIPS  = 5

_LANG_NAMES = {
    "en": "english", "es": "spanish", "fr": "french", "de": "german",
    "it": "italian", "pt": "portuguese", "ar": "arabic", "he": "hebrew",
    "ja": "japanese", "ko": "korean", "zh": "chinese", "ru": "russian",
    "nl": "dutch",   "pl": "polish",   "tr": "turkish", "sv": "swedish",
}


class QuotaExceeded(Exception):
    pass

def yt_search(word, lang):
    base = lang[:2]
    q    = word  # rely on relevanceLanguage, not appending the language name
    r = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "q": q, "type": "video",
            "relevanceLanguage": base,
            "videoDuration":     "medium",
            "maxResults":        str(MAX_VIDEOS),
            "part":              "id",
            "key":               YT_API_KEY,
        },
        timeout=10,
    )
    data = r.json()
    errors = data.get("error", {}).get("errors", [])
    if any(e.get("reason") == "quotaExceeded" for e in errors):
        raise QuotaExceeded("YouTube API daily quota exceeded — try again tomorrow")
    ids = [item["id"]["videoId"] for item in data.get("items", []) if "videoId" in item.get("id", {})]
    print(f"  search '{q}' -> {ids}")
    return ids


def download_audio(video_id):
    """Stream audio into memory via yt-dlp stdout — no disk writes."""
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--js-runtimes", "node",
        "--remote-components", "ejs:github",
        "--no-cache-dir",
        "--cookies-from-browser", "chrome",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", "-",
        "--quiet",
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        print(f"  yt-dlp failed: {r.stderr.decode(errors='ignore').strip()[:300]}")
        return None
    mb = len(r.stdout) / 1e6
    print(f"  downloaded {mb:.1f} MB (in memory)")
    if mb > 24:
        print("  too large for Groq (>24 MB), skipping")
        return None
    return io.BytesIO(r.stdout)


def transcribe(audio_data):
    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)
    for attempt in range(3):
        try:
            audio_data.seek(0)
            result = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=("audio.m4a", audio_data),
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
            segs = result.segments or []
            print(f"  transcribed: {len(segs)} segments")
            return segs
        except Exception as e:
            if attempt < 2:
                print(f"  transcription error (attempt {attempt+1}): {e} — retrying in 5s")
                time.sleep(5)
            else:
                raise


def find_clips(word, segments, debug=False):
    clips  = []
    target = word.lower()
    # Collapsed form catches Whisper splitting compounds: "nervenzusammenbruch" ↔ "nerven zusammenbruch"
    target_collapsed = target.replace(" ", "").replace("-", "")
    parts = [p for p in target.split() if len(p) > 3]
    for seg in segments:
        text = (seg.get("text") or "").strip()
        tl   = text.lower()
        tl_collapsed = tl.replace(" ", "").replace("-", "")
        if debug and parts and any(p in tl for p in parts):
            print(f"    partial: {text}")
        if target in tl or target_collapsed in tl_collapsed:
            start = int(float(seg.get("start", 0)))
            end   = int(float(seg.get("end",   start + 3)))
            clips.append({"start_sec": start, "end_sec": end, "context": text})
    return clips


def post_clips(word, lang, video_id, clips):
    payload = [{"word": word, "lang": lang, "video_id": video_id, **c} for c in clips]
    r = requests.post(
        f"{BACKEND_URL}/vocab/clips",
        json=payload,
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=10,
    )
    print(f"  posted -> {r.text}")


def process(word, lang):
    print(f"\n{'='*50}")
    print(f"word={word!r}  lang={lang}")

    skip_key = f"{word.lower()}::{lang}"
    if skip_key in _SKIPPED:
        print("  skipping — previously found no YouTube results")
        return

    try:
        r = requests.get(
            f"{BACKEND_URL}/vocab/clips",
            params={"word": word, "lang": lang, "limit": "1"},
            timeout=5,
        )
        if r.json():
            print("  already cached, skipping")
            return
    except Exception:
        pass

    _CJK = {'ja', 'zh', 'ko', 'cmn', 'yue'}
    min_len = 1 if lang in _CJK else 2
    if len(word) < min_len or len(word) > 40 or (' ' in word.strip() and len(word) > 20):
        print("  skipping — too short, too long, or a sentence/title")
        return

    try:
        video_ids = yt_search(word, lang)
    except QuotaExceeded as e:
        raise  # bubble up to stop the whole run
    if not video_ids:
        print("  no videos found")
        _mark_skipped(word, lang)
        _SKIPPED.add(skip_key)
        return

    total = 0
    for vid in video_ids:
        if total >= MAX_CLIPS:
            break
        print(f"\n  [{vid}]")
        audio = download_audio(vid)
        if not audio:
            continue
        try:
            segs = transcribe(audio)
        except Exception as e:
            print(f"  transcription error: {e}")
            continue
        clips = find_clips(word, segs, debug=True)
        print(f"  clips containing '{word}': {len(clips)}")
        if clips:
            want = clips[:MAX_CLIPS - total]
            try:
                post_clips(word, lang, vid, want)
                total += len(want)
            except Exception as e:
                print(f"  post error: {e}")

    print(f"\nDone: {total} clips stored for '{word}'")


def fetch_pending():
    r = requests.get(
        f"{BACKEND_URL}/vocab/all-words",
        headers={"X-Worker-Secret": WORKER_SECRET},
        timeout=10,
    )
    return r.json()


if __name__ == "__main__":
    missing = [v for v in ("GROQ_API_KEY", "YOUTUBE_API_KEY", "WORKER_SECRET") if not os.getenv(v)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)}")

    if len(sys.argv) == 3:
        process(sys.argv[1], sys.argv[2])
    elif len(sys.argv) == 1:
        print("Fetching pending words from backend...")
        try:
            pending = fetch_pending()
        except Exception as e:
            sys.exit(f"Could not fetch pending words: {e}")

        if not pending:
            print("Nothing to do — all vocab words already have clips.")
            sys.exit(0)

        print(f"Found {len(pending)} word(s) needing clips:")
        for item in pending:
            print(f"  {item['word']} ({item['lang']})")
        print()

        for item in pending:
            try:
                process(item["word"], item["lang"])
            except QuotaExceeded as e:
                print(f"\n⚠ {e}")
                print("Stopping early — remaining words will be processed tomorrow.")
                sys.exit(1)

        print("\nAll done.")
    else:
        print("Usage:")
        print("  python worker.py              # process all pending vocab words")
        print("  python worker.py guitar en    # process one word")
        sys.exit(1)
