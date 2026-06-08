// api/timedtext.js — fetches YouTube captions via the internal youtubei/v1/player API.
// This is the same endpoint the YouTube web player calls — returns clean JSON with
// captionTracks including baseUrl and vssId, no HTML scraping required.
// Rejects ASR (auto-generated) tracks — vssId starts with "a." for those.

// YouTube treats server-side WEB client requests as bots.
// TVHTML5 and ANDROID clients bypass the LOGIN_REQUIRED restriction.
const CLIENTS = [
  {
    key:  'AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8',
    name: 'TVHTML5',
    version: '7.20210224.00.00',
    clientHeader: '7',
  },
  {
    key:  '***YT_KEY_ANDROID***',
    name: 'ANDROID',
    version: '17.31.35',
    clientHeader: '3',
  },
]

async function fetchPlayer(videoId, client) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${client.key}&prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type':             'application/json',
        'User-Agent':               'Mozilla/5.0',
        'X-YouTube-Client-Name':    client.clientHeader,
        'X-YouTube-Client-Version': client.version,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: { clientName: client.name, clientVersion: client.version, hl: 'en', gl: 'US' },
        },
      }),
    }
  )
  if (!res.ok) return null
  const data = await res.json()
  if (data?.playabilityStatus?.status === 'LOGIN_REQUIRED') return null
  return data
}

export default async function handler(req, res) {
  const { v } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  try {
    // Try each client in order until one returns a usable player response
    let player = null
    for (const client of CLIENTS) {
      player = await fetchPlayer(v, client)
      if (player) break
    }

    if (!player) return res.status(403).json({ error: 'Could not access this video. It may be private or restricted.' })

    const captionTracks = player?.captions
      ?.playerCaptionsTracklistRenderer
      ?.captionTracks

    if (!captionTracks?.length) {
      return res.status(404).json({ error: 'This video has no captions. Choose a video that has subtitles enabled.' })
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
