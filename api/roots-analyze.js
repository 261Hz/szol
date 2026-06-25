export const config = { runtime: 'edge' }

// Hebrew: Dicta Nakdan (direct, CORS-blocked from browser) → HebSpacy on Render for misses.
// Arabic: CAMeL Tools on Render backend (no usable public CORS-friendly Arabic API).

const DICTA_URL  = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'
const RENDER_URL = 'https://szol.onrender.com'

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
    if (!w) continue
    const opt = item.nakdan?.options?.[0]
    if (!opt) continue
    const lex = stripNiqqud(opt.lex ?? '')
    if (lex.length < 2) continue

    if (wordSet.has(w)) {
      roots[w] = [...lex]
    } else {
      // Dicta re-tokenizes prefixes: "הכובש" → ["ה","כובש"]. Match by suffix.
      for (const inputWord of words) {
        if (inputWord.endsWith(w) && inputWord.length > w.length) {
          roots[inputWord] = [...lex]
          break
        }
      }
    }
  }

  console.log('[roots-dicta] roots found:', Object.keys(roots).length, '/', items.length)
  return roots
}

async function renderRootsBatch(words, lang) {
  try {
    const res = await fetch(`${RENDER_URL}/roots/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ words, lang }),
      signal:  AbortSignal.timeout(8000),
    })
    const data = res.ok ? await res.json() : {}
    return data.roots ?? {}
  } catch (e) {
    console.error(`[roots-render/${lang}]`, e.message)
    return {}
  }
}

const json = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return json({ root: null, roots: {} }) }

  const { lang } = body

  try {
    const words = Array.isArray(body.words) ? body.words : [body.word ?? '']
    const single = !Array.isArray(body.words)

    let roots = {}

    if (lang === 'he') {
      roots = await hebrewRootsBatch(words)
      const missed = words.filter(w => !roots[w])
      if (missed.length) {
        const fallback = await renderRootsBatch(missed, 'he')
        Object.assign(roots, fallback)
      }
    } else if (lang === 'ar') {
      roots = await renderRootsBatch(words, 'ar')
    }

    if (single) return json({ root: roots[body.word] ?? null })
    return json({ roots })
  } catch (e) {
    console.error('[roots] error:', e.message)
    return json({ root: null, roots: {} })
  }
}
