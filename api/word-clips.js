// api/word-clips.js — Vercel serverless function
//
// Fetches YouTube caption entries for a list of video IDs and returns segments
// where the target word appears. Called by the Render backend when its datacenter
// IP is bot-detected by YouTube — Vercel's Lambda IPs are not flagged.
//
// Usage: GET /api/word-clips?word=town&lang=en&video_ids=id1,id2,id3

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
  const lines   = vtt.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    if (!lines[i].includes(' --> ')) { i++; continue }
    const [startStr, endRest] = lines[i].split(' --> ')
    const start = vttTime(startStr)
    const end   = vttTime(endRest.split(' ')[0])
    i++
    while (i < lines.length && lines[i].trim() === '') i++
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

function parseJson3(data) {
  const entries = []
  for (const ev of data.events ?? []) {
    if (!ev.segs) continue
    const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
    if (text) entries.push({ text, start: ev.tStartMs / 1000, duration: (ev.dDurationMs ?? 2000) / 1000 })
  }
  return entries
}

// ── Word matching ─────────────────────────────────────────────────────────────

function containsWord(target, text, lang) {
  const base = lang.slice(0, 2)
  const t = target.trim().toLowerCase()
  const s = text.toLowerCase()
  if (!t) return false
  if (['zh', 'ja', 'ko', 'th'].includes(base)) return s.includes(t)
  return new RegExp('(?<![\\w])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])').test(s)
}

// ── Caption source: YouTube Innertube API ─────────────────────────────────────

async function tryYouTubeInnertube(videoId, lang) {
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

      gotValidResponse = true

      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
      if (!tracks.length) continue

      const pick = tracks.find(t => t.languageCode === lang && t.kind !== 'asr')
        ?? tracks.find(t => t.languageCode?.startsWith(langBase) && t.kind !== 'asr')
        ?? tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
        ?? tracks.find(t => t.kind !== 'asr')
        ?? tracks[0]
      if (!pick?.baseUrl) continue

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

      return { entries, lang: pick.languageCode ?? lang }
    } catch {}
  }
  return gotValidResponse ? { noCaption: true } : null
}

// ── Caption source: direct YouTube watch page ─────────────────────────────────

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
        'Cookie':          'CONSENT=YES+1; SOCS=CAE=',
      },
    })
    if (!r.ok) return null
    const html = await r.text()
    if (!html.includes('ytInitialPlayerResponse')) return null

    const marker   = '"captionTracks":'
    const mi       = html.indexOf(marker)
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

    const langBase = lang.slice(0, 2)
    const pick = tracks.find(t => t.languageCode === lang && !t.kind)
      ?? tracks.find(t => t.languageCode?.startsWith(langBase) && !t.kind)
      ?? tracks.find(t => t.languageCode === 'en' && !t.kind)
      ?? tracks.find(t => !t.kind)
      ?? tracks[0]

    const capRes = await fetch(`${pick.baseUrl}&fmt=json3`, { signal: ac.signal })
    if (!capRes.ok) return null
    const entries = parseJson3(await capRes.json())
    if (!entries.length) return null

    return { entries, lang: pick.languageCode ?? lang }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { word, lang = 'en', video_ids } = req.query

  if (!word?.trim() || !video_ids?.trim()) {
    return res.status(400).json({ detail: 'word and video_ids are required' })
  }

  const ids      = video_ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)
  const MAX_CLIPS = 8

  const clips = []

  for (const videoId of ids) {
    if (clips.length >= MAX_CLIPS) break
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) continue

    let result = await tryYouTubeInnertube(videoId, lang)
    if (!result || result.noCaption) {
      result = await tryYouTubeDirect(videoId, lang)
    }
    if (!result || result.noCaption || !result.entries?.length) {
      console.log(`[word-clips] ${videoId}: no captions (result=${JSON.stringify(result?.noCaption)})`)
      continue
    }

    console.log(`[word-clips] ${videoId}: ${result.entries.length} entries, searching for "${word}"`)
    let found = 0
    for (const entry of result.entries) {
      if (clips.length >= MAX_CLIPS) break
      const text = entry.text?.replace(/\n/g, ' ').trim() || ''
      if (!text || !containsWord(word, text, lang)) continue
      clips.push({
        video_id:  videoId,
        start_sec: Math.floor(entry.start),
        end_sec:   Math.floor(entry.start + Math.max(2, entry.duration ?? 3)),
        context:   text,
      })
      found++
    }
    console.log(`[word-clips] ${videoId}: found ${found} clips`)
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  return res.status(200).json(clips)
}
