// api/clarity-collect.js — first-party proxy for Microsoft Clarity data collection.
//
// The rewritten Clarity script sends session data here instead of directly to
// clarity.ms. This function forwards it upstream and returns the response.
//
// Handles all methods (GET, POST, OPTIONS) and preserves the original path
// suffix so sub-endpoints like /collect/batch still resolve correctly.

const COLLECT_BASE = 'https://e.clarity.ms'

export default async function handler(req, res) {
  // Reconstruct the full upstream URL: base + everything after /api/clarity-collect
  const suffix = req.url.replace(/^\/api\/clarity-collect/, '') || ''
  const target = COLLECT_BASE + suffix

  // Passthrough headers the Clarity script sends (content-type, content-encoding, etc.)
  const forwardHeaders = {}
  for (const [key, val] of Object.entries(req.headers)) {
    // Drop host/connection headers that would confuse the upstream server.
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

    // Forward response status and any headers Clarity sets (e.g. Access-Control-Allow-*)
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
