// api/feed-search.js — proxy Feedly's public feed search (no auth required)
// Usage: GET /api/feed-search?q=substack+tech

export default async function handler(req, res) {
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
