from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from typing import List, Optional
import os
from groq import Groq
from .. import models, oauth2
from ..limiter import limiter, dynamic_limit

router = APIRouter(tags=["Chat"])

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

_LANG_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "ru": "Russian", "he": "Hebrew", "ar": "Arabic",
    "arz": "Egyptian Arabic", "ja": "Japanese", "zh": "Mandarin Chinese",
    "hu": "Hungarian", "el": "Greek",
}


class Message(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def role_must_be_safe(cls, v):
        if v not in ("user", "assistant"):
            raise ValueError("role must be 'user' or 'assistant'")
        return v


class ChatRequest(BaseModel):
    message:       str
    story_content: Optional[str] = ""
    lang:          str           = "en"
    history:       List[Message] = []
    vocab:         List[str]     = []
    proficiency:   Optional[str] = "B1"


@router.post("/chat")
@limiter.limit(dynamic_limit("chat"))
def chat(request: Request, req: ChatRequest, current_user: models.User = Depends(oauth2.get_current_user)):
    lang_name   = _LANG_NAMES.get(req.lang, req.lang)
    story_snip  = (req.story_content or "")[:1500].strip()
    vocab_str   = ", ".join(req.vocab[:20]) if req.vocab else "none yet"
    proficiency = req.proficiency or "B1"

    system_prompt = (
        f"You are a friendly language tutor helping a {proficiency} learner of {lang_name}. "
        f"The learner just read this story excerpt:\n\n{story_snip}\n\n"
        f"Their saved vocabulary includes: {vocab_str}.\n\n"
        f"Rules:\n"
        f"- Respond ONLY in {lang_name}. Never switch to English. Ever.\n"
        f"- Keep responses short and conversational (2-4 sentences max)\n"
        f"- Gently correct grammar mistakes inline\n"
        f"- Ask follow-up questions about the story to encourage production\n"
        f"- Encourage the learner warmly"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for h in req.history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": req.message})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=300,
        temperature=0.7,
    )
    return {"reply": response.choices[0].message.content}
