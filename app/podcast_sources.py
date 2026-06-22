"""
Podcast source registry for Szol.

Each entry is fetched by the podcast ingest job and stored in podcast_episodes.
Transcription happens on demand (user requests) via Groq Whisper.

Required keys: name, feed_url, lang
Optional keys: max_episodes (int, default 10)
"""

PODCAST_SOURCES = [
    {
        "name": "The Joe Rogan Experience",
        "feed_url": "https://feeds.megaphone.fm/GLT1412515089",
        "lang": "en",
        "max_episodes": 10,
        "transcript_source": "ogjre",  # free GraphQL API at api.ogjre.com/graphql
    },
    {
        "name": "Lex Fridman Podcast",
        "feed_url": "https://lexfridman.com/feed/podcast/",
        "lang": "en",
        "max_episodes": 10,
        "transcript_source": "lexfridman",  # transcript URLs embedded in episode descriptions
    },
    {
        "name": "コテンラジオ",
        "feed_url": "https://anchor.fm/s/8c2088c/podcast/rss",
        "lang": "ja",
        "max_episodes": 10,
    },
    {
        "name": "The Wild Project",
        "feed_url": "https://feeds.megaphone.fm/TWIP9771253765",
        "lang": "es",
        "max_episodes": 10,
    },
]
