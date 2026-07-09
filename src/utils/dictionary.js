// dictionary.js -- native-language dictionary adapters for languages where the
// per-edition Wiktionary REST endpoint doesn't work (see wiktionary.js).
// Used by wiktionary.js's searchWiktionary() as a first attempt before falling
// back to the (English-only) Wiktionary REST API.

// clean() removes HTML tags and extra spaces from a string.
// Some dictionary APIs return text wrapped in HTML like <b>word</b> -- this strips that out.
function clean(str) {
  let out = str
  let prev
  do { prev = out; out = out.replace(/<[^<>]*>/g, '') } while (out !== prev)
  return out.replace(/\s+/g, ' ').trim()
}

// fromMoedict() looks up a Traditional Chinese word in Moedict (Taiwan Ministry
// of Education dictionary). Uses the /a/{word}.json endpoint -- the older
// /api/{word} endpoint has rotted and now returns a bare Cloudflare stub.
// Moedict's `f` (definition) and `e` (example) fields use `word~` markup to
// mark cross-linkable terms; stripping the backticks/tildes leaves clean text.
async function fromMoedict(word) {
  const r = await fetch(`https://www.moedict.tw/a/${encodeURIComponent(word)}.json`)
  if (!r.ok) return null
  const d = await r.json()

  const senses = d.h?.[0]?.d ?? []
  if (!senses.length) return null

  const definitions = senses.map(s => s.f?.replace(/[`~]/g, '').trim()).filter(Boolean)
  const examples     = senses.flatMap(s => s.e ?? []).map(e => e.replace(/[`~]/g, '').trim()).filter(Boolean)
  if (!definitions.length) return null

  return {
    pos:         senses[0]?.type?.replace(/[`~]/g, '') || '',
    definitions: definitions.slice(0, 4),
    examples:    examples.slice(0, 5),
    source:      'moedict',
  }
}

// fromRAE() looks up a Spanish word in RAE (Real Academia Española -- Spain's
// official dictionary authority). This is an unofficial community wrapper
// (rae-api.com), not the official RAE website -- but it's live and returns
// genuine Spanish-language definitions.
async function fromRAE(word) {
  const r = await fetch(`https://rae-api.com/api/words/${encodeURIComponent(word)}`)
  if (!r.ok) return null
  const d = await r.json()
  if (!d.ok || !d.data?.meanings?.length) return null

  const definitions = []
  const examples     = []
  for (const meaning of d.data.meanings) {
    for (const sense of (meaning.senses ?? [])) {
      if (sense.description) definitions.push(clean(sense.description))
      for (const ex of (sense.examples ?? [])) examples.push(clean(ex))
    }
  }
  if (!definitions.length) return null

  return {
    pos:         d.data.meanings[0]?.senses?.[0]?.category ?? '',
    definitions: definitions.slice(0, 4),
    examples:    examples.slice(0, 5),
    source:      'rae',
  }
}

// lookupAdapter() tries a native-language dictionary for languages where one
// exists. Returns { pos, definitions: string[], examples: string[] } or null
// if this language has no adapter (caller should fall back to Wiktionary).
export async function lookupAdapter(word, lang) {
  try {
    if (lang === 'zh-TW') return await fromMoedict(word)
    if (lang === 'es')    return await fromRAE(word)
    return null
  } catch {
    return null
  }
}
