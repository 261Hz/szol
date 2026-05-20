from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: UUID  # Changed from int to UUID to match your Postgres schema
    username: str
    email: EmailStr
    created_at: datetime

    # Pydantic v2 way to enable ORM compatibility
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str 
    token_type: str

class TokenData(BaseModel):
    # Changed from int to UUID; usually stores the user's ID from the JWT
    id: Optional[UUID] = None





# Schemas for CuratedStory, WordCache, and CommunityStory

class CuratedStoryBase(BaseModel):
    title: str
    content: str
    franco: Optional[str] = None
    lang: str
    author: Optional[str] = None
    source: Optional[str] = None
    sequence_order: Optional[int] = None

class CuratedStoryCreate(CuratedStoryBase):
    pass  

class CuratedStoryResponse(CuratedStoryBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WordCacheBase(BaseModel):
    word: str
    lang: str
    pos: Optional[str] = None
    definition: Optional[str] = None
    example: Optional[str] = None
    source: str = "wiktionary"

class WordCacheCreate(WordCacheBase):
    pass

class WordCacheResponse(WordCacheBase):
    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)




class CommunityStoryBase(BaseModel):
    title: str
    content: str
    franco: Optional[str] = None
    lang: str
    author: Optional[str] = None
    source: Optional[str] = None

class CommunityStoryCreate(CommunityStoryBase):
    pass

class CommunityStoryResponse(CommunityStoryBase):
    id: UUID
    reviewed: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)