# stories.py — endpoints for reading and submitting stories.
#
# All routes are public (no auth) so the frontend can load content before a user logs in.
#
# Routes
# ------
#   GET  /stories?lang=           curated stories for a language
#   POST /stories                 submit a community story
#   GET  /stories/community?lang= community stories for a language

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas
from ..database import get_db

# prefix="/stories" means every route below is relative to /stories.
# tags=["Stories"] groups these routes together in the auto-generated /docs UI.
router = APIRouter(
    prefix="/stories",
    tags=["Stories"],
)


@router.get("/", response_model=List[schemas.CuratedStoryResponse])
def get_curated_stories(lang: str, db: Session = Depends(get_db)):
    # lang is a required query parameter: GET /stories?lang=es
    # Depends(get_db) injects a SQLAlchemy session that is automatically closed after the request.
    # .filter() adds a WHERE clause; .order_by() sorts by the sequence_order column so stories
    # appear in the intended reading order rather than insertion order.
    stories = (
        db.query(models.CuratedStory)
        .filter(models.CuratedStory.lang == lang)
        .order_by(models.CuratedStory.sequence_order)
        .all()
    )
    return stories


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CommunityStoryResponse)
def create_community_story(story: schemas.CommunityStoryCreate, db: Session = Depends(get_db)):
    # story.model_dump() converts the Pydantic model to a plain dict so we can unpack it
    # as keyword arguments into the SQLAlchemy model constructor (**kwargs).
    # db.add()    stages the new row.
    # db.commit() writes it to the database.
    # db.refresh() re-reads the row so server-set fields (id, created_at, reviewed) are populated
    #              before we return the response — otherwise those fields would be None.
    new_story = models.CommunityStory(**story.model_dump())
    db.add(new_story)
    db.commit()
    db.refresh(new_story)
    return new_story


@router.get("/community", response_model=List[schemas.CommunityStoryResponse])
def get_community_stories(lang: str, db: Session = Depends(get_db)):
    # .desc() reverses the sort so the most recently submitted stories appear first,
    # giving returning users fresh content at the top.
    stories = (
        db.query(models.CommunityStory)
        .filter(models.CommunityStory.lang == lang)
        .order_by(models.CommunityStory.created_at.desc())
        .all()
    )
    return stories
