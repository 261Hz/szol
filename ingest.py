#!/usr/bin/env python
"""
Szol content ingest — run from the project root.

  Local (venv):  python ingest.py
  Docker:        docker compose exec api python /ingest.py
  Dry run:       python ingest.py --dry-run
  One language:  python ingest.py --lang ja
  Throttled:     python ingest.py --limit 5
"""
import argparse
import os
import sys

# Ensure the project root is on the path so `app` is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.ingest.run import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Szol content ingest")
    parser.add_argument("--lang",    help="Only ingest this language code (e.g. ja, fr, es)")
    parser.add_argument("--limit",   type=int, help="Max articles per source")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing to DB")
    args = parser.parse_args()
    run(lang_filter=args.lang, limit=args.limit, dry_run=args.dry_run)
