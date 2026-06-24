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

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db
from ..leipzig_api import get_word_rank, get_sentences as leipzig_sentences, get_similar


def _cache_rank(word: str, lang: str, rank: int | None, db: Session) -> None:
    """Write frequency_rank into word_cache, creating a stub row if needed."""
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == word, models.WordCache.lang == lang)
        .first()
    )
    if entry:
        entry.frequency_rank = rank
    else:
        db.add(models.WordCache(word=word, lang=lang, frequency_rank=rank))
    db.commit()

router = APIRouter(
    prefix="/words",
    tags=["Words"],
)


# ── Public word cache ─────────────────────────────────────────────────────────

@router.get("/frequency")
def word_frequency(word: str, lang: str, db: Session = Depends(get_db)):
    """
    Return corpus frequency rank. Always 200; frequency_rank is null if unknown.
    Fast path: word_cache.frequency_rank.
    Fallback: Leipzig API — result written back to word_cache for future calls.
    """
    entry = (
        db.query(models.WordCache)
        .filter(models.WordCache.word == word, models.WordCache.lang == lang)
        .first()
    )
    if entry and entry.frequency_rank is not None:
        return {"word": word, "lang": lang, "frequency_rank": entry.frequency_rank}

    rank = get_word_rank(word, lang)
    if rank is not None:
        _cache_rank(word, lang, rank, db)

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
    return schemas.WordLookupResponse(**entry.__dict__)


_LANG_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ar": "Arabic", "arz": "Egyptian Arabic",
    "he": "Hebrew",  "ja": "Japanese",  "zh": "Chinese", "ru": "Russian",
    "nl": "Dutch",   "pl": "Polish",    "tr": "Turkish", "sv": "Swedish",
    "hu": "Hungarian", "el": "Greek",   "ko": "Korean",
}

_LATIN_LANGS = {"en", "es", "fr", "de", "it", "pt", "nl", "pl", "tr", "sv", "hu"}

@router.post("/write/check")
def check_handwriting(payload: schemas.HandwritingCheckIn):
    """Use a vision LLM to evaluate the user's handwritten attempt."""
    try:
        from groq import Groq
        from ..config import settings
        client    = Groq(api_key=settings.GROQ_API_KEY)
        lang_name = _LANG_NAMES.get(payload.lang, payload.lang)
        word      = payload.word.strip()
        resp = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": (
                        f"OCR this handwritten word. "
                        f"Read every letter exactly as written, left to right. "
                        f"Return only the letters you see — no spaces, no punctuation, no explanation. "
                        f"If you see nothing, return a single dash: -"
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{payload.image_b64}"}},
                ],
            }],
            max_tokens=20,
        )
        ocr = resp.choices[0].message.content.strip().lower()
        passed = ocr == word.lower()
        return {"passed": passed}
    except Exception as e:
        import traceback, logging
        logging.error("check_handwriting error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate/check")
