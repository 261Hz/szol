"""
Podcast RSS ingest — fetches episode metadata and stores in DB.

For sources with transcript_source='ogjre', transcripts + timestamped
segments are fetched from api.ogjre.com/graphql (free, no auth) at
ingest time. Other sources leave transcript=null (Whisper on demand).
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any

import feedparser
import requests

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Szol/1.0 (+https://szol.app; podcast ingest; "
        "contact: hello@szol.app)"
    )
}
_TIMEOUT = 15
_OGJRE_GQL = "https://api.ogjre.com/graphql"

_GQL_QUERY = """
{
  video(slug: "%s") {
    transcriptStatus
    transcriptText
    transcriptSegments { startMs endMs text }
  }
}
"""


def ogjre_slug(title: str) -> str | None:
    """Build the ogjre.com URL slug from an episode title.

    '#2516 - Rowan Jacobsen'                → 'joe-rogan-experience-2516-rowan-jacobsen'
    'JRE MMA Show #180 with Daniel Rodriguez' → 'jre-mma-show-180-with-daniel-rodriguez'
    """
    if not re.search(r"#\d+", title):
        return None
    slugify = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    # Titles like "#2516 - Guest" have no show name — prepend the JRE prefix
    if re.match(r"\s*#\d+", title):
        return f"joe-rogan-experience-{slugify(title.strip()[1:])}"
    return slugify(title)


def fetch_ogjre_transcript(title: str) -> tuple[str | None, list[dict]]:
    """Return (transcript_text, segments) from ogjre.com, or (None, [])."""
    slug = ogjre_slug(title)
    if not slug:
        return None, []
    try:
        resp = requests.post(
            _OGJRE_GQL,
            json={"query": _GQL_QUERY % slug},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        video = resp.json().get("data", {}).get("video") or {}
        if video.get("transcriptStatus") not in ("DONE", "READY"):
            return None, []
        text  = video.get("transcriptText") or ""
        segs  = [
            {"start": s["startMs"] / 1000, "end": s["endMs"] / 1000, "text": s["text"]}
            for s in video.get("transcriptSegments") or []
        ]
        return text, segs
    except Exception as e:
        logger.warning("ogjre transcript fetch failed for %s: %s", slug, e)
        return None, []


def _audio_url(entry: Any) -> str | None:
    for enc in getattr(entry, "enclosures", []):
        ctype = enc.get("type", "")
        href  = enc.get("href") or enc.get("url", "")
        if ctype.startswith("audio/") or href.endswith((".mp3", ".m4a", ".ogg", ".aac")):
            return href or None
    for link in entry.get("links", []):
        if link.get("type", "").startswith("audio/"):
            return link.get("href") or link.get("url")
    return None


def _transcript_url(entry: Any) -> str | None:
    for item in getattr(entry, "podcast_transcript", None) or []:
        url = item.get("url") or item.get("href")
        if url:
            return url
    return None


def _duration_sec(entry: Any) -> int | None:
    dur = getattr(entry, "itunes_duration", None)
    if not dur:
        return None
    if isinstance(dur, (int, float)):
        return int(dur)
    parts = str(dur).strip().split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(float(parts[1]))
        return int(float(parts[0]))
    except (ValueError, IndexError):
        return None


def _parse_date(entry: Any) -> datetime | None:
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "").strip()


def _lex_transcript_url(entry: Any) -> str | None:
    """Derive the transcript page URL from the episode link.

    Episode link: https://lexfridman.com/don-lincoln/?utm_source=rss...
    Transcript:   https://lexfridman.com/don-lincoln-transcript
    """
    link = entry.get("link") or ""
    m = re.search(r'lexfridman\.com/([^/?#]+)', link)
    if not m:
        return None
    slug = m.group(1).rstrip("/")
    return f"https://lexfridman.com/{slug}-transcript"


def _parse_lex_segments(text: str) -> tuple[str, list[dict]]:
    """Parse Lex Fridman transcript text into (plain_text, segments).

    Transcript format:
        Speaker Name
        (HH:MM:SS)
        Dialogue text…

    Returns timestamped segments usable by the dictation player.
    """
    def _secs(ts: str) -> float:
        parts = ts.split(":")
        return sum(float(p) * 60 ** (len(parts) - 1 - i) for i, p in enumerate(parts))

    # Split on (HH:MM:SS) / (MM:SS) markers
    parts = re.split(r"\((\d{1,2}:\d{2}(?::\d{2})?)\)", text)
    # parts = [pre, ts0, block0, ts1, block1, ...]
    timestamps = [_secs(parts[i]) for i in range(1, len(parts), 2)]
    blocks     = [parts[i] for i in range(2, len(parts), 2)]

    segments = []
    for i, (ts, raw) in enumerate(zip(timestamps, blocks)):
        end = timestamps[i + 1] if i + 1 < len(timestamps) else ts + 120
        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        # Drop leading speaker-name line (short, no sentence punctuation)
        if lines and len(lines[0]) < 40 and not re.search(r"[.!?,;]", lines[0]):
            lines = lines[1:]
        if not lines:
            continue
        seg_text = " ".join(lines)
        segments.append({"start": ts, "end": end, "text": seg_text})

    full_text = " ".join(s["text"] for s in segments)
    return full_text, segments


def _fetch_lex_transcript(url: str) -> tuple[str | None, list[dict]]:
    """Fetch a Lex Fridman transcript page and return (text, segments)."""
    try:
        import trafilatura
        r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        r.raise_for_status()
        raw = trafilatura.extract(r.text, include_comments=False, include_tables=False)
        if not raw:
            return None, []
        text, segments = _parse_lex_segments(raw)
        return (text.strip() or None), segments
    except Exception as e:
        logger.warning("Lex transcript fetch failed %s: %s", url, e)
        return None, []


def _fetch_rss_transcript(url: str) -> str | None:
    try:
        r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        r.raise_for_status()
        ct = r.headers.get("content-type", "").lower()
        return _parse_transcript_body(r.text, ct)
    except Exception as e:
        logger.warning("RSS transcript fetch failed %s: %s", url, e)
        return None


def _parse_transcript_body(text: str, content_type: str) -> str:
    if "json" in content_type:
        import json
        try:
            data = json.loads(text)
            segs = data.get("segments") or data.get("words") or []
            return " ".join(s.get("text", "") for s in segs).strip()
        except Exception:
            return text.strip()
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.isdigit() or "-->" in s or s.upper() == "WEBVTT":
            continue
        lines.append(s)
    return " ".join(lines)


def ingest_podcasts(db, dry_run: bool = False) -> int:
    from ..podcast_sources import PODCAST_SOURCES
    from ..models import PodcastEpisode

    total = 0
    for source in PODCAST_SOURCES:
        logger.info("→ [podcast] %s  [%s]", source["name"], source["lang"])
        try:
            feed = feedparser.parse(source["feed_url"])
        except Exception as e:
            logger.warning("  Failed to parse feed: %s", e)
            continue

        use_ogjre = source.get("transcript_source") == "ogjre"
        max_ep    = source.get("max_episodes", 10)
        inserted  = 0

        for entry in feed.entries[:max_ep]:
            audio = _audio_url(entry)
            if not audio:
                continue

            exists = db.query(PodcastEpisode.id).filter_by(audio_url=audio).first()
            if exists:
                continue

            title = _strip_html(entry.get("title", "Untitled"))

            # Transcript: ogjre API > web page > RSS tag > null
            transcript, segments = None, []
            if use_ogjre:
                transcript, segments = fetch_ogjre_transcript(title)
                if transcript:
                    logger.info("    ✓ ogjre transcript: %s", title)
            if not transcript and source.get("transcript_source") == "lexfridman":
                tx_url = _lex_transcript_url(entry)
                if tx_url:
                    transcript, lex_segs = _fetch_lex_transcript(tx_url)
                    if transcript:
                        segments = lex_segs
                        logger.info("    ✓ lex transcript (%d segs): %s", len(lex_segs), title)
            if not transcript:
                tx_url = _transcript_url(entry)
                if tx_url:
                    transcript = _fetch_rss_transcript(tx_url)

            ep = PodcastEpisode(
                podcast_name=source["name"],
                lang=source["lang"],
                title=title,
                audio_url=audio,
                duration_sec=_duration_sec(entry),
                description=_strip_html(entry.get("summary", "") or "")[:1000],
                published_at=_parse_date(entry),
                transcript=transcript,
                segments=segments or None,
            )

            if not dry_run:
                db.add(ep)
            inserted += 1

        if not dry_run and inserted:
            db.commit()

        logger.info("  %d new episode(s)", inserted)
        total += inserted

    return total
