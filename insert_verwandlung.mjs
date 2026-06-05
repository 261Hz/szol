// insert_verwandlung.mjs
// Usage: node insert_verwandlung.mjs <path-to-gutenberg-txt>
//
// Set env vars before running:
//   $env:SUPABASE_URL="https://your-project.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="your-service-role-key"

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node insert_verwandlung.mjs <path-to-txt-file>');
  process.exit(1);
}

const CHAPTER_LABELS = ['I', 'II', 'III'];

function parseChapters(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Find the start of the story — look for the first chapter heading "I."
  // Allow optional whitespace/blank lines before it.
  const novelStart = text.search(/\n[ \t]*I\.[ \t]*\n/);
  if (novelStart === -1) throw new Error('Could not find chapter I. marker.');

  const novelText = text.slice(novelStart);

  // Match "I.", "II.", "III." on their own line (with optional surrounding whitespace).
  const re = /\n[ \t]*(I{1,3}(?:V|X)?)\.[ \t]*\n/g;

  const matches = [];
  let m;
  while ((m = re.exec(novelText)) !== null) {
    // Only keep the three roman numerals we expect
    if (CHAPTER_LABELS.includes(m[1])) {
      matches.push({ label: m[1], index: m.index, end: m.index + m[0].length });
    }
  }

  if (matches.length === 0) throw new Error('No chapter headings found — check file encoding or format.');
  if (matches.length !== 3) console.warn(`Warning: expected 3 chapters, found ${matches.length}.`);

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end   = i + 1 < matches.length ? matches[i + 1].index : novelText.length;
    const body  = novelText.slice(start, end).trim();
    chapters.push({ label: matches[i].label, text: body });
  }

  return chapters;
}

async function main() {
  const raw = readFileSync(filePath, 'utf-8');
  const chapters = parseChapters(raw);

  console.log(`Parsed ${chapters.length} chapters.`);
  chapters.forEach((c, i) =>
    console.log(`  ${i + 1}. Kapitel ${c.label} — ${c.text.slice(0, 60).replace(/\n/g, ' ')}…`)
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  for (let i = 0; i < chapters.length; i++) {
    const { label, text } = chapters[i];
    const row = {
      title:          `Die Verwandlung — Kapitel ${label}`,
      content:        text,
      lang:           'de',
      author:         'Franz Kafka',
      source:         'Project Gutenberg',
      sequence_order: i + 1,
    };

    const { error } = await supabase.from('curated_stories').insert(row);
    if (error) {
      console.error(`✗ Kapitel ${label}:`, error.message);
    } else {
      console.log(`✓ Inserted Kapitel ${label} (seq ${i + 1})`);
    }
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
