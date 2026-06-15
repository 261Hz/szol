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
  const code = wl(lang)

  try {
    // Step 1: find matching page titles via opensearch.
    const searchRes = await fetch(
      `https://${code}.wikiquote.org/w/api.php?action=opensearch&search=${encodeURIComponent(word)}&limit=2&format=json&origin=*`
    )
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const titles = searchData[1] ?? []
    if (!titles.length) return []

    // Step 2: fetch plain-text extracts using the action API (not REST summary, which
    // returns page descriptions rather than actual quotes).
    const results = await Promise.all(
      titles.slice(0, 2).map(async title => {
        try {
          const r = await fetch(
            `https://${code}.wikiquote.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exchars=3000&format=json&origin=*`
          )
          if (!r.ok) return null
          const data  = await r.json()
          const pages = data.query?.pages
          const raw   = pages?.[Object.keys(pages)[0]]?.extract?.trim()
          if (!raw) return null

          // Parse actual quote lines: long enough to be a sentence, not a section header.
          const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
          const quotes = lines.filter(l =>
            l.length >= 30 &&
            l.length <= 300 &&
            !l.startsWith('==') &&
            !l.startsWith('*') === false || l.startsWith('*')
          )
          // Prefer lines starting with * (wiki quote bullets), fall back to any sentence-like line.
          const bulleted  = lines.filter(l => l.startsWith('*') && l.length >= 30 && l.length <= 300)
          const sentenced = lines.filter(l => !l.startsWith('==') && l.length >= 40 && l.length <= 300)
          const picks = (bulleted.length ? bulleted : sentenced).slice(0, 3)
          if (!picks.length) return null

          // Strip leading bullet/asterisk markup.
          const extract = picks.map(l => l.replace(/^\*+\s*/, '').trim()).join('\n')
          return { title, extract }
        } catch {
          return null
        }
      })
    )
    return results.filter(Boolean)
  } catch {
    return []
  }
}
