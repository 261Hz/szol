"""
Podcast endpoints.

GET  /podcasts/search?q=        search iTunes for podcasts
POST /podcasts/subscribe        add a podcast feed and ingest episodes
GET  /podcasts/?lang=           list episodes for a language
POST /podcasts/{id}/transcript  scraped transcript (ogjre/Lex) → Groq Whisper fallback
"""

import logging
import re
import urllib.parse
from typing import List
from uuid import UUID

import requests as _requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..config import settings

_MAX_BYTES = 24 * 1024 * 1024  # 24 MB — Groq upload limit
_AUDIO_EXTS = [".mp3", ".m4a", ".aac", ".ogg", ".flac", ".wav", ".webm", ".opus"]
_WHISPER_LANG_MAP = {"arz": "ar"}  # non-ISO-639-1 codes Whisper doesn't accept
_WHISPER_LANGS = {
    "en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru",
    "ar", "ja", "zh", "ko", "sv", "tr", "hu", "el", "he",
}

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/podcasts", tags=["Podcasts"])


@router.get("/", response_model=List[schemas.PodcastEpisodeResponse])
def list_episodes(lang: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.PodcastEpisode)
        .filter(models.PodcastEpisode.lang == lang)
        .order_by(models.PodcastEpisode.published_at.desc())
        .limit(40)
        .all()
    )
    return [schemas.PodcastEpisodeResponse.from_orm(r) for r in rows]


@router.get("/search")
def search_podcasts(q: str):
    """Proxy iTunes podcast search — avoids CORS on the frontend."""
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(q)}&entity=podcast&limit=12"
    try:
        r = _requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"iTunes search failed: {e}")
    results = []
    for p in data.get("results", []):
        feed = p.get("feedUrl")
        if not feed:
            continue
        results.append({
            "title":         p.get("collectionName", ""),
            "feed_url":      feed,
            "artwork":       p.get("artworkUrl600", ""),
            "publisher":     p.get("artistName", ""),
            "episode_count": p.get("trackCount", 0),
            "lang":          (p.get("country") or "").lower(),
        })
    return results


class _SubscribeIn(BaseModel):
    feed_url:     str
    lang:         str
    max_episodes: int = 10


@router.post("/subscribe")
def subscribe_podcast(payload: _SubscribeIn, db: Session = Depends(get_db)):
    """Parse an RSS feed and ingest its recent episodes into podcast_episodes."""
    import feedparser
    from ..ingest.podcasts import _audio_url, _duration_sec, _parse_date, _strip_html

    try:
        feed = feedparser.parse(payload.feed_url)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse feed: {e}")

    if not feed.entries:
        raise HTTPException(status_code=422, detail="Feed is empty or invalid")

    podcast_name = (feed.feed.get("title") or "Unknown Podcast").strip()
    added, skipped = [], 0

    for entry in feed.entries[: payload.max_episodes]:
        audio = _audio_url(entry)
        if not audio:
            continue

        if db.query(models.PodcastEpisode).filter_by(audio_url=audio).first():
            skipped += 1
            continue

        title = _strip_html(entry.get("title", "Untitled"))

        ep = models.PodcastEpisode(
            podcast_name = podcast_name,
            lang         = payload.lang,
            title        = title,
            audio_url    = audio,
            duration_sec = _duration_sec(entry),
            description  = _strip_html(entry.get("summary", "") or "")[:1000],
            published_at = _parse_date(entry),
            transcript   = None,
            segments     = None,
        )
        db.add(ep)
        added.append({"title": title, "has_transcript": False})

    db.commit()
    return {
        "podcast_name":    podcast_name,
        "episodes_added":  len(added),
        "episodes_skipped": skipped,
        "episodes":        added,
    }


def _lex_slug_from_audio(audio_url: str) -> str | None:
    """Extract the episode slug from a Blubrry audio URL.

    https://…/lex_ai_lars_brownworth.mp3 → lars-brownworth
    Strips query strings before matching.
    """
    clean = audio_url.split("?")[0].split("#")[0]
    m = re.search(r'/lex_ai_([^/]+?)(?:\.mp3|\.m4a|\.aac)?$', clean, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).replace("_", "-")


