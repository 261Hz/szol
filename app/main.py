from fastapi import FastAPI
from . import models
from .database import engine
from .routers import user, auth, stories, words, vocab, progress, chat, transcript, listen
from .config import settings

from fastapi.middleware.cors import CORSMiddleware

# Create all tables from the ORM models if they don't already exist.
# When using Alembic for migrations this line should be removed — Alembic owns the schema.
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Allow requests from any origin.
# allow_credentials must be False when allow_origins=["*"] — Starlette 1.x raises
# ValueError otherwise. We use Bearer tokens (not cookies) so credentials=True
# is never needed here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Each router handles a group of related routes and registers them under its own prefix.
# Routers are matched in the order they are included, but prefix uniqueness means
# there is no ambiguity between /users, /auth, /stories, and /words.
app.include_router(user.router)    # /users/*
app.include_router(auth.router)    # /login
app.include_router(stories.router) # /stories/*
app.include_router(words.router)   # /words/*
app.include_router(vocab.router)     # /vocab/*
app.include_router(progress.router)  # /progress/*
app.include_router(chat.router)       # /chat
app.include_router(transcript.router) # /transcript
app.include_router(listen.router)     # /listen-stories
