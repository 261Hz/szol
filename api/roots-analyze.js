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

const DICTA_URL = 'https://nakdan.dicta.org.il/api'
const CAMEL_URL = process.env.CAMEL_API_URL  // optional self-hosted CAMeL endpoint

async function hebrewRoot(word) {
  const res = await fetch(DICTA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:       'morphanalyzer',
      genre:      'modern',
      useTokens:  true,
      tokenized:  false,
      text:       word,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  // Dicta returns an array of token arrays, each with option objects.
  // Pick the first (highest-confidence) analysis of the first token.
  const token  = data?.[0]?.[0]
  const option = token?.options?.[0] ?? token?.analyses?.[0] ?? token
  // root is returned as e.g. "כתב" — split to char array
  const root = option?.root ?? option?.shoresh ?? null
  if (!root || typeof root !== 'string') return null
  return [...root.replace(/[-\s]/g, '')]
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
