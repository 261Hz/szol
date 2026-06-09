"""
Voice messages between users.

Design:
  - Audio is stored temporarily in Supabase Storage and expires after 7 days.
  - Senders can disable the recipient's ability to save/download the clip.
  - Only users with open_to_messages=True are reachable.
  - Sender must be learning the recipient's native language.

Routes
------
  POST   /messages                  (auth) send a voice message
  GET    /messages/inbox            (auth) received messages
  GET    /messages/sent             (auth) sent messages
  PATCH  /messages/{id}/read        (auth) mark as read
  DELETE /messages/{id}             (auth) delete + remove audio from storage
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

import requests as http
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(prefix="/messages", tags=["Messages"])

SUPABASE_URL    = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET  = "voice-messages"
MAX_DURATION_MS = 90_000   # 90-second hard limit
EXPIRY_DAYS     = 7        # audio deleted after 7 days


def _storage_upload(data: bytes, path: str, content_type: str) -> str:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(500, "Storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    resp = http.post(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": content_type},
        data=data,
        timeout=20,
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(500, "Audio upload failed")
    return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"


def _storage_delete(path: str):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    http.delete(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={"Authorization": f"Bearer {SUPABASE_KEY}"},
        timeout=10,
    )


def _audio_path_from_url(url: str) -> str:
    """Extract the storage object path from a public URL."""
    marker = f"/object/public/{STORAGE_BUCKET}/"
    idx = url.find(marker)
    return url[idx + len(marker):] if idx != -1 else ""


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
    if duration_ms > MAX_DURATION_MS:
        raise HTTPException(400, f"Voice messages must be under {MAX_DURATION_MS // 1000} seconds")

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

    audio_bytes  = await audio.read()
    content_type = audio.content_type or "audio/webm"
    path         = f"{current_user.id}/{uuid.uuid4()}.webm"
    audio_url    = _storage_upload(audio_bytes, path, content_type)
    expires_at   = datetime.now(timezone.utc) + timedelta(days=EXPIRY_DAYS)

    msg = models.VoiceMessage(
        sender_id      = current_user.id,
        recipient_id   = recipient_id,
        audio_url      = audio_url,
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
        models.VoiceMessage.id == msg_id,
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
        models.VoiceMessage.recipient_id == current_user.id,
    ).first()
    if not msg:
        raise HTTPException(404, "Message not found")
    # Remove audio from Supabase Storage
    _storage_delete(_audio_path_from_url(msg.audio_url))
    db.delete(msg)
    db.commit()
