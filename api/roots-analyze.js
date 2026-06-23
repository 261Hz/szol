// Hebrew morphological analysis via DictaBERT-Joint (HuggingFace Inference API).
// Returns per-word stem characters for prefix/root/suffix highlighting.
// Requires HF_TOKEN env var (free at huggingface.co/settings/tokens).

const HF_URL = 'https://api-inference.huggingface.co/models/dicta-il/dictabert-joint'

function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

async function hebrewRootsBatch(words) {
  const hfToken = process.env.HF_TOKEN
  if (!hfToken) { console.error('[roots-hf] HF_TOKEN not set'); return {} }

  const text = words.join(' ')
  let res
  try {
    res = await fetch(HF_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    })
  } catch (err) {
    console.error('[roots-hf] network error:', err.message,
      '| cause:', err.cause?.code ?? '', err.cause?.message ?? '')
    return {}
  }

  if (res.status === 503) {
    const body = await res.json().catch(() => ({}))
    console.log('[roots-hf] model loading, estimated', body.estimated_time, 's')
    return {}
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[roots-hf] HTTP', res.status, body.slice(0, 300))
    return {}
  }

  const data = await res.json()

  if (!Array.isArray(data)) {
    console.log('[roots-hf] unexpected shape:', JSON.stringify(data).slice(0, 300))
    return {}
  }

  // Model may return [[sentence tokens], ...] or flat [token, ...]
  const tokens = Array.isArray(data[0]) ? data.flat() : data
  console.log('[roots-hf] tokens:', tokens.length, '| sample:', JSON.stringify(tokens[0]).slice(0, 300))

  const wordSet = new Set(words)
  const roots   = {}

  for (const tok of tokens) {
    const w = stripNiqqud(tok.token ?? tok.word ?? '')
    if (!w || !wordSet.has(w)) continue

    const seg   = tok.seg   ?? []
    const morph = tok.morph ?? {}

    // Number of leading prefix segments and trailing suffix segment
    const nPre   = Array.isArray(morph.prefixes) ? morph.prefixes.length : 0
    const hasSuf = !!morph.suffix
    const nSuf   = hasSuf && seg.length > nPre ? 1 : 0

    if (seg.length >= 1) {
      const prefixLen = seg.slice(0, nPre).reduce((s, p) => s + p.length, 0)
      const suffixLen = nSuf ? seg[seg.length - 1].length : 0
      const stem      = [...w].slice(prefixLen, w.length - suffixLen || undefined)
      if (stem.length >= 1) { roots[w] = stem; continue }
    }

    // Fallback: lex (lemma) chars — client segMap will do sequential matching
    const lex = stripNiqqud(tok.lex ?? '')
    if (lex.length >= 2) roots[w] = [...lex]
  }

  console.log('[roots-hf] roots found:', Object.keys(roots).length, '/', tokens.length)
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
