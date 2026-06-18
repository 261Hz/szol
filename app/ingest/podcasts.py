"""
Podcast RSS ingest — fetches episode metadata and stores in DB.

Transcription is NOT done here; it happens on demand via
POST /podcasts/{id}/transcript when a user opens an episode.
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
    """Look for Podcasting 2.0 <podcast:transcript> tag."""
    # feedparser may surface this as entry.podcast_transcript (list of dicts)
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


def _fetch_transcript(url: str) -> str | None:
    """Fetch and parse an RSS-linked transcript (SRT, VTT, JSON, or plain text)."""
    try:
        r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        r.raise_for_status()
        ct = r.headers.get("content-type", "").lower()
        return _parse_transcript_body(r.text, ct)
    except Exception as e:
        logger.warning("Could not fetch transcript from %s: %s", url, e)
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
    # Strip SRT / VTT timing + sequence lines
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.isdigit() or "-->" in stripped:
            continue
        if stripped.upper() in ("WEBVTT",):
            continue
        lines.append(stripped)
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

        max_ep  = source.get("max_episodes", 10)
        inserted = 0

        for entry in feed.entries[:max_ep]:
            audio = _audio_url(entry)
            if not audio:
                continue

            exists = db.query(PodcastEpisode.id).filter_by(audio_url=audio).first()
            if exists:
                continue

            tx_url = _transcript_url(entry)
            transcript = _fetch_transcript(tx_url) if tx_url else None

            ep = PodcastEpisode(
                podcast_name=source["name"],
                lang=source["lang"],
                title=_strip_html(entry.get("title", "Untitled")),
                audio_url=audio,
                duration_sec=_duration_sec(entry),
                description=_strip_html(entry.get("summary", "") or "")[:1000],
                published_at=_parse_date(entry),
                transcript=transcript,
            )

            if not dry_run:
                db.add(ep)
            inserted += 1

        if not dry_run and inserted:
            db.commit()

        logger.info("  %d new episode(s)", inserted)
        total += inserted

    return total
