import math
import hmac as _hmac
import hashlib
import json as _json
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/ink", tags=["ink"])

CJK_LANGS = frozenset({"zh", "zh-TW", "ja"})
PASS_THRESHOLD = 0.38

class Pt(BaseModel):
    x: float
    y: float

class RecognizeRequest(BaseModel):
    strokes: list[list[Pt]]
    lang: str
    expected: str

class RecognizeResponse(BaseModel):
    match: bool
    score: float

_hanzi_cache: dict[str, list | None] = {}

async def _fetch_hanzi(char: str) -> list | None:
    if char in _hanzi_cache:
        return _hanzi_cache[char]
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(
                f"https://cdn.jsdelivr.net/npm/hanzi-writer-data/{char}.json"
            )
        if r.status_code != 200:
            _hanzi_cache[char] = None
            return None
        medians = r.json()["medians"]
        # HanziWriter y=0 is bottom; flip to match canvas (y increases downward)
        strokes = [[[p[0], 900 - p[1]] for p in s] for s in medians]
        _hanzi_cache[char] = strokes
        return strokes
    except Exception:
        _hanzi_cache[char] = None
        return None

def _all_pts(strokes: list) -> list:
    return [p for s in strokes for p in s]

def _norm_all(strokes: list) -> list:
    """Normalize all strokes together to unit box, centered (preserves relative positions)."""
    all_p = _all_pts(strokes)
    if len(all_p) < 2:
        return strokes
    xs = [p[0] for p in all_p]
    ys = [p[1] for p in all_p]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    size = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    return [
        [[(p[0] - cx) / size, (p[1] - cy) / size] for p in s]
        for s in strokes
    ]

def _resample(pts: list, n: int) -> list:
    """Resample a single stroke to exactly n evenly-spaced points."""
    if not pts:
        return [[0.0, 0.0]] * n
    if len(pts) == 1:
        return [pts[0]] * n
    cum = [0.0]
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i-1][0]
        dy = pts[i][1] - pts[i-1][1]
        cum.append(cum[-1] + math.sqrt(dx*dx + dy*dy))
    total = cum[-1]
    if total == 0:
        return [pts[0]] * n
    out = []
    lo = 0
    for k in range(n):
        target = total * k / (n - 1) if n > 1 else 0.0
        while lo < len(cum) - 2 and cum[lo + 1] <= target:
            lo += 1
        seg = cum[lo + 1] - cum[lo]
        t = (target - cum[lo]) / seg if seg > 0 else 0.0
        out.append([
            pts[lo][0] + t * (pts[lo+1][0] - pts[lo][0]),
            pts[lo][1] + t * (pts[lo+1][1] - pts[lo][1]),
        ])
    return out

def _avg_dist(a: list, b: list) -> float:
    n = min(len(a), len(b))
    if n == 0:
        return float('inf')
    return sum(math.sqrt((a[i][0]-b[i][0])**2 + (a[i][1]-b[i][1])**2) for i in range(n)) / n

