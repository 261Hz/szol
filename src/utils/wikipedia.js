// wikipedia.js: helpers for fetching content from the Wikimedia APIs.
// Three purposes:
//   1. fetchFeaturedArticle() — Today's Featured Article for the Library "Today" section.
//   2. fetchOnThisDay()       — Historical events for the Library "On This Day" section.
//   3. searchWikipedia()      — Word-level article search for the ExamplesPanel "Wikipedia" tab.
//
// All three APIs are public and CORS-enabled — no proxy or API key needed.

// Maps the app's short language codes to Wikipedia subdomain codes.
// These are the same codes used in Wikipedia URLs (e.g. "es" → es.wikipedia.org).
// arz = Egyptian Arabic uses 'ar' because Arabic Wikimedia APIs don't have a separate arz endpoint.
const WIKI_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ar: 'ar', arz: 'ar',
  ja: 'ja', zh: 'zh', hu: 'hu', el: 'el',
}

// wl() = "wiki language" — returns the Wikipedia code for a given app language code.
// Falls back to 'en' so unsupported languages still show something useful.
function wl(lang) {
  return WIKI_LANG[lang] || 'en'
}

// fetchFeaturedArticle() fetches today's Wikipedia "Featured Article" for a given language.
// The Wikimedia Feed API endpoint requires the date in YYYY/MM/DD format.
// Returns { title, extract, thumbnail, url } on success, or null on any error.
export async function fetchFeaturedArticle(lang) {
  // Build today's date in the YYYY/MM/DD format the API requires.
  // padStart(2, '0') ensures single-digit months/days get a leading zero (e.g. "06", not "6").
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0') // getMonth() is 0-indexed, so +1
  const d   = String(now.getDate()).padStart(2, '0')

  try {
    // Use the language-specific Wikipedia REST v1 endpoint — public, CORS-enabled, no API key.
    // The api.wikimedia.org centralised endpoint now requires auth tokens; the per-wiki
    // REST endpoint does not.
    const res = await fetch(
      `https://${wl(lang)}.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`
    )
    if (!res.ok) return null // 404 = language doesn't have a featured article today

    const data = await res.json()
    const tfa  = data.tfa
    if (!tfa) return null

    // Some language Wikipedias return the extract as HTML; strip tags so the text is
    // plain when stored as a story and displayed in the reading interface.
    const rawExtract = tfa.extract ?? tfa.description ?? ''
    const extract    = rawExtract.replace(/<[^>]+>/g, '').trim()

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
// The feed has three sub-arrays: events (history), births, deaths.
// We combine them and return up to 12 items as { text, year } objects.
// Returns [] on any error.
export async function fetchOnThisDay(lang) {
  const now = new Date()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  // Note: the On This Day endpoint uses only MM/DD (no year), because the feed covers all years.

  try {
    const res = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/${wl(lang)}/onthisday/all/${m}/${d}`,
      { headers: { 'Api-User-Agent': 'szol-app/1.0 (language-learning)' } }
    )
    if (!res.ok) return []
    const data = await res.json()

    // Combine all three event categories into one list.
    // ?? [] = if a category is missing from the response, use an empty array instead.
    const events = [
      ...(data.events ?? []),
      ...(data.births ?? []),
      ...(data.deaths ?? []),
    ]
    // Limit to 12 items so the UI doesn't overflow, and simplify each event to just text + year.
    return events.slice(0, 12).map(e => ({ text: e.text, year: e.year }))
  } catch {
    return []
  }
}

// fetchQuoteOfDay() fetches a random quote from Wikiquote in the active language.
// Uses the MediaWiki Action API to get a random page title, then fetches its plain-text extract.
// Results are cached in sessionStorage for the day so the quote stays consistent.
export async function fetchQuoteOfDay(lang) {
  const code = wl(lang)
  const cacheKey = `szol_qotd_${code}_${new Date().toDateString()}`
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch {}

  try {
    const randRes = await fetch(
      `https://${code}.wikiquote.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`
    )
    if (!randRes.ok) return null
    const { query } = await randRes.json()
    const title = query?.random?.[0]?.title
    if (!title) return null

    const pageRes = await fetch(
      `https://${code}.wikiquote.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exchars=500&format=json&origin=*`
    )
    if (!pageRes.ok) return null
    const pageData = await pageRes.json()
    const pages   = pageData.query?.pages
    const extract = pages?.[Object.keys(pages)[0]]?.extract?.trim()
    if (!extract || extract.length < 15) return null

    // Pick the first line that looks like a quote (skip section headers and trivially short lines)
    const lines = extract.split('\n').map(l => l.trim()).filter(l => l.length > 20 && !l.startsWith('=='))
    const quote = lines[0]
    if (!quote) return null

    const result = { quote, author: title }
    try { sessionStorage.setItem(cacheKey, JSON.stringify(result)) } catch {}
    return result
  } catch {
    return null
  }
}

// searchWikipedia() finds Wikipedia articles related to a word, for the ExamplesPanel.
// Two-step process:
//   Step 1: opensearch → get article titles that match the word.
//   Step 2: REST summary → get the opening paragraph (extract) of each article.
// Returns array of { title, extract } or [] on any error.
export async function searchWikipedia(word, lang) {
  const code = wl(lang) // e.g. 'es' for Spanish
  try {
    // Step 1: OpenSearch returns [query, [titles], [descriptions], [urls]].
    // origin=* allows the browser to call the API directly (Wikimedia has permissive CORS).
    // limit=2 keeps it fast — two articles is enough to give meaningful context.
    const searchRes = await fetch(
      `https://${code}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(word)}&limit=2&format=json&origin=*`
    )
    if (!searchRes.ok) return []

    const searchData = await searchRes.json()
    // searchData is an array: [queryString, [title1, title2], [desc1, desc2], [url1, url2]]
    // Index [1] = the array of article titles.
    const titles = searchData[1] ?? []
    if (!titles.length) return []

    // Step 2: Fetch the summary (first paragraph) for each title in parallel.
    // Promise.all() runs both requests at the same time instead of one after the other.
    const results = await Promise.all(
      titles.slice(0, 2).map(async title => {
        try {
          // The REST summary endpoint returns a clean extract without needing to parse wikitext.
          const r = await fetch(
            `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          )
          if (!r.ok) return null
          const s = await r.json()
          // Only include articles that have a non-empty extract (some pages are redirect stubs).
          return s.extract ? { title: s.title, extract: s.extract } : null
        } catch {
          return null // one article failing shouldn't break the whole result
        }
      })
    )
    // .filter(Boolean) removes any null entries from failed or empty fetches.
    return results.filter(Boolean)
  } catch {
    return []
  }
}
