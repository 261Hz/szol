# insert_listen.py — fetch a YouTube video's manual transcript and store it in video_stories.
#
# Usage:
#   python insert_listen.py VIDEO_ID LANG TITLE [AUTHOR] [SOURCE] [SEQUENCE_ORDER]
#
# For non-YouTube audio (podcast, TED, etc.) supply an audio URL instead of a video ID:
#   python insert_listen.py --audio-url https://cdn.ted.com/.../talk.mp3 \
#          --source-type ted LANG TITLE [AUTHOR] [SOURCE] [SEQUENCE_ORDER]
#
# Requires: pip install yt-dlp psycopg2-binary python-dotenv

import sys, json, os, requests, argparse
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DB_USER     = os.getenv("DATABASE_ROOT_USER")
DB_PASSWORD = os.getenv("DATABASE_ROOT_PASSWORD")
DB_HOST     = os.getenv("DATABASE_URL")
DB_PORT     = os.getenv("DATABASE_PORT", "5432")
DB_NAME     = os.getenv("DATABASE_NAME")

if not all([DB_USER, DB_PASSWORD, DB_HOST, DB_NAME]):
    print("ERROR: Missing one of DATABASE_ROOT_USER / DATABASE_ROOT_PASSWORD / DATABASE_URL / DATABASE_NAME in .env")
    sys.exit(1)

DATABASE_DSN = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

parser = argparse.ArgumentParser(description="Insert a listening exercise into video_stories.")
parser.add_argument("lang",           help="Language code, e.g. 'en', 'de'")
parser.add_argument("title",          help="Display title")
parser.add_argument("author",         nargs="?", default=None)
parser.add_argument("source",         nargs="?", default=None, help="e.g. 'TED', 'DW', 'YouTube'")
parser.add_argument("sequence_order", nargs="?", type=int, default=None)
parser.add_argument("--video-id",     default=None, help="YouTube video ID (for YouTube source)")
parser.add_argument("--audio-url",    default=None, help="Direct audio URL (for non-YouTube sources)")
parser.add_argument("--source-type",  default="youtube",
                    choices=["youtube", "ted", "podcast", "upload"],
                    help="Player type (default: youtube)")
parser.add_argument("--transcript-url", default=None,
                    help="Override: fetch transcript JSON from this URL instead of yt-dlp")

args = parser.parse_args()

# ── Validate arguments ────────────────────────────────────────────────────────

if args.source_type == "youtube" and not args.video_id:
    print("ERROR: --video-id is required when --source-type is 'youtube'"); sys.exit(1)

if args.source_type != "youtube" and not args.audio_url and not args.transcript_url:
    print("ERROR: --audio-url is required for non-YouTube sources"); sys.exit(1)

# ── Fetch transcript ──────────────────────────────────────────────────────────

events = []

if args.transcript_url:
    print(f"Fetching transcript from {args.transcript_url}…")
    resp   = requests.get(args.transcript_url, timeout=20)
    data   = resp.json()
    events = [e for e in data.get("events", []) if e.get("segs")]

