// insert_fonissa.mjs
// Usage: node insert_fonissa.mjs <path-to-gutenberg-txt>
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
  console.error('Usage: node insert_fonissa.mjs <path-to-txt-file>');
  process.exit(1);
}

const CHAPTER_LABELS = [
  "Α'", "Β'", "Γ'", "Δ'", "Ε'", "ΣΤ'",
  "Ζ'", "Η'", "Θ'", "Ι'", "ΙΑ'", "ΙΒ'",
  "ΙΓ'", "ΙΔ'", "ΙΕ'", "ΙΖ'", "ΙΗ'",
];

function parseChapters(rawText) {
  // Normalise Windows \r\n and stray \r so all regex can use \n
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Find the start of the novel (after the Gutenberg header).
  // The title appears spaced-out; be flexible about the exact spacing/variant.
  const novelStart = text.search(/Η\s+Φ\s*Ο\s*Ν\s*[IΙ]\s*Σ\s*Σ\s*Α/);
  if (novelStart === -1) throw new Error('Could not find novel start marker.');

  const novelText = text.slice(novelStart);

  // Match headings like "Α'" or "ΣΤ'." on their own line.
  // Allow straight apostrophe, right-single-quote, tonos, or prime.
  const headingPattern = CHAPTER_LABELS
    .map(l => l.replace(/'/g, "['’΄′]"))
    .join('|');
  const re = new RegExp(`\\n(${headingPattern})\\.?[ \\t]*\\n`, 'g');

  const matches = [];
  let m;
  while ((m = re.exec(novelText)) !== null) {
    matches.push({ label: m[1], index: m.index, end: m.index + m[0].length });
  }

  if (matches.length === 0) throw new Error('No chapter headings found — check encoding or heading format.');

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
    console.log(`  ${i + 1}. ${c.label} — ${c.text.slice(0, 60).replace(/\n/g, ' ')}…`)
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  for (let i = 0; i < chapters.length; i++) {
    const { label, text } = chapters[i];
    const row = {
      title:          `Η Φόνισσα — ${label}`,
      text,
      lang:           'el',
      author:         'Αλέξανδρος Παπαδιαμάντης',
      source:         'Project Gutenberg #36205',
      sequence_order: i + 1,
    };

    const { error } = await supabase.from('curated_stories').insert(row);
    if (error) {
      console.error(`✗ Chapter ${label}:`, error.message);
    } else {
      console.log(`✓ Inserted chapter ${label} (seq ${i + 1})`);
    }
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
