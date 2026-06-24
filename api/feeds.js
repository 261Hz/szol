// api/feeds.js — unified feed API
// ?action=search&q=...   → Feedly public search
// ?action=rss&url=...    → parse RSS/Atom article feed
// ?action=wp&lang=...    → WordPress Reader curated posts

// ── Shared helpers ─────────────────────────────────────────────────────────────

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g
const stripCdata = s => s.replace(CDATA_RE, '$1').trim()
const stripTags  = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim()

function textNode(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? stripTags(stripCdata(m[1])) : null
}
function attrVal(str, name) {
  const m = str.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return m?.[1] ?? null
}

// ── action=search ──────────────────────────────────────────────────────────────

async function handleSearch(req, res) {
  const q = (req.query.q ?? '').trim()
  if (!q) return res.status(400).json({ error: 'Missing query' })

  let data
  try {
    const r = await fetch(
      `https://cloud.feedly.com/v3/search/feeds?query=${encodeURIComponent(q)}&count=15`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'szol-app/1.0' } }
    )
    if (!r.ok) return res.status(502).json({ error: `Feedly returned ${r.status}` })
    data = await r.json()
  } catch {
    return res.status(502).json({ error: 'Feed search unavailable.' })
  }

  const results = []
  for (const item of data.results ?? []) {
    const feedId  = item.feedId ?? ''
    const feedUrl = feedId.startsWith('feed/') ? feedId.slice(5) : feedId
    if (!feedUrl?.startsWith('http')) continue
    results.push({
      title:       item.title       ?? '',
      feed_url:    feedUrl,
      description: item.description ?? '',
      website:     item.website     ?? '',
      subscribers: item.subscribers ?? 0,
      icon_url:    item.iconUrl     ?? item.visualUrl ?? '',
      language:    item.language    ?? '',
    })
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate')
  return res.status(200).json(results)
}

// ── action=rss ─────────────────────────────────────────────────────────────────

async function handleRss(req, res) {
  const url = req.query.url
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Expected an http(s) URL.' })
  }

  let rssText
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'szol-app/1.0 (+https://szol.app)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })
    if (!r.ok) return res.status(502).json({ error: `Feed returned ${r.status}.` })
    rssText = await r.text()
  } catch {
    return res.status(502).json({ error: 'Could not reach the feed URL.' })
  }

  const chanM   = rssText.match(/<channel>([\s\S]*?)<\/channel>/)
  const chanXml = chanM?.[1] ?? rssText.slice(0, 3000)
  const feedTitle = textNode(chanXml.slice(0, 600), 'title') ?? 'Feed'
  const feedImage = (() => {
    const m = rssText.slice(0, 3000).match(/<(?:itunes:)?image[^>]*>\s*<url[^>]*>([^<]+)<\/url>/)
      ?? rssText.slice(0, 3000).match(/<(?:itunes:)?image[^>]+href="([^"]+)"/)
    return m?.[1]?.trim() ?? null
  })()

  const isAtom = /<feed[^>]*xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/.test(rssText)
  const articles = []

  if (isAtom) {
    const re = /<entry>([\s\S]*?)<\/entry>/g
    let m
    while ((m = re.exec(rssText)) !== null && articles.length < 30) {
      const e    = m[1]
      const title = textNode(e, 'title') ?? ''
      const link  = (() => {
        const alt = e.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)
        if (alt) return alt[1]
        const any = e.match(/<link[^>]+href="([^"]+)"/)
        return any?.[1] ?? textNode(e, 'link') ?? null
      })()
      if (!link) continue
      const desc    = textNode(e, 'summary') ?? textNode(e, 'content') ?? ''
      const pubDate = textNode(e, 'published') ?? textNode(e, 'updated') ?? null
      articles.push({ title, url: link, description: desc.slice(0, 400), pub_date: pubDate })
    }
  } else {
    const re = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = re.exec(rssText)) !== null && articles.length < 30) {
      const item  = m[1]
      const title = textNode(item, 'title') ?? ''
      const link  = textNode(item, 'link') ?? attrVal(item.match(/<link([^>]*)>/)?.[1] ?? '', 'href') ?? null
      if (!link) continue
      const desc    = textNode(item, 'description') ?? ''
      const pubDate = textNode(item, 'pubDate') ?? null
      articles.push({ title, url: link, description: desc.slice(0, 400), pub_date: pubDate })
    }
  }

  if (!articles.length) return res.status(404).json({ error: 'No articles found in this feed.' })

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate')
  return res.status(200).json({ title: feedTitle, image: feedImage, articles })
}

// ── action=wp ──────────────────────────────────────────────────────────────────

const WP_LANG = {
  en: 'en', de: 'de', fr: 'fr', es: 'es', pt: 'pt',
  it: 'it', nl: 'nl', ru: 'ru', pl: 'pl', tr: 'tr',
  sv: 'sv', ja: 'ja', ko: 'ko', zh: 'zh', ar: 'ar',
  he: 'he', el: 'el', hu: 'hu',
}
const WP_TAGS = ['culture','arts','science','technology','history','books','travel','food','music','film']

function stripHtml(s) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#\d+);/g, ' ').replace(/\s+/g, ' ').trim()
}

async function handleWp(req, res) {
  const { lang = 'en', limit = '10' } = req.query
  const n      = Math.min(parseInt(limit) || 10, 20)
  const wpLang = WP_LANG[lang] ?? lang

  const tags = WP_TAGS.slice(0, 4)
  const results = await Promise.all(tags.map(async tag => {
    try {
      const r = await fetch(
        `https://public-api.wordpress.com/rest/v1.1/read/tags/${tag}/posts?number=5&lang=${wpLang}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
      )
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
    } catch { return [] }
  }))

  const seen = new Set()
  const articles = []
  for (const batch of results) {
    for (const a of batch) {
      if (!seen.has(a.url)) { seen.add(a.url); articles.push(a) }
      if (articles.length >= n) break
    }
    if (articles.length >= n) break
  }

  if (!articles.length) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json([])
  }
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600')
  return res.status(200).json(articles)
}

// ── Router ─────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const action = req.query.action
  if (action === 'search') return handleSearch(req, res)
  if (action === 'rss')    return handleRss(req, res)
  if (action === 'wp')     return handleWp(req, res)
  return res.status(400).json({ error: 'action must be search | rss | wp' })
}
