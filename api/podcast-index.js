// api/podcast-index.js
// Looks up a transcript URL for a podcast episode via the Podcast Index API.
// Requires PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET in Vercel env vars.
// Free account at podcastindex.org — no quota concerns for this use pattern.
//
// GET /api/podcast-index?feedUrl=<rss-url>[&audioUrl=<enclosure-url>]
// Returns: { transcript_url, type } or 404

import crypto from 'node:crypto'
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return

  const { feedUrl, audioUrl } = req.query
  if (!feedUrl) return res.status(400).json({ error: 'Expected ?feedUrl=' })

  const key    = process.env.PODCAST_INDEX_KEY
  const secret = process.env.PODCAST_INDEX_SECRET
  if (!key || !secret) return res.status(501).json({ error: 'Podcast Index credentials not configured' })

  const epoch = Math.floor(Date.now() / 1000).toString()
  const auth  = crypto.createHash('sha1').update(key + secret + epoch).digest('hex')

  try {
    const url = `https://api.podcastindex.org/api/1.0/episodes/byfeedurl?url=${encodeURIComponent(feedUrl)}&max=200`
    const r = await fetch(url, {
      headers: {
        'X-Auth-Key':    key,
        'X-Auth-Date':   epoch,
        'Authorization': auth,
        'User-Agent':    'szol-app/1.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!r.ok) return res.status(502).json({ error: `Podcast Index returned ${r.status}` })
    const data = await r.json()

    for (const ep of data.items ?? []) {
      // Match by enclosure URL when provided; otherwise take the first episode with a transcript
      const matchesAudio = !audioUrl || ep.enclosureUrl === audioUrl
      if (!matchesAudio) continue
      const tx = (ep.transcripts ?? []).find(t => t.url)
      if (tx?.url) {
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
        return res.status(200).json({ transcript_url: tx.url, type: tx.type ?? null })
      }
    }

    return res.status(404).json({ error: 'No transcript found in Podcast Index' })
  } catch (e) {
    return res.status(502).json({ error: String(e) })
  }
}
