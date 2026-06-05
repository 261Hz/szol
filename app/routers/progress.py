# progress.py — save and restore where a user is within a story.
#
# Routes
# ------
#   POST /progress/user          upsert sentence position for (user, story, tab)
#   GET  /progress/user          get saved position for (user, story, tab)
#   GET  /progress/user/all      get all progress entries for the current user

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/progress",
    tags=["Progress"],
)


@router.post("/user", response_model=schemas.UserProgressResponse)
def save_progress(
    payload: schemas.UserProgressCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Upsert the user's sentence position for a given story + tab.
    Creates a new row on first visit; updates sentence_index on subsequent calls."""
    existing = (
        db.query(models.UserProgress)
        .filter(
            models.UserProgress.user_id  == current_user.id,
            models.UserProgress.story_id == payload.story_id,
            models.UserProgress.tab      == payload.tab,
        )
        .first()
    )
    if existing:
        existing.sentence_index = payload.sentence_index
        existing.updated_at     = datetime.now(timezone.utc)
        if payload.story_title:
            existing.story_title = payload.story_title
    else:
        existing = models.UserProgress(user_id=current_user.id, **payload.model_dump())
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing


@router.get("/user/all", response_model=list[schemas.UserProgressResponse])
def get_all_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return all saved progress entries for the current user, newest first."""
    return (
        db.query(models.UserProgress)
        .filter(models.UserProgress.user_id == current_user.id)
        .order_by(models.UserProgress.updated_at.desc())
        .all()
    )


@router.get("/user", response_model=schemas.UserProgressResponse)
def get_progress(
    story_id: str,
    tab: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return saved progress for a story + tab, or 404 if none exists."""
    prog = (
        db.query(models.UserProgress)
        .filter(
            models.UserProgress.user_id  == current_user.id,
            models.UserProgress.story_id == story_id,
            models.UserProgress.tab      == tab,
        )
        .first()
    )
    if not prog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No progress saved")
    return prog
