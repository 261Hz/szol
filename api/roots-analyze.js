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

  // Dicta nakdan returns [[word0, word1, ...], ...] (sentences → words)
  // but may also return [word0, ...] flat depending on API version.
  const first = Array.isArray(data) ? data[0] : null
  const word0 = Array.isArray(first) ? first[0] : first   // unwrap sentence wrapper if present
  // morph can be an array of analyses OR a single analysis object
  const rawMorph = word0?.morph
  const analysis = Array.isArray(rawMorph) ? rawMorph[0] : rawMorph

  const raw = analysis?.shoresh ?? analysis?.lex ?? null
  console.log(`[roots-he] "${word}" → shoresh="${analysis?.shoresh}" lex="${analysis?.lex?.slice?.(0,12)}"`)

  if (!raw || typeof raw !== 'string') return null
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
