from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
from jose import JWTError, jwt
from .config import settings

# Rate limit tables by trust level.
# Keys: guest | established_guest | verified | high_trust
_LIMITS = {
    "chat": {
        "guest":             "5/day",
        "established_guest": "20/day",
        "verified":          "100/day",
        "high_trust":        "500/day",
    },
    "transcript": {
        "guest":             "3/day",
        "established_guest": "10/day",
        "verified":          "50/day",
        "high_trust":        "200/day",
    },
    "default": {
        "guest":             "60/minute",
        "established_guest": "120/minute",
        "verified":          "240/minute",
        "high_trust":        "600/minute",
    },
}


def _trust_from_request(request: Request) -> str:
    """Extract trust level from the JWT in the Authorization header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(
                auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            return payload.get("trust_level", "guest")
        except (JWTError, Exception):
            pass
    return "guest"


def _limit_key(request: Request) -> str:
    """Rate limit by user_id when authenticated, fall back to IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(
                auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            user_id = payload.get("user_id")
            if user_id:
                return f"user:{user_id}"
        except (JWTError, Exception):
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_limit_key)


def dynamic_limit(endpoint: str = "default"):
    """Return a slowapi-compatible callable that yields the right limit string
    for the calling user's trust level."""
    def _limit(request: Request) -> str:
        trust = _trust_from_request(request)
        table = _LIMITS.get(endpoint, _LIMITS["default"])
        return table.get(trust, table["guest"])
    return _limit
