from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db

router = APIRouter()

@router.get("/listen-stories", response_model=list[schemas.VideoStoryResponse])
def get_listen_stories(lang: str, db: Session = Depends(get_db)):
    return (
        db.query(models.VideoStory)
        .filter(models.VideoStory.lang == lang)
        .order_by(models.VideoStory.sequence_order)
        .all()
    )
