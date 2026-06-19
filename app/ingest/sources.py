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

    # ── English — The Guardian ───────────────────────────────────────────────
    {
        "name": "The Guardian",
        "feed_url": "https://www.theguardian.com/world/rss",
        "lang": "en",
        "license": "attribution",
        "min_words": 80,
    },
    {
        "name": "The Guardian Science",
        "feed_url": "https://www.theguardian.com/science/rss",
        "lang": "en",
        "license": "attribution",
        "min_words": 80,
    },
    {
        "name": "The Guardian Technology",
        "feed_url": "https://www.theguardian.com/technology/rss",
        "lang": "en",
        "license": "attribution",
        "min_words": 80,
    },

    # ── English — longform / tech / history / culture ──────────────────────
    {
        "name": "Simon Willison",
        "feed_url": "https://simonwillison.net/atom/everything/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "A Collection of Unmitigated Pedantry",
        "feed_url": "https://acoup.blog/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "The Marginalian",
        "feed_url": "https://www.themarginalian.org/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Longreads",
        "feed_url": "https://longreads.com/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Joel on Software",
        "feed_url": "https://www.joelonsoftware.com/feed/",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "3 Quarks Daily",
        "feed_url": "https://3quarksdaily.com/feed",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Defector",
        "feed_url": "https://defector.com/rss",
        "lang": "en",
        "license": "attribution",
    },
    {
        "name": "Aftermath",
        "feed_url": "https://aftermath.site/rss",
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
    {
        "name": "Le Grand Continent",
        "feed_url": "https://legrandcontinent.eu/feed/",
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
    {
        "name": "Jot Down",
        "feed_url": "https://www.jotdown.es/feed/",
        "lang": "es",
        "license": "attribution",
    },
    {
        "name": "Naukas",
        "feed_url": "https://naukas.com/feed/",
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
    {
        "name": "Netzpolitik",
        "feed_url": "https://netzpolitik.org/feed/",
        "lang": "de",
        "license": "CC BY-NC-SA 4.0",
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
        "name": "الجزيرة",
        "feed_url": "https://www.aljazeera.net/xml/rss/all.xml",
        "lang": "ar",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Chinese ─────────────────────────────────────────────────────────────
    {
        "name": "Deutsche Welle 中文",
        "feed_url": "https://rss.dw.com/rdf/rss-chi-all",
        "lang": "zh",
        "license": "attribution",
        "min_words": 40,
    },

    # ── Russian ─────────────────────────────────────────────────────────────
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


    # ── Greek ───────────────────────────────────────────────────────────────
    {
        "name": "Kathimerini",
        "feed_url": "https://www.kathimerini.gr/rss/",
        "lang": "el",
        "license": "attribution",
        "min_words": 60,
    },

    # ── Indonesian ──────────────────────────────────────────────────────────
    {
        "name": "BBC Indonesia",
        "feed_url": "https://feeds.bbci.co.uk/indonesia/rss.xml",
        "lang": "id",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "Antara News",
        "feed_url": "https://www.antaranews.com/rss/terkini.xml",
        "lang": "id",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "DW Indonesia",
        "feed_url": "https://rss.dw.com/rdf/rss-id-all",
        "lang": "id",
        "license": "attribution",
        "min_words": 60,
    },
    {
        "name": "Tempo.co",
        "feed_url": "https://rss.tempo.co/",
        "lang": "id",
        "license": "attribution",
        "min_words": 80,
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
