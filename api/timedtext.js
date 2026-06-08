// api/timedtext.js — fetches YouTube captions via the internal youtubei/v1/player API.
// This is the same endpoint the YouTube web player calls — returns clean JSON with
// captionTracks including baseUrl and vssId, no HTML scraping required.
// Rejects ASR (auto-generated) tracks — vssId starts with "a." for those.

const INNERTUBE_KEY = '***YT_KEY_WEB***' // public YouTube web client key

export default async function handler(req, res) {
  const { v } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  try {
    // 1. Call the YouTube innertube player API
    const playerRes = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-YouTube-Client-Name':    '1',
          'X-YouTube-Client-Version': '2.20240101.00.00',
        },
        body: JSON.stringify({
          videoId: v,
          context: {
            client: {
              clientName:    'WEB',
              clientVersion: '2.20240101.00.00',
              hl: 'en',
              gl: 'US',
            },
          },
        }),
      }
    )

    if (!playerRes.ok) return res.status(playerRes.status).json({ error: `Player API error ${playerRes.status}` })

    const player = await playerRes.json()

    const captionTracks = player?.captions
      ?.playerCaptionsTracklistRenderer
      ?.captionTracks

    if (!captionTracks?.length) {
      return res.status(404).json({
        error: 'This video has no captions. Choose a video that has subtitles enabled.',
        _debug: {
          playabilityStatus: player?.playabilityStatus?.status,
          hasCaptions: !!player?.captions,
          captionsKeys: player?.captions ? Object.keys(player.captions) : null,
          tracklistKeys: player?.captions?.playerCaptionsTracklistRenderer
            ? Object.keys(player.captions.playerCaptionsTracklistRenderer) : null,
        }
      })
    }

    // 2. Filter out auto-generated tracks (vssId starts with "a.", e.g. "a.en")
    const manual = captionTracks.filter(t => !t.vssId?.startsWith('a.'))

    if (!manual.length) {
      return res.status(422).json({
        error: 'This video only has auto-generated captions, which have too many errors for dictation practice. Choose a video with manually reviewed subtitles.',
        autoOnly: true,
      })
    }

    // 3. Pick best English manual track, fall back to first available
    const pick = manual.find(t => t.languageCode?.startsWith('en')) ?? manual[0]

    // 4. Fetch caption content in json3 format using the baseUrl from the player response
    const captionUrl = pick.baseUrl.replace(/&fmt=[^&]*/g, '') + '&fmt=json3'
    const captionRes = await fetch(captionUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!captionRes.ok) return res.status(captionRes.status).json({ error: `Caption fetch failed (${captionRes.status})` })

    const data = await captionRes.json()
    if (!data.events?.length) return res.status(404).json({ error: 'Caption track is empty.' })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({
      ...data,
      _track: { lang: pick.languageCode, name: pick.name?.simpleText ?? '' },
    })

  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
