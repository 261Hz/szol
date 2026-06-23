export const config = { runtime: 'edge' }

// Real Dicta loadbalancer URL — found via browser DevTools on nakdan.dicta.org.il
// Payload uses `data` field; response: { data: [{ str, nakdan: { options: [{lex, prefix_len}] } }] }
const DICTA_URL = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'

function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

async function hebrewRootsBatch(words) {
  let res
  try {
    res = await fetch(DICTA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'nakdan', genre: 'modern', addmorph: true,
        useTokenization: true, keepmetagim: true,
        keepqq: false, nodageshdefmem: false, patachma: false,
        data: words.join(' '),
      }),
    })
  } catch (err) {
    console.error('[roots-dicta] fetch error:', err.message)
    return {}
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[roots-dicta] HTTP', res.status, body.slice(0, 200))
    return {}
  }

  const json  = await res.json()
  const items = Array.isArray(json.data) ? json.data : []
  console.log('[roots-dicta] items:', items.length, '| sample:', JSON.stringify(items[0]).slice(0, 200))

  const wordSet = new Set(words)
  const roots   = {}
  for (const item of items) {
    const w = stripNiqqud(item.str ?? '')
    if (!w || !wordSet.has(w)) continue
    const opt = item.nakdan?.options?.[0]
    if (!opt) continue
    const lex = stripNiqqud(opt.lex ?? '')
    if (lex.length >= 2) roots[w] = [...lex]
  }

  console.log('[roots-dicta] roots found:', Object.keys(roots).length, '/', items.length)
  return roots
}

const json = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

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
