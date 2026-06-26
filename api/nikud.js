export const config = { runtime: 'edge' }

// Proxy for Dicta Nakdan vocalization (CORS-blocked from browser).
// Receives { text: string } — the full story content (Hebrew).
// Returns { niqqud: { consonant_word: vocalized_word } }.
// Uses addmorph:false for speed; full text gives Dicta sentence context for
// better disambiguation.

const DICTA_URL = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'

// Strip all Hebrew niqqud, dagesh, and cantillation marks (U+0591–U+05C7).
function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

const jsonRes = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return jsonRes({ niqqud: {} }) }

  const text = (body.text ?? '').trim()
  if (!text) return jsonRes({ niqqud: {} })

  try {
    const res = await fetch(DICTA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'nakdan', genre: 'modern', addmorph: false,
        useTokenization: false, keepmetagim: true,
        keepqq: false, nodageshdefmem: false, patachma: false,
        data: text,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      console.error('[nikud] Dicta HTTP', res.status)
      return jsonRes({ niqqud: {} })
    }

    const json  = await res.json()
    const items = Array.isArray(json.data) ? json.data : []

    // Build consonant → vocalized map from all tokens.
    // Dicta may split prefixed words ("הספר" → "ה"+"ספר"); for such cases the
    // consonant key won't match tok.clean in the client, which is acceptable —
    // those words simply display without niqqud.
    const niqqud = {}
    for (const item of items) {
      const vocalized = item.str ?? ''
      const consonants = stripNiqqud(vocalized).trim()
      if (consonants && vocalized !== consonants && !niqqud[consonants]) {
        niqqud[consonants] = vocalized
      }
    }

    console.log('[nikud] mapped', Object.keys(niqqud).length, 'words')
    return jsonRes({ niqqud })
  } catch (e) {
    console.error('[nikud]', e.message)
    return jsonRes({ niqqud: {} })
  }
}
