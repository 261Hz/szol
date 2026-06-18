from .database import Base
from sqlalchemy import ARRAY, TIMESTAMP, BigInteger, Column, Integer, String, Boolean, Uuid, JSON, UniqueConstraint
from sqlalchemy.sql.expression import text
from sqlalchemy.orm import relationship
from sqlalchemy.sql.schema import ForeignKey


class User(Base):
    __tablename__ = "users"
    id           = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    username     = Column(String, nullable=False, unique=True, index=True)
    email        = Column(String, nullable=False, unique=True, index=True)
    password     = Column(String, nullable=False)
    created_at   = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))
    proficiency       = Column(String)                                          # CEFR level: A1 A2 B1 B2 C1 C2
    native_lang       = Column(String)                                          # e.g. 'en', 'es'
    target_lang       = Column(String)                                          # language they are learning
    open_to_messages      = Column(Boolean, server_default=text('false'))        # opt-in to receive voice messages
    email_verified        = Column(Boolean, nullable=False, server_default=text('false'))
    email_verify_token    = Column(String)                                       # null once verified
    email_verify_expires  = Column(TIMESTAMP(timezone=True))                    # null once verified

class UserWord(Base):
    __tablename__ = "user_words"

    id         = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id    = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    word       = Column(String, nullable=False)
    lang       = Column(String, nullable=False)
    seen_count = Column(Integer, server_default=text("1"))
    first_seen = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
    last_seen  = Column(TIMESTAMP(timezone=True), server_default=text("now()"))
    stories    = Column(ARRAY(String))

class UserProgress(Base):
    __tablename__ = "user_progress"

    id             = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id        = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    story_id       = Column(String, nullable=False)   # UUID or 'l<timestamp>' for local stories
    story_title    = Column(String)
    lang           = Column(String, nullable=False)
    tab            = Column(String, nullable=False)   # 'retype' | 'speak'
    sentence_index = Column(Integer, nullable=False, server_default=text("0"))
    updated_at     = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

class UserVocab(Base):
    __tablename__ = "user_vocab"

    id         = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id    = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    word       = Column(String, nullable=False)
    lang       = Column(String, nullable=False)
    pos        = Column(String)
    definition = Column(String)
    example    = Column(String)
    saved_at   = Column(TIMESTAMP(timezone=True), server_default=text("now()"))

class CuratedStory(Base):
    __tablename__ = "curated_stories"

    id             = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    title          = Column(String, nullable=False)
    content        = Column(String, nullable=False)
    franco         = Column(String)
    lang           = Column(String, nullable=False)
    author         = Column(String)
    source         = Column(String)
    sequence_order = Column(Integer)
    created_at     = Column(TIMESTAMP(timezone=True), server_default=text('now()'))

class WordCache(Base):
    __tablename__ = "word_cache"

    id             = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    word           = Column(String, nullable=False, index=True)
    lang           = Column(String, nullable=False, index=True)
    pos            = Column(String)
    definition     = Column(String)
    example        = Column(String)
    source         = Column(String, server_default='wiktionary')
    frequency_rank = Column(Integer)
    created_at     = Column(TIMESTAMP(timezone=True), server_default=text('now()'))

class VideoStory(Base):
    __tablename__ = "video_stories"

    id             = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    video_id       = Column(String, nullable=True, index=True)    # YouTube video ID; null for non-YouTube sources
    audio_url      = Column(String)                                # direct audio stream URL (TED, podcast, etc.)
    source_type    = Column(String, nullable=False, server_default=text("'youtube'"))  # 'youtube'|'ted'|'podcast'|'upload'
    title          = Column(String, nullable=False)
    lang           = Column(String, nullable=False, index=True)
    author         = Column(String)                                # channel / speaker
    source         = Column(String)                                # e.g. 'TED', 'DW', 'BBC'
    segments         = Column(JSON, nullable=False)                  # [{start, end, text}, ...]
    is_autogenerated = Column(Boolean, server_default=text('false')) # true when captions are ASR-generated
    sequence_order   = Column(Integer)
    created_at       = Column(TIMESTAMP(timezone=True), server_default=text('now()'))


class CommunityStory(Base):
    __tablename__ = "community_stories"

    id         = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    title      = Column(String, nullable=False)
    content    = Column(String, nullable=False)
    franco     = Column(String)
    lang       = Column(String, nullable=False)
    author     = Column(String)
    source     = Column(String)
    reviewed   = Column(Boolean, server_default=text('false'))
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'))


class VoiceMessage(Base):
    __tablename__ = "voice_messages"

    id             = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    sender_id      = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id   = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    audio_url      = Column(String, nullable=False)
    lang           = Column(String, nullable=False)
    duration_ms    = Column(Integer)
    allow_download = Column(Boolean, server_default=text('true'))   # sender can disable saving
    read_at              = Column(TIMESTAMP(timezone=True))          # null = unread
    recipient_deleted_at = Column(TIMESTAMP(timezone=True))          # set when recipient dismisses; row kept for sender
    expires_at           = Column(TIMESTAMP(timezone=True))          # auto-deleted after 1 day
    created_at     = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))


