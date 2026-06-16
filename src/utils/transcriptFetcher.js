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
  'https://invidious.jing.rocks',
  'https://inv.riverside.rocks',
  'https://invidious.privacydev.net',
  'https://yt.artemislena.eu',
  'https://invidious.perennialte.ch',
  'https://invidious.slipfox.xyz',
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

function pickTrack(tracks, lang) {
  const base   = lang.slice(0, 2)
  const isAuto = t => /auto/i.test(t.label ?? '')
  // Invidious /api/v1/captions/:id returns "languageCode" (camelCase) per the docs,
  // but /api/v1/videos/:id returns "language_code" (snake_case). Support both.
  const lc = t => t.languageCode ?? t.language_code ?? ''
  return tracks.find(t => lc(t) === lang && !isAuto(t))
    ?? tracks.find(t => lc(t).startsWith(base) && !isAuto(t))
    ?? tracks.find(t => lc(t) === 'en' && !isAuto(t))
    ?? tracks.find(t => !isAuto(t))
    ?? tracks[0]
}

// ── YouTube timedtext (direct, no proxy needed) ───────────────────────────────
// YouTube's timedtext API is reachable from the browser with CORS headers intact
// on some responses (e.g. auto-generated captions for embeddable videos).
// We try json3 first (word-level timestamps) then VTT; first working variant wins.
async function tryYouTubeTimedtext(videoId, lang) {
  const base  = lang.slice(0, 2)
  const langs = base === 'en' ? ['en'] : [base, 'en']
  const variants = langs.flatMap(l => [
    { qs: `v=${videoId}&lang=${l}&kind=asr&fmt=json3`, isJson3: true },
    { qs: `v=${videoId}&lang=${l}&kind=asr&fmt=vtt`,   isJson3: false },
    { qs: `v=${videoId}&lang=${l}&fmt=vtt`,            isJson3: false },
  ])
  for (const { qs, isJson3 } of variants) {
    try {
      const r = await fetch(`https://www.youtube.com/api/timedtext?${qs}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) continue
      const text = await r.text()
      if (!text.trim()) continue

      let entries = []
      let words   = null
      if (isJson3) {
        try {
          const j = JSON.parse(text)
          if (j?.events) {
            words = parseJson3(j)
            for (const ev of j.events) {
              if (!ev.segs) continue
              const t = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
              if (t) entries.push({ text: t, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
            }
          }
        } catch {}
      } else {
        entries = parseVTT(text)
      }
      if (entries.length) return { entries, isAuto: true, lang: base, title: null, words }
    } catch {}
  }
  return null
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

    // Some Invidious instances return an empty track list even when captions exist
    // (the list endpoint fails but direct caption serving still works).
    // When empty, probe common label/lang params before giving up.
    if (!tracks.length) {
      const baseLang = lang.slice(0, 2)
      const probes = [
        `lang=${encodeURIComponent(baseLang)}`,
        `label=${encodeURIComponent(baseLang)}`,
        `label=${encodeURIComponent(lang)}`,
        `label=${encodeURIComponent('English (auto-generated)')}`,
        `label=${encodeURIComponent('English')}`,
      ]
      for (const qs of probes) {
        try {
          const probeUrl = `${base}/api/v1/captions/${videoId}?${qs}`
          const pr = await fetch(probeUrl, { signal: ac.signal })
          if (!pr.ok) continue
          const text = await pr.text()
          if (!text.includes('-->')) continue
          const entries = parseVTT(text)
          if (!entries.length) continue
          let words = null
          try {
            const j3url = new URL(probeUrl)
            j3url.searchParams.set('fmt', 'json3')
            const j3res = await fetch(j3url.toString(), { signal: ac.signal })
            if (j3res.ok) {
              const j3 = await j3res.json().catch(() => null)
              if (j3?.events) words = parseJson3(j3)
            }
          } catch {}
          let title = `YouTube: ${videoId}`
          try {
            const ir = await fetch(`${base}/api/v1/videos/${videoId}?fields=title`, { signal: ac.signal })
            if (ir.ok) title = (await ir.json()).title ?? title
          } catch {}
          return { entries, isAuto: qs.includes('auto'), lang: baseLang, title, words }
        } catch {}
      }
      return { noCaption: true }
    }

    const pick   = pickTrack(tracks, lang)
    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`

    // Fetch json3 and save the raw text. Some instances ignore ?fmt=json3 and
    // return VTT; others return json3 for ?label=X without any fmt param.
    // We need to try both interpretations on both responses.
    let words  = null
    let j3Data = null
    let j3Text = ''
    try {
      const j3url = new URL(capUrl)
      j3url.searchParams.set('fmt', 'json3')
      const j3res = await fetch(j3url.toString(), { signal: ac.signal })
      if (j3res.ok) {
        j3Text = await j3res.text()
        try { j3Data = JSON.parse(j3Text) } catch {}
        if (j3Data?.events) words = parseJson3(j3Data)
      }
    } catch {}

    // Wrap in try/catch: some instances redirect the label-based caption URL to
    // YouTube's timedtext API which has no CORS headers → fetch throws TypeError.
    let capText = ''
    try {
      const capRes = await fetch(capUrl, { signal: ac.signal })
      if (capRes.ok) capText = await capRes.text()
    } catch {}

    // When both are empty (empty body OR CORS-redirect to YouTube), try lang-based
    // alternatives. Some instances serve captions differently for ?lang=X vs ?label=X.
    if (!capText.trim() && !j3Text.trim()) {
      const baseLang = lang.slice(0, 2)
      for (const qs of [`lang=${baseLang}&fmt=json3`, `lang=en&fmt=json3`,
                        `lang=${baseLang}&fmt=vtt`,   `lang=en&fmt=vtt`,
                        `lang=${baseLang}`,            `lang=en`]) {
        try {
          const pr = await fetch(`${base}/api/v1/captions/${videoId}?${qs}`, { signal: ac.signal })
          if (!pr.ok) continue
          const t = await pr.text()
          if (!t.trim()) continue
          if (qs.includes('fmt=json3')) {
            j3Text = t
            try { j3Data = JSON.parse(j3Text) } catch {}
            if (j3Data?.events) words = parseJson3(j3Data)
          } else {
            capText = t
          }
          break
        } catch {}
      }
    }

    if (!capText.trim() && !j3Text.trim()) return null

    // Try all format interpretations in sequence:
    let entries = parseVTT(capText)                                 // capText is VTT

    if (!entries.length) {
      // capText is json3 (Invidious proxied YouTube's default ASR format)
      try {
        const j = JSON.parse(capText)
        if (j?.events) {
          if (!words) words = parseJson3(j)
          for (const ev of j.events) {
            if (!ev.segs) continue
            const t = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
            if (t) entries.push({ text: t, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
          }
        }
      } catch {}
    }

    if (!entries.length && j3Data?.events) {
      // json3 URL gave proper json3; capText was something else
      for (const ev of j3Data.events) {
        if (!ev.segs) continue
        const t = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
        if (t) entries.push({ text: t, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
      }
    }

    if (!entries.length && j3Text.includes('-->')) {
      // json3 URL returned VTT (instance ignored ?fmt=json3)
      entries = parseVTT(j3Text)
    }

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

// ── Vercel same-origin proxy ──────────────────────────────────────────────────
// Invidious redirects caption content to signed YouTube timedtext URLs.
// The browser cannot follow that redirect (CORS). Our own /api/captions-proxy
// fetches server-side (no CORS) and returns the raw VTT or json3 body.
async function tryViaServerProxy(videoId, lang) {
  try {
    const r = await fetch(
      `/api/captions-proxy?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`,
      { signal: AbortSignal.timeout(20000) },
    )
    if (!r.ok) return null
    const text = await r.text()
    if (!text.trim()) return null

    const base2   = lang.slice(0, 2)
    let entries   = []
    let words     = null

    if (text.trimStart().startsWith('{')) {
      try {
        const j = JSON.parse(text)
        if (j?.events) {
          words = parseJson3(j)
          for (const ev of j.events) {
            if (!ev.segs) continue
            const t = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
            if (t) entries.push({ text: t, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
          }
        }
      } catch {}
    } else {
      entries = parseVTT(text)
    }

    if (!entries.length) return null
    return { entries, isAuto: true, lang: base2, title: null, words }
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch YouTube captions from the browser. Tries in parallel:
 *   1. YouTube timedtext API directly (fast; works when CORS headers present)
 *   2. /api/captions-proxy — Vercel proxies Invidious server-side (no CORS)
 *   3. Direct Invidious instances (belt-and-suspenders; most are CORS-blocked)
 * Returns { entries, isAuto, lang, title, words } on success, null if all fail.
 */
export async function fetchCaptionsFromBrowser(videoId, lang) {
  const result = await Promise.any([
    tryYouTubeTimedtext(videoId, lang).then(r => { if (!r) throw new Error('miss'); return r }),
    tryViaServerProxy(videoId, lang).then(r => { if (!r) throw new Error('miss'); return r }),
    ...INVIDIOUS.map(async base => {
      const r = await tryInstance(base, videoId, lang)
      if (!r || r.noCaption) throw new Error('miss')
      return r
    }),
  ]).catch(() => null)
  return result
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
