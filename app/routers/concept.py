import json, re, os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from groq import Groq

router = APIRouter(tags=["Concept"])
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


class ConceptRequest(BaseModel):
    concept:  str
    category: str


@router.post("/concept-of-day")
def concept_of_day(req: ConceptRequest):
    prompt = (
        f'You are a multilingual language teacher.\n\n'
        f'Concept ({req.category}): "{req.concept}"\n\n'
        f'For each of the 13 languages below, write exactly ONE short, natural example sentence '
        f'that clearly uses this concept. Keep sentences simple (5–12 words), everyday language, B1 level.\n\n'
        f'Reply ONLY with a JSON object — no markdown, no explanation, just the JSON:\n\n'
        f'{{"en":"...","es":"...","fr":"...","de":"...","he":"...","ar":"...","arz":"...",'
        f'"ja":"...","ru":"...","it":"...","el":"...","zh":"...","hu":"..."}}'
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
        temperature=0.5,
    )

    content = response.choices[0].message.content.strip()

    try:
        translations = json.loads(content)
    except Exception:
        m = re.search(r'\{[^{}]+\}', content, re.DOTALL)
        if not m:
            raise HTTPException(500, "Could not parse translations from model response.")
        try:
            translations = json.loads(m.group())
        except Exception:
            raise HTTPException(500, "Could not parse translations from model response.")

    return {"translations": translations}