def _score(user_raw: list, template_raw: list) -> float:
    """
    Per-stroke comparison when stroke counts match (better accuracy).
    Falls back to whole-char comparison with 1.5× penalty when they don't.
    All strokes are normalized together so relative positions are preserved.
    """
    if not user_raw or not template_raw:
        return float('inf')

    u_norm = _norm_all(user_raw)
    t_norm = _norm_all(template_raw)

    if len(u_norm) == len(t_norm):
        pts_per = max(8, 48 // len(u_norm))
        total = 0.0
        for u_s, t_s in zip(u_norm, t_norm):
            ur = _resample(u_s, pts_per)
            tr = _resample(t_s, pts_per)
            fwd = _avg_dist(ur, tr)
            rev = _avg_dist(ur, list(reversed(tr)))
            total += min(fwd, rev)
        return total / len(u_norm)
    else:
        # Wrong stroke count: whole-character comparison with penalty
        u_flat = _resample(_all_pts(u_norm), 64)
        t_flat = _resample(_all_pts(t_norm), 64)
        fwd = _avg_dist(u_flat, t_flat)
        rev = _avg_dist(u_flat, list(reversed(t_flat)))
        return min(fwd, rev) * 1.5

_GOOGLE_LANG_MAP = {
    "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it",
    "pt": "pt", "nl": "nl", "pl": "pl", "sv": "sv", "tr": "tr",
    "hu": "hu", "fi": "fi", "da": "da", "cs": "cs", "ro": "ro",
    "ar": "ar", "arz": "ar", "he": "iw", "ru": "ru", "el": "el",
    "uk": "uk", "bg": "bg",
}

class GoogleInkRequest(BaseModel):
    strokes: list[list[Pt]]
    lang: str
    width: float = 600
    height: float = 220

@router.post("/google-recognize")
async def google_recognize(req: GoogleInkRequest):
    import logging as _log
    lang_code = _GOOGLE_LANG_MAP.get(req.lang, req.lang)
    ink = []
    t_offset = 0
    for stroke in req.strokes:
        if not stroke:
            continue
        xs = [p.x for p in stroke]
        ys = [p.y for p in stroke]
        ts = [t_offset + i * 50 for i in range(len(stroke))]
        t_offset = ts[-1] + 200
        ink.append([xs, ys, ts])
    _log.warning("google-recognize: lang=%s strokes=%d pts=%d", lang_code, len(ink), sum(len(s[0]) for s in ink))
    if not ink:
        return {"text": None, "candidates": []}
    payload = {
        "writing_guide": {"writing_area_width": req.width, "writing_area_height": req.height},
        "ink": ink,
        "language": lang_code,
        "max_completions": 5,
        "pre_context": "",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(
                "https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        _log.warning("google-recognize: http=%d body=%s", r.status_code, r.text[:200])
        if r.status_code != 200:
            return {"text": None, "candidates": []}
        data = r.json()
        if not data or data[0] != "SUCCESS" or not data[1]:
            return {"text": None, "candidates": []}
        candidates = data[1][0] if data[1] else []
        _log.warning("google-recognize: candidates=%r", candidates)
        return {"text": candidates[0] if candidates else None, "candidates": candidates}
    except Exception as e:
        _log.warning("google-recognize: exception %s", e)
        return {"text": None, "candidates": []}

_MYSCRIPT_LANG_MAP = {
    # Non-Latin scripts
    "ar": "ar",      "he": "he_IL",  "ru": "ru_RU",
    "el": "el_GR",   "uk": "uk_UA",  "bg": "bg_BG",
    # Latin
    "en": "en_US",   "es": "es_ES",  "fr": "fr_FR",
    "de": "de_DE",   "it": "it_IT",  "pt": "pt_PT",
    "nl": "nl_NL",   "pl": "pl_PL",  "sv": "sv_SE",
    "tr": "tr_TR",   "hu": "hu_HU",  "fi": "fi_FI",
    "da": "da_DK",   "cs": "cs_CZ",  "ro": "ro_RO",
}

class TranscribeRequest(BaseModel):
    strokes: list[list[Pt]]
    lang: str

def _myscript_hmac(app_key: str, hmac_key: str, body: str) -> str:
    msg = (app_key + body).encode("utf-8")
    return _hmac.new(hmac_key.encode("utf-8"), msg, hashlib.sha512).hexdigest()

@router.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    from ..config import settings
    lang_code = _MYSCRIPT_LANG_MAP.get(req.lang)
    app_key  = settings.MYSCRIPT_APP_KEY.strip()
    hmac_key = settings.MYSCRIPT_HMAC_KEY.strip()
    import logging
    logging.warning("MyScript keys: app_key_len=%d hmac_key_len=%d lang=%s", len(app_key), len(hmac_key), req.lang)
    if not lang_code or not app_key or not hmac_key:
        return {"text": None}

    # Build stroke list with synthetic timestamps (10ms per point, 500ms gap between strokes)
    ms_strokes = []
    t_offset = 0
    for stroke in req.strokes:
        if not stroke:
            continue
        xs = [p.x for p in stroke]
        ys = [p.y for p in stroke]
        ts = [t_offset + i * 10 for i in range(len(stroke))]
        t_offset = ts[-1] + 500
        ms_strokes.append({"x": xs, "y": ys, "t": ts})

    if not ms_strokes:
        return {"text": None}

    body = {
        "configuration": {"lang": lang_code},
        "contentType": "Text",
        "strokeGroups": [{"strokes": ms_strokes}],
    }
    body_str = _json.dumps(body, separators=(",", ":"))
    sig = _myscript_hmac(app_key, hmac_key, body_str)

    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.post(
                "https://cloud.myscript.com/api/v4.0/iink/batch",
                content=body_str.encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json,application/vnd.myscript.jiix",
                    "applicationKey": app_key,
                    "hmac": sig,
                },
            )
        if r.status_code != 200:
            import logging
            logging.warning("MyScript %d: %s", r.status_code, r.text[:200])
            return {"text": None}
        label = r.json().get("label", "").strip()
        import logging
        logging.warning("MyScript lang=%s label=%r", req.lang, label)
        return {"text": label}
    except Exception:
        return {"text": None}

@router.post("/recognize", response_model=RecognizeResponse)
async def recognize(req: RecognizeRequest):
    user_pts = [[[p.x, p.y] for p in s] for s in req.strokes]

    if req.lang in CJK_LANGS and len(req.expected) == 1:
        template = await _fetch_hanzi(req.expected)
        if template:
            score = _score(user_pts, template)
            return RecognizeResponse(match=score < PASS_THRESHOLD, score=round(score, 4))
        # No template (punctuation etc.) — accept any drawing
        return RecognizeResponse(match=bool(user_pts), score=0.0)

    # Latin / RTL: stroke-count heuristic (no per-word template library yet)
    min_s = max(1, len(req.expected) // 4)
    ok = len(user_pts) >= min_s
    return RecognizeResponse(match=ok, score=0.5 if ok else 1.0)
