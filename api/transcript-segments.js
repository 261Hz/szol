// api/transcript-segments.js — Vercel serverless function
//
// Fetches YouTube captions without going through Render's flagged server IPs.
// Two-stage approach:
//   Stage 1: Invidious public instances — dedicated /api/v1/captions/{id} endpoint.
//   Stage 2: Direct YouTube watch-page scrape — extracts captionTracks from
//            ytInitialPlayerResponse JSON embedded in the HTML. Works from
//            Vercel's distributed AWS Lambda IPs even when Render's IPs are blocked.
//
// Returns needs_whisper: true only when a source confirms the video has NO captions
// (so the frontend knows to call Render for Groq Whisper audio transcription).
//
// Usage: GET /api/transcript-segments?v=VIDEO_ID&lang=en

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://iv.datura.network',
  'https://invidious.tiekoetter.com',
  'https://yt.cdaut.de',
]

// ── Caption parsers ───────────────────────────────────────────────────────────

function vttTime(ts) {
  const parts = ts.trim().split(':')
  const secs  = parseFloat(parts.pop() ?? '0')
  const mins  = parseInt(parts.pop() ?? '0', 10)
  const hrs   = parseInt(parts.pop() ?? '0', 10)
  return hrs * 3600 + mins * 60 + secs
}

function parseVTT(vtt) {
  const entries = []
  for (const cue of vtt.split(/\n{2,}/)) {
    const lines    = cue.trim().split('\n')
    const timeLine = lines.find(l => l.includes(' --> '))
    if (!timeLine) continue
    const [startStr, endStr] = timeLine.split(' --> ')
    const start    = vttTime(startStr)
    const end      = vttTime(endStr.split(' ')[0])
    const text     = lines
      .filter(l => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .trim()
    if (text && end > start) entries.push({ text, start, duration: end - start })
  }
  return entries
}

function parseJson3(data) {
  const entries = []
  for (const ev of data.events ?? []) {
    if (!ev.segs) continue
    const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
    if (text) entries.push({ text, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
  }
  return entries
}

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
  if (cur.w.length)
    segments.push({ start: Math.round(cur.s / 1000), end: Math.round(cur.e / 1000), text: cur.w.join(' ') })
  return segments
}

// ── Caption source: Invidious ─────────────────────────────────────────────────

function pickTrack(tracks, lang) {
  const langBase = lang.slice(0, 2)
  const isAuto   = t => /auto/i.test(t.label ?? '')
  return tracks.find(t => t.language_code === lang)
    ?? tracks.find(t => t.language_code?.startsWith(langBase) && !isAuto(t))
    ?? tracks.find(t => t.language_code === 'en' && !isAuto(t))
    ?? tracks.find(t => !isAuto(t))
    ?? tracks[0]
}

async function tryInvidious(base, videoId, lang) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 6000)
  try {
    // Use the dedicated captions endpoint (more reliable than video?fields=captions).
    const r = await fetch(`${base}/api/v1/captions/${videoId}`, {
      signal: ac.signal, headers: { 'User-Agent': 'szol-app/1.0' },
    })
    if (!r.ok) return null
    const data   = await r.json()
    const tracks = data.captions ?? []
    if (!tracks.length) return { noCaption: true }

    const pick   = pickTrack(tracks, lang)
    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`
    const capRes = await fetch(capUrl, { signal: ac.signal })
    if (!capRes.ok) return null

    const vtt     = await capRes.text()
    const entries = parseVTT(vtt)
    if (!entries.length) return null

    // Fetch title separately (captions endpoint doesn't include it).
    let title = `YouTube: ${videoId}`
    try {
      const ir = await fetch(`${base}/api/v1/videos/${videoId}?fields=title`, { signal: ac.signal })
      if (ir.ok) title = (await ir.json()).title ?? title
    } catch { /* non-fatal */ }

    return { entries, isAuto: /auto/i.test(pick.label ?? ''), lang: pick.language_code ?? lang, title }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Caption source: direct YouTube watch page ─────────────────────────────────
// Extracts captionTracks URLs from ytInitialPlayerResponse embedded in HTML.
// Works from Vercel's IPs (AWS Lambda, diverse ranges, not flagged like Render).

async function tryYouTubeDirect(videoId, lang) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10000)
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      signal:  ac.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!r.ok) return null
    const html = await r.text()

    // captionTracks array is embedded in the serialised ytInitialPlayerResponse.
    const match = html.match(/"captionTracks":\s*(\[[\s\S]*?\])\s*,\s*"audioTracks"/)
    if (!match) return { noCaption: true }

    let tracks
    try { tracks = JSON.parse(match[1]) } catch { return null }
    if (!tracks.length) return { noCaption: true }

    // Pick best track: prefer requested lang non-ASR, fallback to any.
    const langBase = lang.slice(0, 2)
    const pick = tracks.find(t => t.languageCode === lang && !t.kind)
      ?? tracks.find(t => t.languageCode?.startsWith(langBase) && !t.kind)
      ?? tracks.find(t => t.languageCode === 'en' && !t.kind)
      ?? tracks.find(t => !t.kind)
      ?? tracks[0]

    // baseUrl already has auth params; append fmt=json3 for timed JSON.
    const capUrl = `${pick.baseUrl}&fmt=json3`
    const capRes = await fetch(capUrl, { signal: ac.signal })
    if (!capRes.ok) return null

    const capData = await capRes.json()
    const entries = parseJson3(capData)
    if (!entries.length) return null

    // Extract title from the same HTML blob.
    let title = `YouTube: ${videoId}`
    const titleMatch = html.match(/"title":\s*\{"runs":\s*\[.*?"text":\s*"([^"]+)"/)
      ?? html.match(/<title>([^<]+)<\/title>/)
    if (titleMatch) title = titleMatch[1].replace(/ - YouTube$/, '').trim()

    return { entries, isAuto: pick.kind === 'asr', lang: pick.languageCode ?? lang, title }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { v: videoId, lang = 'en' } = req.query

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ detail: 'Invalid video ID.' })
  }

  let confirmedNoCaption = false

  // Stage 1: try Invidious instances.
  for (const base of INVIDIOUS) {
    const result = await tryInvidious(base, videoId, lang)
    if (!result) continue
    if (result.noCaption) { confirmedNoCaption = true; continue }

    const segments = buildSegments(result.entries)
    if (!segments.length) continue

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json({
      video_id: videoId, title: result.title, lang: result.lang,
      is_autogenerated: result.isAuto, segments,
    })
  }

  // Stage 2: direct YouTube watch-page extraction (different IP pool, may succeed).
  if (!confirmedNoCaption) {
    const result = await tryYouTubeDirect(videoId, lang)
    if (result && !result.noCaption) {
      const segments = buildSegments(result.entries)
      if (segments.length) {
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
        return res.status(200).json({
          video_id: videoId, title: result.title, lang: result.lang,
          is_autogenerated: result.isAuto, segments,
        })
      }
    }
    if (result?.noCaption) confirmedNoCaption = true
  }

  // Signal to frontend: needs_whisper means Groq fallback; we only set it when
  // at least one source confirmed no captions exist.
  return res.status(422).json({
    detail:        confirmedNoCaption ? 'no_captions' : 'Could not reach any caption source. Try again.',
    needs_whisper: confirmedNoCaption,
  })
}
