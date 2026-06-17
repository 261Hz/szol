# words.py — endpoints for word cache and per-user word frequency tracking.
#
# Routes
# ------
#   GET  /words/lookup?word=&lang=    return cached dictionary entry or 404
#   POST /words/cache                 insert or update a word cache entry
#   GET  /words/frequency?word=&lang= corpus frequency rank (local → Leipzig API fallback)
#   GET  /words/examples?word=&lang=  example sentences (local → Leipzig API fallback)
#   GET  /words/similar?word=&lang=   contextually similar words via Leipzig cooccurrence API
#   POST /words/user                  (auth) upsert a word into the user's seen-word log
#   GET  /words/user?lang=            (auth) return user's word log for a language

import re
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db
from ..leipzig_api import get_word_rank, get_sentences as leipzig_sentences, get_similar


# ── Word normalization (mirrors frequency_import.py) ─────────────────────────

_HEBREW_NIQQUD     = re.compile(r"[֑-ׇ]")
_ARABIC_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]")

def _base(word: str) -> str:
    return unicodedata.normalize("NFKC", word).strip().lower()

_NORMALIZERS = {
    "he":  lambda w: _HEBREW_NIQQUD.sub("", _base(w)),
    "ar":  lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
    "arz": lambda w: _ARABIC_DIACRITICS.sub("", _base(w)),
}

def _normalize(lang: str, word: str) -> str:
    return _NORMALIZERS.get(lang, _base)(word)


def _rank_map(lang: str, words: list[str], db: Session) -> dict[str, int]:
    """Return {normalized_lemma: rank} for a batch of words in one query."""
    if not words:
        return {}
    normed = list({_normalize(lang, w) for w in words})
    rows = db.execute(text("""
        SELECT fl.normalized_lemma, MIN(fe.rank) AS rank
        FROM   frequency_lemmas fl
        JOIN   frequency_entries fe ON fe.lemma_id = fl.id
        WHERE  fl.language_code = :lang
          AND  fl.normalized_lemma = ANY(:words)
        GROUP  BY fl.normalized_lemma
    """), {"lang": lang, "words": normed}).fetchall()
    return {row[0]: row[1] for row in rows}

router = APIRouter(
    prefix="/words",
    tags=["Words"],
)


# ── Public word cache ─────────────────────────────────────────────────────────

@router.get("/frequency")
def word_frequency(word: str, lang: str, db: Session = Depends(get_db)):
    """
    Return corpus frequency rank. Always 200; frequency_rank is null if unknown.
    Fast path: local frequency_entries table.
    Fallback: Leipzig API (covers inflected forms like 'bailed' independently).
    """
    ranks = _rank_map(lang, [word], db)
    rank  = ranks.get(_normalize(lang, word))

    if rank is None:
        rank = get_word_rank(word, lang)

    return {"word": word, "lang": lang, "frequency_rank": rank}


@router.get("/examples")
def word_examples(word: str, lang: str, limit: int = 5):
    sentences = leipzig_sentences(word, lang, limit)
    return [{"sentence": s, "score": 70} for s in sentences]


@router.get("/similar")
def word_similar(word: str, lang: str):
    """
    Return contextually similar words from the Leipzig cooccurrence similarity API.
    Only available for the 9 languages that have a Leipzig v3 corpus.
    """
    words = get_similar(word, lang)
    return {"word": word, "lang": lang, "similar": words}


@router.get("/lookup", response_model=schemas.WordLookupResponse)
def lookup_word(word: str, lang: str, db: Session = Depends(get_db)):
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == word, models.WordCache.lang == lang)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word not in cache")
    ranks = _rank_map(lang, [word], db)
    freq_rank = ranks.get(_normalize(lang, word))
    return schemas.WordLookupResponse(**entry.__dict__, frequency_rank=freq_rank)


_LANG_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ar": "Arabic", "arz": "Egyptian Arabic",
    "he": "Hebrew",  "ja": "Japanese",  "zh": "Chinese", "ru": "Russian",
    "nl": "Dutch",   "pl": "Polish",    "tr": "Turkish", "sv": "Swedish",
    "hu": "Hungarian", "el": "Greek",   "ko": "Korean",
}

@router.post("/write/check")
def check_handwriting(payload: schemas.HandwritingCheckIn):
    """Use a vision LLM to evaluate the user's handwritten attempt."""
    from groq import Groq
    from ..config import settings
    client    = Groq(api_key=settings.GROQ_API_KEY)
    lang_name = _LANG_NAMES.get(payload.lang, payload.lang)
    try:
        resp = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": (
                        f"A language learner is practising writing '{payload.word}' in {lang_name}. "
                        "Look at their handwriting on the canvas and give 1–2 sentences of encouraging, "
                        "specific feedback. Note what looks good and one thing to improve if needed. "
                        "If the canvas appears blank or unclear, just say so gently."
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{payload.image_b64}"}},
                ],
            }],
            max_tokens=120,
        )
        return {"feedback": resp.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache", response_model=schemas.WordCacheResponse)
def cache_word(payload: schemas.WordCacheCreate, db: Session = Depends(get_db)):
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == payload.word, models.WordCache.lang == payload.lang)
        .first()
    )
    if entry:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
    else:
        entry = models.WordCache(**payload.model_dump())
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ── Authenticated user word tracking ─────────────────────────────────────────

@router.post("/user", status_code=status.HTTP_201_CREATED, response_model=schemas.UserWordResponse)
def track_user_word(
    payload: schemas.UserWordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Upsert a word into the current user's seen-word log.

    If the (user_id, word, lang) row already exists, increment seen_count,
    update last_seen, and append story_title to the stories array (if new).
    If it doesn't exist, create a fresh row.
    """
    existing = (
        db.query(models.UserWord)
        .filter(
            models.UserWord.user_id == current_user.id,
            models.UserWord.word    == payload.word,
            models.UserWord.lang    == payload.lang,
        )
        .first()
    )

    if existing:
        existing.seen_count += 1
        existing.last_seen   = datetime.now(timezone.utc)
        if payload.story_title:
            stories = list(existing.stories or [])
            if payload.story_title not in stories:
                stories.append(payload.story_title)
            existing.stories = stories
    else:
        stories = [payload.story_title] if payload.story_title else []
        existing = models.UserWord(
            user_id = current_user.id,
            word    = payload.word,
            lang    = payload.lang,
            stories = stories or None,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing


@router.get("/user", response_model=List[schemas.UserWordResponse])
def get_user_words(
    lang: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return all words the current user has seen for a given language,
    ordered by seen_count descending. Each entry includes frequency_rank
    from the corpus (lower = more common; None = word not in frequency list)."""
    rows = (
        db.query(models.UserWord)
        .filter(
            models.UserWord.user_id == current_user.id,
            models.UserWord.lang    == lang,
        )
        .order_by(models.UserWord.seen_count.desc())
        .all()
    )
    ranks = _rank_map(lang, [r.word for r in rows], db)
    return [
        schemas.UserWordResponse(
            **{c.key: getattr(row, c.key) for c in models.UserWord.__table__.columns},
            frequency_rank=ranks.get(_normalize(lang, row.word)),
        )
        for row in rows
    ]
