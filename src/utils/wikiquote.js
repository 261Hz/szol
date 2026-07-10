// wikiquote.js: helpers for searching Wikiquote for quotes related to a word.
// Used by ExamplesPanel's "Wikiquote" tab to show authentic quotations alongside Tatoeba sentences.

const WIKI_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ar: 'ar', arz: 'ar', pt: 'pt',
  ja: 'ja', zh: 'zh', 'zh-TW': 'zh', hu: 'hu', el: 'el',
}

function wl(lang) {
  return WIKI_LANG[lang] || 'en'
}

// searchWikiquote() searches Wikiquote for pages about a word and returns actual quote lines.
// word = vocabulary word (e.g. 'freedom', 'liberté')
// lang = app language code
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

    // Step 2: fetch plain-text extracts and extract actual quote lines.
    const results = await Promise.all(
      titles.slice(0, 2).map(async title => {
        try {
          // 4000 chars to get past biographical intros on author pages.
          const r = await fetch(
            `https://${code}.wikiquote.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exchars=4000&format=json&origin=*`
          )
          if (!r.ok) return null
          const data  = await r.json()
          const pages = data.query?.pages
          const raw   = pages?.[Object.keys(pages)[0]]?.extract?.trim()
          if (!raw) return null

          const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)

          // Lines starting with `* ` (single asterisk) are the actual quotes.
          // Lines starting with `** ` are source/attribution — skip those.
          const bulleted = lines.filter(l =>
            l.startsWith('* ') &&
            !l.startsWith('** ') &&
            l.length >= 40 &&
            l.length <= 300
          )

          // Fallback for pages that don't use bullet formatting: look for
          // lines that read like complete sentences and end with punctuation.
          const sentenced = lines.filter(l =>
            !l.startsWith('*') &&
            !l.startsWith('==') &&
            l.length >= 50 &&
            l.length <= 300 &&
            /[.!?»"'"]$/.test(l) &&
            !/^\d/.test(l)        // skip year-only lines or footnote numbers
          )

          const picks = (bulleted.length ? bulleted : sentenced).slice(0, 3)
          if (!picks.length) return null

          // Strip leading bullet markup before displaying.
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
