#!/usr/bin/env python
"""
Ingest runner for inside the Docker container.

  docker compose exec api python /app/ingest_run.py
  docker compose exec api python /app/ingest_run.py --lang ja
  docker compose exec api python /app/ingest_run.py --dry-run
"""
import argparse
import os
import sys

# /app is the package dir; add its parent (/) so `app` is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ingest.run import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Szol content ingest")
    parser.add_argument("--lang",    help="Language code (e.g. ja, fr, es)")
    parser.add_argument("--limit",   type=int, help="Max articles per source")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing to DB")
    args = parser.parse_args()
    run(lang_filter=args.lang, limit=args.limit, dry_run=args.dry_run)
