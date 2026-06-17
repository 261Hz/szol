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
        "fetch_full_text": False,  # aeon.co returns 429 on direct page fetches
        "min_words": 60,           # RSS entries are excerpts, not full essays
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
    {
        "name": "Why Is This Interesting",
        "feed_url": "https://whyisthisinteresting.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Culture Study",
        "feed_url": "https://annehelen.substack.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Damn Interesting",
        "feed_url": "https://www.damninteresting.com/?feed=rss2",
        "lang": "en",
        "license": "CC BY-NC-SA 3.0",
    },
    {
        "name": "Atlas Obscura",
        "feed_url": "https://www.atlasobscura.com/feeds/latest",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Wait But Why",
        "feed_url": "https://waitbutwhy.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Quanta Magazine",
        "feed_url": "https://www.quantamagazine.org/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Nautilus",
        "feed_url": "https://nautil.us/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Works in Progress",
        "feed_url": "https://worksinprogress.co/rss/",
        "lang": "en",
        "license": "attribution",
    },

    # ── French ──────────────────────────────────────────────────────────────
    {
        "name": "Sciences et Avenir",
        "feed_url": "https://www.sciencesetavenir.fr/rss.xml",
        "lang": "fr",
        "license": "attribution",
    },

    # ── Spanish ─────────────────────────────────────────────────────────────
    {
        "name": "Muy Interesante",
        "feed_url": "https://www.muyinteresante.es/rss/",
        "lang": "es",
        "license": "attribution",
    },

    # ── Portuguese ──────────────────────────────────────────────────────────
    {
        "name": "Agência Pública",
        "feed_url": "https://apublica.org/feed/",
        "lang": "pt",
        "license": "CC BY-ND 4.0",
    },

    # ── Japanese ────────────────────────────────────────────────────────────
    {
        "name": "Gigazine",
        "feed_url": "https://gigazine.net/news/rss_atom/",
        "lang": "ja",
        "license": "attribution",
    },
    {
        "name": "Rocket News 24",
        "feed_url": "https://rocketnews24.com/feed/",
        "lang": "ja",
        "license": "attribution",
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
        "name": "Il Post",
        "feed_url": "https://www.ilpost.it/?feed=rss2",
        "lang": "it",
        "license": "attribution",
    },
    {
        "name": "Le Scienze",
        "feed_url": "https://www.lescienze.it/rss/",
        "lang": "it",
        "license": "attribution",
    },
    {
        "name": "Internazionale",
        "feed_url": "https://www.internazionale.it/rss/tutto",
        "lang": "it",
        "license": "attribution",
    },

    # ── Hebrew ──────────────────────────────────────────────────────────────
    {
        "name": "הארץ",
        "feed_url": "https://www.haaretz.co.il/cmlink/1.1615254",
        "lang": "he",
        "license": "attribution",
    },
    {
        "name": "ynet",
        "feed_url": "https://www.ynet.co.il/Integration/StoryRss2.xml",
        "lang": "he",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Arabic ──────────────────────────────────────────────────────────────
    {
        "name": "BBC Arabic",
        "feed_url": "https://feeds.bbci.co.uk/arabic/rss.xml",
        "lang": "ar",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "الجزيرة",
        "feed_url": "https://www.aljazeera.net/xml/rss/all.xml",
        "lang": "ar",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Chinese ─────────────────────────────────────────────────────────────
    {
        "name": "BBC 中文",
        "feed_url": "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml",
        "lang": "zh",
        "license": "attribution",
        "min_words": 40,
    },
    {
        "name": "Deutsche Welle 中文",
        "feed_url": "https://rss.dw.com/rdf/rss-chi-all",
        "lang": "zh",
        "license": "attribution",
        "min_words": 40,
    },

    # ── Russian ─────────────────────────────────────────────────────────────
    {
        "name": "BBC Русская служба",
        "feed_url": "https://feeds.bbci.co.uk/russian/rss.xml",
        "lang": "ru",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "Deutsche Welle Русский",
        "feed_url": "https://rss.dw.com/rdf/rss-rus-all",
        "lang": "ru",
        "license": "attribution",
        "min_words": 60,
    },

    # ── French ──────────────────────────────────────────────────────────────
    {
        "name": "RFI Français",
        "feed_url": "https://www.rfi.fr/fr/rss",
        "lang": "fr",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Spanish ─────────────────────────────────────────────────────────────
    {
        "name": "BBC Mundo",
        "feed_url": "https://feeds.bbci.co.uk/mundo/rss.xml",
        "lang": "es",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Greek ───────────────────────────────────────────────────────────────
    {
        "name": "Kathimerini",
        "feed_url": "https://www.kathimerini.gr/rss/",
        "lang": "el",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Hungarian ───────────────────────────────────────────────────────────
    {
        "name": "444.hu",
        "feed_url": "https://444.hu/feed",
        "lang": "hu",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "Index.hu",
        "feed_url": "https://index.hu/24ora/rss/",
        "lang": "hu",
        "license": "attribution",
        "min_words": 60,
    },
]