@router.post("/{episode_id}/transcript")
def get_transcript(episode_id: UUID, db: Session = Depends(get_db)):
    ep = db.query(models.PodcastEpisode).filter(models.PodcastEpisode.id == episode_id).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Return cached transcript if we have it
    if ep.transcript:
        return {"transcript": ep.transcript, "segments": ep.segments or []}

    transcript, segments = None, []

    # Try ogjre.com for JRE episodes
    if ep.podcast_name == "The Joe Rogan Experience":
        try:
            from ..ingest.podcasts import fetch_ogjre_transcript
            transcript, segments = fetch_ogjre_transcript(ep.title)
        except Exception:
            pass

    # Try lexfridman.com for Lex Fridman episodes
    if not transcript and ep.podcast_name == "Lex Fridman Podcast":
        try:
            from ..ingest.podcasts import _fetch_lex_transcript
            slug = _lex_slug_from_audio(ep.audio_url)
            logger.info("Lex on-demand: audio=%s → slug=%s", ep.audio_url, slug)
            if slug:
                transcript, segments = _fetch_lex_transcript(slug)
                logger.info("Lex on-demand result: transcript=%s segs=%d", bool(transcript), len(segments))
        except Exception as exc:
            logger.warning("Lex on-demand fetch error: %s", exc)

    if not transcript:
        return _transcribe(ep, db)

    ep.transcript = transcript
    ep.segments   = segments or None
    db.commit()
    return {"transcript": transcript, "segments": segments}


@router.post("/repair-names", status_code=200)
def repair_podcast_names(db: Session = Depends(get_db)):
    """One-shot: rename podcast_name for all episodes to match current podcast_sources registry."""
    from ..podcast_sources import PODCAST_SOURCES
    from ..ingest.podcasts import fetch_ogjre_transcript  # noqa: ensure module loads
    import feedparser

    name_map: dict[str, str] = {}
    for source in PODCAST_SOURCES:
        try:
            feed = feedparser.parse(source["feed_url"])
        except Exception:
            continue
        for entry in feed.entries[:source.get("max_episodes", 10)]:
            for enc in getattr(entry, "enclosures", []):
                url = enc.get("href") or enc.get("url", "")
                if url:
                    name_map[url] = source["name"]

    updated = 0
    for ep in db.query(models.PodcastEpisode).all():
        correct = name_map.get(ep.audio_url)
        if correct and ep.podcast_name != correct:
            logger.info("repair: %r → %r for %s", ep.podcast_name, correct, ep.title)
            ep.podcast_name = correct
            updated += 1
    db.commit()
    return {"updated": updated}


class _SaveIn(BaseModel):
    segments: list[dict]

@router.post("/{episode_id}/transcript/save", status_code=204)
def save_transcript(episode_id: UUID, payload: _SaveIn, db: Session = Depends(get_db)):
    """Cache a transcript fetched by the frontend (e.g. via ogjre Vercel proxy)."""
    ep = db.query(models.PodcastEpisode).filter(models.PodcastEpisode.id == episode_id).first()
    if not ep or ep.segments:
        return  # episode missing or already cached — nothing to do
    ep.segments = payload.segments
    db.commit()


def _ext_from_url(url: str) -> str:
    lower = url.lower().split("?")[0]
    for ext in _AUDIO_EXTS:
        if lower.endswith(ext):
            return ext.lstrip(".")
    return "mp3"


def _transcribe(ep: models.PodcastEpisode, db: Session) -> dict:
    import httpx
    from groq import Groq

    if not settings.GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Groq not configured — cannot transcribe audio.")

    client = Groq(api_key=settings.GROQ_API_KEY)

    audio = bytearray()
    truncated = False
    try:
        with httpx.stream(
            "GET", ep.audio_url,
            timeout=120,
            follow_redirects=True,
            headers={"User-Agent": "Szol/1.0"},
        ) as r:
            r.raise_for_status()
            for chunk in r.iter_bytes(chunk_size=65536):
                audio.extend(chunk)
                if len(audio) >= _MAX_BYTES:
                    truncated = True
                    break
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not download audio: {e}")

    ext = _ext_from_url(ep.audio_url)
    raw_lang = _WHISPER_LANG_MAP.get(ep.lang, ep.lang)
    lang_hint = raw_lang if raw_lang in _WHISPER_LANGS else None

    try:
        resp = client.audio.transcriptions.create(
            file=(f"episode.{ext}", bytes(audio)),
            model="whisper-large-v3",
            language=lang_hint,
            response_format="verbose_json",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Whisper transcription failed: {e}")

    transcript = resp.text or ""
    segments: list[dict] = []
    if hasattr(resp, "segments") and resp.segments:
        segments = [
            {"start": s.start, "end": s.end, "text": s.text}
            for s in resp.segments
        ]

    if truncated and transcript:
        transcript += "\n\n[Transcript truncated — episode exceeds 24 MB download limit]"

    ep.transcript = transcript
    ep.segments   = segments
    db.commit()

    return {"transcript": transcript, "segments": segments}
