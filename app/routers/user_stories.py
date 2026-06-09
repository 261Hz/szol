from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(prefix="/user-stories", tags=["User Stories"])


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.UserStoryResponse)
def save_user_story(
    payload: schemas.UserStoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    story = models.UserStory(user_id=current_user.id, **payload.model_dump())
    db.add(story)
    db.commit()
    db.refresh(story)
    return story


@router.get("/", response_model=List[schemas.UserStoryResponse])
def get_user_stories(
    lang: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    return (
        db.query(models.UserStory)
        .filter(
            models.UserStory.user_id == current_user.id,
            models.UserStory.lang    == lang,
        )
        .order_by(models.UserStory.created_at.desc())
        .all()
    )


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_story(
    story_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    story = (
        db.query(models.UserStory)
        .filter(
            models.UserStory.id      == story_id,
            models.UserStory.user_id == current_user.id,
        )
        .first()
    )
    if not story:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Story not found")
    db.delete(story)
    db.commit()
