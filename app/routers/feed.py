import time
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..ingest.fetch import fetch_source
from ..ingest.sources import SOURCES

router = APIRouter(prefix="/feed", tags=["Feed"])

_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
_CACHE_TTL = 12 * 3600  # seconds — refresh articles twice a day
_cache: dict[str, tuple[list[dict], float]] = {}


def _stable_id(source_url: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, source_url)


def _fetch_lang(lang: str) -> list[dict]:
    sources = [s for s in SOURCES if s["lang"] == lang]
    articles: list[dict] = []
    now = datetime.now(timezone.utc)
    for source in sources:
        try:
            for art in fetch_source(source):
                art["id"] = _stable_id(art["source_url"])
                art["fetched_at"] = now
                articles.append(art)
        except Exception:
            pass
    articles.sort(
        key=lambda a: a.get("published_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return articles


def _get_cached(lang: str) -> list[dict]:
    now = time.monotonic()
    if lang in _cache:
        articles, ts = _cache[lang]
        if now - ts < _CACHE_TTL:
            return articles
    articles = _fetch_lang(lang)
    _cache[lang] = (articles, now)
    return articles


@router.get("/", response_model=List[schemas.FeedStoryResponse])
def get_feed(lang: str, skip: int = 0, limit: int = 40):
    articles = _get_cached(lang)
    return articles[skip : skip + min(limit, 100)]


@router.post("/suggest", status_code=201)
def suggest_source(payload: schemas.SourceSuggestionCreate, db: Session = Depends(get_db)):
    db.add(models.SourceSuggestion(url=payload.url, lang=payload.lang, note=payload.note))
    db.commit()
    return {"status": "received"}
