// api/ogjre-transcript.js — Vercel serverless proxy for ogjre.com transcripts
//
// Two strategies:
//   1. Scrape __NEXT_DATA__ from the episode page — gets exactly what the browser renders
//   2. Fall back to the GraphQL API with browser headers
//
// POST /api/ogjre-transcript
// Body: { slug: "joe-rogan-experience-2515-chase-hughes" }

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug } = req.body || {}
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  // Strategy 1: scrape __NEXT_DATA__ from the episode page
  try {
    const pageRes = await fetch(`https://ogjre.com/episode/${slug}`, {
      headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
      signal: AbortSignal.timeout(12000),
    })
    if (pageRes.ok) {
      const html = await pageRes.text()
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (m) {
        const nextData = JSON.parse(m[1])
        const video = nextData?.props?.pageProps?.video
        if (video?.transcriptStatus === 'DONE' && video.transcriptSegments?.length) {
          return res.status(200).json({
            transcript: video.transcriptText || '',
            segments: video.transcriptSegments.map(s => ({
              start: s.startMs / 1000,
              end:   s.endMs   / 1000,
              text:  s.text,
            })),
          })
        }
        // Transcript exists in page data but status isn't DONE yet
        const status = video?.transcriptStatus ?? 'NOT_FOUND'
        if (status !== 'DONE') {
          return res.status(404).json({ error: 'Transcript not available', debug: { source: 'next_data', status } })
        }
      }
    }
  } catch (e) {
    // fall through to GraphQL
  }

  // Strategy 2: GraphQL API
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
      body:    JSON.stringify({ query }),
      signal:  AbortSignal.timeout(12000),
    })

    const raw     = await gqlRes.text()
    let gqlData
    try { gqlData = JSON.parse(raw) } catch { gqlData = null }

    const video = gqlData?.data?.video
    if (video?.transcriptStatus === 'DONE' && video.transcriptSegments?.length) {
      return res.status(200).json({
        transcript: video.transcriptText || '',
        segments: video.transcriptSegments.map(s => ({
          start: s.startMs / 1000,
          end:   s.endMs   / 1000,
          text:  s.text,
        })),
      })
    }

    return res.status(404).json({
      error: 'Transcript not available',
      debug: {
        source:           'graphql',
        status:           video?.transcriptStatus ?? null,
        video_found:      video !== null && video !== undefined,
        gql_http_status:  gqlRes.status,
      },
    })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}
