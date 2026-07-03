"""
Audio proxy — streams podcast audio with CORS headers added.

Used by the browser Whisper client when the CDN rejects direct cross-origin
fetches. The browser POSTs through here, which is same-origin from the
browser's perspective, so no CORS preflight is triggered for Range headers.

GET /proxy/audio?url=<encoded-audio-url>
  - Passes Range header through (range-fetch for MP3 works transparently)
  - Returns Content-Type, Content-Length, Accept-Ranges from upstream
  - Sets Access-Control-Allow-Origin: *
  - SSRF-guarded: https only, blocks private / loopback / link-local addresses
"""

import ipaddress
import re
import socket
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..limiter import limiter

router = APIRouter(prefix="/proxy", tags=["Proxy"])

_PRIVATE_PREFIX_RE = re.compile(
    r'^(localhost|.*\.local|.*\.internal|'
    r'10\.\d+\.\d+\.\d+|'
    r'172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|'
    r'192\.168\.\d+\.\d+|'
    r'127\.\d+\.\d+\.\d+|'
    r'169\.254\.\d+\.\d+|'        # link-local / AWS metadata
    r'\[?::1\]?)',                 # IPv6 loopback
    re.IGNORECASE,
)


def _ssrf_safe(url: str) -> bool:
    """Return True only if url is an https:// URL to a public host."""
    try:
        p = urlparse(url)
        if p.scheme != "https":
            return False
        host = p.hostname or ""
        if not host:
            return False
        # Fast regex check before any DNS resolution
        if _PRIVATE_PREFIX_RE.match(host):
            return False
        # Reject numeric private addresses not caught by the regex
        try:
            addr = ipaddress.ip_address(host)
            return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)
        except ValueError:
            pass  # host is a domain name — regex check is sufficient here
        return True
    except Exception:
        return False


@router.api_route("/audio", methods=["GET", "HEAD"])
@limiter.limit("30/minute")
async def proxy_audio(url: str, request: Request):
    if not _ssrf_safe(url):
        raise HTTPException(400, "Invalid or disallowed URL")

    # HEAD: fetch upstream headers only (GET+immediate close so CDNs that reject HEAD still work)
    if request.method == "HEAD":
        client = httpx.AsyncClient(follow_redirects=True, timeout=httpx.Timeout(15))
        try:
            upstream_req = client.build_request("GET", url, headers={"User-Agent": "szol-app/1.0"})
            r = await client.send(upstream_req, stream=True)
            resp_headers: dict[str, str] = {
                "Content-Type":                r.headers.get("content-type", "audio/mpeg"),
                "Accept-Ranges":               r.headers.get("accept-ranges", "bytes"),
                "Access-Control-Allow-Origin": "*",
            }
            if cl := r.headers.get("content-length"):
                resp_headers["Content-Length"] = cl
        except httpx.RequestError as e:
            raise HTTPException(502, f"Could not reach upstream: {e}")
        finally:
            await r.aclose()
            await client.aclose()
        from fastapi.responses import Response
        return Response(status_code=200, headers=resp_headers)

    fwd: dict[str, str] = {"User-Agent": "szol-app/1.0"}
    if rng := request.headers.get("range"):
        fwd["Range"] = rng

    client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(15, read=None),   # long read timeout for large files
    )
    try:
        upstream_req = client.build_request("GET", url, headers=fwd)
        r = await client.send(upstream_req, stream=True)
    except httpx.RequestError as e:
        await client.aclose()
        raise HTTPException(502, f"Could not reach upstream: {e}")

    if r.status_code >= 400:
        body = await r.aread()
        await r.aclose()
        await client.aclose()
        raise HTTPException(r.status_code, f"Upstream returned {r.status_code}")

    resp_headers: dict[str, str] = {
        "Content-Type":                r.headers.get("content-type", "audio/mpeg"),
        "Accept-Ranges":               r.headers.get("accept-ranges", "bytes"),
        "Access-Control-Allow-Origin": "*",
    }
    if cl := r.headers.get("content-length"):
        resp_headers["Content-Length"] = cl
    if cr := r.headers.get("content-range"):
        resp_headers["Content-Range"] = cr

    async def _stream():
        try:
            async for chunk in r.aiter_bytes(65536):
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(_stream(), status_code=r.status_code, headers=resp_headers)
