// api/timedtext.js — server-side proxy for YouTube's timedtext captions API.
// YouTube's timedtext endpoint doesn't set CORS headers, so we fetch server-side.
// Usage: /api/timedtext?v=VIDEO_ID&lang=en

export default async function handler(req, res) {
  const { v, lang = 'en' } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  const url = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(v)}&lang=${lang}&fmt=json3`
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!r.ok) return res.status(r.status).json({ error: `Upstream ${r.status}` })
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
