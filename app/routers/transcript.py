from fastapi import APIRouter, HTTPException
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

router = APIRouter()

@router.get("/transcript")
def get_transcript(v: str):
    """
    Fetch manually created captions for a YouTube video.
    Rejects auto-generated (ASR) transcripts — they have too many errors
    for dictation practice.
    Returns events in json3-compatible format.
    """
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(v)
    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Captions are disabled for this video.")
    except VideoUnavailable:
        raise HTTPException(status_code=404, detail="Video unavailable or private.")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Try English manual transcript first, then any manual language.
    transcript_obj = None
    try:
        transcript_obj = transcript_list.find_manually_created_transcript(['en', 'en-US', 'en-GB'])
    except NoTranscriptFound:
        # No English manual — try any manually created language
        manual = [t for t in transcript_list if not t.is_generated]
        if not manual:
            raise HTTPException(
                status_code=422,
                detail="This video only has auto-generated captions, which have too many errors for dictation practice. Choose a video with manually reviewed subtitles."
            )
        transcript_obj = manual[0]

    try:
        entries = transcript_obj.fetch()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch transcript: {e}")

    events = [
        {
            "tStartMs":    int(entry["start"] * 1000),
            "dDurationMs": int(entry["duration"] * 1000),
            "segs":        [{"utf8": entry["text"]}],
        }
        for entry in entries
        if entry.get("text", "").strip()
    ]

    return {
        "events": events,
        "_track": {
            "lang": transcript_obj.language_code,
            "name": transcript_obj.language,
        },
    }
