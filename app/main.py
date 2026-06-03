from fastapi import FastAPI
from . import models
from .database import engine
from .routers import user, auth, stories, words
from .config import settings

from fastapi.middleware.cors import CORSMiddleware

#this line is not needed when using alembic
models.Base.metadata.create_all(bind=engine)


app = FastAPI()


origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(user.router)
app.include_router(auth.router)
app.include_router(stories.router)
app.include_router(words.router)




