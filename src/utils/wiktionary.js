// wiktionary.js — uses the Wiktionary REST definition API
// Returns { definitions: string[], examples: string[] } or null.
// The REST endpoint returns structured JSON unlike the extracts API,
// so no per-language parsing hacks needed.

// ar/he Wiktionary REST endpoint returns 501 — omitted intentionally
const WIKT_CODE = {
  arz: 'ar', de: 'de', fr: 'fr', es: 'es',
  it: 'it', pt: 'pt', ru: 'ru', ja: 'ja', zh: 'zh', 'zh-TW': 'zh', ko: 'ko',
  nl: 'nl', pl: 'pl', sv: 'sv', el: 'el', hu: 'hu', cs: 'cs',
  tr: 'tr', en: 'en',
}

function stripHtml(s) {
  return (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

const JUNK_RE = /\bISO\s*\d|\bISO\s*639|\bISO\s*3166|language code|country code|\babbreviation\b|\binitialism\b/i

async function fetchDefinition(word, siteCode) {
  try {
    const r = await fetch(
      `https://${siteCode}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return null
    const data = await r.json()

    // Only use the site's own language section — cross-language fallback causes
    // English definitions to appear for Arabic/Hebrew words.
    const entries = data[siteCode] ?? []
    if (!entries.length) return null

    const definitions = []
    const examples    = []

    for (const entry of entries.slice(0, 3)) {
      for (const def of (entry.definitions ?? []).slice(0, 4)) {
        const clean = stripHtml(def.definition)
        if (clean.length > 4 && !JUNK_RE.test(clean)) definitions.push(clean)
        for (const ex of (def.examples ?? []).slice(0, 2)) {
          const cleanEx = stripHtml(ex)
          if (cleanEx.length > 8) examples.push(cleanEx)
        }
      }
    }

    if (!definitions.length && !examples.length) return null
    return { definitions: definitions.slice(0, 4), examples: examples.slice(0, 5) }
  } catch {
    return null
  }
}

export async function searchWiktionary(word, lang) {
  const code = WIKT_CODE[lang] ?? 'en'
  return fetchDefinition(word, code)
}
