// api/timedtext.js — server-side proxy for YouTube's timedtext captions API.
// Only serves manually submitted caption tracks — auto-generated (ASR) tracks
// are rejected because they contain too many errors for dictation practice.

export default async function handler(req, res) {
  const { v } = req.query
  if (!v) return res.status(400).json({ error: 'Missing video id' })

  const ua = { 'User-Agent': 'Mozilla/5.0' }

  try {
    // 1. Fetch the caption track list.
    const listUrl = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(v)}&type=list`
    const listXml = await (await fetch(listUrl, { headers: ua })).text()

    // Parse every <track .../> element into { lang, name, kind }.
    const tracks = []
    for (const m of listXml.matchAll(/<track\b([^>]*)>/g)) {
      const attr  = m[1]
      const lang  = attr.match(/lang_code="([^"]*)"/)?.[1] ?? ''
      const name  = attr.match(/\bname="([^"]*)"/)?.[1]  ?? ''
      const kind  = attr.match(/\bkind="([^"]*)"/)?.[1]  ?? ''
      if (lang) tracks.push({ lang, name, kind })
    }

    if (!tracks.length) {
      return res.status(404).json({ error: 'This video has no captions. Choose a video with subtitles.' })
    }

    // 2. Keep only manually created tracks — exclude ASR (auto-generated).
    const manual = tracks.filter(t =>
      t.kind !== 'asr' && !t.name.toLowerCase().includes('auto')
    )

    if (!manual.length) {
      return res.status(422).json({
        error: 'This video only has auto-generated captions, which contain too many errors for dictation practice. Please choose a video with manually reviewed subtitles.',
        autoOnly: true,
      })
    }

    // 3. Pick the best manual track: prefer English, fall back to first.
    const pick = manual.find(t => t.lang.startsWith('en')) ?? manual[0]

    // 4. Fetch the track in json3 format.
    const url = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(v)}&lang=${pick.lang}&name=${encodeURIComponent(pick.name)}&fmt=json3`
    const captionRes = await fetch(url, { headers: ua })
    if (!captionRes.ok) return res.status(captionRes.status).json({ error: `Upstream ${captionRes.status}` })

    const data = await captionRes.json()
    if (!data.events?.length) {
      return res.status(404).json({ error: 'Caption track is empty.' })
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ ...data, _track: pick })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
}
