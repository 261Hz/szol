#!/usr/bin/env python3
"""
Build Arabic root dictionary using CAMeL Tools morphological analyzer.

CAMeL models the full Arabic inflection system and maps any surface form
directly to its triconsonantal root — far better than Wiktionary headwords.

Setup (one-time):
    pip install camel-tools
    camel_data -i morphology-db-msa-s31

Usage:
    python scripts/build-arabic-roots-camel.py

Reads:   scripts/_ar_wordlist.txt  (one word per line, or auto-generates from Wikipedia)
Writes:  public/ar-roots.json      { "word": ["root", "chars"] }

The output replaces the Wiktionary-derived ar-roots.json.
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

OUT_PATH      = Path(__file__).parent.parent / 'public' / 'ar-roots.json'
WORDLIST_PATH = Path(__file__).parent / '_ar_wordlist.txt'

# ── CAMeL Tools ────────────────────────────────────────────────────────────────

def load_analyzer():
    try:
        from camel_tools.morphology.analyzer import MorphologicalAnalyzer
        print('  Loading CAMeL morphological analyzer …')
        analyzer = MorphologicalAnalyzer.builtin_analyzer()
        print('  Analyzer ready.')
        return analyzer
    except ImportError:
        print('ERROR: camel-tools not installed.')
        print('  Run: pip install camel-tools')
        print('  Then: camel_data -i morphology-db-msa-s31')
        sys.exit(1)
    except Exception as e:
        print(f'ERROR loading analyzer: {e}')
        print('  Ensure you ran: camel_data -i morphology-db-msa-s31')
        sys.exit(1)


def get_root(analyzer, word: str) -> list[str] | None:
    """Return the most likely root consonants for an Arabic word, or None."""
    try:
        analyses = analyzer.analyze(word)
        if not analyses:
            return None
        # Prefer the first high-confidence analysis that has a root
        for a in analyses:
            root = a.get('root', '')
            # CAMeL roots are dot-separated: "ك.ت.ب"
            if root and root != 'NOAN':
                chars = [c for c in root.split('.') if c]
                if 2 <= len(chars) <= 5:
                    return chars
        return None
    except Exception:
        return None


# ── Word list ──────────────────────────────────────────────────────────────────

def build_wordlist_from_wiktionary() -> list[str]:
    """Extract unique Arabic words from the cached Wiktionary dump as seed list."""
    import bz2
    from xml.etree.ElementTree import iterparse

    dump_path = Path(__file__).parent / '_dumps' / 'arwiktionary-latest-pages-articles.xml.bz2'
    if not dump_path.exists():
        print('  Arabic Wiktionary dump not found — run build-roots.py first to download it.')
        return []

    print(f'  Reading word list from {dump_path.name} …')
    AR_RE    = re.compile(r'[؀-ۿ]{2,}')
    NIQQUD   = re.compile(r'[ً-ٰٟ]')
    words    = set()
    title_buf = None

    with bz2.open(dump_path, 'rb') as f:
        for event, elem in iterparse(f, events=['end']):
            if elem.tag.endswith('}title') and event == 'end':
                t = NIQQUD.sub('', elem.text or '').strip()
                title_buf = t if ':' not in t else None
            elif elem.tag.endswith('}text') and event == 'end':
                if title_buf and AR_RE.match(title_buf):
                    words.add(title_buf)
                    # Also collect Arabic words from the article body
                    for w in AR_RE.findall(elem.text or ''):
                        words.add(NIQQUD.sub('', w))
                title_buf = None
                elem.clear()

    return sorted(words)


def load_wordlist() -> list[str]:
    if WORDLIST_PATH.exists():
        print(f'  Using word list: {WORDLIST_PATH}')
        words = [w.strip() for w in WORDLIST_PATH.read_text('utf-8').splitlines() if w.strip()]
        return words

    print('  No word list found — extracting from Wiktionary dump …')
    words = build_wordlist_from_wiktionary()
    if words:
        WORDLIST_PATH.write_text('\n'.join(words), encoding='utf-8')
        print(f'  Saved word list ({len(words)} words) → {WORDLIST_PATH}')
    return words


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    analyzer = load_analyzer()
    words    = load_wordlist()

    if not words:
        print('ERROR: No words to process.')
        sys.exit(1)

    print(f'\n  Analyzing {len(words)} words …')
    roots  = {}
    found  = 0
    batch  = 500

    for i, word in enumerate(words):
        chars = get_root(analyzer, word)
        if chars:
            roots[word] = chars
            found += 1
        if (i + 1) % batch == 0:
            print(f'    … {i+1}/{len(words)} ({found} roots found)', flush=True)

    # Sort for deterministic diffs
    out = dict(sorted(roots.items()))
    OUT_PATH.write_text(
        json.dumps(out, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8',
    )
    size_kb = OUT_PATH.stat().st_size // 1024
    print(f'\n  → {OUT_PATH.name}  ({len(out)} entries, {size_kb} KB)')
    print(f'  Coverage: {found}/{len(words)} ({100*found//len(words)}%)')


if __name__ == '__main__':
    main()
