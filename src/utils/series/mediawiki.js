// MediaWiki adapter — works with any MediaWiki site that allows CORS (origin=*).
//
// Primary target: Wikisource (en/fr/de/es/it/ru/pt/zh/ar/he/ja/el/hu + many more)
// Also works with: Wikipedia, Wikibooks, other MediaWiki wikis.
//
// adapterConfig:  { site: "en.wikisource.org" }
// locator:        { page: "Dracula/Chapter_I", entry: "3 May" }
//   page  — MediaWiki page title (slashes = sub-pages)
//   entry — optional text marker used to extract a specific diary entry
//            from a chapter that spans multiple dates

function stripMediaWikiChrome(doc) {
  const noise = [
    '.ws-noexport', '.mw-editsection', 'sup.reference', '.reference',
    '.noprint', '[class*="navigation"]', '[class*="navbar"]',
    '.sister-project', '.reflist', '.references', 'style', 'script',
  ].join(',')
  doc.querySelectorAll(noise).forEach(el => el.remove())
}

function collectParagraphs(doc) {
  return Array.from(doc.querySelectorAll('p, div.poem > p, blockquote > p, div.verse'))
    .map(el => el.textContent.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// For epistolary texts: find the paragraph containing `entry` marker
// (e.g. "3 May") then collect forward until the next date-like heading.
const DATE_LIKE = /^\d{1,2}\s+\p{L}+\.?\s*$|^\p{L}+\s+\d{1,2}\.?\s*$/u

function sliceByEntry(paras, entry) {
  const hint = entry.trim().toLowerCase()
  const start = paras.findIndex(p => p.toLowerCase().startsWith(hint))
  if (start === -1) return paras   // marker not found — return everything

  const result = [paras[start]]
  for (let i = start + 1; i < paras.length; i++) {
    // Stop at the next entry marker (but not at the very first paragraph)
    if (DATE_LIKE.test(paras[i].trim())) break
    result.push(paras[i])
  }
  return result
}

export async function fetchMediaWiki(adapterConfig, locator) {
  const site  = adapterConfig?.site ?? 'en.wikisource.org'
  const page  = locator?.page
  const entry = locator?.entry ?? null

  if (!page) return null

  const params = new URLSearchParams({
    action:             'parse',
    page,
    prop:               'text',
    format:             'json',
    origin:             '*',
    disablelimitreport: '1',
    disableeditsection: '1',
  })

  let res
  try {
    res = await fetch(`https://${site}/w/api.php?${params}`, {
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = await res.json().catch(() => null)
  if (!data || data.error || !data.parse?.text?.['*']) return null

  const doc = new DOMParser().parseFromString(data.parse.text['*'], 'text/html')
  stripMediaWikiChrome(doc)

  const paras = collectParagraphs(doc)
  if (!paras.length) return null

  const slice = entry ? sliceByEntry(paras, entry) : paras
  return slice.join('\n\n')
}
