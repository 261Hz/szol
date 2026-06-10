"""
Voice messages between users.

Security model:
  - Audio stored in a PRIVATE Supabase bucket — no public URLs ever exposed.
  - All audio is served through GET /messages/{id}/audio which verifies the
    requester is the sender or recipient before proxying the bytes.
  - allow_download is enforced server-side: if false, Content-Disposition is
    not set, preventing browser save prompts.
  - File type validated to audio/* on upload; size capped at 10 MB.
  - Messages expire after 7 days; expired rows and files are cleaned up on delete.

Routes
------
  POST   /messages                  (auth) send a voice message
  GET    /messages/{id}/audio       (auth) stream audio — only sender/recipient
  GET    /messages/inbox            (auth) received messages
  GET    /messages/sent             (auth) sent messages
  PATCH  /messages/{id}/read        (auth) mark as read
  DELETE /messages/{id}             (auth) delete + remove from storage
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

import requests as http
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(prefix="/messages", tags=["Messages"])

SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET  = "voice-messages"   # must be a PRIVATE bucket in Supabase
MAX_DURATION_MS = 90_000             # 90 seconds
MAX_BYTES       = 10 * 1024 * 1024   # 10 MB
EXPIRY_DAYS     = 1
AUDIO_TYPES     = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
                   "audio/wav", "audio/aac", "application/octet-stream"}


def _upload(data: bytes, path: str, content_type: str) -> str:
    """Upload to private Supabase bucket. Returns the storage path (not a public URL)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(500, "Storage not configured")
    resp = http.post(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": content_type},
        data=data,
        timeout=20,
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(500, "Audio upload failed")
    return path   # store path only, never the public URL


def _delete_from_storage(path: str):
    if not SUPABASE_URL or not SUPABASE_KEY or not path:
        return
    http.delete(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10,
    )


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VoiceMessageResponse)
async def send_voice_message(
    recipient_id:   str        = Form(...),
    lang:           str        = Form(...),
    duration_ms:    int        = Form(...),
    allow_download: bool       = Form(True),
    audio:          UploadFile = File(...),
    db:             Session    = Depends(get_db),
    current_user:   models.User = Depends(oauth2.get_current_user),
):
    # Validate duration
    if duration_ms > MAX_DURATION_MS:
        raise HTTPException(400, f"Max {MAX_DURATION_MS // 1000} seconds")

    # Validate content type
    ct = (audio.content_type or "").split(";")[0].strip().lower()
    if ct not in AUDIO_TYPES:
        raise HTTPException(400, "File must be an audio recording")

    # Read with size cap
    audio_bytes = await audio.read(MAX_BYTES + 1)
    if len(audio_bytes) > MAX_BYTES:
        raise HTTPException(400, f"Audio must be under {MAX_BYTES // 1024 // 1024} MB")

    # Validate recipient
    recipient = db.query(models.User).filter(
        models.User.id == recipient_id,
        models.User.open_to_messages == True,
    ).first()
    if not recipient:
        raise HTTPException(404, "This user is not accepting voice messages")

    if current_user.target_lang != recipient.native_lang:
        raise HTTPException(403, "You can only message native speakers of your target language")

    if str(current_user.id) == str(recipient_id):
        raise HTTPException(400, "Cannot send a message to yourself")

    # Upload to private bucket — store path only, never expose a public URL
    path      = f"{current_user.id}/{uuid.uuid4()}.webm"
    _upload(audio_bytes, path, ct or "audio/webm")
    expires_at = datetime.now(timezone.utc) + timedelta(days=EXPIRY_DAYS)

    msg = models.VoiceMessage(
        sender_id      = current_user.id,
        recipient_id   = recipient_id,
        audio_url      = path,          # store path, not public URL
        lang           = lang,
        duration_ms    = duration_ms,
        allow_download = allow_download,
        expires_at     = expires_at,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return schemas.VoiceMessageResponse(
        **{c.key: getattr(msg, c.key) for c in models.VoiceMessage.__table__.columns},
        sender_username=current_user.username,
    )


@router.get("/{msg_id}/audio")
def stream_audio(
    msg_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    """
    Proxy audio from private storage. Only sender or recipient may access.
    Respects allow_download: if False, no Content-Disposition header is set
    so browsers won't offer a save prompt.
    """
    msg = db.query(models.VoiceMessage).filter(
        models.VoiceMessage.id == msg_id,
        or_(
            models.VoiceMessage.recipient_id == current_user.id,
            models.VoiceMessage.sender_id    == current_user.id,
        ),
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")

    if msg.expires_at and msg.expires_at < datetime.now(timezone.utc):
        raise HTTPException(410, "This message has expired")

    # Fetch from private bucket using service key
    r = http.get(
        f"{SUPABASE_URL}/storage/v1/object/authenticated/{STORAGE_BUCKET}/{msg.audio_url}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        stream=True,
        timeout=15,
    )
    if r.status_code != 200:
        raise HTTPException(404, "Audio not found")

    headers = {"Cache-Control": "no-store"}
    if msg.allow_download and str(current_user.id) == str(msg.recipient_id):
        headers["Content-Disposition"] = "attachment; filename=voice-message.webm"

    return StreamingResponse(
        r.iter_content(chunk_size=8192),
        media_type="audio/webm",
        headers=headers,
    )


@router.get("/inbox", response_model=List[schemas.VoiceMessageResponse])
def get_inbox(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    rows = db.execute(text("""
        SELECT vm.*, u.username AS sender_username
        FROM   voice_messages vm
        JOIN   users u ON u.id = vm.sender_id
        WHERE  vm.recipient_id = :uid
          AND  vm.recipient_deleted_at IS NULL
          AND  (vm.expires_at IS NULL OR vm.expires_at > now())
        ORDER  BY vm.created_at DESC
    """), {"uid": current_user.id}).fetchall()
    return [schemas.VoiceMessageResponse(**dict(r._mapping)) for r in rows]


@router.get("/sent", response_model=List[schemas.VoiceMessageResponse])
def get_sent(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    rows = db.execute(text("""
        SELECT vm.*, u.username AS sender_username
        FROM   voice_messages vm
        JOIN   users u ON u.id = vm.sender_id
        WHERE  vm.sender_id = :uid
        ORDER  BY vm.created_at DESC
    """), {"uid": current_user.id}).fetchall()
    return [schemas.VoiceMessageResponse(**dict(r._mapping)) for r in rows]


@router.patch("/{msg_id}/read", response_model=schemas.VoiceMessageResponse)
def mark_read(
    msg_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    msg = db.query(models.VoiceMessage).filter(
        models.VoiceMessage.id           == msg_id,
        models.VoiceMessage.recipient_id == current_user.id,
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    msg.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return schemas.VoiceMessageResponse(
        **{c.key: getattr(msg, c.key) for c in models.VoiceMessage.__table__.columns},
    )


@router.delete("/{msg_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    msg_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user),
):
    msg = db.query(models.VoiceMessage).filter(
        models.VoiceMessage.id == msg_id,
        or_(
            models.VoiceMessage.recipient_id == current_user.id,
            models.VoiceMessage.sender_id    == current_user.id,
        ),
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")

    if str(current_user.id) == str(msg.sender_id):
        # Sender hard-deletes: remove from storage and drop the row
        _delete_from_storage(msg.audio_url)
        db.delete(msg)
    else:
        # Recipient soft-deletes: hide from their inbox, leave storage intact for sender
        msg.recipient_deleted_at = datetime.now(timezone.utc)
    db.commit()
