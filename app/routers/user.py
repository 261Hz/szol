# user.py — endpoints for user account management.
#
# Routes
# ------
#   POST  /users/              register a new account
#   GET   /users/me            return the authenticated user's own profile
#   PATCH /users/me            update settings (open_to_messages, target_lang, etc.)
#   GET   /users/discover      find users open to voice messages for a given native language
#   GET   /users/{user_id}     look up any user by UUID (requires auth)

from fastapi import Request, Response, status, HTTPException, Depends, APIRouter
from typing import List
from uuid import UUID
from sqlalchemy.exc import IntegrityError
from email_validator import validate_email, EmailNotValidError
from .. import models, schemas, utils, oauth2
from ..database import get_db
from ..limiter import limiter
from ..disposable_domains import DISPOSABLE_DOMAINS
from sqlalchemy.orm import Session
from sqlalchemy import text

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.UserResponse)
@limiter.limit("5/hour")
def create_user(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
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

    domain = user.email.split("@")[1].lower()
    if domain in DISPOSABLE_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Disposable email addresses are not allowed. Please use a real email.",
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
    return current_user


@router.patch("/me", response_model=schemas.UserResponse)
def update_settings(
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/discover", response_model=List[schemas.DiscoverableUser])
def discover_users(
    native_lang: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """Return users whose native language matches native_lang and who accept voice messages."""
    return (
        db.query(models.User)
        .filter(
            models.User.native_lang      == native_lang,
            models.User.open_to_messages == True,
            models.User.id               != current_user.id,
        )
        .limit(50)
        .all()
    )


@router.get("/{user_id}", response_model=schemas.PublicUserResponse)
def get_user(user_id: UUID, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
