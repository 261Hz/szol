// transcriptFetcher.js — caption parsers and YouTube Data API metadata helper.

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

export function parseVTT(vtt) {
  // Line-by-line scan rather than split-on-blank-lines.
  // YouTube ASR VTT puts a blank line between the timestamp and its text, so
  // block-splitting would put them in separate chunks and miss every cue.
  const entries = []
  const lines   = vtt.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    if (!lines[i].includes(' --> ')) { i++; continue }
    const [a, bRest] = lines[i].split(' --> ')
    const start = vttTime(a)
    const end   = vttTime(bRest.split(' ')[0])
    i++
    while (i < lines.length && lines[i].trim() === '') i++  // skip blank gap
    const textLines = []
    while (i < lines.length && lines[i].trim() !== '') {
      const l = lines[i].trim()
      if (!/^\d+$/.test(l)) textLines.push(l)
      i++
    }
    const text = textLines.join(' ')
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
