// api/substack-feed.js — fetches recent posts filtered by language.
// Uses WordPress.com Reader API (multilingual, no auth, accessible from Vercel).
// Results CDN-cached 4h; empty results are never cached.
//
// ?lang=de&limit=10

// Language code mapping: BCP-47 → WordPress locale
const WP_LANG = {
  en: 'en', de: 'de', fr: 'fr', es: 'es', pt: 'pt',
  it: 'it', nl: 'nl', ru: 'ru', pl: 'pl', tr: 'tr',
  sv: 'sv', ja: 'ja', ko: 'ko', zh: 'zh', ar: 'ar',
  he: 'he', el: 'el', hu: 'hu',
}

// Categories to rotate through for variety (WordPress Reader tag slugs)
const TAGS = ['culture','arts','science','technology','history','books','travel','food','music','film']

function stripHtml(s) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#\d+);/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function handler(req, res) {
  const { lang = 'en', limit = '10' } = req.query
  const n       = Math.min(parseInt(limit) || 10, 20)
  const wpLang  = WP_LANG[lang] ?? lang

  // Fetch from several tags in parallel so we get variety
  const tags = TAGS.slice(0, 4)
  const results = await Promise.all(tags.map(async tag => {
    try {
      const url = `https://public-api.wordpress.com/rest/v1.1/read/tags/${tag}/posts?number=5&lang=${wpLang}`
      const r   = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal:  AbortSignal.timeout(5000),
      })
      if (!r.ok) return []
      const data = await r.json()
      return (data.posts ?? []).map(p => ({
        title:   stripHtml(p.title ?? ''),
        excerpt: stripHtml(p.excerpt ?? '').slice(0, 220),
        url:     p.URL ?? p.short_URL ?? '',
        date:    p.date ?? '',
        pub:     p.site_name ?? p.author?.name ?? '',
        author:  p.author?.name ?? '',
      })).filter(a => a.title && a.url)
    } catch {
      return []
    }
  }))

  // Merge, deduplicate by URL, cap at limit
  const seen     = new Set()
  const articles = []
  for (const batch of results) {
    for (const a of batch) {
      if (!seen.has(a.url)) {
        seen.add(a.url)
        articles.push(a)
      }
      if (articles.length >= n) break
    }
    if (articles.length >= n) break
  }

  console.log(`wp-reader lang=${wpLang} tags=${tags.join(',')} articles=${articles.length}`)

  if (!articles.length) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json([])
  }

  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600')
  return res.status(200).json(articles)
}
