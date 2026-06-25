// wikivoyage.js: helpers for searching Wikivoyage travel destination articles.
// Used by LibraryView's "Travel" section so users can read about destinations in their target language.
//
// Wikivoyage is a Wikimedia project with travel guides in many languages.
// Unlike many news sites, its MediaWiki API includes CORS headers (via origin=*),
// so the browser can call it directly — no server proxy required.
//
// API pattern: same MediaWiki API as Wikipedia, just on a different subdomain.

// Maps app language codes to Wikivoyage subdomain codes.
// Most are 1:1 with the language code. arz (Egyptian Arabic) falls back to 'ar'.
// ar, hu: Wikivoyage editions still in Wikimedia Incubator — not included.
const WIKI_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ja: 'ja', zh: 'zh', 'zh-TW': 'zh', el: 'el', id: 'id',
}

// wl() = returns the Wikivoyage subdomain for a language, or null if unavailable.
function wl(lang) {
  return WIKI_LANG[lang] ?? null
}

// searchWikivoyage() searches Wikivoyage for destination articles matching a query string.
// For example: searchWikivoyage("Paris", "fr") → articles about Paris from fr.wikivoyage.org.
//
// query = user's search term (e.g. "Tokyo", "Mediterranean")
// lang  = app language code — determines which language version of Wikivoyage to search
// Returns array of { title, pageid, snippet } or [] on any error.
// snippet = a short plain-text excerpt from the article (HTML tags stripped).
export async function searchWikivoyage(query, lang) {
  const code = wl(lang)
  if (!code) return []

  try {
    // list=search performs a full-text search across Wikivoyage articles.
    // srlimit=6 returns up to 6 results — enough to give options without overloading the UI.
    // origin=* enables CORS so the browser can make this request directly.
    const res = await fetch(
      `https://${code}.wikivoyage.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&format=json&origin=*`
    )
    if (!res.ok) return []

    const data = await res.json()
    // data.query.search is an array of result objects with title, pageid, snippet, etc.
    return (data.query?.search ?? []).map(r => ({
      title:   r.title,
      pageid:  r.pageid,
      // snippet contains matched context but wrapped in HTML <span> tags for highlighting.
      // .replace(/<[^>]+>/g, '') strips those tags to get plain text.
      snippet: (() => { let s = r.snippet, p; do { p = s; s = s.replace(/<[^<>]*>/g, '') } while (s !== p); return s })(),
    }))
  } catch {
    return []
  }
}

// fetchWikivoyageArticle() downloads the full plain-text intro section of a Wikivoyage article.
// The "intro" (exintro=1) is typically 1–3 paragraphs — enough content to read as a story
// without including the enormous full article (which has listings, maps, etc.).
//
// title = the article title as returned by searchWikivoyage() (e.g. "Paris")
// lang  = app language code — determines which language version to fetch from
// Returns { title, text } on success, or null if the article doesn't exist or on error.
export async function fetchWikivoyageArticle(title, lang) {
  const code = wl(lang)
  if (!code) return null

  try {
    // prop=extracts   = we want the article text (not images, categories, etc.)
    // exintro=1       = only return the intro section (before the first heading)
    // explaintext=1   = return plain text instead of wikitext markup
    // titles=...      = the specific article to fetch
    const res = await fetch(
      `https://${code}.wikivoyage.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*`
    )
    if (!res.ok) return null

    const data = await res.json()
    // The API returns pages as an object keyed by pageid (e.g. { "12345": { title, extract, ... } }).
    // Object.values() extracts the array of page objects; [0] gets the first (and only) one.
    const pages = data.query?.pages ?? {}
    const page  = Object.values(pages)[0]

    // 'missing' in page = the article doesn't exist on this language's Wikivoyage.
    if (!page || 'missing' in page) return null

    return {
      title: page.title,
      // .trim() removes any leading/trailing whitespace the API sometimes adds.
      text:  (page.extract ?? '').trim(),
    }
  } catch {
    return null
  }
}
