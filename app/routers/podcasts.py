"""
Podcast endpoints.

GET  /podcasts/?lang=           list episodes for a language
POST /podcasts/{id}/transcript  fetch transcript via ogjre.com (fast, free)
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

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


@router.post("/{episode_id}/transcript")
def get_transcript(episode_id: UUID, db: Session = Depends(get_db)):
    ep = db.query(models.PodcastEpisode).filter(models.PodcastEpisode.id == episode_id).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Return cached transcript if we have it
    if ep.transcript:
        return {"transcript": ep.transcript, "segments": ep.segments or []}

    # Try ogjre.com (free, fast, ~2s round-trip)
    try:
        from ..ingest.podcasts import fetch_ogjre_transcript
        transcript, segments = fetch_ogjre_transcript(ep.title)
    except Exception:
        raise HTTPException(status_code=503, detail="Transcript fetch failed")

    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not available for this episode")

    ep.transcript = transcript
    ep.segments   = segments or None
    db.commit()
    return {"transcript": transcript, "segments": segments}


def _ext_from_url(url: str) -> str:
    lower = url.lower().split("?")[0]
    for ext in _AUDIO_EXTS:
        if lower.endswith(ext):
            return ext.lstrip(".")
    return "mp3"


def _transcribe(ep: models.PodcastEpisode, db: Session) -> dict:
    import httpx
    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY)

    # Stream-download, capped at MAX_BYTES (truncates long episodes)
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

    # Restrict language hint to Whisper-supported codes
    _WHISPER_LANGS = {
        "en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru",
        "ar", "ja", "zh", "ko", "sv", "tr", "hu", "el",
    }
    lang_hint = ep.lang if ep.lang in _WHISPER_LANGS else None

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
