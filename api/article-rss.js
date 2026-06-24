// api/article-rss.js — fetch + parse an article RSS or Atom feed
// Usage: GET /api/article-rss?url=https://example.com/feed

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

export default async function handler(req, res) {
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

  // Channel / feed metadata
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
      const e     = m[1]
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
      // <link> in RSS 2.0 is text, not an attribute
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
