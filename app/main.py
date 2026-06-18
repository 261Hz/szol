from fastapi import FastAPI, Header, HTTPException
from . import models
from .database import engine
from .routers import user, auth, stories, words, vocab, progress, chat, transcript, listen, concept, user_stories, messages, feed, stats, collections
from .config import settings
from .limiter import limiter

from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Create all tables from the ORM models if they don't already exist.
# When using Alembic for migrations this line should be removed — Alembic owns the schema.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(docs_url="/docs-szol", redoc_url=None)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

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
app.include_router(concept.router)       # /concept-of-day
app.include_router(user_stories.router)  # /user-stories
app.include_router(messages.router)      # /messages
app.include_router(feed.router)          # /feed
app.include_router(stats.router)         # /stats
app.include_router(collections.router)   # /collections


@app.post("/ingest/run")
def trigger_ingest(x_worker_secret: str = Header(...)):
    if x_worker_secret != settings.WORKER_SECRET:
        raise HTTPException(status_code=401, detail="unauthorized")
    from .ingest.run import run
    inserted = run()
    return {"inserted": inserted}
