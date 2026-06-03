from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas
from ..database import get_db

router = APIRouter(
    prefix="/stories",
    tags=["Stories"],
)


@router.get("/", response_model=List[schemas.CuratedStoryResponse])
def get_curated_stories(lang: str, db: Session = Depends(get_db)):
    """Fetch curated stories for a given language, ordered by sequence_order."""
    stories = (
        db.query(models.CuratedStory)
        .filter(models.CuratedStory.lang == lang)
        .order_by(models.CuratedStory.sequence_order)
        .all()
    )
    return stories


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CommunityStoryResponse)
def create_community_story(story: schemas.CommunityStoryCreate, db: Session = Depends(get_db)):
    """Submit a new community story."""
    new_story = models.CommunityStory(**story.model_dump())
    db.add(new_story)
    db.commit()
    db.refresh(new_story)
    return new_story


@router.get("/community", response_model=List[schemas.CommunityStoryResponse])
def get_community_stories(lang: str, db: Session = Depends(get_db)):
    """Fetch community-submitted stories for a given language, newest first."""
    stories = (
        db.query(models.CommunityStory)
        .filter(models.CommunityStory.lang == lang)
        .order_by(models.CommunityStory.created_at.desc())
        .all()
    )
    return stories
