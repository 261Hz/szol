# vocab.py -- endpoints for the user's saved vocabulary bank and shared video clips corpus.
#
# Routes
# ------
#   POST   /vocab/user              save a word to the current user's vocab bank
#   GET    /vocab/user              return all saved words (all languages)
#   DELETE /vocab/user?word=&lang=  remove a word from the bank
#   POST   /vocab/words/request     (public via Vercel proxy) queue a word for clip generation
#   GET    /vocab/clips?word=&lang= return cached clips (populated by local worker.py)
#   POST   /vocab/clips             accept clips from local worker.py
#   GET    /vocab/all-words         (worker) return all (word,lang) pairs that need clips

from datetime import datetime, timezone, timedelta
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import union
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .. import models, schemas, oauth2
from ..config import settings
from ..database import get_db

router = APIRouter(
    prefix="/vocab",
    tags=["Vocab"],
)

# -- User vocab bank ----------------------------------------------------------

@router.post("/user", status_code=status.HTTP_201_CREATED, response_model=schemas.UserVocabResponse)
def save_vocab_word(
    payload: schemas.UserVocabCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
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
        return existing

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


# -- Public word-clip request (guests + logged-in users) ----------------------

@router.post("/words/request", status_code=status.HTTP_204_NO_CONTENT)
def request_word_clip(
    payload: schemas.VocabWordRequestIn,
    x_worker_secret: str = Header(None),
    db: Session = Depends(get_db),
):
    """Queue a (word, lang) pair for clip generation. Callers must supply
    X-Worker-Secret — the Vercel api/queue-word.js proxy adds it so guests
    never need to know the secret."""
    if not settings.WORKER_SECRET or x_worker_secret != settings.WORKER_SECRET:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid worker secret")

    word = payload.word.strip()
    lang = payload.lang.strip()
    _CJK = {'ja', 'zh', 'ko', 'cmn', 'yue'}
    min_len = 1 if lang in _CJK else 2
    if not word or len(word) < min_len or len(word) > 40:
        return  # silently ignore junk

    existing = (
        db.query(models.VocabWordRequest)
        .filter_by(word=word, lang=lang)
        .first()
    )
    if not existing:
        db.add(models.VocabWordRequest(word=word, lang=lang))
        try:
            db.commit()
        except Exception:
            db.rollback()  # unique constraint race — that's fine


# -- Shared YouTube clips corpus ----------------------------------------------

_CLIP_TTL_DAYS = 7


@router.get("/clips", response_model=List[schemas.VocabClipOut])
def get_vocab_clips(word: str, lang: str, limit: int = 5, db: Session = Depends(get_db)):
    """Return cached clips for `word`. Clips are populated by the local worker.py."""
    if not word.strip() or not lang.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "word and lang are required")

    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=_CLIP_TTL_DAYS)
    return (
        db.query(models.VocabClip)
        .filter(
            models.VocabClip.word       == word,
            models.VocabClip.lang       == lang,
            models.VocabClip.crawled_at >  stale_cutoff,
        )
        .limit(min(limit, 8))
        .all()
    )


@router.get("/all-words")
def get_all_words(
    x_worker_secret: str = Header(None),
    db: Session = Depends(get_db),
):
    """Return all unique (word, lang) pairs from every user's vocab bank.
    Only words that have no cached clips are returned — nothing to do otherwise.
    Protected by WORKER_SECRET header."""
    if not settings.WORKER_SECRET or x_worker_secret != settings.WORKER_SECRET:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid worker secret")

    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=_CLIP_TTL_DAYS)

    # All unique (word, lang) from logged-in users' vocab banks + guest requests
    user_pairs = db.query(models.UserVocab.word, models.UserVocab.lang).distinct()
    guest_pairs = db.query(models.VocabWordRequest.word, models.VocabWordRequest.lang).distinct()
    all_pairs = db.execute(union(user_pairs, guest_pairs)).fetchall()

    # Which ones already have fresh clips
    cached = set(
        (r.word, r.lang)
        for r in db.query(models.VocabClip.word, models.VocabClip.lang)
        .filter(models.VocabClip.crawled_at > stale_cutoff)
        .distinct()
        .all()
    )

    _CJK = {'ja', 'zh', 'ko', 'cmn', 'yue'}
    pending = [
        {"word": w, "lang": l}
        for w, l in all_pairs
        if (w, l) not in cached
        and len(w.strip()) >= (1 if l in _CJK else 2)
        and len(w.strip()) <= 40
        and not (' ' in w.strip() and len(w.strip()) > 20)
    ]
    return pending


@router.post("/clips", status_code=status.HTTP_201_CREATED)
def post_vocab_clips(
    clips: List[schemas.VocabClipIn],
    x_worker_secret: str = Header(None),
    db: Session = Depends(get_db),
):
    """Accept clips from the local worker. Protected by WORKER_SECRET header."""
    if not settings.WORKER_SECRET or x_worker_secret != settings.WORKER_SECRET:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "invalid worker secret")

    inserted = 0
    for clip in clips:
        exists = db.query(models.VocabClip).filter_by(
            word=clip.word, lang=clip.lang,
            video_id=clip.video_id, start_sec=clip.start_sec,
        ).first()
        if not exists:
            db.add(models.VocabClip(**clip.model_dump()))
            inserted += 1
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "db error")

    print(f"[clips] worker posted {len(clips)} clips, {inserted} new", flush=True)
    return {"inserted": inserted, "total": len(clips)}
