// transcriptFetcher.js — client-side YouTube caption fetcher.
//
// Why client-side: requests come from the user's real browser IP —
// no datacenter bot-detection, no auth wall, no yt-dlp needed.
//
// Sources tried in order:
//   1. Public Invidious instances (CORS-enabled APIs, already bypass YouTube).
//   2. Caller decides what to do if all fail (e.g. Vercel fn → Render Whisper).

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://iv.datura.network',
  'https://invidious.tiekoetter.com',
  'https://yt.cdaut.de',
  'https://invidious.private.coffee',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
]

// ── YouTube Data API (official, CORS ✓, browser-callable) ────────────────────

export async function fetchVideoMetadata(videoId) {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY
  if (!key) return null
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${key}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) return null
    const item = (await r.json()).items?.[0]?.snippet
    if (!item) return null
    return { title: item.title, channel: item.channelTitle }
  } catch {
    return null
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function vttTime(ts) {
  const parts = ts.trim().split(':')
  const s = parseFloat(parts.pop() ?? '0')
  const m = parseInt(parts.pop() ?? '0', 10)
  const h = parseInt(parts.pop() ?? '0', 10)
  return h * 3600 + m * 60 + s
}

function parseVTT(vtt) {
  const entries = []
  for (const cue of vtt.split(/\n{2,}/)) {
    const lines    = cue.trim().split('\n')
    const timeLine = lines.find(l => l.includes(' --> '))
    if (!timeLine) continue
    const [a, b] = timeLine.split(' --> ')
    const start  = vttTime(a)
    const end    = vttTime(b.split(' ')[0])
    const text   = lines
      .filter(l => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .trim()
    if (text && end > start) entries.push({ text, start, duration: end - start })
  }
  return entries
}

// Parse YouTube's json3 ASR format into a flat word-level timestamp array.
// Each event has a block start time; each seg has a relative offset within it.
export function parseJson3(data) {
  const words = []
  for (const event of data.events ?? []) {
    if (!event.segs) continue
    const blockStart = event.tStartMs ?? 0
    for (const seg of event.segs) {
      const raw  = (seg.utf8 ?? '').trim()
      if (!raw || raw === '\n') continue
      const start = (blockStart + (seg.tOffsetMs ?? 0)) / 1000
      const word  = raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
      if (!word) continue
      words.push({ word, raw, start: Math.round(start * 100) / 100 })
    }
  }
  return words
}

export function buildSegments(entries, words = 15) {
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

function pickTrack(tracks, lang) {
  const base   = lang.slice(0, 2)
  const isAuto = t => /auto/i.test(t.label ?? '')
  return tracks.find(t => t.language_code === lang && !isAuto(t))
    ?? tracks.find(t => t.language_code?.startsWith(base) && !isAuto(t))
    ?? tracks.find(t => t.language_code === 'en' && !isAuto(t))
    ?? tracks.find(t => !isAuto(t))
    ?? tracks[0]
}

// ── Invidious fetcher (client-side, CORS ✓) ───────────────────────────────────

async function tryInstance(base, videoId, lang) {
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10000)
  try {
    // Dedicated captions endpoint — returns track list with label, language_code, url.
    const r = await fetch(`${base}/api/v1/captions/${videoId}`, { signal: ac.signal })
    if (!r.ok) return null
    const data   = await r.json()
    const tracks = data.captions ?? []
    if (!tracks.length) return { noCaption: true }

    const pick   = pickTrack(tracks, lang)
    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`

    // Try json3 for word-level timestamps. Non-fatal: Invidious instances that
    // proxy YouTube's timedtext API pass through the fmt param; others don't.
    let words = null
    try {
      const j3url = new URL(capUrl)
      j3url.searchParams.set('fmt', 'json3')
      const j3res = await fetch(j3url.toString(), { signal: ac.signal })
      if (j3res.ok) {
        const j3 = await j3res.json().catch(() => null)
        if (j3?.events) words = parseJson3(j3)
      }
    } catch { /* instance doesn't support json3 */ }

    const capRes = await fetch(capUrl, { signal: ac.signal })
    if (!capRes.ok) return null

    const vtt     = await capRes.text()
    const entries = parseVTT(vtt)
    if (!entries.length) return null

    // Title is a separate request — non-fatal if it fails.
    let title = `YouTube: ${videoId}`
    try {
      const ir = await fetch(`${base}/api/v1/videos/${videoId}?fields=title`, { signal: ac.signal })
      if (ir.ok) title = (await ir.json()).title ?? title
    } catch { /* ignore */ }

    return { entries, isAuto: /auto/i.test(pick.label ?? ''), lang: pick.language_code ?? lang, title, words }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch YouTube captions for videoId+lang by trying public Invidious instances.
 * Returns:
 *   { entries, isAuto, lang, title }  — on success
 *   { noCaption: true }               — video confirmed to have no captions
 *   null                              — all instances unreachable (transient)
 */
export async function fetchCaptionsFromBrowser(videoId, lang) {
  let confirmedNoCaption = false
  for (const base of INVIDIOUS) {
    const result = await tryInstance(base, videoId, lang)
    if (!result) continue
    if (result.noCaption) { confirmedNoCaption = true; continue }
    return result
  }
  return confirmedNoCaption ? { noCaption: true } : null
}

/**
 * Download YouTube audio via Invidious proxy (browser-side, CORS ✓).
 * Invidious instances that proxy audio return URLs under their own domain,
 * so they have proper CORS headers and aren't IP-bound like raw YouTube CDN URLs.
 * Returns { blob, ext } or null if no instance could serve audio.
 */
export async function fetchYouTubeAudioBlob(videoId) {
  for (const base of INVIDIOUS) {
    try {
      // Strategy 1: /latest_version proxied stream (itag 140 = m4a audio).
      // Simpler than adaptive formats and more widely supported across instances.
      const streamUrl = `${base}/latest_version?id=${videoId}&itag=140`
      const streamBlob = await fetch(streamUrl, { signal: AbortSignal.timeout(10000) })
        .then(r => r.ok ? r.blob() : null).catch(() => null)
      if (streamBlob && streamBlob.size > 1000) return { blob: streamBlob, ext: 'm4a' }

      // Strategy 2: adaptive formats list, prefer proxy URLs (CORS-safe).
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), 8000)
      let formats
      try {
        const r = await fetch(`${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`, {
          signal: ac.signal,
        })
        clearTimeout(timer)
        if (!r.ok) continue
        formats = (await r.json()).adaptiveFormats ?? []
      } catch {
        clearTimeout(timer)
        continue
      }

      const audio = formats.filter(f => f.type?.includes('audio'))
      if (!audio.length) continue

      // Prefer proxy URLs (start with instance base) — these have CORS and aren't IP-bound.
      const proxyAudio = audio.filter(f => f.url?.startsWith(base))
      const pick = proxyAudio[0] ?? audio[0]
      if (!pick?.url) continue

      // Determine extension from MIME type.
      const mime = pick.type ?? 'audio/webm'
      const ext  = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'webm'

      const blob = await fetch(pick.url).then(r => r.ok ? r.blob() : null).catch(() => null)
      if (!blob || blob.size < 1000) continue
      return { blob, ext }
    } catch {
      continue
    }
  }
  return null
}
