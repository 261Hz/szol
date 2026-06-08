// api/timedtext.js — proxies to the Render backend which uses youtube-transcript-api
// (Python) to fetch manually created YouTube captions reliably.

export default async function handler(req, res) {
  const { v } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  try {
    const r = await fetch(`https://szol.onrender.com/transcript?v=${encodeURIComponent(v)}`)
    const data = await r.json()

    if (!r.ok) {
      return res.status(r.status).json({ error: data.detail ?? 'Failed to fetch transcript' })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
