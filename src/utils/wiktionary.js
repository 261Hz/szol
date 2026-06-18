// wiktionary.js: fetch definitions and example sentences from Wiktionary.
// Uses the target-language Wiktionary (de.wiktionary.org for German, etc.)
// which contains native-language definitions and authentic usage examples.

const WIKT_LANG = {
  en: 'en', de: 'de', fr: 'fr', es: 'es', it: 'it',
  pt: 'pt', ru: 'ru', ja: 'ja', zh: 'zh', ar: 'ar',
  ko: 'ko', nl: 'nl', pl: 'pl', sv: 'sv', he: 'he',
  el: 'el', hu: 'hu', cs: 'cs', tr: 'tr',
}

// Section header keywords that mark "definitions" and "examples" sections
// across the major Wiktionary languages.
const DEF_MARKERS     = /bedeutung|meaning|sens\b|acep|значен|定義|의미/i
const EXAMPLE_MARKERS = /beispiel|example|exemple|ejemplo|пример|例文|例句|用例|예/i

export async function searchWiktionary(word, lang) {
  const code = WIKT_LANG[lang] ?? 'en'
  try {
    const r = await fetch(
      `https://${code}.wiktionary.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent(word)}` +
      `&prop=extracts&explaintext=1&exchars=8000` +
      `&format=json&origin=*`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return null
    const data  = await r.json()
    const pages = data.query?.pages ?? {}
    const page  = Object.values(pages)[0]
    if (!page || 'missing' in page) return null
    const raw = page.extract?.trim()
    if (!raw) return null

    return parseWiktEntry(raw, word)
  } catch {
    return null
  }
}

function parseWiktEntry(text, word) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const definitions = []
  const examples    = []
  let   section     = ''   // 'defs' | 'examples' | ''

  for (const line of lines) {
    if (/^=/.test(line)) {
      const heading = line.replace(/^=+|=+$/g, '').trim()
      if (EXAMPLE_MARKERS.test(heading))    section = 'examples'
      else if (DEF_MARKERS.test(heading))   section = 'defs'
      else if (/^={1,2}[^=]/.test(line))   section = ''   // top-level section → reset
      continue
    }

    // Items prefixed with [1], [2] … are numbered definitions/examples in most Wiktionary editions
    if (section === 'defs' && /^\[\d+\]/.test(line)) {
      const def = line.replace(/^\[\d+\]\s*/, '').trim()
      if (def.length > 8) definitions.push(def)
    }

    if (section === 'examples' && /^\[\d+\]/.test(line)) {
      const ex = line.replace(/^\[\d+\]\s*/, '').trim()
      if (ex.length > 20 && ex.length < 500) examples.push(ex)
    }
  }

  // Fallback: if the parser found nothing, look for any line containing the word stem
  if (!definitions.length && !examples.length) return null

  // If we have definitions but no examples (common for some editions), try extracting
  // sentence-like lines from anywhere in the text that contain the word
  if (!examples.length) {
    const stem = word.toLowerCase().slice(0, Math.max(4, word.length - 2))
    for (const line of lines) {
      if (
        !line.startsWith('=') &&
        line.toLowerCase().includes(stem) &&
        line.length > 30 && line.length < 400 &&
        /[.!?»"'"]$/.test(line) &&
        !/^(Synonyme|Antonym|Ober|Unter|Verwandt|Quell|Refer|Lit)/i.test(line)
      ) {
        examples.push(line)
        if (examples.length >= 4) break
      }
    }
  }

  return {
    definitions: definitions.slice(0, 4),
    examples:    examples.slice(0, 5),
  }
}
