// api/captions-proxy.js — server-side Invidious proxy for caption content.
//
// Why this exists: Invidious instances send Access-Control-Allow-Origin on
// their track-list endpoint but then redirect caption content to YouTube's
// signed timedtext URLs (which have no CORS header). The browser cannot
// follow that redirect. The server can — so we proxy it here.
//
// Usage: GET /api/captions-proxy?v=VIDEO_ID&lang=en
// Returns raw VTT or json3 text; the browser parses it.

// Server-side: no CORS restriction, so we can include any Invidious instance.
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.tiekoetter.com',
  'https://yewtu.be',
  'https://invidious.kavin.rocks',
  'https://invidious.nerdvpn.de',
  'https://invidious.private.coffee',
  'https://vid.priv.au',
  'https://inv.riverside.rocks',
  'https://invidious.jing.rocks',
]

function pickTrack(tracks, lang) {
  const base   = lang.slice(0, 2)
  const isAuto = t => /auto/i.test(t.label ?? '')
  const lc     = t => t.languageCode ?? t.language_code ?? ''
  return tracks.find(t => lc(t) === lang && !isAuto(t))
    ?? tracks.find(t => lc(t).startsWith(base) && !isAuto(t))
    ?? tracks.find(t => lc(t) === 'en' && !isAuto(t))
    ?? tracks.find(t => !isAuto(t))
    ?? tracks[0]
}

export default async function handler(req, res) {
  const { v: videoId, lang = 'en' } = req.query

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' })
  }

  const base2 = lang.slice(0, 2)

  for (const base of INVIDIOUS) {
    try {
      // Step 1: get track list.
      const listRes = await fetch(`${base}/api/v1/captions/${videoId}`, {
        signal:  AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'szol-app/1.0' },
      })
      if (!listRes.ok) continue

      const tracks = (await listRes.json()).captions ?? []

      // Build candidate URLs: label-based first (from track list), then lang-based.
      // fetch() follows redirects by default — if Invidious redirects to a signed
      // YouTube timedtext URL, the server follows it (no CORS restriction).
      const urls = []
      if (tracks.length) {
        const pick    = pickTrack(tracks, lang)
        const capBase = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`
        urls.push(`${capBase}&fmt=json3`, capBase)
      }
      urls.push(
        `${base}/api/v1/captions/${videoId}?lang=${base2}&fmt=json3`,
        `${base}/api/v1/captions/${videoId}?lang=en&fmt=json3`,
        `${base}/api/v1/captions/${videoId}?lang=${base2}`,
        `${base}/api/v1/captions/${videoId}?lang=en`,
      )

      for (const url of urls) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
          if (!r.ok) continue
          const text = await r.text()
          if (!text.trim()) continue

          const isJson = text.trimStart().startsWith('{')
          res.setHeader('Content-Type', isJson ? 'application/json' : 'text/vtt; charset=utf-8')
          res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
          return res.status(200).send(text)
        } catch { /* try next url */ }
      }
    } catch { /* try next instance */ }
  }

  return res.status(502).json({ error: 'Caption unavailable' })
}
