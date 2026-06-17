#!/usr/bin/env python3
"""
worker.py - local clip generator for szol

Requires:
    pip install yt-dlp groq requests
    ffmpeg in PATH  (yt-dlp needs it for audio extraction)

Usage:
    python worker.py guitar en
    python worker.py chance en
"""

import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

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
    base   = lang[:2]
    suffix = _LANG_NAMES.get(base, "")
    q      = f"{word} {suffix}".strip() if suffix else word
    params = urllib.parse.urlencode({
        "q": q, "type": "video",
        "videoCaption":     "closedCaption",
        "relevanceLanguage": base,
        "videoDuration":    "medium",
        "maxResults":       str(MAX_VIDEOS),
        "part":             "id",
        "key":              YT_API_KEY,
    })
    with urllib.request.urlopen(
        f"https://www.googleapis.com/youtube/v3/search?{params}", timeout=10
    ) as r:
        data = json.loads(r.read().decode())
    ids = [item["id"]["videoId"] for item in data.get("items", [])]
    print(f"  search '{q}' -> {ids}")
    return ids


def download_audio(video_id, outdir):
    out = os.path.join(outdir, f"{video_id}.%(ext)s")
    # Use 'python -m yt_dlp' so we don't need yt-dlp on PATH.
    # No --audio-format conversion so ffmpeg is not required.
    # Groq Whisper accepts m4a/webm/mp4 natively.
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", out,
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  yt-dlp failed: {r.stderr.strip()[:300]}")
        return None
    for fname in os.listdir(outdir):
        if fname.startswith(video_id):
            path = os.path.join(outdir, fname)
            mb   = os.path.getsize(path) / 1e6
            print(f"  downloaded {fname}  ({mb:.1f} MB)")
            if mb > 24:
                print(f"  file too large for Groq (>24 MB), skipping")
                return None
            return path
    return None


def transcribe(audio_path):
    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segs = result.segments or []
    print(f"  transcribed: {len(segs)} segments")
    return segs


def find_clips(word, segments):
    clips = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if word.lower() in text.lower():
            start = int(seg.get("start", 0))
            end   = int(seg.get("end", start + 3))
            clips.append({"start_sec": start, "end_sec": end, "context": text})
    return clips


def post_clips(word, lang, video_id, clips):
    payload = json.dumps([
        {"word": word, "lang": lang, "video_id": video_id, **c}
        for c in clips
    ]).encode()
    req = urllib.request.Request(
        f"{BACKEND_URL}/vocab/clips",
        data=payload,
        headers={
            "Content-Type":    "application/json",
            "X-Worker-Secret": WORKER_SECRET,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode()
    print(f"  posted -> {body}")


def process(word, lang):
    print(f"\n{'='*50}")
    print(f"word={word!r}  lang={lang}")

    # Skip if already cached
    params = urllib.parse.urlencode({"word": word, "lang": lang, "limit": "1"})
    try:
        with urllib.request.urlopen(
            f"{BACKEND_URL}/vocab/clips?{params}", timeout=5
        ) as r:
            if json.loads(r.read().decode()):
                print("  already cached, skipping")
                return
    except Exception:
        pass  # backend down or no cache entry, continue

    video_ids = yt_search(word, lang)
    if not video_ids:
        print("  no videos found")
        return

    total = 0
    with tempfile.TemporaryDirectory() as tmpdir:
        for vid in video_ids:
            if total >= MAX_CLIPS:
                break
            print(f"\n  [{vid}]")
            audio = download_audio(vid, tmpdir)
            if not audio:
                continue
            try:
                segs = transcribe(audio)
            except Exception as e:
                print(f"  transcription error: {e}")
                continue
            clips = find_clips(word, segs)
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
    """Return list of {word, lang} dicts that have no cached clips yet."""
    req = urllib.request.Request(
        f"{BACKEND_URL}/vocab/all-words",
        headers={"X-Worker-Secret": WORKER_SECRET},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


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
