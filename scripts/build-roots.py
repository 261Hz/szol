#!/usr/bin/env python3
"""
Extract Hebrew and Arabic root dictionaries from Wiktionary dumps.

Usage:
    python scripts/build-roots.py

Downloads the Hebrew and Arabic Wiktionary XML dumps (~20-50 MB each,
bzip2-compressed), parses root template entries, and writes:

    public/he-roots.json   { "word": ["root", "chars"] }
    public/ar-roots.json   { "word": ["root", "chars"] }

Run once locally, commit the JSON files. No DB, no runtime API calls.
The frontend loads them lazily on first Roots activation.
"""

import re
import json
import bz2
import sys
import urllib.request
from pathlib import Path
from xml.etree.ElementTree import iterparse

# ── Sources ───────────────────────────────────────────────────────────────────

DUMPS = {
    'he': 'https://dumps.wikimedia.org/hewiktionary/latest/hewiktionary-latest-pages-articles.xml.bz2',
    'ar': 'https://dumps.wikimedia.org/arwiktionary/latest/arwiktionary-latest-pages-articles.xml.bz2',
}

# Template patterns that encode root consonants
# Hebrew: {{שורש|כ|ת|ב}}  or  {{שורש|כ.ת.ב}}
# Arabic: {{جذر|ك.ت.ب}}  or  {{جذر|ك|ت|ب}}
ROOT_RE = {
    'he': re.compile(r'\{\{שורש\|([^}]+)\}\}', re.UNICODE),
    'ar': re.compile(r'\{\{(?:جذر|جذر اشتقاق)\|([^}]+)\}\}', re.UNICODE),
}

# Hebrew niqqud + cantillation marks to strip from page titles
NIQQUD_RE = re.compile(r'[֑-ׇ]')


def parse_root_chars(raw: str) -> list[str] | None:
    """
    Parse '|'-separated or '.'-separated Wiktionary root template args
    into a list of single consonant characters.
    e.g. 'כ|ת|ב' → ['כ','ת','ב']
         'ك.ت.ب' → ['ك','ت','ب']
    """
    chars = [c.strip() for c in re.split(r'[|.\s]+', raw) if c.strip()]
    # Keep only entries that are a single letter (some templates have extra params)
    chars = [c for c in chars if len(c) == 1]
    return chars if 2 <= len(chars) <= 5 else None


def download(url: str, dest: Path) -> None:
    print(f'  Downloading {url.split("/")[-1]} …', end=' ', flush=True)

    def progress(n, size, total):
        if total > 0:
            pct = min(100, int(n * size * 100 / total))
            print(f'\r  Downloading … {pct}%', end='', flush=True)

    urllib.request.urlretrieve(url, dest, reporthook=progress)
    print(f'\r  Downloaded → {dest} ({dest.stat().st_size // 1024} KB)  ')


def extract_roots(dump_path: Path, lang: str) -> dict[str, list[str]]:
    root_re = ROOT_RE[lang]
    roots: dict[str, list[str]] = {}
    ns = ''  # xml namespace prefix

    print(f'  Parsing {dump_path.name} …', flush=True)
    title_buf = None
    text_buf  = None
    count = 0

    with bz2.open(dump_path, 'rb') as f:
        for event, elem in iterparse(f, events=['start', 'end']):
            tag = elem.tag
            if tag.endswith('}title') and event == 'end':
                t = elem.text or ''
                # Skip non-article pages (talk, user, template, etc.)
                title_buf = None if ':' in t else NIQQUD_RE.sub('', t).strip()
            elif tag.endswith('}text') and event == 'end':
                text_buf = elem.text or ''
            elif tag.endswith('}page') and event == 'end':
                if title_buf and text_buf:
                    m = root_re.search(text_buf)
                    if m:
                        chars = parse_root_chars(m.group(1))
                        if chars:
                            roots[title_buf] = chars
                            count += 1
                            if count % 1000 == 0:
                                print(f'    … {count} roots found', flush=True)
                title_buf = text_buf = None
                elem.clear()

    return roots


def main() -> None:
    out_dir = Path(__file__).parent.parent / 'public'
    cache_dir = Path(__file__).parent / '_dumps'
    cache_dir.mkdir(exist_ok=True)

    for lang, url in DUMPS.items():
        print(f'\n── {lang.upper()} ──────────────────────────────────────────')
        fname = url.split('/')[-1]
        dump_path = cache_dir / fname

        if not dump_path.exists():
            download(url, dump_path)
        else:
            print(f'  Using cached {fname}')

        roots = extract_roots(dump_path, lang)
        out_path = out_dir / f'{lang}-roots.json'

        # Sort by word for deterministic diffs
        out_path.write_text(
            json.dumps(dict(sorted(roots.items())), ensure_ascii=False, separators=(',', ':')),
            encoding='utf-8',
        )
        size_kb = out_path.stat().st_size // 1024
        print(f'  → {out_path.name}  ({len(roots)} entries, {size_kb} KB)')


if __name__ == '__main__':
    main()
