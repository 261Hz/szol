export const config = { runtime: 'edge' }

// Proxy for Dicta Nakdan vocalization (CORS-blocked from browser).
// Receives { text: string } — the full story content (Hebrew).
// Returns { text: string } — the same text fully vocalized with niqqud.
//
// Dicta returns an items array where each item.str is a token (Hebrew word,
// punctuation, or whitespace). Joining all str fields gives the vocalized text
// with correct spacing because Dicta includes whitespace items between words.

const DICTA_URL = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'

const jsonRes = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return jsonRes({ text: '' }) }

  const text = (body.text ?? '').trim()
  if (!text) return jsonRes({ text: '' })
  if (text.length > 50_000) return new Response(null, { status: 413 })

  try {
    const res = await fetch(DICTA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'nakdan', genre: 'modern', addmorph: true,
        useTokenization: true, keepmetagim: true,
        keepqq: false, nodageshdefmem: false, patachma: false,
        data: text,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      console.error('[nikud] Dicta HTTP', res.status)
      return jsonRes({ text: '' })
    }

    const json   = await res.json()
    const raw    = Array.isArray(json.data) ? json.data : []
    // Dicta returns a flat array for single-sentence input but an array-of-arrays
    // (one per sentence) for multi-sentence / paragraph input. Flatten either form.
    const items  = raw.length > 0 && Array.isArray(raw[0]) ? raw.flat() : raw

    // Join all token str fields — Dicta includes whitespace items between words
    // so join('') produces correctly spaced vocalized text.
    const vocalized = items.map(i => i.str ?? '').join('')

    console.log('[nikud] vocalized', vocalized.length, 'chars from', items.length, 'items')
    return jsonRes({ text: vocalized })
  } catch (e) {
    console.error('[nikud]', e.message)
    return jsonRes({ text: '' })
  }
}
