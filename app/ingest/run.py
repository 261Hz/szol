"""
Szol content ingest pipeline — CLI entry point.

Usage (run from project root):
    python -m app.ingest.run
    python -m app.ingest.run --lang ja
    python -m app.ingest.run --lang en --limit 5
    python -m app.ingest.run --dry-run

Schedule this daily (cron, Render cron job, etc.) to keep the feed fresh.
"""

import argparse
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("ingest.run")


def run(
    lang_filter: str | None = None,
    limit: int | None = None,
    dry_run: bool = False,
) -> int:
    from sqlalchemy.orm import Session
    from ..database import SessionLocal, engine
    from .. import models
    from ..models import FeedStory
    from .fetch import fetch_source
    from .sources import SOURCES

    models.Base.metadata.create_all(bind=engine)

    db.query(models.FeedStory).delete()
    db.commit()
    logger.info("Cleared previous feed articles")

    sources = SOURCES
    if lang_filter:
        sources = [s for s in sources if s["lang"] == lang_filter]
        if not sources:
            logger.error("No sources found for lang=%s", lang_filter)
            return 0

    db: Session = SessionLocal()
    total = 0

    try:
        for source in sources:
            logger.info("→ %s  [%s]", source["name"], source["lang"])
            articles = fetch_source(source)
            if limit:
                articles = articles[:limit]

            inserted = 0
            for art in articles:
                if dry_run:
                    logger.info("  [dry] %s — %.60s", art["source_name"], art["title"])
                    inserted += 1
                    continue

                db.add(FeedStory(**art))
                inserted += 1

            if not dry_run and inserted:
                db.commit()

            if inserted:
                logger.info("  %d new article(s)", inserted)
            else:
                logger.info("  nothing new")
            total += inserted

    except Exception:
        db.rollback()
        logger.exception("Ingest aborted")
        raise
    finally:
        db.close()

    logger.info("Done — %d article(s) total", total)

    # Podcast episode ingest (metadata only — transcription is on demand)
    if not lang_filter:
        try:
            from .podcasts import ingest_podcasts
            pod_total = ingest_podcasts(db, dry_run=dry_run)
            logger.info("Podcast episodes: %d new", pod_total)
        except Exception:
            logger.exception("Podcast ingest failed")

    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Szol content ingest")
    parser.add_argument("--lang",    help="Only ingest this language code (e.g. ja, fr)")
    parser.add_argument("--limit",   type=int, help="Max articles per source")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    args = parser.parse_args()
    run(lang_filter=args.lang, limit=args.limit, dry_run=args.dry_run)
