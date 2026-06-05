// api/clarity-collect/[...path].js — catch-all for Clarity sub-path requests.
//
// Vercel routes /api/clarity-collect exactly to clarity-collect.js, but sub-paths
// like /api/clarity-collect/0.8.65/clarity.js need this catch-all file.
// Same proxy logic — strips the prefix and forwards to e.clarity.ms.

const COLLECT_BASE = 'https://e.clarity.ms'

export default async function handler(req, res) {
  const suffix = req.url.replace(/^\/api\/clarity-collect/, '') || ''
  const target = COLLECT_BASE + suffix

  const forwardHeaders = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (['host', 'connection', 'transfer-encoding'].includes(key)) continue
    forwardHeaders[key] = val
  }

  try {
    const upstream = await fetch(target, {
      method:  req.method,
      headers: forwardHeaders,
      body:    req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      duplex:  'half',
    })

    res.status(upstream.status)
    for (const [key, val] of upstream.headers.entries()) {
      if (key === 'transfer-encoding') continue
      res.setHeader(key, val)
    }

    const body = await upstream.arrayBuffer()
    res.end(Buffer.from(body))
  } catch {
    res.status(502).end()
  }
}
