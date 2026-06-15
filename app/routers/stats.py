from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/stats", tags=["Stats"])


@router.get("/learners")
def get_learner_counts(db: Session = Depends(get_db)):
    """
    Return {lang: count} of distinct learners per language.
    Combines target_lang registrations with active practice (UserProgress).
    """
    counts: dict[str, int] = {}

    # Registered users' stated target language
    rows = (
        db.query(models.User.target_lang, func.count(models.User.id))
        .filter(models.User.target_lang.isnot(None))
        .group_by(models.User.target_lang)
        .all()
    )
    for lang, n in rows:
        counts[lang] = counts.get(lang, 0) + n

    # Distinct users who have practiced each language (progress records)
    rows2 = (
        db.query(models.UserProgress.lang, func.count(func.distinct(models.UserProgress.user_id)))
        .group_by(models.UserProgress.lang)
        .all()
    )
    for lang, n in rows2:
        # Only add if higher than the registration count (avoid double-counting)
        counts[lang] = max(counts.get(lang, 0), n)

    return counts
