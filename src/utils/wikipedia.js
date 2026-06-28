// wikipedia.js: helpers for fetching content from the Wikimedia APIs.
// Three purposes:
//   1. fetchFeaturedArticle() — Today's Featured Article for the Library "Today" section.
//   2. fetchOnThisDay()       — Historical events for the Library "On This Day" section.
//   3. searchWikipedia()      — Word-level article search for the ExamplesPanel "Wikipedia" tab.
//   4. fetchQuoteOfDay()      — Random quote from Wikiquote for the Library "Quote of the Day".
//
// All APIs are public and CORS-enabled — no proxy or API key needed.

// Maps the app's short language codes to Wikipedia subdomain codes.
const WIKI_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ar: 'ar', arz: 'ar',
  ja: 'ja', zh: 'zh', 'zh-TW': 'zh', hu: 'hu', el: 'el',
}

function wl(lang) {
  return WIKI_LANG[lang] || 'en'
}

// fetchFeaturedArticle() fetches today's Wikipedia "Featured Article" for a given language.
export async function fetchFeaturedArticle(lang) {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')

  try {
    const res = await fetch(
      `https://${wl(lang)}.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`
    )
    if (!res.ok) return null

    const data = await res.json()
    const tfa  = data.tfa
    if (!tfa) return null

    const rawExtract = tfa.extract ?? tfa.description ?? ''
    let extract = rawExtract
    let _p; do { _p = extract; extract = extract.replace(/<[^<>]*>/g, '') } while (extract !== _p)
    extract = extract.trim()

    return {
      title:     tfa.title,
      extract,
      thumbnail: tfa.thumbnail?.source ?? null,
      url:       tfa.content_urls?.desktop?.page ?? null,
    }
  } catch {
    return null
  }
}

// fetchOnThisDay() fetches historical events for today's date from the Wikimedia On This Day feed.
export async function fetchOnThisDay(lang) {
  const now = new Date()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')

  try {
    const res = await fetch(
      `https://${wl(lang)}.wikipedia.org/api/rest_v1/feed/onthisday/all/${m}/${d}`
    )
    if (!res.ok) return []
    const data = await res.json()

    const events = [
      ...(data.events ?? []),
      ...(data.births ?? []),
      ...(data.deaths ?? []),
    ]
    return events.slice(0, 12).map(e => ({ text: e.text, year: e.year }))
  } catch {
    return []
  }
}

// fetchQuoteOfDay() fetches a random quote from Wikiquote in the active language.
// Results are cached in sessionStorage so the quote stays consistent within a browser session.
export async function fetchQuoteOfDay(lang) {
  const code = wl(lang)
  const cacheKey = `szol_qotd_${code}_${new Date().toDateString()}`
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  // Try up to 5 random pages to find one with a clean quote.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const randRes = await fetch(
        `https://${code}.wikiquote.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`
      )
      if (!randRes.ok) return null
      const { query } = await randRes.json()
      const title = query?.random?.[0]?.title
      if (!title) continue

      // 4000 chars — enough to get past biographical intros on author pages.
      const pageRes = await fetch(
        `https://${code}.wikiquote.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exchars=4000&format=json&origin=*`
      )
      if (!pageRes.ok) continue
      const pageData = await pageRes.json()
      const pages    = pageData.query?.pages
      const extract  = pages?.[Object.keys(pages)[0]]?.extract?.trim()
      if (!extract || extract.length < 20) continue

      const lines = extract.split('\n').map(l => l.trim()).filter(Boolean)

      // Only use lines that start with a single `*` (actual quote bullets).
      // Lines starting with `**` are source attributions, not the quotes themselves.
      const bulleted = lines.filter(l =>
        l.startsWith('* ') &&
        !l.startsWith('** ') &&
        l.length >= 40 &&
        l.length <= 300
      )

      if (!bulleted.length) continue

      // Pick randomly from the first 5 candidates so we get variety.
      const raw   = bulleted[Math.floor(Math.random() * Math.min(bulleted.length, 5))]
      const quote = raw.replace(/^\*+\s*/, '').trim()
      const result = { quote, author: title }
      try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
      return result

    } catch {
      continue
    }
  }
  return null
}

// searchWikipedia() finds Wikipedia articles related to a word, for the ExamplesPanel.
// Strategy:
//   1. Try a direct title lookup — most relevant for vocabulary words (e.g. "liberté" → Freedom article).
//   2. Fall back to opensearch, but only keep results whose title closely matches the word.
// Returns array of { title, extract } or [] on any error.
export async function searchWikipedia(word, lang) {
  const code = wl(lang)

  function parseSummary(s) {
    if (!s?.extract) return null
    const sentences = s.extract.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s.extract]
    return { title: s.title, extract: sentences.slice(0, 3).join('').trim() }
  }

  async function summaryForTitle(title, strict = false) {
    try {
      const r = await fetch(
        `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      )
      if (!r.ok) return null
      const s = await r.json()
      if (s.type === 'disambiguation') return null
      if (strict) {
        // Only for opensearch fallback: reject if title is clearly unrelated
        // (e.g. "comer" → Italian city). Check that the searched word appears
        // somewhere in the returned title or vice-versa.
        const wNorm = word.toLowerCase().normalize('NFC')
        const tNorm = (s.title ?? '').toLowerCase().normalize('NFC')
        if (!tNorm.includes(wNorm) && !wNorm.includes(tNorm)) return null
      }
      return parseSummary(s)
    } catch {
      return null
    }
  }

  try {
    // Step 1: direct title lookup — most relevant for vocabulary words ("liberté" → Liberty article).
    const direct = await summaryForTitle(word)
    if (direct) return [direct]

    // Step 2: opensearch fallback — only keep titles that closely match the word.
    // Exclude "Place, Region" geo-disambiguators (e.g. "Comer, Lambayeque") and
    // titles that merely contain the word as a substring.
    const searchRes = await fetch(
      `https://${code}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(word)}&limit=5&format=json&origin=*`
    )
    if (!searchRes.ok) return []

    const searchData = await searchRes.json()
    const allTitles  = searchData[1] ?? []

    const wLow = word.toLowerCase()
    const titles = allTitles.filter(t => {
      const tl = t.toLowerCase()
      return !t.includes(',') &&                  // skip geo "Place, Region" entries
             (tl === wLow ||
              tl.startsWith(wLow + ' ') ||
              tl.startsWith(wLow + '('))
    })

    if (!titles.length) return []

    const results = await Promise.all(titles.slice(0, 2).map(t => summaryForTitle(t, true)))
    return results.filter(Boolean)
  } catch {
    return []
  }
}
