// api/librivox-rss.js — Vercel serverless function
//
// Given a LibriVox book URL, fetches the book's RSS feed and returns
// the list of chapters with their archive.org MP3 URLs.
//
// Usage: GET /api/librivox-rss?url=https://librivox.org/aesops-fables-volume-1-fables-1-25/

export default async function handler(req, res) {
  const { url } = req.query

  if (!url || !url.startsWith('https://librivox.org/')) {
    return res.status(400).json({ detail: 'Expected a https://librivox.org/ URL.' })
  }

  try {
    // Step 1: fetch the LibriVox book page and extract the RSS <link> tag.
    const pageRes = await fetch(url, {
      signal:  AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'szol-app/1.0 (+https://szol.app)' },
    })
    if (!pageRes.ok) return res.status(502).json({ detail: 'LibriVox page unreachable.' })

    const html = await pageRes.text()

    // <link rel="alternate" type="application/rss+xml" href="https://librivox.org/rss/123" />
    const rssMatch = html.match(/href="(https:\/\/librivox\.org\/rss\/\d+)"/)
    if (!rssMatch) return res.status(404).json({ detail: 'RSS link not found on LibriVox page.' })

    const rssUrl = rssMatch[1]

    // Step 2: fetch the RSS feed.
    const rssRes = await fetch(rssUrl, {
      signal:  AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'szol-app/1.0' },
    })
    if (!rssRes.ok) return res.status(502).json({ detail: 'Could not fetch RSS feed.' })

    const xml = await rssRes.text()

    // Step 3: parse <item> blocks → extract title + enclosure URL.
    const chapters = []
    const itemRe   = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemRe.exec(xml)) !== null) {
      const item     = m[1]
      const rawTitle = item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? ''
      const title    = rawTitle.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim()
      const audioUrl = item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ?? ''
      const duration = item.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/)?.[1]?.trim() ?? ''
      if (audioUrl) chapters.push({ title, url: audioUrl, duration })
    }

    if (!chapters.length) return res.status(404).json({ detail: 'No audio chapters found in RSS.' })

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({ chapters })
  } catch (e) {
    return res.status(500).json({ detail: e.message ?? 'Unexpected error.' })
  }
}
