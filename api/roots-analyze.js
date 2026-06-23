// Hebrew morphological analysis via Dicta nakdan API (proxied through Vercel).
// Dicta returns 404 without browser-like headers; spoofing their own Origin works.
// Retries up to 3× because Vercel may route to a region Dicta blocks on first try.

const DICTA_URL = 'https://nakdan.dicta.org.il/api'

function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

async function dictaFetch(text) {
  const res = await fetch(DICTA_URL, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Accept':          'application/json, text/plain, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      'Origin':          'https://nakdan.dicta.org.il',
      'Referer':         'https://nakdan.dicta.org.il/',
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ task: 'nakdan', genre: 'modern', addmorph: true, keepqq: false, nodagesh: false, text }),
  })
  return res
}

async function hebrewRootsBatch(words) {
  const text = words.join(' ')

  let res
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await dictaFetch(text)
      if (res.ok) break
      console.log('[roots-dicta] attempt', attempt, 'status', res.status)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    } catch (err) {
      console.error('[roots-dicta] attempt', attempt, 'error:', err.message, err.cause?.code ?? '')
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }

  if (!res?.ok) {
    console.error('[roots-dicta] all attempts failed')
    return {}
  }

  const data   = await res.json()
  const tokens = Array.isArray(data[0]) ? data.flat() : data
  console.log('[roots-dicta] tokens:', tokens.length, '| sample:', JSON.stringify(tokens[0]).slice(0, 200))

  const wordSet = new Set(words)
  const roots   = {}

  for (const tok of tokens) {
    const w = stripNiqqud(tok.word ?? '')
    if (!w || !wordSet.has(w)) continue

    const rawMorph = tok.morph
    const analysis = Array.isArray(rawMorph) ? rawMorph[0] : rawMorph
    const raw      = analysis?.shoresh ?? null
    if (!raw || typeof raw !== 'string') continue

    const chars = [...raw.replace(/[.\-\s]/g, '')]
    if (chars.length >= 2) roots[w] = chars
  }

  console.log('[roots-dicta] roots found:', Object.keys(roots).length, '/', tokens.length)
  return roots
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body ?? {}
  const { lang } = body

  try {
    if (Array.isArray(body.words)) {
      const roots = lang === 'he' ? await hebrewRootsBatch(body.words) : {}
      return res.status(200).json({ roots })
    }
    // Single-word backward compat (VocabView)
    const batch = lang === 'he' ? await hebrewRootsBatch([body.word ?? '']) : {}
    return res.status(200).json({ root: batch[body.word] ?? null })
  } catch (e) {
    console.error('[roots] handler error:', e.message)
    return res.status(200).json({ root: null, roots: {} })
  }
}
