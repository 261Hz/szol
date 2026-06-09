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
from sqlalchemy.exc import IntegrityError
from email_validator import validate_email, EmailNotValidError
from .. import models, schemas, utils, oauth2
from ..database import get_db
from sqlalchemy.orm import Session

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Reject duplicate email early with a clean 409 so the frontend can show a
    # readable message.  Without this check an IntegrityError from Postgres would
    # propagate as an unhandled 500 whose response lacks CORS headers, causing the
    # browser to report a CORS error instead of the real problem.
    # Verify the email address has a live MX record (rejects typos and fake domains).
    # check_deliverability does a DNS lookup; we catch any error and return 422.
    try:
        info = validate_email(user.email, check_deliverability=True)
        user.email = info.normalized  # use canonical form (lowercased, etc.)
    except EmailNotValidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken.",
        )

    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user.password = utils.hash_password(user.password)
    new_user = models.User(**user.model_dump())
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
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


@router.get("/{user_id}", response_model=schemas.PublicUserResponse)
def get_user(user_id: UUID, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
