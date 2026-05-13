from .database import Base
from sqlalchemy import TIMESTAMP, Column, Integer, String, Boolean
from sqlalchemy.sql.expression import text
from sqlalchemy.orm import relationship
from sqlalchemy.sql.schema import ForeignKey
from uuid import UUID


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    username = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text('now()'))

class CuratedStory(Base):
    __tablename__ = "curated_stories"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    title = Column(String, nullable=False)
    text = Column(String, nullable=False)
    franco = Column(String)
    lang = Column(String, nullable=False)
    author = Column(String)
    source = Column(String)
    sequence_order = Column(Integer)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'))

class WordCache(Base):
    __tablename__ = "word_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    word = Column(String, nullable=False, index=True)
    lang = Column(String, nullable=False, index=True)
    pos = Column(String)
    definition = Column(String)
    example = Column(String)
    source = Column(String, server_default='wiktionary')
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'))

class CommunityStory(Base):
    __tablename__ = "community_stories"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    title = Column(String, nullable=False)
    text = Column(String, nullable=False)
    franco = Column(String)
    lang = Column(String, nullable=False)
    author = Column(String)
    source = Column(String)
    reviewed = Column(Boolean, server_default=text('false'))
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'))