elif args.source_type == "youtube":
    import yt_dlp

    print(f"Fetching subtitle info for {args.video_id}…")

    ydl_opts = {
        'skip_download':     True,
        'writesubtitles':    True,
        'writeautomaticsub': False,
        'subtitleslangs':    [args.lang, 'en'],
        'quiet':             True,
        'no_warnings':       True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f'https://www.youtube.com/watch?v={args.video_id}', download=False)

    manual_subs = info.get('subtitles', {})
    if not manual_subs:
        print("ERROR: No manually created subtitles found for this video.")
        print("       (Auto-generated captions exist but are excluded for quality reasons.)")
        sys.exit(1)

    pick_lang = args.lang if args.lang in manual_subs else next(iter(manual_subs))
    formats   = manual_subs[pick_lang]
    print(f"Found manual track: {pick_lang} ({len(formats)} format(s) available)")

    preferred = ['json3', 'srv3', 'ttml', 'vtt']
    fmt = next((f for p in preferred for f in formats if f.get('ext') == p), formats[0])
    print(f"Downloading format: {fmt.get('ext')}")

    resp     = requests.get(fmt['url'], timeout=20)
    raw_text = resp.text

    def parse_json3(text):
        data = json.loads(text)
        return [e for e in data.get('events', []) if e.get('segs')]

    def parse_srv3(text):
        import xml.etree.ElementTree as ET
        root   = ET.fromstring(text)
        events = []
        for p in root.iter('p'):
            start_ms = int(p.get('t', 0))
            dur_ms   = int(p.get('d', 2000))
            words    = [s.text or '' for s in p.iter('s')]
            text_str = ''.join(words).replace('\n', ' ').strip()
            if text_str:
                events.append({'tStartMs': start_ms, 'dDurationMs': dur_ms, 'segs': [{'utf8': text_str}]})
        return events

    def parse_vtt(text):
        events = []
        for block in text.split('\n\n'):
            if '-->' not in block:
                continue
            lines     = [l.strip() for l in block.split('\n') if l.strip()]
            time_line = next((l for l in lines if '-->' in l), None)
            if not time_line:
                continue
            def to_ms(t):
                t     = t.split('.')[0]
                parts = t.split(':')
                if len(parts) == 3:
                    return (int(parts[0])*3600 + int(parts[1])*60 + int(parts[2])) * 1000
                return (int(parts[0])*60 + int(parts[1])) * 1000
            start_s, end_s = time_line.split('-->')[0].strip(), time_line.split('-->')[1].strip().split()[0]
            caption_lines  = [l for l in lines if '-->' not in l and not l.isdigit()]
            text_str       = ' '.join(caption_lines).strip()
            if text_str:
                start_ms = to_ms(start_s)
                events.append({'tStartMs': start_ms, 'dDurationMs': to_ms(end_s) - start_ms, 'segs': [{'utf8': text_str}]})
        return events

    ext = fmt.get('ext', 'vtt')
    if ext == 'json3':
        events = parse_json3(raw_text)
    elif ext == 'srv3':
        events = parse_srv3(raw_text)
    else:
        events = parse_vtt(raw_text)

else:
    print("ERROR: For non-YouTube sources, provide --transcript-url with a JSON3 transcript.")
    sys.exit(1)

if not events:
    print("ERROR: Caption track is empty."); sys.exit(1)
print(f"Parsed {len(events)} caption events.")

# ── Segment into ~15-word chunks ──────────────────────────────────────────────

def build_segments(events, words_per_seg=15):
    segments, cur = [], {"startMs": 0, "endMs": 0, "words": []}
    for ev in events:
        text   = ' '.join(s.get('utf8', '') for s in ev['segs']).replace('\n', ' ').strip()
        end_ms = ev['tStartMs'] + ev.get('dDurationMs', 2000)
        if not text:
            continue
        if not cur['words']:
            cur['startMs'] = ev['tStartMs']
        cur['endMs'] = end_ms
        cur['words'].extend(text.split())
        if len(cur['words']) >= words_per_seg:
            segments.append({'start': cur['startMs']//1000, 'end': cur['endMs']//1000, 'text': ' '.join(cur['words'])})
            cur = {"startMs": 0, "endMs": 0, "words": []}
    if cur['words']:
        segments.append({'start': cur['startMs']//1000, 'end': cur['endMs']//1000, 'text': ' '.join(cur['words'])})
    return segments

segments = build_segments(events)
print(f"Built {len(segments)} segments.")
for i, s in enumerate(segments[:3]):
    print(f"  seg {i+1}: {s['start']}s–{s['end']}s — {s['text'][:70]}…")

# ── Insert into database ──────────────────────────────────────────────────────

conn = psycopg2.connect(DATABASE_DSN)
cur  = conn.cursor()
cur.execute("""
    INSERT INTO video_stories
      (video_id, audio_url, source_type, title, lang, author, source, segments, sequence_order)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id
""", (
    args.video_id,
    args.audio_url,
    args.source_type,
    args.title,
    args.lang,
    args.author,
    args.source,
    json.dumps(segments),
    args.sequence_order,
))
row = cur.fetchone()
conn.commit(); cur.close(); conn.close()
print(f"OK Inserted -- id: {row[0]}")
