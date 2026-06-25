export const config = { runtime: 'edge' }

// Hebrew: Dicta Nakdan (CORS-blocked from browser, proxied here) → DictaBERT-lex on
//         Hugging Face for words Dicta misses.
// Arabic: local ar-roots.json dict only (handled in the browser; no usable keyless
//         REST endpoint returns actual Arabic triliteral roots).

const DICTA_URL    = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'
const HF_DICTABERT = 'https://api-inference.huggingface.co/models/dicta-il/dictabert-lex'

function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

function hfHeaders() {
  const tok = process.env.HF_TOKEN
  return tok
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }
    : { 'Content-Type': 'application/json' }
}

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

  console.log('[roots-dicta] roots found:', Object.keys(roots).length, '/', words.length)
  return roots
}

// DictaBERT-lex: token classification model — entity label IS the Hebrew lemma.
// Batch mode: one request for all missed words, returns [[preds], [preds], ...].
async function dictaBertHebrewBatch(words) {
  if (!words.length) return {}
  try {
    const res = await fetch(HF_DICTABERT, {
      method:  'POST',
      headers: hfHeaders(),
      body:    JSON.stringify({ inputs: words }),
      signal:  AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error('[roots-hf-he] HTTP', res.status)
      return {}
    }
    const data = await res.json()
    // data: [ [predsForWord0], [predsForWord1], ... ]
    // Each inner array is token-level predictions; entity = Hebrew lemma string.
    const results = {}
    for (let i = 0; i < words.length; i++) {
      const preds = Array.isArray(data[i]) ? data[i] : []
      if (!preds.length) continue
      const best = [...preds].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
      if (!best?.entity) continue
      const lemma = stripNiqqud(best.entity)
      const chars = [...lemma].filter(c => 'א' <= c && c <= 'ת')
      if (chars.length >= 2) results[words[i]] = chars
    }
    console.log('[roots-hf-he] found:', Object.keys(results).length, '/', words.length)
    return results
  } catch (e) {
    console.error('[roots-hf-he]', e.message)
    return {}
  }
}

const jsonRes = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return jsonRes({ root: null, roots: {} }) }

  const { lang } = body

  try {
    const words  = Array.isArray(body.words) ? body.words : [body.word ?? '']
    const single = !Array.isArray(body.words)

    let roots = {}

    if (lang === 'he') {
      roots = await hebrewRootsBatch(words)
      const missed = words.filter(w => !roots[w])
      if (missed.length) {
        const hfRoots = await dictaBertHebrewBatch(missed)
        Object.assign(roots, hfRoots)
      }
    }
    // Arabic: local dict in the browser handles it; no server-side lookup needed.

    if (single) return jsonRes({ root: roots[body.word] ?? null })
    return jsonRes({ roots })
  } catch (e) {
    console.error('[roots] error:', e.message)
    return jsonRes({ root: null, roots: {} })
  }
}
