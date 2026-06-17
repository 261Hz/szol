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

import requests

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
    ids = [item["id"]["videoId"] for item in r.json().get("items", [])]
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
    result = client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=("audio.m4a", audio_data),
        response_format="verbose_json",
        timestamp_granularities=["segment"],
    )
    segs = result.segments or []
    print(f"  transcribed: {len(segs)} segments")
    return segs


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

    video_ids = yt_search(word, lang)
    if not video_ids:
        print("  no videos found")
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
            process(item["word"], item["lang"])

        print("\nAll done.")
    else:
        print("Usage:")
        print("  python worker.py              # process all pending vocab words")
        print("  python worker.py guitar en    # process one word")
        sys.exit(1)
