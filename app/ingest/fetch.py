"""
RSS/Atom feed fetcher for the Szol ingest pipeline.

For each source:
  1. Parse the feed with feedparser
  2. Prefer full content in the feed entry; fall back to fetching the page
  3. Clean HTML to plain text and validate word count
  4. Return article dicts ready to insert into feed_stories
"""

import logging
from datetime import datetime, timezone
from typing import Any

import feedparser
import requests

from .clean import extract_article, is_usable, strip_html

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Szol/1.0 (+https://szol.app; content ingest; "
        "contact: hello@szol.app)"
    )
}
_TIMEOUT = 15


def _best_text_from_entry(entry: Any) -> str | None:
    """Return the best text available directly from a feed entry."""
    # Atom <content> / RSS <content:encoded> — usually full article
    if getattr(entry, "content", None):
        raw = entry.content[0].get("value", "")
        if raw:
            return strip_html(raw)
    # RSS <description> / Atom <summary>
    if getattr(entry, "summary", None):
        return strip_html(entry.summary)
    return None


def _fetch_page_text(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        return extract_article(resp.text)
    except Exception as exc:
        logger.warning("Could not fetch %s: %s", url, exc)
        return None


def _parse_date(entry: Any) -> datetime | None:
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None


def _entry_author(entry: Any) -> str | None:
    if getattr(entry, "author", None):
        return entry.author
    authors = getattr(entry, "authors", None)
    if authors:
        names = [a.get("name", "") for a in authors if a.get("name")]
        return ", ".join(names) or None
    return None


def fetch_source(source: dict) -> list[dict]:
    """
    Fetch all usable articles from one source definition.

    Returns a list of dicts with keys:
      title, text, lang, source_name, source_url, license, author, published_at
    """
    feed_url    = source["feed_url"]
    lang        = source["lang"]
    source_name = source["name"]
    license_    = source["license"]
    fetch_full  = source.get("fetch_full_text", True)
    min_words   = source.get("min_words", 120)

    try:
        feed = feedparser.parse(feed_url, request_headers=_HEADERS)
    except Exception as exc:
        logger.error("feedparser failed for %s: %s", feed_url, exc)
        return []

    if not feed.entries:
        logger.warning("No entries in feed %s (bozo=%s)", feed_url, feed.get("bozo"))
        return []

    results = []

    for entry in feed.entries:
        url   = entry.get("link", "").strip()
        title = entry.get("title", "").strip()
        if not url or not title:
            continue

        text = _best_text_from_entry(entry)

        if fetch_full and not is_usable(text or "", min_words):
            text = _fetch_page_text(url)

        if not is_usable(text or "", min_words):
            continue

        results.append({
            "title":        title,
            "text":         text,
            "lang":         lang,
            "source_name":  source_name,
            "source_url":   url,
            "license":      license_,
            "author":       _entry_author(entry),
            "published_at": _parse_date(entry),
        })

    return results
