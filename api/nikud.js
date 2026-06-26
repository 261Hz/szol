export const config = { runtime: 'edge' }

// Proxy for Dicta Nakdan vocalization (CORS-blocked from browser).
// Receives { text: string } — the full story content (Hebrew).
// Returns { niqqud: { consonant_word: vocalized_word } }.
//
// Uses addmorph:true (same params as roots-analyze) because that is the
// proven response format returning json.data[].str.
//
// Dicta re-tokenizes prefix clitics: "הספר" → ["הַ","סֵּפֶר"].
// We align Dicta tokens back to the original story words by accumulating
// consecutive token consonants until they spell out the source word,
// then store the joined niqqud form ("הַסֵּפֶר") under that word key.

const DICTA_URL = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api'

// Strip all Hebrew niqqud, dagesh, and cantillation marks (U+0591–U+05C7).
function stripNiqqud(s) { return s.replace(/[֑-ׇ]/g, '') }

// Keep only base Hebrew consonants (alef–tav, U+05D0–U+05EA).
function heConsonants(s) { return stripNiqqud(s).replace(/[^א-ת]/g, '') }

const jsonRes = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  let body
  try { body = await req.json() } catch { return jsonRes({ niqqud: {} }) }

  const text = (body.text ?? '').trim()
  if (!text) return jsonRes({ niqqud: {} })
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
      return jsonRes({ niqqud: {} })
    }

    const json  = await res.json()
    const items = Array.isArray(json.data) ? json.data : []

    // Filter to items that have actual Hebrew consonants (skip spaces, punct).
    const wordItems = items.filter(i => heConsonants(i.str ?? '').length > 0)

    // Walk source words and Dicta items in parallel.
    // For each source word, consume wordItems until their consonants match,
    // then store the concatenated niqqud form.
    const storyWords = text.split(/\s+/).filter(Boolean)
    const niqqud = {}
    let ii = 0

    for (const word of storyWords) {
      const wordCons = heConsonants(word)
      if (!wordCons || niqqud[wordCons]) continue  // skip non-Hebrew or already mapped

      let accumulated = ''
      let accumNiqqud = ''
      const startIi   = ii

      while (ii < wordItems.length) {
        const itemStr  = wordItems[ii].str ?? ''
        const itemCons = heConsonants(itemStr)
        accumulated += itemCons
        accumNiqqud += itemStr
        ii++

        if (accumulated === wordCons) {
          niqqud[wordCons] = accumNiqqud
          break
        }
        if (accumulated.length >= wordCons.length) {
          ii = startIi + 1  // overshot — backtrack
          break
        }
      }
    }

    console.log('[nikud] mapped', Object.keys(niqqud).length, '/', storyWords.length, 'words')
    return jsonRes({ niqqud })
  } catch (e) {
    console.error('[nikud]', e.message)
    return jsonRes({ niqqud: {} })
  }
}
