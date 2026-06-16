# vocab.py -- endpoints for the user's saved vocabulary bank and shared video clips corpus.
#
# Routes
# ------
#   POST   /vocab/user              save a word to the current user's vocab bank
#   GET    /vocab/user              return all saved words (all languages)
#   DELETE /vocab/user?word=&lang=  remove a word from the bank
#   GET    /vocab/clips?word=&lang= return YouTube clips where `word` appears (crawls on cache miss)

import json
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import List

import yt_dlp
from fastapi import APIRouter, Depends, HTTPException, status
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


# -- Shared YouTube clips corpus ----------------------------------------------

_CLIP_TTL_DAYS = 7
_MAX_CLIPS     = 8
_MAX_VIDEOS    = 8

_ARABIC_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]")
_HEBREW_NIQQUD     = re.compile(r"[֑-ׇ]")


def _normalize(word: str, lang: str) -> str:
    w = unicodedata.normalize("NFKC", word).strip().lower()
    if lang in ("ar", "arz"):
        return _ARABIC_DIACRITICS.sub("", w)
    if lang == "he":
        return _HEBREW_NIQQUD.sub("", w)
    return w


def _contains_word(target: str, text: str, lang: str) -> bool:
    t = _normalize(target, lang)
    s = _normalize(text, lang)
    if not t:
        return False
    if lang in ("zh", "ja", "ko", "th"):
        return t in s
    return bool(re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", s))


_VERCEL_URL = "https://szol.vercel.app"


def _crawl_clips(word: str, lang: str, db: Session) -> list:
    """Search YouTube for `word`, delegate transcript fetching to Vercel (bot-safe IPs)."""
    base_lang = lang[:2]

    # Step 1: search for captioned videos via YouTube Data API.
    # Fall back to yt-dlp ytsearch (may include music videos without captions).
    video_ids = []
    if settings.YOUTUBE_API_KEY:
        try:
            params = urllib.parse.urlencode({
                "q": word, "type": "video",
                "videoCaption": "closedCaption",
                "relevanceLanguage": base_lang,
                "maxResults": "10", "part": "id",
                "key": settings.YOUTUBE_API_KEY,
            })
            with urllib.request.urlopen(
                f"https://www.googleapis.com/youtube/v3/search?{params}", timeout=10
            ) as r:
                data = json.loads(r.read().decode())
            video_ids = [item["id"]["videoId"] for item in data.get("items", [])][:_MAX_VIDEOS]
            print(f"[clips] YT API search '{word}' -> {video_ids}", flush=True)
        except Exception as e:
            print(f"[clips] YT API search failed: {e}", flush=True)

    if not video_ids:
        search_opts = {
            "skip_download": True, "quiet": True, "no_warnings": True,
            "extract_flat":  True, "socket_timeout": 15,
        }
        try:
            with yt_dlp.YoutubeDL(search_opts) as ydl:
                results = ydl.extract_info(f"ytsearch10:{word}", download=False)
            video_ids = [
                e["id"] for e in (results.get("entries") or []) if e.get("id")
            ][:_MAX_VIDEOS]
            print(f"[clips] yt-dlp search '{word}' -> {video_ids}", flush=True)
        except Exception as e:
            print(f"[clips] yt-dlp search failed: {e}", flush=True)
            return []

    if not video_ids:
        return []

    # Step 2: delegate caption fetching to Vercel. Render's datacenter IPs are
    # bot-detected by YouTube; Vercel's Lambda IPs are not.
    try:
        params = urllib.parse.urlencode({
            "word":      word,
            "lang":      lang,
            "video_ids": ",".join(video_ids),
        })
        req = urllib.request.Request(
            f"{_VERCEL_URL}/api/word-clips?{params}",
            headers={"User-Agent": "szol-backend/1.0"},
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            body = json.loads(r.read().decode())
        # When clips is empty the function returns {"clips":[], "debug":[...]}
        if isinstance(body, dict):
            clips = body.get("clips", [])
            for line in body.get("debug", []):
                print(f"[clips] vercel: {line}", flush=True)
        else:
            clips = body
        print(f"[clips] Vercel word-clips returned {len(clips)} clips", flush=True)
    except Exception as e:
        print(f"[clips] Vercel word-clips failed: {e}", flush=True)
        return []

    # Step 3: persist to DB for caching.
    for clip in clips:
        row = db.query(models.VocabClip).filter_by(
            word=word, lang=lang,
            video_id=clip["video_id"], start_sec=clip["start_sec"],
        ).first()
        if not row:
            db.add(models.VocabClip(
                word=word, lang=lang,
                video_id=clip["video_id"],
                start_sec=clip["start_sec"],
                end_sec=clip["end_sec"],
                context=clip["context"],
            ))
    try:
        db.commit()
    except Exception:
        db.rollback()

    return clips


@router.get("/clips", response_model=List[schemas.VocabClipOut])
def get_vocab_clips(word: str, lang: str, limit: int = 5, db: Session = Depends(get_db)):
    """Return YouTube clips where `word` appears in `lang` captions.

    Results are shared across all users and cached for 7 days. A cache miss
    triggers a crawl (expect ~15-20 s on first request for a new word).
    """
    if not word.strip() or not lang.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "word and lang are required")

    limit = min(limit, _MAX_CLIPS)
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=_CLIP_TTL_DAYS)

    fresh = (
        db.query(models.VocabClip)
        .filter(
            models.VocabClip.word       == word,
            models.VocabClip.lang       == lang,
            models.VocabClip.crawled_at >  stale_cutoff,
        )
        .limit(limit)
        .all()
    )
    if fresh:
        return fresh

    clips = _crawl_clips(word, lang, db)
    return clips[:limit]
