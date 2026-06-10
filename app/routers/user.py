# user.py — endpoints for user account management.
#
# Routes
# ------
#   POST  /users/                    register a new account
#   GET   /users/verify-email        verify email token from the link in the email
#   POST  /users/resend-verification resend the verification email
#   GET   /users/me                  return the authenticated user's own profile
#   PATCH /users/me                  update settings (open_to_messages, target_lang, etc.)
#   GET   /users/discover            find users open to voice messages for a given native language
#   GET   /users/{user_id}           look up any user by UUID (requires auth)

import logging
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Request, Response, status, HTTPException, Depends, APIRouter
from fastapi.responses import RedirectResponse
from typing import List, Optional
from uuid import UUID
from sqlalchemy.exc import IntegrityError
from email_validator import validate_email, EmailNotValidError
import requests as http
from .. import models, schemas, utils, oauth2
from ..database import get_db
from ..limiter import limiter
from ..disposable_domains import DISPOSABLE_DOMAINS
from ..email import send_verification_email
from ..config import settings
from sqlalchemy.orm import Session
from sqlalchemy import text

log = logging.getLogger(__name__)


def _verify_turnstile(token: str) -> bool:
    """Returns True if the Turnstile token is valid. Fails open on any error."""
    if not settings.TURNSTILE_SECRET or not token:
        return True  # not configured or not provided — fail open
    try:
        r = http.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": settings.TURNSTILE_SECRET, "response": token},
            timeout=5,
        )
        return r.json().get("success", False)
    except Exception as exc:
        log.warning("Turnstile verification failed (fail open): %s", exc)
        return True  # Cloudflare unreachable — let the request through

router = APIRouter(
    prefix="/users",
    tags=["Users"],
)

VERIFY_TOKEN_EXPIRY_HOURS = 24


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.UserResponse)
@limiter.limit("5/hour")
def create_user(
    request: Request,
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    cf_turnstile_response: Optional[str] = None,
):
    if not _verify_turnstile(cf_turnstile_response or ""):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="CAPTCHA verification failed. Please try again.")

    try:
        info = validate_email(user.email, check_deliverability=True)
        user.email = info.normalized
    except EmailNotValidError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    domain = user.email.split("@")[1].lower()
    if domain in DISPOSABLE_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Disposable email addresses are not allowed. Please use a real email.",
        )

    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This username is already taken.")

    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    email_sender_active = bool(settings.RESEND_API_KEY)
    token   = secrets.token_urlsafe(32) if email_sender_active else None
    expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_EXPIRY_HOURS) if email_sender_active else None

    user.password = utils.hash_password(user.password)
    new_user = models.User(
        **user.model_dump(),
        email_verified       = not email_sender_active,  # auto-verify until email sender is configured
        email_verify_token   = token,
        email_verify_expires = expires,
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    db.refresh(new_user)

    if email_sender_active:
        send_verification_email(new_user.email, new_user.username, token)
    return new_user


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Click target from the verification email. Marks the account verified and
    redirects the user back to the frontend."""
    user = db.query(models.User).filter(models.User.email_verify_token == token).first()

    if not user:
        return RedirectResponse(f"{settings.FRONTEND_URL}?email_verify_error=invalid")

    if user.email_verify_expires and user.email_verify_expires < datetime.now(timezone.utc):
        return RedirectResponse(f"{settings.FRONTEND_URL}?email_verify_error=expired")

    user.email_verified       = True
    user.email_verify_token   = None
    user.email_verify_expires = None
    db.commit()
    return RedirectResponse(f"{settings.FRONTEND_URL}?email_verified=1")


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/hour")
def resend_verification(request: Request, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.get_current_user)):
    """Resend the verification email. No-ops silently if already verified."""
    if current_user.email_verified:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    token   = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_EXPIRY_HOURS)
    current_user.email_verify_token   = token
    current_user.email_verify_expires = expires
    db.commit()

    send_verification_email(current_user.email, current_user.username, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_me(current_user: models.User = Depends(oauth2.get_current_user)):
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


@router.get("/check-username")
def check_username(username: str, db: Session = Depends(get_db)):
    taken = db.query(models.User).filter(models.User.username == username).first() is not None
    return {"available": not taken}


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
