import asyncio
import logging as _log
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/roots", tags=["roots"])

_ar_analyzer = None
_he_nlp      = None

def _load_ar():
    global _ar_analyzer
    if _ar_analyzer is None:
        from camel_tools.morphology.database import MorphologyDB
        try:
            from camel_tools.morphology.analyzer import MorphAnalyzer as _Cls
        except ImportError:
            from camel_tools.morphology.analyzer import Analyzer as _Cls
        db = MorphologyDB.builtin_db()
        _ar_analyzer = _Cls(db)
    return _ar_analyzer

def _load_he():
    global _he_nlp
    if _he_nlp is None:
        import spacy
        _he_nlp = spacy.load("he_core_news_sm")
    return _he_nlp

def _get_root(analysis) -> str | None:
    if isinstance(analysis, dict):
        return analysis.get("root")
    return getattr(analysis, "root", None)

def _ar_roots_sync(words: list) -> dict:
    try:
        az = _load_ar()
        out = {}
        for w in words:
            analyses = az.analyze(w)
            if not analyses:
                continue
            root = _get_root(analyses[0])
            if not root or root in ("NOAN", "----", ""):
                continue
            chars = [c for c in root.replace(".", "").replace("_", "")
                     if "؀" <= c <= "ۿ"]
            if 2 <= len(chars) <= 5:
                out[w] = chars
        return out
    except Exception as e:
        _log.warning("ar roots: %s", e)
        return {}

def _he_roots_sync(words: list) -> dict:
    try:
        nlp = _load_he()
        out = {}
        for w in words:
            doc = nlp(w)
            for tok in doc:
                lemma = "".join(
                    c for c in (tok.lemma_ or tok.text)
                    if "א" <= c <= "ת"
                )
                if len(lemma) >= 2:
                    out[w] = list(lemma)
                    break
        return out
    except Exception as e:
        _log.warning("he roots: %s", e)
        return {}

class RootsReq(BaseModel):
    words: list[str]
    lang: str

@router.post("/analyze")
async def analyze_roots(req: RootsReq):
    loop = asyncio.get_event_loop()
    if req.lang == "ar":
        roots = await loop.run_in_executor(None, _ar_roots_sync, req.words)
    elif req.lang == "he":
        roots = await loop.run_in_executor(None, _he_roots_sync, req.words)
    else:
        roots = {}
    _log.warning("roots/%s: %d/%d found", req.lang, len(roots), len(req.words))
    return {"roots": roots}
