# words.py — endpoints for the word definition cache.
#
# The frontend looks up a word before hitting an external dictionary API.
# If the word is already cached (lookup returns 200) it uses the stored data.
# If not (lookup returns 404) it fetches from the dictionary and calls POST /words/cache
# to store the result for future requests.
#
# Routes
# ------
#   GET  /words/lookup?word=&lang=  return cached entry or 404
#   POST /words/cache               insert or update a word entry

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
    # Both word and lang are required query parameters: GET /words/lookup?word=hablar&lang=es
    # We filter on both columns so "run" in English and "run" in another language are stored
    # as separate entries (definitions differ across languages).
    # .first() returns the matching row or None if no row exists.
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == word, models.WordCache.lang == lang)
        .first()
    )
    if not entry:
        # 404 is the correct status here: "not found in cache" is an expected, non-error
        # condition that tells the caller to fetch from the dictionary API instead.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word not in cache")
    return entry


@router.post("/cache", response_model=schemas.WordCacheResponse)
def cache_word(payload: schemas.WordCacheCreate, db: Session = Depends(get_db)):
    # Upsert logic: check whether a row for this (word, lang) pair already exists.
    # We do this in Python rather than using a raw ON CONFLICT clause so the code stays
    # database-agnostic and consistent with the ORM patterns used elsewhere in this project.
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == payload.word, models.WordCache.lang == payload.lang)
        .first()
    )

    if entry:
        # Row exists — update only the fields the caller actually sent.
        # exclude_unset=True omits fields the caller left as their Pydantic default,
        # which prevents accidentally overwriting stored data with None or a stale default.
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
    else:
        # No existing row — create a fresh one from the full payload.
        entry = models.WordCache(**payload.model_dump())
        db.add(entry)

    # commit() writes the INSERT or UPDATE; refresh() reloads server-generated fields
    # (id, created_at) so the response object is fully populated.
    db.commit()
    db.refresh(entry)
    return entry
