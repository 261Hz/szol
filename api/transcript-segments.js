// api/transcript-segments.js — Vercel serverless function
//
// Fetches YouTube captions via public Invidious instances.
// WHY VERCEL, NOT RENDER:
//   Render's shared IPs are flagged by YouTube's bot detection.
//   Vercel runs on distributed AWS Lambda IPs, and Invidious instances
//   already handle YouTube's bot checks — they've solved this problem.
//
// Flow:
//   1. Try each Invidious instance until one returns caption data.
//   2. Return parsed segments in the same shape as the Render backend.
//   3. If no instance has captions (video has none), return 422 with
//      needs_whisper: true so the frontend can fall back to Render/Groq.
//
// Usage: GET /api/transcript-segments?v=VIDEO_ID&lang=en

// Public Invidious instances — tried in order, first success wins.
// These are community-run; add/remove as uptime changes.
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://iv.datura.network',
  'https://invidious.tiekoetter.com',
  'https://yt.cdaut.de',
]

// Parse a WebVTT timestamp (HH:MM:SS.mmm) into seconds.
function vttTime(ts) {
  const parts = ts.split(':')
  const secs  = parseFloat(parts.pop())
  const mins  = parseInt(parts.pop() ?? '0', 10)
  const hrs   = parseInt(parts.pop() ?? '0', 10)
  return hrs * 3600 + mins * 60 + secs
}

// Convert WebVTT caption text into [{text, start, duration}] entries.
function parseVTT(vtt) {
  const entries = []
  // Each cue: timestamp line followed by one or more text lines, separated by blank lines.
  const cues = vtt.split(/\n{2,}/)
  for (const cue of cues) {
    const lines  = cue.trim().split('\n')
    const timeLine = lines.find(l => l.includes(' --> '))
    if (!timeLine) continue
    const [startStr, endStr] = timeLine.split(' --> ')
    const start    = vttTime(startStr.trim())
    const end      = vttTime(endStr.trim().split(' ')[0]) // strip positioning cues
    const textLines = lines.filter(l => l !== timeLine && !l.match(/^\d+$/) && l.trim())
    const text      = textLines.join(' ')
      .replace(/<[^>]+>/g, '')   // strip VTT inline tags <c>, <b>, timestamps
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .trim()
    if (text && end > start) entries.push({ text, start, duration: end - start })
  }
  return entries
}

// Merge raw entries into ~15-word segments with second-level timestamps.
function buildSegments(entries, words = 15) {
  const segments = []
  let cur = { s: 0, e: 0, w: [] }
  for (const { text, start, duration } of entries) {
    if (!text) continue
    const sMs = Math.round(start * 1000)
    const eMs = Math.round((start + duration) * 1000)
    if (!cur.w.length) cur.s = sMs
    cur.e = eMs
    cur.w.push(...text.split(/\s+/).filter(Boolean))
    if (cur.w.length >= words) {
      segments.push({ start: Math.round(cur.s / 1000), end: Math.round(cur.e / 1000), text: cur.w.join(' ') })
      cur = { s: 0, e: 0, w: [] }
    }
  }
  if (cur.w.length) segments.push({ start: Math.round(cur.s / 1000), end: Math.round(cur.e / 1000), text: cur.w.join(' ') })
  return segments
}

// Try one Invidious instance. Returns null on any failure.
async function tryInstance(base, videoId, lang) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)

  try {
    // Step 1: get video metadata + caption track list.
    const infoRes = await fetch(
      `${base}/api/v1/videos/${videoId}?fields=title,captions`,
      { signal: controller.signal, headers: { 'User-Agent': 'szol-app/1.0' } }
    )
    if (!infoRes.ok) return null
    const info = await infoRes.json()

    const tracks = info.captions ?? []
    if (!tracks.length) return { noCaption: true, title: info.title }

    // Step 2: pick best caption track.
    // Prefer exact lang match → same 2-char prefix → any non-auto → any.
    const langBase = lang.slice(0, 2)
    const isAuto   = t => /auto/i.test(t.label ?? '')
    const pick =
      tracks.find(t => t.language_code === lang) ??
      tracks.find(t => t.language_code?.startsWith(langBase) && !isAuto(t)) ??
      tracks.find(t => t.language_code === 'en' && !isAuto(t)) ??
      tracks.find(t => !isAuto(t)) ??
      tracks[0]

    // Step 3: fetch the caption VTT.
    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`
    const capRes = await fetch(capUrl, { signal: controller.signal })
    if (!capRes.ok) return null

    const vtt     = await capRes.text()
    const entries = parseVTT(vtt)
    if (!entries.length) return null

    return {
      entries,
      isAuto:   isAuto(pick),
      lang:     pick.language_code ?? lang,
      title:    info.title ?? `YouTube: ${videoId}`,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  const { v: videoId, lang = 'en' } = req.query

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ detail: 'Invalid video ID.' })
  }

  let noCaption = false
  let lastTitle = `YouTube: ${videoId}`

  for (const base of INVIDIOUS) {
    const result = await tryInstance(base, videoId, lang)
    if (!result) continue                      // instance unreachable / error
    if (result.noCaption) {
      noCaption = true
      lastTitle = result.title ?? lastTitle
      continue                                 // instance responded but no captions
    }

    const segments = buildSegments(result.entries)
    if (!segments.length) continue

    // Cache on Vercel CDN for 24 h — caption content doesn't change.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({
      video_id:         videoId,
      title:            result.title,
      lang:             result.lang,
      is_autogenerated: result.isAuto,
      segments,
    })
  }

  // All instances tried — either no captions or all unreachable.
  // needs_whisper: true tells the frontend to call the Render backend (Groq fallback).
  return res.status(422).json({
    detail:        noCaption ? 'no_captions' : 'All caption sources unavailable.',
    needs_whisper: true,
  })
}
