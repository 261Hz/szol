from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(
    prefix="/words",
    tags=["Words"],
)


@router.get("/lookup", response_model=schemas.WordCacheResponse)
def lookup_word(word: str, lang: str, db: Session = Depends(get_db)):
    """Check the word_cache table for an existing entry. Returns 404 if not cached."""
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
    """Upsert a word entry into word_cache (insert or update by word + lang)."""
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == payload.word, models.WordCache.lang == payload.lang)
        .first()
    )

    if entry:
        # Update every field the caller provided.
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
    else:
        entry = models.WordCache(**payload.model_dump())
        db.add(entry)

    db.commit()
    db.refresh(entry)
    return entry
