from fastapi import FastAPI
from . import models
from .database import engine
from .routers import user, auth, stories, words
from .config import settings

from fastapi.middleware.cors import CORSMiddleware

# Create all tables from the ORM models if they don't already exist.
# When using Alembic for migrations this line should be removed — Alembic owns the schema.
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Allow requests from any origin so the Vue frontend (served separately)
# can call this API without being blocked by the browser's CORS policy.
# Tighten origins to a specific domain before deploying to production.
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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