def check_translation(payload: schemas.TranslationCheckIn):
    """Grade a user's spoken-segment translation using an LLM."""
    import json as _json
    from groq import Groq
    from ..config import settings
    client   = Groq(api_key=settings.GROQ_API_KEY)
    src_name = _LANG_NAMES.get(payload.source_lang, payload.source_lang)
    tgt_name = _LANG_NAMES.get(payload.target_lang, payload.target_lang)
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{
                "role": "user",
                "content": (
                    f"You are a translation grader.\n"
                    f"Source text ({src_name}): \"{payload.source_text}\"\n"
                    f"Student's translation ({tgt_name}): \"{payload.translation}\"\n"
                    f"Score 0-100 on meaning accuracy and completeness. "
                    f"Reply with JSON only: {{\"score\": <number>, \"feedback\": \"<one sentence>\"}}"
                ),
            }],
            max_tokens=120,
            response_format={"type": "json_object"},
        )
        data = _json.loads(resp.choices[0].message.content)
        return {"score": int(data.get("score", 0)), "feedback": data.get("feedback", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


_LANG_NAMES_FULL = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "ru": "Russian", "he": "Hebrew", "ar": "Arabic",
    "arz": "Egyptian Arabic", "ja": "Japanese", "zh": "Chinese",
    "hu": "Hungarian", "el": "Greek",
}

_GROQ_MODEL = "llama-3.3-70b-versatile"


def _search_content(query: str, lang: str, db: Session):
    """Search curated stories, community stories, and videos for the query keywords.
    Returns a list of short context snippets (max 3 total, 250 chars each)."""
    from sqlalchemy import or_
    words = [w.strip() for w in query.split() if len(w.strip()) > 2][:5]
    if not words:
        return []

    snippets = []

    # Curated stories
    conds = [or_(models.CuratedStory.content.ilike(f"%{w}%"),
                 models.CuratedStory.title.ilike(f"%{w}%")) for w in words]
    for s in db.query(models.CuratedStory).filter(
            models.CuratedStory.lang == lang, or_(*conds)).limit(1).all():
        snippets.append(f'Story "{s.title}": {s.content[:250]}')

    # Community stories
    conds2 = [or_(models.CommunityStory.content.ilike(f"%{w}%"),
                  models.CommunityStory.title.ilike(f"%{w}%")) for w in words]
    for s in db.query(models.CommunityStory).filter(
            models.CommunityStory.lang == lang, or_(*conds2)).limit(1).all():
        snippets.append(f'Community story "{s.title}": {s.content[:250]}')

    # Video transcripts (title search + first 300 chars of transcript)
    conds3 = [models.VideoStory.title.ilike(f"%{w}%") for w in words]
    for v in db.query(models.VideoStory).filter(
            models.VideoStory.lang == lang, or_(*conds3)).limit(1).all():
        segs = v.segments or []
        transcript = " ".join(seg.get("text", "") for seg in segs[:8])[:300]
        snippets.append(f'Video "{v.title}": {transcript}')

    return snippets[:3]


@router.post("/tutor/chat")
def tutor_chat(
    payload: schemas.TutorChatIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Immersive language tutor with full content RAG (stories, videos, vocab). Requires auth."""
    from groq import Groq
    from ..config import settings
    lang_name = _LANG_NAMES_FULL.get(payload.lang, payload.lang)

    last_user = next((m.content for m in reversed(payload.messages) if m.role == "user"), "")

    # ── User vocab (words + definitions) ──────────────────────────────────────
    saved = (
        db.query(models.UserVocab)
        .filter(models.UserVocab.user_id == current_user.id,
                models.UserVocab.lang    == payload.lang)
        .order_by(models.UserVocab.saved_at.desc())
        .limit(80)
        .all()
    )
    vocab_ctx = ""
    if saved:
        entries  = "; ".join(
            v.word + (f" ({v.definition})" if v.definition else "")
            for v in saved
        )
        vocab_ctx = f"\n\nStudent's saved vocabulary ({len(saved)} words): {entries}"

    # ── Content RAG: stories + videos ─────────────────────────────────────────
    snippets = _search_content(last_user, payload.lang, db)
    content_ctx = ("\n\nRelevant app content:\n" + "\n\n".join(snippets)) if snippets else ""

    # ── System prompt ─────────────────────────────────────────────────────────
    system = (
        f"You are a friendly, immersive language tutor. The student is learning {lang_name}. "
        f"Always respond in {lang_name} only — never switch languages, never explain why. "
        f"Keep replies to 2–3 sentences. "
        f"When asked about their vocabulary or whether they've seen a word before, use the vocab list to answer accurately."
        f"{vocab_ctx}"
        f"{content_ctx}"
    )

    # Trim to last 16 turns (8 exchanges) to keep token usage low
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in payload.messages[-16:]]

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        resp   = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=messages,
            max_tokens=512,
        )
        return {"reply": resp.choices[0].message.content.strip(), "model": "llama-3.3-70b"}
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
    if not rows:
        return []

    # Batch-fetch cached ranks from word_cache
    word_list = [r.word for r in rows]
    cached_ranks: dict[str, int | None] = {
        e.word.lower(): e.frequency_rank
        for e in db.query(models.WordCache).filter(
            models.WordCache.lang == lang,
            models.WordCache.word.in_(word_list),
        ).all()
    }

    # For uncached words, call Leipzig and write back (capped to avoid slow responses)
    misses = [w for w in word_list if w.lower() not in cached_ranks]
    for w in misses[:20]:
        rank = get_word_rank(w, lang)
        cached_ranks[w.lower()] = rank
        _cache_rank(w, lang, rank, db)

    return [
        schemas.UserWordResponse(
            **{c.key: getattr(row, c.key) for c in models.UserWord.__table__.columns},
            frequency_rank=cached_ranks.get(row.word.lower()),
        )
        for row in rows
    ]
