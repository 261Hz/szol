# words.py — endpoints for word cache and per-user word frequency tracking.
#
# Routes
# ------
#   GET  /words/lookup?word=&lang=   return cached dictionary entry or 404
#   POST /words/cache                insert or update a word cache entry
#   POST /words/user                 (auth) upsert a word into the user's seen-word log
#   GET  /words/user?lang=           (auth) return user's word log for a language

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models, schemas, oauth2
from database import get_db

router = APIRouter(
    prefix="/words",
    tags=["Words"],
)


# ── Public word cache ─────────────────────────────────────────────────────────

@router.get("/lookup", response_model=schemas.WordCacheResponse)
def lookup_word(word: str, lang: str, db: Session = Depends(get_db)):
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == word, models.WordCache.lang == lang)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word not in cache")
    return entry


@router.post("/cache", response_model=schemas.WordCacheResponse)
def cache_word(payload: schemas.WordCacheCreate, db: Session = Depends(get_db)):
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == payload.word, models.WordCache.lang == payload.lang)
        .first()
    )
    if entry:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
    else:
        entry = models.WordCache(**payload.model_dump())
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ── Authenticated user word tracking ─────────────────────────────────────────

@router.post("/user", status_code=status.HTTP_201_CREATED, response_model=schemas.UserWordResponse)
def track_user_word(
    payload: schemas.UserWordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Upsert a word into the current user's seen-word log.

    If the (user_id, word, lang) row already exists, increment seen_count,
    update last_seen, and append story_title to the stories array (if new).
    If it doesn't exist, create a fresh row.
    """
    existing = (
        db.query(models.UserWord)
        .filter(
            models.UserWord.user_id == current_user.id,
            models.UserWord.word    == payload.word,
            models.UserWord.lang    == payload.lang,
        )
        .first()
    )

    if existing:
        existing.seen_count += 1
        existing.last_seen   = datetime.now(timezone.utc)
        if payload.story_title:
            stories = list(existing.stories or [])
            if payload.story_title not in stories:
                stories.append(payload.story_title)
            existing.stories = stories
    else:
        stories = [payload.story_title] if payload.story_title else []
        existing = models.UserWord(
            user_id = current_user.id,
            word    = payload.word,
            lang    = payload.lang,
            stories = stories or None,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing


@router.get("/user", response_model=List[schemas.UserWordResponse])
def get_user_words(
    lang: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return all words the current user has seen for a given language,
    ordered by seen_count descending so the most-encountered words appear first."""
    return (
        db.query(models.UserWord)
        .filter(
            models.UserWord.user_id == current_user.id,
            models.UserWord.lang    == lang,
        )
        .order_by(models.UserWord.seen_count.desc())
        .all()
    )
