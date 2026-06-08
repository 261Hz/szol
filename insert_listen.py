# insert_listen.py — fetch a YouTube video's manual transcript and store it in video_stories.
#
# Usage:
#   python insert_listen.py VIDEO_ID LANG TITLE [AUTHOR] [SOURCE] [SEQUENCE_ORDER]
#
# Example:
#   python insert_listen.py dQw4w9WgXcQ de "Deutsch lernen mit DW" "Deutsche Welle" "DW" 1
#
# Reads DATABASE_URL from .env (same one the FastAPI backend uses).
# Requires: pip install youtube-transcript-api psycopg2-binary python-dotenv

import sys
import json
import psycopg2
from dotenv import load_dotenv
import os
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

if len(sys.argv) < 4:
    print("Usage: python insert_listen.py VIDEO_ID LANG TITLE [AUTHOR] [SOURCE] [SEQ_ORDER]")
    sys.exit(1)

video_id       = sys.argv[1]
lang           = sys.argv[2]
title          = sys.argv[3]
author         = sys.argv[4] if len(sys.argv) > 4 else None
source         = sys.argv[5] if len(sys.argv) > 5 else None
sequence_order = int(sys.argv[6]) if len(sys.argv) > 6 else None

# ── Fetch transcript ──────────────────────────────────────────────────────────

print(f"Fetching transcript for {video_id} ({lang})…")

try:
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
except TranscriptsDisabled:
    print("ERROR: Captions are disabled for this video.")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

# Prefer manual English track, fall back to any manual track.
transcript_obj = None
try:
    transcript_obj = transcript_list.find_manually_created_transcript([lang, 'en', 'en-US'])
except NoTranscriptFound:
    manual = [t for t in transcript_list if not t.is_generated]
    if not manual:
        print("ERROR: No manually created transcript found. Only auto-generated captions exist.")
        sys.exit(1)
    transcript_obj = manual[0]

print(f"Using track: {transcript_obj.language} ({transcript_obj.language_code})")
entries = transcript_obj.fetch()
print(f"Fetched {len(entries)} caption entries.")

# ── Segment into ~15-word chunks ──────────────────────────────────────────────

def build_segments(entries, words_per_seg=15):
    segments = []
    cur = {"startMs": 0, "endMs": 0, "words": []}
    for entry in entries:
        text = entry["text"].replace("\n", " ").strip()
        if not text:
            continue
        start_ms = int(entry["start"] * 1000)
        end_ms   = int((entry["start"] + entry["duration"]) * 1000)
        if not cur["words"]:
            cur["startMs"] = start_ms
        cur["endMs"] = end_ms
        cur["words"].extend(text.split())
        if len(cur["words"]) >= words_per_seg:
            segments.append({
                "start": cur["startMs"] // 1000,
                "end":   cur["endMs"]   // 1000,
                "text":  " ".join(cur["words"]),
            })
            cur = {"startMs": 0, "endMs": 0, "words": []}
    if cur["words"]:
        segments.append({
            "start": cur["startMs"] // 1000,
            "end":   cur["endMs"]   // 1000,
            "text":  " ".join(cur["words"]),
        })
    return segments

segments = build_segments(entries)
print(f"Built {len(segments)} segments.")
for i, s in enumerate(segments[:3]):
    print(f"  seg {i+1}: {s['start']}s–{s['end']}s — {s['text'][:60]}…")

# ── Insert into database ──────────────────────────────────────────────────────

conn = psycopg2.connect(DATABASE_URL)
cur  = conn.cursor()

cur.execute("""
    INSERT INTO video_stories (video_id, title, lang, author, source, segments, sequence_order)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    RETURNING id
""", (video_id, title, lang, author, source, json.dumps(segments), sequence_order))

row = cur.fetchone()
conn.commit()
cur.close()
conn.close()

print(f"✓ Inserted video story — id: {row[0]}")
