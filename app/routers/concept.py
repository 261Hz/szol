import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from groq import Groq
from .. import models, oauth2

router = APIRouter(tags=["Concept"])
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

_LANG_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "ru": "Russian", "he": "Hebrew", "ar": "Arabic (Modern Standard)",
    "arz": "Egyptian Arabic (spoken dialect)", "ja": "Japanese",
    "zh": "Mandarin Chinese (Simplified)", "hu": "Hungarian", "el": "Greek",
}


class ConceptRequest(BaseModel):
    concept:  str
    category: str
    lang:     str = "en"


@router.post("/concept-of-day")
def concept_of_day(req: ConceptRequest, current_user: models.User = Depends(oauth2.get_current_user)):
    lang_name = _LANG_NAMES.get(req.lang, req.lang)
    prompt = (
        f'You are a multilingual language teacher.\n\n'
        f'Concept ({req.category}): "{req.concept}"\n\n'
        f'Write exactly ONE short, natural example sentence in {lang_name} '
        f'that clearly illustrates this concept. '
        f'Use simple everyday vocabulary suitable for a B1 learner (5–12 words). '
        f'Reply with ONLY the sentence — no explanation, no punctuation outside the sentence.'
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=80,
        temperature=0.6,
    )

    sentence = response.choices[0].message.content.strip().strip('"').strip("'")
    if not sentence:
        raise HTTPException(500, "Model returned an empty sentence.")

    return {"sentence": sentence}
