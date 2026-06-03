# user.py — endpoints for user account management.
#
# Routes
# ------
#   POST /users/          register a new account
#   GET  /users/me        return the authenticated user's own profile
#   GET  /users/{user_id} look up any user by UUID (requires auth)

from fastapi import Response, status, HTTPException, Depends, APIRouter
from typing import List
from uuid import UUID
from .. import models, schemas, utils, oauth2
from ..database import get_db
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Hash the plaintext password before storing — never persist raw passwords.
    # utils.hash_password() uses bcrypt so the hash is salted and one-way.
    user.password = utils.hash_password(user.password)

    # **user.dict() unpacks the Pydantic model fields as keyword arguments to the ORM constructor.
    # .dict() is the Pydantic v1 name; model_dump() is the v2 equivalent — both work here.
    new_user = models.User(**user.model_dump())
    db.add(new_user)
    db.commit()
    # refresh() re-reads the row from the database so server-generated fields
    # (id, created_at) are populated before FastAPI serialises the response.
    db.refresh(new_user)
    return new_user


@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_me(current_user: models.User = Depends(oauth2.get_current_user)):
    # oauth2.get_current_user decodes the JWT from the Authorization header and
    # queries the database for the matching User row, so current_user is already
    # a fully populated ORM object — we just return it directly.
    #
    # IMPORTANT: this route must be declared before /{user_id}.
    # FastAPI matches routes in declaration order; if /{user_id} came first,
    # the literal path "/me" would be captured as a UUID parameter and raise a
    # 422 Unprocessable Entity error before this handler ever runs.
    return current_user


@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: UUID, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    # user_id is parsed from the URL path as a UUID; FastAPI validates the format
    # automatically and returns 422 if the value is not a valid UUID string.
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return user
