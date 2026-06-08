from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username:    str
    email:       EmailStr
    password:    str
    proficiency: Optional[str] = None  # CEFR level e.g. 'B2'
    native_lang: Optional[str] = None  # e.g. 'en'

class UserResponse(BaseModel):
    id:          UUID
    username:    str
    email:       EmailStr
    created_at:  datetime
    proficiency: Optional[str] = None
    native_lang: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email:    EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type:   str

class TokenData(BaseModel):
    id: Optional[UUID] = None


# ── User progress ────────────────────────────────────────────────────────────

class UserProgressCreate(BaseModel):
    story_id:       str
    story_title:    Optional[str] = None
    lang:           str
    tab:            str   # 'retype' | 'speak'
    sentence_index: int   = 0

class UserProgressResponse(BaseModel):
    id:             UUID
    user_id:        UUID
    story_id:       str
    story_title:    Optional[str] = None
    lang:           str
    tab:            str
    sentence_index: int
    updated_at:     datetime

    model_config = ConfigDict(from_attributes=True)


# ── User vocab (saved word bank) ─────────────────────────────────────────────

class UserVocabCreate(BaseModel):
    word:       str
    lang:       str
    pos:        Optional[str] = None
    definition: Optional[str] = None
    example:    Optional[str] = None

class UserVocabResponse(BaseModel):
    id:         UUID
    user_id:    UUID
    word:       str
    lang:       str
    pos:        Optional[str] = None
    definition: Optional[str] = None
    example:    Optional[str] = None
    saved_at:   datetime

    model_config = ConfigDict(from_attributes=True)


# ── User words (frequency tracking) ──────────────────────────────────────────

class UserWordCreate(BaseModel):
    word:        str
    lang:        str
    story_title: Optional[str] = None

class UserWordResponse(BaseModel):
    id:         UUID
    user_id:    UUID
    word:       str
    lang:       str
    seen_count: int
    first_seen: datetime
    last_seen:  datetime
    stories:    Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)


# ── Curated stories ───────────────────────────────────────────────────────────

class CuratedStoryBase(BaseModel):
    title:          str
    content:        str
    franco:         Optional[str] = None
    lang:           str
    author:         Optional[str] = None
    source:         Optional[str] = None
    sequence_order: Optional[int] = None

class CuratedStoryCreate(CuratedStoryBase):
    pass

class CuratedStoryResponse(CuratedStoryBase):
    id:         UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Word cache ────────────────────────────────────────────────────────────────

class WordCacheBase(BaseModel):
    word:       str
    lang:       str
    pos:        Optional[str] = None
    definition: Optional[str] = None
    example:    Optional[str] = None
    source:     str = "wiktionary"

class WordCacheCreate(WordCacheBase):
    pass

class WordCacheResponse(WordCacheBase):
    id:         UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Video stories (Listen feature) ───────────────────────────────────────────

class VideoStoryResponse(BaseModel):
    id:             UUID
    video_id:       str
    title:          str
    lang:           str
    author:         Optional[str] = None
    source:         Optional[str] = None
    segments:       List[dict]
    sequence_order: Optional[int] = None
    created_at:     datetime

    model_config = ConfigDict(from_attributes=True)


# ── Community stories ─────────────────────────────────────────────────────────

class CommunityStoryBase(BaseModel):
    title:  str
    content: str
    franco:  Optional[str] = None
    lang:    str
    author:  Optional[str] = None
    source:  Optional[str] = None

class CommunityStoryCreate(CommunityStoryBase):
    pass

class CommunityStoryResponse(CommunityStoryBase):
    id:         UUID
    reviewed:   bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
