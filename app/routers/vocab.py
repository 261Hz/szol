# vocab.py — endpoints for the user's saved vocabulary bank.
#
# Routes
# ------
#   POST   /vocab/user          save a word to the current user's vocab bank
#   GET    /vocab/user          return all saved words (all languages)
#   DELETE /vocab/user?word=&lang=  remove a word from the bank

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import models, schemas, oauth2
from database import get_db

router = APIRouter(
    prefix="/vocab",
    tags=["Vocab"],
)


@router.post("/user", status_code=status.HTTP_201_CREATED, response_model=schemas.UserVocabResponse)
def save_vocab_word(
    payload: schemas.UserVocabCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Add a word to the current user's saved vocabulary bank.
    Silently ignores duplicates (same word + lang already saved)."""
    existing = (
        db.query(models.UserVocab)
        .filter(
            models.UserVocab.user_id == current_user.id,
            models.UserVocab.word    == payload.word,
            models.UserVocab.lang    == payload.lang,
        )
        .first()
    )
    if existing:
        return existing  # already saved — idempotent

    entry = models.UserVocab(user_id=current_user.id, **payload.model_dump())
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(models.UserVocab)
            .filter(
                models.UserVocab.user_id == current_user.id,
                models.UserVocab.word    == payload.word,
                models.UserVocab.lang    == payload.lang,
            )
            .first()
        )
        return existing
    db.refresh(entry)
    return entry


@router.get("/user", response_model=List[schemas.UserVocabResponse])
def get_vocab(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return the current user's full saved vocabulary bank, newest first."""
    return (
        db.query(models.UserVocab)
        .filter(models.UserVocab.user_id == current_user.id)
        .order_by(models.UserVocab.saved_at.desc())
        .all()
    )


@router.delete("/user", status_code=status.HTTP_204_NO_CONTENT)
def remove_vocab_word(
    word: str,
    lang: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Remove a word from the current user's vocab bank."""
    entry = (
        db.query(models.UserVocab)
        .filter(
            models.UserVocab.user_id == current_user.id,
            models.UserVocab.word    == word,
            models.UserVocab.lang    == lang,
        )
        .first()
    )
    if entry:
        db.delete(entry)
        db.commit()
