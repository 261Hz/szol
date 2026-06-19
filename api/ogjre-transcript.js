// api/ogjre-transcript.js — Vercel serverless proxy for ogjre.com GraphQL
//
// Browser can't call api.ogjre.com directly (CORS blocks szol.vercel.app).
// This function runs server-side (Vercel Lambda), so there's no CORS check.
//
// POST /api/ogjre-transcript
// Body: { slug: "joe-rogan-experience-2515-chase-hughes" }
// Returns: { transcript, segments } or 404

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug } = req.body || {}
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  const query = `{ video(slug: "${slug}") { transcriptStatus transcriptText transcriptSegments { startMs endMs text } } }`

  let data
  try {
    const upstream = await fetch('https://api.ogjre.com/graphql', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body:    JSON.stringify({ query }),
      signal:  AbortSignal.timeout(12000),
    })
    if (!upstream.ok) {
      return res.status(502).json({ error: 'ogjre upstream error' })
    }
    data = await upstream.json()
  } catch {
    return res.status(502).json({ error: 'ogjre unreachable' })
  }

  const video = data?.data?.video
  if (!video || video.transcriptStatus !== 'DONE') {
    return res.status(404).json({ error: 'Transcript not available' })
  }

  const segments = (video.transcriptSegments || []).map(s => ({
    start: s.startMs / 1000,
    end:   s.endMs   / 1000,
    text:  s.text,
  }))

  return res.status(200).json({
    transcript: video.transcriptText || '',
    segments,
  })
}