class UserStory(Base):
    __tablename__ = "user_stories"

    id         = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id    = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title      = Column(String, nullable=False)
    content    = Column(String, nullable=False)
    franco     = Column(String)
    lang       = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'))


class FrequencySource(Base):
    __tablename__ = "frequency_sources"

    id   = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    url  = Column(String)


class FrequencyLemma(Base):
    __tablename__ = "frequency_lemmas"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    language_code    = Column(String(10), nullable=False, index=True)
    normalized_lemma = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("language_code", "normalized_lemma"),)


class FrequencyEntry(Base):
    __tablename__ = "frequency_entries"

    id        = Column(BigInteger, primary_key=True, autoincrement=True)
    lemma_id  = Column(BigInteger, ForeignKey("frequency_lemmas.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("frequency_sources.id"), nullable=False)
    rank      = Column(Integer, index=True)
    raw_count = Column(BigInteger)

    __table_args__ = (UniqueConstraint("lemma_id", "source_id"),)


class CorpusSentence(Base):
    __tablename__ = "corpus_sentences"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    language_code = Column(String(10), nullable=False, index=True)
    sentence      = Column(String, nullable=False)
    source        = Column(String(50), nullable=False, server_default="leipzig")
    score         = Column(Integer, nullable=False, index=True)  # 0–100, higher = better example


class Collection(Base):
    __tablename__ = "collections"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    title          = Column(String, nullable=False)
    lang           = Column(String(10), nullable=False, index=True)
    description    = Column(String)
    author         = Column(String)        # original author / curator
    source         = Column(String)        # display name of primary source
    adapter        = Column(String)        # 'mediawiki' | 'github' | 'inline'
    adapter_config = Column(JSON)          # e.g. {"site": "en.wikisource.org"}
    documents      = relationship("CollectionDocument", back_populates="collection",
                                  order_by="CollectionDocument.doc_number",
                                  cascade="all, delete-orphan")

class CollectionDocument(Base):
    __tablename__ = "collection_documents"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    collection_id   = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False)
    doc_number      = Column(Integer, nullable=False)
    calendar_month  = Column(Integer)      # 1–12; null = always available
    calendar_day    = Column(Integer)      # 1–31
    document_type   = Column(String)       # 'journal' | 'letter' | 'telegram' | 'newspaper' | 'log' | 'note'
    voice           = Column(String)       # author of this document (character or real person)
    title           = Column(String)       # e.g. "3 May. Bistritz." or "Telegram to White Star Line"
    content         = Column(String)       # inline text for adapter='inline'; null otherwise
    locator         = Column(JSON)         # adapter-specific: {"page": "Dracula/Chapter_I", "entry": "3 May"}
    collection      = relationship("Collection", back_populates="documents")

class UserBlock(Base):
    __tablename__ = "user_blocks"

    id         = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    blocker_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id = Column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))

    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id"),)


class VocabWordRequest(Base):
    """Words submitted by guests (or anyone) to be queued for clip generation."""
    __tablename__ = "vocab_word_requests"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    word       = Column(String, nullable=False)
    lang       = Column(String(10), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))

    __table_args__ = (UniqueConstraint("word", "lang"),)


class VocabClip(Base):
    __tablename__ = "vocab_clips"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    word       = Column(String, nullable=False, index=True)
    lang       = Column(String(10), nullable=False, index=True)
    video_id   = Column(String(20), nullable=False)
    start_sec  = Column(Integer, nullable=False)
    end_sec    = Column(Integer, nullable=False)
    context    = Column(String, nullable=False)
    crawled_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))

    __table_args__ = (UniqueConstraint("word", "lang", "video_id", "start_sec"),)


class FeedStory(Base):
    __tablename__ = "feed_stories"

    id           = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    title        = Column(String, nullable=False)
    lang         = Column(String, nullable=False, index=True)
    source_name  = Column(String, nullable=False)
    source_url   = Column(String, nullable=False, unique=True)
    license      = Column(String, nullable=False)
    author       = Column(String)
    published_at = Column(TIMESTAMP(timezone=True))
    fetched_at   = Column(TIMESTAMP(timezone=True), nullable=False, server_default="now()")
    text         = Column(String, nullable=False)


class SourceSuggestion(Base):
    __tablename__ = "source_suggestions"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    url        = Column(String, nullable=False)
    lang       = Column(String(10))
    note       = Column(String)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))


class PodcastEpisode(Base):
    __tablename__ = "podcast_episodes"

    id           = Column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    podcast_name = Column(String, nullable=False)
    lang         = Column(String(10), nullable=False, index=True)
    title        = Column(String, nullable=False)
    audio_url    = Column(String, nullable=False, unique=True)
    duration_sec = Column(Integer)
    description  = Column(String)
    published_at = Column(TIMESTAMP(timezone=True))
    transcript   = Column(String)       # null until transcribed on demand
    segments     = Column(JSON)         # [{start, end, text}] from Whisper
    fetched_at   = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
