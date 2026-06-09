# stories.py — endpoints for reading and submitting stories.
#
# Routes
# ------
#   GET  /stories?lang=           curated stories for a language
#   POST /stories                 submit a community story (auto-moderated via Groq)
#   GET  /stories/community?lang= approved community stories for a language

import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from groq import Groq

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/stories",
    tags=["Stories"],
)

_groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def _moderate(title: str, content: str) -> tuple[bool, str]:
    """
    Run content through Groq moderation. Returns (is_safe, reason).
    Uses a fast small model to keep latency low.
    Fails open (returns True) if Groq is unavailable, so a Groq outage
    doesn't block all submissions — those are saved with reviewed=False
    for manual review instead.
    """
    snippet = (title + "\n\n" + content)[:2000]
    try:
        resp = _groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{
                "role": "user",
                "content": (
                    "You are a content moderator for a language-learning app used by students of all ages. "
                    "Review the following user-submitted story and respond with ONLY one of:\n"
                    "  SAFE\n"
                    "  UNSAFE: <brief reason>\n\n"
                    "Flag content that contains: hate speech, explicit sexual content, graphic violence, "
                    "spam, personal information (emails, phone numbers), or harassment.\n"
                    "Educational content, historical events, and mature literary themes are fine.\n\n"
                    f"Story:\n{snippet}"
                ),
            }],
            max_tokens=60,
            temperature=0,
        )
        verdict = resp.choices[0].message.content.strip()
        if verdict.upper().startswith("UNSAFE"):
            reason = verdict[7:].strip(" :\n") or "Content policy violation"
            return False, reason
        return True, ""
    except Exception:
        # Groq unavailable — fail open, flag for manual review
        return True, "moderation_skipped"


@router.get("/", response_model=List[schemas.CuratedStoryResponse])
def get_curated_stories(lang: str, db: Session = Depends(get_db)):
    return (
        db.query(models.CuratedStory)
        .filter(models.CuratedStory.lang == lang)
        .order_by(models.CuratedStory.sequence_order)
        .all()
    )


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CommunityStoryResponse)
def create_community_story(
    story: schemas.CommunityStoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    data = story.model_dump()
    if not data.get("author"):
        data["author"] = current_user.username

    is_safe, reason = _moderate(data.get("title", ""), data.get("content", ""))
    if not is_safe:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Story could not be published: {reason}",
        )

    # reviewed=True  → moderation passed, story is live immediately
    # reviewed=False → moderation was skipped (Groq unavailable), held for manual review
    data["reviewed"] = (reason != "moderation_skipped")

    new_story = models.CommunityStory(**data)
    db.add(new_story)
    db.commit()
    db.refresh(new_story)
    return new_story


@router.get("/community", response_model=List[schemas.CommunityStoryResponse])
def get_community_stories(lang: str, db: Session = Depends(get_db)):
    return (
        db.query(models.CommunityStory)
        .filter(
            models.CommunityStory.lang == lang,
            models.CommunityStory.reviewed == True,
        )
        .order_by(models.CommunityStory.created_at.desc())
        .all()
    )
