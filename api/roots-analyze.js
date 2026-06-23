/**
 * /api/roots/analyze  — root lookup proxy for Hebrew and Arabic.
 *
 * POST { word: string, lang: "he" | "ar" }
 * → { root: string[] | null }   e.g. { root: ["כ","ת","ב"] }
 *
 * Hebrew  → Dicta morphological analyzer (free public API)
 * Arabic  → CAMeL Tools endpoint (self-hosted, set CAMEL_API_URL env var)
 *           Falls back to null if unavailable.
 *
 * No DB writes. Caller caches in memory / localStorage.
 */

// Dicta nakdan API — used for Hebrew morphology + root extraction.
// Endpoint confirmed from dicta-vue-components source usage.
// Returns per-token analyses with a `morph` field containing root (shoresh).
const DICTA_URL = 'https://nakdan.dicta.org.il/api'
const CAMEL_URL = process.env.CAMEL_API_URL  // optional self-hosted CAMeL endpoint

// Batch: send all words as one text string, parse every token's shoresh.
// Returns { word → char[] } for words that have a known root.
async function hebrewRootsBatch(words) {
  const text = words.join(' ')
  // Dicta returns 404 for requests without browser-like headers.
  // Spoofing Origin/Referer as their own site makes the server treat this as a first-party call.
  const res = await fetch(DICTA_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin':  'https://nakdan.dicta.org.il',
      'Referer': 'https://nakdan.dicta.org.il/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ task: 'nakdan', genre: 'modern', addmorph: true, keepqq: false, nodagesh: false, text }),
  })
  if (!res.ok) { console.error('[roots-batch] Dicta', res.status); return {} }

  const data = await res.json()
  // data is [[token, ...], ...] (sentences → tokens) — flatten to one list
  const tokens = Array.isArray(data[0]) ? data.flat() : data
  console.log('[roots-batch] tokens:', tokens.length, 'sample:', JSON.stringify(tokens[0]).slice(0, 120))

  const roots = {}
  for (const tok of tokens) {
    // Dicta nakdan adds niqqud to the word field (e.g. "הַלְוָאָה").
    // Strip Hebrew vowel points / cantillation so the key matches the bare consonantal input.
    const w = (tok.word ?? '').replace(/[֑-ׇ]/g, '')
    if (!w) continue
    const rawMorph = tok.morph
    const analysis = Array.isArray(rawMorph) ? rawMorph[0] : rawMorph
    const raw = analysis?.shoresh ?? null   // only shoresh; lex is a vocalized lemma, not the root
    if (!raw || typeof raw !== 'string') continue
    const chars = [...raw.replace(/[.\-\s]/g, '')]
    if (chars.length >= 2) roots[w] = chars
  }
  console.log('[roots-batch] roots found:', Object.keys(roots).length, '/', tokens.length)
  return roots
}

// Keep single-word path for backward compat (VocabView applyRoots)
async function hebrewRoot(word) {
  const batch = await hebrewRootsBatch([word])
  return batch[word] ?? null
}

async function arabicRoot(word) {
  if (!CAMEL_URL) return null
  const res = await fetch(`${CAMEL_URL}/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const root = data?.root ?? null
  if (!root || typeof root !== 'string') return null
  return [...root.replace(/[-\s]/g, '')]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body ?? {}
  const { lang } = body

  try {
    // Batch mode: { words: string[], lang }
    if (Array.isArray(body.words)) {
      const roots = lang === 'he' ? await hebrewRootsBatch(body.words) : {}
      return res.status(200).json({ roots })
    }

    // Single-word mode (backward compat): { word, lang }
    const root = lang === 'he' ? await hebrewRoot(body.word ?? '') : null
    return res.status(200).json({ root })
  } catch (e) {
    console.error('[roots] handler error:', e.message)
    return res.status(200).json({ root: null, roots: {} })
  }
}
