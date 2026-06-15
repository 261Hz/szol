"""
Content source registry for Szol.

Every entry is legally usable under one of:
  CC BY-ND 4.0   — attribute, do not modify
  CC BY-SA 3.0   — attribute, share-alike
  public domain  — no restrictions
  attribution    — RSS/Substack convention: display with byline + link back

Required keys: name, feed_url, lang, license
Optional keys: fetch_full_text (bool, default True)
               min_words (int, default 120) — minimum word count to accept
"""

SOURCES = [

    # ── English — The Conversation (CC BY-ND 4.0, explicit free republish) ──
    {
        "name": "The Conversation US",
        "feed_url": "https://theconversation.com/us/articles.atom",
        "lang": "en",
        "license": "CC BY-ND 4.0",
    },
    {
        "name": "The Conversation UK",
        "feed_url": "https://theconversation.com/uk/articles.atom",
        "lang": "en",
        "license": "CC BY-ND 4.0",
    },
    {
        "name": "The Conversation Australia",
        "feed_url": "https://theconversation.com/au/articles.atom",
        "lang": "en",
        "license": "CC BY-ND 4.0",
    },
    {
        "name": "The Conversation Africa",
        "feed_url": "https://theconversation.com/africa/articles.atom",
        "lang": "en",
        "license": "CC BY-ND 4.0",
    },

    # ── English — curated open sources ──────────────────────────────────────
    {
        "name": "JSTOR Daily",
        "feed_url": "https://daily.jstor.org/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Public Domain Review",
        "feed_url": "https://publicdomainreview.org/feed/",
        "lang": "en",
        "license": "CC BY-SA 3.0",
    },
    {
        "name": "Aeon",
        "feed_url": "https://aeon.co/feed.rss",
        "lang": "en",
        "license": "CC BY-ND 4.0",
    },
    {
        "name": "NASA",
        "feed_url": "https://www.nasa.gov/feed/",
        "lang": "en",
        "license": "public domain",
    },

    # ── English — Substack public posts (attribution / standard RSS practice)
    {
        "name": "Bird History",
        "feed_url": "https://birdhistory.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Tedium",
        "feed_url": "https://readtedium.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Experimental History",
        "feed_url": "https://experimentalhistory.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Free-Range History",
        "feed_url": "https://freerangehistory.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },

    # ── French ──────────────────────────────────────────────────────────────
    {
        "name": "The Conversation France",
        "feed_url": "https://theconversation.com/fr/articles.atom",
        "lang": "fr",
        "license": "CC BY-ND 4.0",
    },

    # ── Spanish ─────────────────────────────────────────────────────────────
    {
        "name": "The Conversation España",
        "feed_url": "https://theconversation.com/es/articles.atom",
        "lang": "es",
        "license": "CC BY-ND 4.0",
    },

    # ── Portuguese ──────────────────────────────────────────────────────────
    {
        "name": "The Conversation Brazil",
        "feed_url": "https://theconversation.com/br/articles.atom",
        "lang": "pt",
        "license": "CC BY-ND 4.0",
    },
    {
        "name": "Agência Pública",
        "feed_url": "https://apublica.org/feed/",
        "lang": "pt",
        "license": "CC BY-ND 4.0",
    },

    # ── Indonesian ──────────────────────────────────────────────────────────
    {
        "name": "The Conversation Indonesia",
        "feed_url": "https://theconversation.com/id/articles.atom",
        "lang": "id",
        "license": "CC BY-ND 4.0",
    },

    # ── Japanese ────────────────────────────────────────────────────────────
    {
        "name": "NHK Easy News",
        "feed_url": "https://www3.nhk.or.jp/news/easy/feed/news-easy.xml",
        "lang": "ja",
        "license": "attribution",
        "fetch_full_text": False,  # feed includes full simplified text + furigana
        "min_words": 30,           # Japanese articles are shorter by word count
    },

    # ── German ──────────────────────────────────────────────────────────────
    {
        "name": "Spektrum der Wissenschaft",
        "feed_url": "https://www.spektrum.de/alias/rss/spektrum-de-rss-feed/996406",
        "lang": "de",
        "license": "attribution",
    },

    # ── Italian ─────────────────────────────────────────────────────────────
    {
        "name": "The Conversation Italy",
        "feed_url": "https://theconversation.com/it/articles.atom",
        "lang": "it",
        "license": "CC BY-ND 4.0",
    },

    # ── Add more sources here ────────────────────────────────────────────────
    # Any Substack with public posts works: https://[pub].substack.com/feed
    # The Conversation has editions for most major languages — check theconversation.com
]
