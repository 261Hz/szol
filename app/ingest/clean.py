"""HTML/text cleaning utilities for the ingest pipeline."""

import html
import re


def strip_html(raw: str) -> str:
    """Strip HTML tags, decode entities, collapse whitespace."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(raw, "lxml")
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "figure"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
    except Exception:
        text = re.sub(r"<[^>]+>", " ", raw)
        text = html.unescape(text)

    lines = [ln.strip() for ln in text.splitlines()]
    paragraphs: list[str] = []
    pending_blank = False
    for ln in lines:
        if not ln:
            pending_blank = bool(paragraphs)
        else:
            if pending_blank:
                paragraphs.append("")
            paragraphs.append(ln)
            pending_blank = False
    return "\n".join(paragraphs).strip()


def extract_article(html_content: str) -> str | None:
    """
    Extract main article text from a full HTML page using trafilatura.
    Returns None if extraction fails or yields too little text.
    """
    try:
        import trafilatura
        return trafilatura.extract(
            html_content,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
            favor_recall=True,
        )
    except Exception:
        return None


def is_usable(text: str, min_words: int = 120) -> bool:
    return bool(text) and len(text.split()) >= min_words
