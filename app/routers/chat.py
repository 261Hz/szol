# chat.py — AI language tutor chat endpoint powered by Gemini 1.5 Flash.
#
# Routes
# ------
#   POST /chat  (auth required) — send a message and receive a tutor reply

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .. import models, oauth2
from ..config import settings

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


class ChatMessage(BaseModel):
    role: str    # "user" | "model"
    text: str


class ChatRequest(BaseModel):
    message:       str
    story_content: str  = ""
    lang:          str  = "en"
    history:       List[ChatMessage] = []
    vocab:         List[str]         = []
    proficiency:   Optional[str]     = None


class ChatResponse(BaseModel):
    reply: str


def _lang_name(code: str) -> str:
    names = {
        "en": "English", "es": "Spanish", "fr": "French", "de": "German",
        "it": "Italian", "ru": "Russian", "he": "Hebrew", "ar": "Arabic",
        "arz": "Egyptian Arabic", "ja": "Japanese", "zh": "Mandarin Chinese",
        "hu": "Hungarian", "el": "Greek",
    }
    return names.get(code, code)


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: models.User = Depends(oauth2.get_current_user),
):
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat is not configured on this server (missing GEMINI_API_KEY).",
        )

    try:
        import google.generativeai as genai
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="google-generativeai package is not installed.",
        )

    genai.configure(api_key=api_key)

    lang_name   = _lang_name(payload.lang)
    proficiency = payload.proficiency or "intermediate"
    story_snip  = payload.story_content[:2000].strip() if payload.story_content else ""
    vocab_str   = ", ".join(payload.vocab[:50]) if payload.vocab else "none yet"

    system_prompt = (
        f"You are a friendly language tutor helping a {proficiency} learner of {lang_name}. "
        f"The learner just read this story:\n\n{story_snip}\n\n"
        f"Their saved vocabulary includes: {vocab_str}.\n\n"
        f"Respond only in {lang_name}. Keep responses short and conversational (2–4 sentences). "
        f"If the learner writes in {lang_name}, gently correct any grammar mistakes by showing "
        f"the corrected form in parentheses. Encourage the learner warmly."
    )

    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=system_prompt,
    )

    # Convert stored history to Gemini's Content format
    history = [
        {"role": msg.role, "parts": [msg.text]}
        for msg in payload.history
    ]

    chat_session = model.start_chat(history=history)

    try:
        response = chat_session.send_message(payload.message)
        return ChatResponse(reply=response.text)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API error: {str(e)}",
        )
