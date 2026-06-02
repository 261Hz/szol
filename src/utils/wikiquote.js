// wikiquote.js: helpers for searching Wikiquote for quotes related to a word.
// Used by ExamplesPanel's "Wikiquote" tab to show authentic quotations alongside Tatoeba sentences.
//
// Wikiquote is a Wikimedia sister project containing quotations from notable people and works.
// Like Wikipedia, its API is CORS-enabled — no proxy needed.
// API pattern mirrors Wikipedia: opensearch finds page titles, then REST summary fetches the text.

// Maps app language codes to Wikiquote subdomain codes.
// arz = Egyptian Arabic falls back to 'ar' (no separate Egyptian Arabic Wikiquote exists).
const WIKI_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ar: 'ar', arz: 'ar',
  ja: 'ja', zh: 'zh', hu: 'hu', el: 'el',
}

// wl() = "wiki language" — converts an app language code to a Wikiquote subdomain code.
// Falls back to 'en' so unsupported languages still try the English Wikiquote.
function wl(lang) {
  return WIKI_LANG[lang] || 'en'
}

// searchWikiquote() searches Wikiquote for pages about a word and returns their opening summaries.
// These summaries often contain the most famous quotes on the topic.
//
// Two-step process (same pattern as searchWikipedia):
//   Step 1: opensearch → get page titles matching the word.
//   Step 2: REST summary → get the opening text/extract for each page.
//
// word = the word to search for (e.g. 'freedom')
// lang = the app language code (e.g. 'fr')
// Returns array of { title, extract } or [] on any error.
export async function searchWikiquote(word, lang) {
  const code = wl(lang) // e.g. 'fr' → fr.wikiquote.org

  try {
    // Step 1: OpenSearch on Wikiquote.
    // The response format is identical to Wikipedia's: [query, [titles], [descriptions], [urls]].
    // origin=* = CORS open-access header required for browser requests to MediaWiki APIs.
    const searchRes = await fetch(
      `https://${code}.wikiquote.org/w/api.php?action=opensearch&search=${encodeURIComponent(word)}&limit=2&format=json&origin=*`
    )
    if (!searchRes.ok) return []

    const searchData = await searchRes.json()
    const titles = searchData[1] ?? [] // index [1] = the array of matching page titles
    if (!titles.length) return []

    // Step 2: Fetch the REST summary for each matching page title, in parallel.
    const results = await Promise.all(
      titles.slice(0, 2).map(async title => {
        try {
          const r = await fetch(
            `https://${code}.wikiquote.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          )
          if (!r.ok) return null
          const s = await r.json()
          // Only include pages that have an extract — some Wikiquote pages are stubs or disambiguation pages.
          return s.extract ? { title: s.title, extract: s.extract } : null
        } catch {
          return null
        }
      })
    )
    return results.filter(Boolean) // remove null entries from failed fetches
  } catch {
    return []
  }
}
