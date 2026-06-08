// api/timedtext.js — fetches YouTube captions by scraping ytInitialPlayerResponse.
// The old type=list timedtext endpoint is unreliable for newer videos.
// Only serves manually submitted tracks (vssId without "a." prefix = not ASR).

export default async function handler(req, res) {
  const { v } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  try {
    // 1. Fetch the YouTube watch page
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(v)}`, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!pageRes.ok) return res.status(pageRes.status).json({ error: 'Could not fetch video page' })

    const html = await pageRes.text()

    // 2. Extract captionTracks array from ytInitialPlayerResponse
    const match = html.match(/"captionTracks":(\[[\s\S]*?\])/)
    if (!match) {
      return res.status(404).json({ error: 'This video has no captions. Choose a video with subtitles.' })
    }

    const captionTracks = JSON.parse(match[1])

    // 3. Filter out auto-generated tracks.
    //    vssId starts with "a." for ASR (auto-generated), e.g. "a.en"
    //    Manual tracks have vssId like ".en" or "en"
    const manual = captionTracks.filter(t => !t.vssId?.startsWith('a.'))

    if (!manual.length) {
      return res.status(422).json({
        error: 'This video only has auto-generated captions, which have too many errors for dictation practice. Choose a video with manually reviewed subtitles.',
        autoOnly: true,
      })
    }

    // 4. Pick best English manual track, fall back to first available
    const pick = manual.find(t => t.languageCode?.startsWith('en')) ?? manual[0]

    // 5. Fetch the caption content in json3 format
    const baseUrl    = pick.baseUrl
    const captionUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`
    const captionRes = await fetch(captionUrl.replace(/fmt=[^&]*/, 'fmt=json3'), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!captionRes.ok) return res.status(captionRes.status).json({ error: `Could not fetch caption track (${captionRes.status})` })

    const data = await captionRes.json()
    if (!data.events?.length) {
      return res.status(404).json({ error: 'Caption track is empty.' })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({
      ...data,
      _track: { lang: pick.languageCode, name: pick.name?.simpleText ?? '' },
    })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
