// api/ogjre-transcript.js — Vercel serverless proxy for ogjre.com transcripts
//
// ogjre.com uses Apollo GraphQL (client-side). __NEXT_DATA__ only has the
// Apollo cache shell, not episode data — so we call the GraphQL API directly
// from the server to bypass browser CORS restrictions.
//
// POST /api/ogjre-transcript
// Body: { slug: "joe-rogan-experience-2515-chase-hughes" }

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

const TRANSCRIPT_READY = ['DONE', 'READY']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug } = req.body || {}
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  try {
    const query = `{ video(slug: "${slug}") { transcriptStatus transcriptText transcriptSegments { startMs endMs text } } }`
    const gqlRes = await fetch('https://api.ogjre.com/graphql', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin:         'https://ogjre.com',
        Referer:        'https://ogjre.com/',
        ...BROWSER_HEADERS,
      },
      body:   JSON.stringify({ query }),
      signal: AbortSignal.timeout(12000),
    })

    const data  = await gqlRes.json()
    const video = data?.data?.video

    if (video && TRANSCRIPT_READY.includes(video.transcriptStatus)) {
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

    return res.status(404).json({
      error: 'Transcript not available',
      debug: { status: video?.transcriptStatus ?? null, video_found: video != null },
    })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
