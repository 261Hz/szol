"""
Leipzig Wortschatz v3 REST API client.
Docs:  https://api.wortschatz-leipzig.de/ws/swagger-ui/index.html
Terms: CC BY 4.0, free for private and scientific use.

Coverage: 9/13 app languages (he, ja, zh, arz not available in this API).
Fallback strategy: try local DB first; only hit the API on a cache miss.
"""
import requests

BASE    = "https://api.wortschatz-leipzig.de/ws"
TIMEOUT = 5  # seconds — fail fast so a slow API doesn't block the user

# Maps app language codes to the best available Leipzig v3 corpus name.
# Retrieved from GET /corpora — only corpora confirmed in the API are listed.
CORPUS: dict[str, str] = {
    "en":  "eng_news_2012_3M",
    "es":  "spa_news_2011_3M",
    "fr":  "fra_news_2011_3M",
    "de":  "deu_news_2012_3M",
    "it":  "ita_wikipedia_2011_1M",
    "ru":  "rus_news_2013_1M",
    "ar":  "ara_wikipedia_2018_1M",
    "arz": "ara_wikipedia_2018_1M",
    "hu":  "hun_newscrawl_2013_1M",
    "el":  "ell_newscrawl_2013_1M",
    # he, ja, zh: not available in this API
}


def _get(path: str) -> dict | list | None:
    try:
        r = requests.get(f"{BASE}{path}", timeout=TIMEOUT)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def get_word_rank(word: str, lang: str) -> int | None:
    """
    Return the corpus frequency rank for a word directly from the Leipzig API.
    Works for inflected forms (e.g. 'bailed' returns its own rank) — no
    lemmatization needed since inflected forms appear independently in the corpus.
    Returns None if the word is not in the corpus or the language is unsupported.
    """
    corpus = CORPUS.get(lang)
    if not corpus:
        return None
    data = _get(f"/words/{corpus}/word/{word}")
    if not isinstance(data, dict):
        return None
    rank = data.get("wordRank")
    return int(rank) if rank else None


def get_sentences(word: str, lang: str, limit: int = 5) -> list[str]:
    """
    Return up to `limit` example sentences for a word from the Leipzig API.
    Returns [] if the language has no corpus or the API is unavailable.
    """
    corpus = CORPUS.get(lang)
    if not corpus:
        return []
    data = _get(f"/sentences/{corpus}/sentences/{word}?limit={limit}")
    if not isinstance(data, dict):
        return []
    return [
        s["sentence"]
        for s in data.get("sentences", [])
        if isinstance(s, dict) and s.get("sentence")
    ]


def get_similar(word: str, lang: str, limit: int = 8) -> list[str]:
    """
    Return words that are contextually similar (based on cooccurrence profiles).
    Closest available proxy for synonyms given the v3 API's available endpoints.
    Returns [] if unsupported or unavailable.
    """
    corpus = CORPUS.get(lang)
    if not corpus:
        return []
    data = _get(f"/similarity/{corpus}/coocsim/{word}")
    if not isinstance(data, list):
        return []
    words = []
    for item in data[:limit]:
        if not isinstance(item, dict):
            continue
        w = item.get("word") or item.get("w") or item.get("coveredWord")
        if w and w.lower() != word.lower():
            words.append(w)
    return words
