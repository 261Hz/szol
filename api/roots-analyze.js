export const config = { runtime: 'edge' }

const DICTA_URL = 'https://nakdan.dicta.org.il/api'

function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

async function hebrewRootsBatch(words) {
  const text = words.join(' ')
  let res

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(DICTA_URL, {
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
      if (res.ok) break
      console.log('[roots-dicta] attempt', attempt, 'status', res.status)
    } catch (err) {
      console.log('[roots-dicta] attempt', attempt, 'error:', err.message)
    }
  }

  if (!res?.ok) { console.error('[roots-dicta] all attempts failed'); return {} }

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

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return json({ root: null, roots: {} }) }

  const { lang } = body

  try {
    if (Array.isArray(body.words)) {
      const roots = lang === 'he' ? await hebrewRootsBatch(body.words) : {}
      return json({ roots })
    }
    const batch = lang === 'he' ? await hebrewRootsBatch([body.word ?? '']) : {}
    return json({ root: batch[body.word] ?? null })
  } catch (e) {
    console.error('[roots] error:', e.message)
    return json({ root: null, roots: {} })
  }
}
