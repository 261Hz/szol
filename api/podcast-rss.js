// api/podcast-rss.js — Vercel serverless function
//
// Fetches and parses a generic podcast RSS feed, returning the episode list.
// Called from the browser so it avoids the CORS issue of fetching RSS directly.
//

// Usage: GET /api/podcast-rss?url=https://example.com/feed.xml

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g
function stripCdata(s) { return s.replace(CDATA_RE, '$1').trim() }
function stripTags(s) {
  let out = s ?? ''
  let prev
  do { prev = out; out = out.replace(/<[^<>]*>/g, '') } while (out !== prev)
  return out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return m?.[1] ?? null
}

function textNode(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? stripTags(stripCdata(m[1])) : null
}

function parseDurationSec(d) {
  if (!d) return null
  const parts = d.trim().split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  const n = Number(d)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default async function handler(req, res) {
  const url = req.query.url
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ detail: 'Expected an http(s) URL.' })
  }

  let rssText
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'szol-app/1.0 (+https://szol.app)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
    })
    if (!r.ok) return res.status(502).json({ detail: `Feed returned ${r.status}.` })
    rssText = await r.text()
  } catch (e) {
    return res.status(502).json({ detail: 'Could not reach the feed URL.' })
  }

  // Channel-level metadata
  const channelM = rssText.match(/<channel>([\s\S]*?)<\/channel>/)
  const channelXml = channelM?.[1] ?? rssText
  const feedTitle = textNode(channelXml.slice(0, 500), 'title') ?? 'Podcast'
  const feedImage = (() => {
    const m = channelXml.slice(0, 2000).match(/<itunes:image[^>]+href="([^"]+)"/)
    return m?.[1] ?? null
  })()

  // Parse <item> blocks
  const episodes = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = itemRe.exec(rssText)) !== null) {
    const item    = m[1]
    const title   = textNode(item, 'title') ?? ''
    const encTag  = item.match(/<enclosure([^>]*?)\/?\s*>/i)?.[1] ?? ''
    const audioUrl = attr(encTag, 'url')
    if (!audioUrl) continue
    const type = attr(encTag, 'type') ?? ''
    if (type && !type.includes('audio') && !type.includes('mpeg') && !type.includes('mp3') && !type.includes('ogg')) continue

    const duration  = textNode(item, 'itunes:duration') ?? textNode(item, 'duration')
    const pubDate   = textNode(item, 'pubDate')
    const guid      = textNode(item, 'guid') ?? audioUrl

    // podcast:transcript namespace tag
    const txTag = item.match(/<podcast:transcript([^>]*?)\/?\s*>/i)?.[1] ?? ''
    const transcriptUrl = txTag ? attr(txTag, 'url') : null

    episodes.push({
      id:             guid,
      title,
      audio_url:      audioUrl,
      duration_sec:   parseDurationSec(duration),
      pub_date:       pubDate,
      transcript_url: transcriptUrl,
    })
  }

  if (!episodes.length) return res.status(404).json({ detail: 'No audio episodes found in this feed.' })

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  return res.status(200).json({ title: feedTitle, image: feedImage, episodes })
}
