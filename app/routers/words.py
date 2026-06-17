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
                        f"A learner is practising writing '{payload.word}' in {lang_name}. "
                        f"The image shows their attempt with numbered circles marking each stroke in the order drawn. "
                        f"PASS if the writing is recognisable as '{payload.word}' AND the stroke direction is broadly correct for {lang_name} "
                        f"(e.g. right-to-left for Arabic/Hebrew, top-down for CJK). "
                        f"FAIL if the word is unrecognisable, uses clearly wrong stroke direction, or the canvas is blank. "
                        f"Be lenient on imperfect letterforms — only the direction and overall shape matter. "
                        "Reply with exactly one word: PASS or FAIL."
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{payload.image_b64}"}},
                ],
            }],
            max_tokens=5,
        )
        answer = resp.choices[0].message.content.strip().upper()
        return {"passed": answer.startswith("PASS")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_LANG_NAMES_FULL = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "ru": "Russian", "he": "Hebrew", "ar": "Arabic",
    "arz": "Egyptian Arabic", "ja": "Japanese", "zh": "Chinese",
    "hu": "Hungarian", "el": "Greek",
}

_HF_MODEL   = "google/gemma-4-12B-it"
_HF_API_URL = f"https://api-inference.huggingface.co/models/{_HF_MODEL}/v1/chat/completions"
_GROQ_FALLBACK = "gemma2-9b-it"


def _search_stories(query: str, lang: str, db: Session, limit: int = 2):
    """Return up to `limit` curated stories whose title or content match any word in `query`."""
    from sqlalchemy import or_
    words = [w.strip() for w in query.split() if len(w.strip()) > 2][:6]
    if not words:
        return []
    conditions = [
        or_(
            models.CuratedStory.content.ilike(f"%{w}%"),
            models.CuratedStory.title.ilike(f"%{w}%"),
        )
        for w in words
    ]
    return (
        db.query(models.CuratedStory)
        .filter(models.CuratedStory.lang == lang, or_(*conditions))
        .limit(limit)
        .all()
    )


@router.post("/tutor/chat")
def tutor_chat(
    payload: schemas.TutorChatIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Language tutor using Gemma 4 via HuggingFace Inference API.
    Auto-retrieves relevant story excerpts from the DB (RAG). Requires auth."""
    import requests as req
    from ..config import settings
    lang_name = _LANG_NAMES_FULL.get(payload.lang, payload.lang)

    # ── RAG: find relevant stories based on the latest user message ───────────
    last_user = next((m.content for m in reversed(payload.messages) if m.role == "user"), "")
    stories   = _search_stories(last_user, payload.lang, db)
    story_ctx = ""
    if stories:
        excerpts  = "\n\n".join(f'"{s.title}":\n{s.content[:500]}' for s in stories)
        story_ctx = f"\n\nRelevant texts from the app you may draw on:\n{excerpts}"

    # ── System prompt: immersion mode ─────────────────────────────────────────
    system = (
        f"You are a friendly, patient language tutor. The student is learning {lang_name}.\n"
        f"IMPORTANT: You MUST respond ONLY in {lang_name}. Never use English or any other language, "
        f"even if the student writes to you in English. Keep replies brief and natural."
        f"{story_ctx}"
    )

    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in payload.messages]

    # ── Try Gemma 4 via HuggingFace; fall back to Groq Gemma 2 ──────────────
    hf_error = None
    if settings.HF_TOKEN:
        try:
            resp = req.post(
                _HF_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.HF_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={"model": _HF_MODEL, "messages": messages, "max_tokens": 512},
                timeout=25,
            )
            if resp.ok:
                reply = resp.json()["choices"][0]["message"]["content"].strip()
                return {"reply": reply, "model": "gemma-4"}
            hf_error = f"HF {resp.status_code}: {resp.text[:200]}"
        except Exception as e:
            hf_error = str(e)

    # Fallback: Groq Gemma 2 9B
    try:
        from groq import Groq
        client = Groq(api_key=settings.GROQ_API_KEY)
        resp2  = client.chat.completions.create(
            model=_GROQ_FALLBACK,
            messages=messages,
            max_tokens=512,
        )
        reply = resp2.choices[0].message.content.strip()
        return {"reply": reply, "model": "gemma2-9b", "hf_error": hf_error}
    except Exception as e2:
        raise HTTPException(
            status_code=500,
            detail=f"Both models failed. HF: {hf_error} | Groq: {e2}"
        )


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
