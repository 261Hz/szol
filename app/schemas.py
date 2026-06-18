from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional, List
from uuid import UUID


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username:    str
    email:       EmailStr
    password:    str
    native_lang: str           # required — native language
    target_lang: str           # required — language being learned
    proficiency: Optional[str] = None  # CEFR level e.g. 'B2'

class UserUpdate(BaseModel):
    proficiency:      Optional[str]  = None
    native_lang:      Optional[str]  = None
    target_lang:      Optional[str]  = None
    open_to_messages: Optional[bool] = None

class UserResponse(BaseModel):
    id:               UUID
    username:         str
    email:            EmailStr
    created_at:       datetime
    proficiency:      Optional[str]  = None
    native_lang:      Optional[str]  = None
    target_lang:      Optional[str]  = None
    open_to_messages: bool           = False

    model_config = ConfigDict(from_attributes=True)

class PublicUserResponse(BaseModel):
    id:          UUID
    username:    str
    native_lang: Optional[str] = None
    created_at:  datetime

    model_config = ConfigDict(from_attributes=True)

class DiscoverableUser(BaseModel):
    id:          UUID
    username:    str
    native_lang: str

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


# ── Vocab word clip request (guest / unauthenticated) ────────────────────────

class VocabWordRequestIn(BaseModel):
    word: str
    lang: str


# ── Vocab clips (shared YouTube corpus) ──────────────────────────────────────

class VocabClipOut(BaseModel):
    video_id:  str
    start_sec: int
    end_sec:   int
    context:   str

    model_config = ConfigDict(from_attributes=True)

class VocabClipIn(BaseModel):
    word:      str
    lang:      str
    video_id:  str
    start_sec: int
    end_sec:   int
    context:   str


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
    id:             UUID
    user_id:        UUID
    word:           str
    lang:           str
    seen_count:     int
    first_seen:     datetime
    last_seen:      datetime
    stories:        Optional[List[str]] = None
    frequency_rank: Optional[int]       = None  # corpus rank from frequency_entries; None if word not in list

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

class WordLookupResponse(WordCacheResponse):
    frequency_rank: Optional[int] = None

class HandwritingCheckIn(BaseModel):
    word:      str
    lang:      str
    image_b64: str  # PNG data URL base64 from canvas.toDataURL()

class TranslationCheckIn(BaseModel):
    source_text: str
    translation: str
    source_lang: str
    target_lang: str = 'en'

class TutorMessage(BaseModel):
    role:    str   # 'user' | 'assistant'
    content: str

class TutorChatIn(BaseModel):
    lang:     str
    messages: List[TutorMessage]


# ── Video stories (Listen feature) ───────────────────────────────────────────

class ListenFromUrl(BaseModel):
    url:  str
    lang: str = 'en'

class VideoStoryResponse(BaseModel):
    id:               UUID
    video_id:         Optional[str] = None
    audio_url:        Optional[str] = None
    source_type:      str = 'youtube'
    title:            str
    lang:             str
    author:           Optional[str] = None
    source:           Optional[str] = None
    segments:         List[dict]
    is_autogenerated: bool = False
    sequence_order:   Optional[int] = None
    created_at:       datetime

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


# ── User stories (private, saved to account) ──────────────────────────────────

class UserStoryCreate(BaseModel):
    title:   str
    content: str
    franco:  Optional[str] = None
    lang:    str

class UserStoryResponse(UserStoryCreate):
    id:         UUID
    user_id:    UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Voice messages ────────────────────────────────────────────────────────────

class VoiceMessageResponse(BaseModel):
    id:                 UUID
    sender_id:          UUID
    recipient_id:       UUID
    audio_url:          str
    lang:               str
    duration_ms:        Optional[int]      = None
    allow_download:     bool               = True
    read_at:            Optional[datetime] = None
    expires_at:         Optional[datetime] = None
    created_at:         datetime
    sender_username:    Optional[str]      = None
    recipient_username: Optional[str]      = None

    model_config = ConfigDict(from_attributes=True)


# ── Diegetic Documents (collections of found documents) ───────────────────────

class DocumentResponse(BaseModel):
    id:             int
    collection_id:  int
    doc_number:     int
    calendar_month: Optional[int]  = None
    calendar_day:   Optional[int]  = None
    document_type:  Optional[str]  = None
    voice:          Optional[str]  = None
    title:          Optional[str]  = None
    content:        Optional[str]  = None  # null when adapter/locator is used
    locator:        Optional[dict] = None  # {"page": "...", "entry": "..."}
    available:      bool                   # computed: today >= document's diegetic date

    model_config = ConfigDict(from_attributes=True)

class CollectionResponse(BaseModel):
    id:                  int
    title:               str
    lang:                str
    description:         Optional[str]  = None
    author:              Optional[str]  = None
    source:              Optional[str]  = None
    adapter:             Optional[str]  = None   # 'mediawiki' | 'github' | 'inline'
    adapter_config:      Optional[dict] = None   # e.g. {"site": "en.wikisource.org"}
    today_count:         int = 0
    total_documents:     int = 0
    available_documents: int = 0

    model_config = ConfigDict(from_attributes=True)

class CollectionDetailResponse(CollectionResponse):
    documents: List[DocumentResponse] = []

class TodayDocumentResponse(BaseModel):
    collection_id:     int
    collection_title:  str
    collection_author: Optional[str]  = None
    adapter:           Optional[str]  = None
    adapter_config:    Optional[dict] = None
    document:          DocumentResponse

    model_config = ConfigDict(from_attributes=True)


# ── Feed stories (ingested from external sources) ─────────────────────────────

class FeedStoryResponse(BaseModel):
    id:           UUID
    title:        str
    text:         str
    lang:         str
    source_name:  str
    source_url:   str
    license:      str
    author:       Optional[str]      = None
    published_at: Optional[datetime] = None
    fetched_at:   datetime

    model_config = ConfigDict(from_attributes=True)
