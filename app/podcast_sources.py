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
    },
]
