import hashlib
import uuid
import requests as http
from datetime import datetime, timezone, timedelta

from fastapi import Depends, APIRouter, HTTPException, Request, status, Response
from sqlalchemy.orm import Session

from .. import schemas, models, utils, oauth2
from ..database import get_db
from ..config import settings
from ..limiter import limiter
from fastapi.security.oauth2 import OAuth2PasswordRequestForm

router = APIRouter(
    tags=["Authentication"],
)


@router.post("/login", response_model=schemas.Token)
def login(user_credentials: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == user_credentials.username).first()
    if not user or not user.password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Credentials")

    if not utils.verify_password(user_credentials.password, user.password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Credentials")

    access_token = oauth2.create_jwt_token(
        data={"user_id": str(user.id), "trust_level": user.trust_level, "is_guest": False}
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/auth/guest", response_model=schemas.GuestResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
def create_guest(request: Request, body: schemas.GuestCreate, db: Session = Depends(get_db)):
    # 1. Honeypot — bots fill hidden fields, humans don't
    if body.website:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request")

    # 2. Turnstile — fail CLOSED (never let through if verification fails)
    if not settings.TURNSTILE_SECRET:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Auth not configured")

    try:
        resp = http.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": settings.TURNSTILE_SECRET, "response": body.turnstile_token},
            timeout=5,
        )
        result = resp.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Could not verify challenge. Try again.")

    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Challenge failed. Please try again.")

    # 3. Token age — Turnstile tokens expire after 5 minutes
    challenge_ts = result.get("challenge_ts", "")
    if challenge_ts:
        try:
            ts = datetime.fromisoformat(challenge_ts.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - ts).total_seconds() > 300:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Challenge expired. Please try again.")
        except ValueError:
            pass

    # 4. Token deduplication — each Turnstile token is single-use
    token_hash = hashlib.sha256(body.turnstile_token.encode()).hexdigest()

    # Purge tokens older than 10 minutes (they can't be replayed anyway after 5 min, but keep it clean)
    db.query(models.UsedTurnstileToken).filter(
        models.UsedTurnstileToken.created_at < datetime.now(timezone.utc) - timedelta(minutes=10)
    ).delete(synchronize_session=False)

    if db.query(models.UsedTurnstileToken).filter(
        models.UsedTurnstileToken.token_hash == token_hash
    ).first():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Challenge already used. Please try again.")

    db.add(models.UsedTurnstileToken(token_hash=token_hash))

    # 5. Create guest user
    guest_id = uuid.uuid4()
    new_user = models.User(
        id=guest_id,
        username=f"guest_{guest_id.hex[:12]}",
        email=None,
        password=None,
        is_guest=True,
        trust_level="guest",
        email_verified=False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 6. Short-lived JWT — 48 hours, no refresh for guests
    access_token = oauth2.create_jwt_token(
        data={"user_id": str(new_user.id), "trust_level": "guest", "is_guest": True},
        expire_minutes=settings.GUEST_JWT_EXPIRE_HOURS * 60,
    )

    return {"access_token": access_token, "token_type": "bearer", "is_guest": True, "trust_level": "guest"}
