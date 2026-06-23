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

async function hebrewRoot(word) {
  const res = await fetch(DICTA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:      'nakdan',
      genre:     'modern',
      addmorph:  true,
      keepqq:    false,
      nodagesh:  false,
      text:      word,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()

  // Dicta nakdan returns [[word0, word1, ...], [sentence2...]]
  // (outer array = sentences, inner array = word tokens)
  const sentence = Array.isArray(data) ? data[0] : null
  const word0    = Array.isArray(sentence) ? sentence[0] : sentence
  const morph0   = word0?.morph?.[0]

  // Prefer shoresh (root letters), fall back to lex (lemma)
  const raw = morph0?.shoresh ?? morph0?.lex ?? null
  if (!raw || typeof raw !== 'string') return null
  // Strip dots/dashes used as separators: "כ.ת.ב" → ["כ","ת","ב"]
  const chars = [...raw.replace(/[.\-\s]/g, '')]
  return chars.length ? chars : null
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

  const { word, lang } = req.body ?? {}
  if (!word || !lang) return res.status(400).json({ root: null })

  try {
    let root = null
    if (lang === 'he') root = await hebrewRoot(word)
    if (lang === 'ar') root = await arabicRoot(word)
    return res.status(200).json({ root })
  } catch {
    return res.status(200).json({ root: null })  // graceful degradation
  }
}
