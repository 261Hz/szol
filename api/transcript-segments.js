// api/transcript-segments.js — Vercel serverless function
//
// Fetches YouTube captions without going through Render's flagged server IPs.
// Two-stage approach:
//   Stage 1: Invidious public instances — dedicated /api/v1/captions/{id} endpoint.

import { requireAuth } from './_auth.js'
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
  // Line-by-line scan: YouTube ASR VTT puts a blank line between the timestamp
  // and the text, so block-splitting misses every cue.
  const entries = []
  const lines   = vtt.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    if (!lines[i].includes(' --> ')) { i++; continue }
    const [startStr, endRest] = lines[i].split(' --> ')
    const start = vttTime(startStr)
    const end   = vttTime(endRest.split(' ')[0])
    i++
    while (i < lines.length && lines[i].trim() === '') i++  // skip blank gap
    const textLines = []
    while (i < lines.length && lines[i].trim() !== '') {
      const l = lines[i].trim()
      if (!/^\d+$/.test(l)) textLines.push(l)
      i++
    }
    let text = textLines.join(' ')
    let _p; do { _p = text; text = text.replace(/<[^<>]*>/g, '') } while (text !== _p)
    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
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
  const lc       = t => t.languageCode ?? t.language_code ?? ''
  return tracks.find(t => lc(t) === lang && !isAuto(t))
    ?? tracks.find(t => lc(t).startsWith(langBase) && !isAuto(t))
    ?? tracks.find(t => lc(t) === 'en' && !isAuto(t))
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

    // Some instances return an empty track list even when captions exist.
    // Probe common labels before giving up.
    if (!tracks.length) {
      const baseLang = lang.slice(0, 2)
      const probes   = [
        `lang=${baseLang}`,
        `label=English+%28auto-generated%29`,
        `label=English`,
        `label=${encodeURIComponent(lang)}`,
      ]
      for (const qs of probes) {
        try {
          const pr = await fetch(`${base}/api/v1/captions/${videoId}?${qs}`, { signal: ac.signal })
          if (!pr.ok) continue
          const text = await pr.text()
          if (!text.includes('-->')) continue
          const entries = parseVTT(text)
          if (!entries.length) continue
          return { entries, isAuto: qs.includes('auto'), lang: baseLang, title: `YouTube: ${videoId}` }
        } catch {}
      }
      return { noCaption: true }
    }

    const pick   = pickTrack(tracks, lang)
    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`

    // Try json3 first — no VTT blank-line format issues.
    let entries = null
    try {
      const j3url = new URL(capUrl)
      j3url.searchParams.set('fmt', 'json3')
      const j3res = await fetch(j3url.toString(), { signal: ac.signal })
      if (j3res.ok) {
        const j3 = await j3res.json().catch(() => null)
        if (j3?.events) {
          entries = j3.events
            .filter(ev => ev.segs)
            .map(ev => ({
              text:     ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim(),
              start:    ev.tStartMs / 1000,
              duration: (ev.dDurationMs ?? 2000) / 1000,
            }))
            .filter(e => e.text)
        }
      }
    } catch {}

    // Fall back to VTT.
    if (!entries?.length) {
      const capRes = await fetch(capUrl, { signal: ac.signal })
      if (!capRes.ok) return null
      const vtt = await capRes.text()
      entries = parseVTT(vtt)
    }

    if (!entries?.length) return null

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

// ── Caption source: YouTube Innertube API ────────────────────────────────────
// POST /youtubei/v1/player with the public WEB client context.
// Returns structured JSON with captionTracks[].baseUrl — no HTML scraping needed.
// More reliable than the watch-page scrape because it's a real API endpoint.

async function tryYouTubeInnertube(videoId, lang) {
  // iOS client (id 5) is what yt-dlp defaults to from non-browser IPs — YouTube's
  // mobile-app pipeline is less aggressively bot-checked than the WEB client.
  // ANDROID (id 3) is the next best option; WEB is last resort.
  const clients = [
    {
      url: 'https://www.youtube.com/youtubei/v1/player?key=***YT_KEY_IOS***&prettyPrint=false',
      headers: {
        'Content-Type':             'application/json',
        'User-Agent':               'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
        'X-YouTube-Client-Name':    '5',
        'X-YouTube-Client-Version': '19.09.3',
      },
      client: { clientName: 'IOS', clientVersion: '19.09.3', deviceModel: 'iPhone14,3', hl: 'en', gl: 'US',
                userAgent: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)' },
    },
    {
      url: 'https://www.youtube.com/youtubei/v1/player?key=***YT_KEY_ANDROID***&prettyPrint=false',
      headers: {
        'Content-Type':             'application/json',
        'User-Agent':               'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name':    '3',
        'X-YouTube-Client-Version': '19.09.37',
      },
      client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' },
    },
    {
      url: 'https://www.youtube.com/youtubei/v1/player?key=***YT_KEY_WEB***&prettyPrint=false',
      headers: {
        'Content-Type':             'application/json',
        'User-Agent':               'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name':    '1',
        'X-YouTube-Client-Version': '2.20241201.01.00',
        'Origin':                   'https://www.youtube.com',
        'Referer':                  `https://www.youtube.com/watch?v=${videoId}`,
      },
      client: { clientName: 'WEB', clientVersion: '2.20241201.01.00', hl: 'en', gl: 'US' },
    },
  ]

  const langBase = lang.slice(0, 2)
  let gotValidResponse = false

  for (const ctx of clients) {
    try {
      const r = await fetch(ctx.url, {
        method:  'POST',
        signal:  AbortSignal.timeout(8000),
        headers: ctx.headers,
        // contentCheckOk + racyCheckOk: skip YouTube's content-rating redirect.
        // thirdParty.embedUrl: tells YouTube this is an embedded-player request —
        // without this, captionTracks is often absent from server-IP responses.
        body: JSON.stringify({
          videoId,
          contentCheckOk: true,
          racyCheckOk:    true,
          context: {
            client:     ctx.client,
            thirdParty: { embedUrl: `https://www.youtube.com/embed/${videoId}` },
          },
        }),
      })
      if (!r.ok) continue
      const data = await r.json().catch(() => null)
      if (!data) continue

      // We got a parseable JSON response — this client reached YouTube.
      gotValidResponse = true

      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
      if (!tracks.length) continue  // try next client before giving up

      const pick = tracks.find(t => t.languageCode === lang && t.kind !== 'asr')
        ?? tracks.find(t => t.languageCode?.startsWith(langBase) && t.kind !== 'asr')
        ?? tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
        ?? tracks.find(t => t.kind !== 'asr')
        ?? tracks[0]
      if (!pick?.baseUrl) continue

      // Try json3 first (richer structure); fall back to VTT.
      let entries = []
      try {
        const j3res = await fetch(`${pick.baseUrl}&fmt=json3`, { signal: AbortSignal.timeout(6000) })
        if (j3res.ok) entries = parseJson3(await j3res.json())
      } catch {}
      if (!entries.length) {
        const vttRes = await fetch(`${pick.baseUrl}&fmt=vtt`, { signal: AbortSignal.timeout(6000) })
        if (!vttRes.ok) continue
        entries = parseVTT(await vttRes.text())
      }
      if (!entries.length) continue

      const title = data?.videoDetails?.title ?? `YouTube: ${videoId}`
      return { entries, isAuto: pick.kind === 'asr', lang: pick.languageCode ?? lang, title }
    } catch { /* try next client */ }
  }
  // Only report noCaption if YouTube actually responded (not a network failure).
  return gotValidResponse ? { noCaption: true } : null
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
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        // CONSENT cookie bypasses the Google EU consent gate that blocks ytInitialPlayerResponse
        'Cookie':          'CONSENT=YES+1; SOCS=CAE=',
      },
    })
    if (!r.ok) return null
    const html = await r.text()

    // If we got a consent/bot-detection page there'll be no ytInitialPlayerResponse.
    // Return null (uncertain) rather than noCaption — we can't distinguish a bot
    // wall from a video with no captions when the full player JSON is missing.
    if (!html.includes('ytInitialPlayerResponse')) return null

    // Extract captionTracks array using bracket counting — regex fails on nested JSON.
    const marker = '"captionTracks":'
    const mi     = html.indexOf(marker)
    if (mi === -1) return { noCaption: true }
    const arrStart = html.indexOf('[', mi + marker.length)
    if (arrStart === -1) return { noCaption: true }
    let depth = 0, pos = arrStart
    while (pos < html.length) {
      const ch = html[pos]
      if (ch === '[' || ch === '{') depth++
      else if (ch === ']' || ch === '}') { if (--depth === 0) break }
      pos++
    }
    let tracks
    try { tracks = JSON.parse(html.slice(arrStart, pos + 1)) } catch { return null }
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
  if (!requireAuth(req, res)) return
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

  // Stage 2: Innertube API — proper POST endpoint, not scraping, works from server IPs.
  {
    const result = await tryYouTubeInnertube(videoId, lang)
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

  // Stage 3: direct YouTube watch-page extraction — always try, regardless of what
  // Invidious reported. Invidious frequently gives false "no captions" results;
  // YouTube's own page is authoritative since it contains the actual captionTracks URLs.
  {
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
