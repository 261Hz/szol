// api/ogjre-transcript.js — Vercel serverless proxy for ogjre.com transcripts
//
// POST /api/ogjre-transcript
// Body: { slug: "joe-rogan-experience-2515-chase-hughes" }

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

function segmentsFrom(video) {
  return (video.transcriptSegments || []).map(s => ({
    start: s.startMs / 1000,
    end:   s.endMs   / 1000,
    text:  s.text,
  }))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slug } = req.body || {}
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug' })
  }

  const debugCtx = {}

  // Strategy 1: scrape __NEXT_DATA__ from episode page
  try {
    const pageRes = await fetch(`https://ogjre.com/episode/${slug}`, {
      headers: { ...BROWSER_HEADERS, Accept: 'text/html' },
      signal: AbortSignal.timeout(12000),
    })
    debugCtx.page_status = pageRes.status

    if (pageRes.ok) {
      const html = await pageRes.text()
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
      if (m) {
        const nextData = JSON.parse(m[1])
        const pageProps = nextData?.props?.pageProps ?? {}
        debugCtx.page_keys = Object.keys(pageProps).slice(0, 15)

        // Try common key names for the episode object
        const video = pageProps.video ?? pageProps.episode ?? pageProps.data?.video ?? null
        debugCtx.video_found = video !== null

        if (video) {
          debugCtx.transcript_status = video.transcriptStatus
          if (video.transcriptStatus === 'DONE' && video.transcriptSegments?.length) {
            return res.status(200).json({
              transcript: video.transcriptText || '',
              segments:   segmentsFrom(video),
            })
          }
          if (video.transcriptStatus !== 'DONE') {
            // Episode found but transcript not ready — no point trying GraphQL
            return res.status(404).json({
              error: 'Transcript not available',
              debug: { source: 'next_data', ...debugCtx },
            })
          }
        }
        // video is null → slug mismatch or different page structure; fall through to GraphQL
      } else {
        debugCtx.next_data_found = false
      }
    }
  } catch (e) {
    debugCtx.page_error = String(e)
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

    debugCtx.gql_status = gqlRes.status
    const raw = await gqlRes.text()
    debugCtx.gql_raw_start = raw.slice(0, 300)

    let gqlData
    try { gqlData = JSON.parse(raw) } catch { gqlData = null }

    const video = gqlData?.data?.video
    debugCtx.gql_video_found = video !== null && video !== undefined
    if (video) debugCtx.gql_transcript_status = video.transcriptStatus

    if (video?.transcriptStatus === 'DONE' && video.transcriptSegments?.length) {
      return res.status(200).json({
        transcript: video.transcriptText || '',
        segments:   segmentsFrom(video),
      })
    }
  } catch (e) {
    debugCtx.gql_error = String(e)
  }

  return res.status(404).json({ error: 'Transcript not available', debug: debugCtx })
}
