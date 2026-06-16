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
// Three formats seen in Dracula/Wikisource:
//   DATE_LIKE   — standalone short heading:   "22 July."
//   DATE_INLINE — date embedded in paragraph: "4 May.—I found..."
//                 or "2 August, midnight.—Woke up..."
//   DATE_ON     — Demeter log format:         "On 6 July we finished taking in cargo..."
const _MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const DATE_LIKE   = /^\d{1,2}\s+\p{L}+\.?\s*$|^\p{L}+\s+\d{1,2}\.?\s*$/u
const DATE_INLINE = new RegExp('^\\d{1,2}\\s+(?:' + _MONTHS + ')\\b', 'i')
const DATE_ON     = new RegExp('^On\\s+\\d{1,2}\\s+(?:' + _MONTHS + ')\\b', 'i')

function sliceByEntry(paras, entry) {
  const hint = entry.trim().toLowerCase()
  const start = paras.findIndex(p => p.toLowerCase().startsWith(hint))
  if (start === -1) return null   // marker not found in this chapter — wrong page

  const result = [paras[start]]
  for (let i = start + 1; i < paras.length; i++) {
    const p = paras[i].trim()
    if (DATE_LIKE.test(p) || DATE_INLINE.test(p) || DATE_ON.test(p)) break
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
  if (!slice?.length) return null
  return slice.join('\n\n')
}
