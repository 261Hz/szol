// api/clarity-tag.js — first-party proxy for the Microsoft Clarity tracking script.
//
// Fetches the Clarity tag script from Microsoft's servers and rewrites all
// clarity.ms references to go through our own domain, so the browser never
// makes a direct request to a known tracker domain.
//
// /api/clarity-tag?id=<project_id>

export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).end()

  let script
  try {
    const upstream = await fetch(`https://www.clarity.ms/tag/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!upstream.ok) return res.status(502).end()
    script = await upstream.text()
  } catch {
    return res.status(502).end()
  }

  // Rewrite every clarity.ms hostname to our collect proxy so data never
  // flows directly to Microsoft from the browser.
  script = script.replace(/https?:\/\/[a-zA-Z0-9-]+\.clarity\.ms/g, '/api/clarity-collect')

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  // Cache for 1 hour — the Clarity script rarely changes intra-day.
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(script)
}
