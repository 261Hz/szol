from fastapi import APIRouter, Depends
from sqlalchemy import nulls_last
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/feed", tags=["Feed"])


@router.get("/", response_model=List[schemas.FeedStoryResponse])
def get_feed(
    lang:  str,
    skip:  int = 0,
    limit: int = 40,
    db: Session = Depends(get_db),
):
    return (
        db.query(models.FeedStory)
        .filter(models.FeedStory.lang == lang)
        .order_by(nulls_last(models.FeedStory.published_at.desc()))
        .offset(skip)
        .limit(min(limit, 100))
        .all()
    )
