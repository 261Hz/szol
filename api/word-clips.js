// api/word-clips.js — Vercel serverless function
//
// Returns YouTube caption clips where a word (or words) appears.
// Supports two call modes:
//   Single : GET /api/word-clips?word=town&lang=en&video_ids=id1,id2   → Clip[]
//   Multi  : GET /api/word-clips?words=town,city&lang=en&video_ids=id1 → { word: Clip[] }
//
// Caption sources are tried in priority order; exhausted or disabled sources
// are skipped.  All fetched captions are cached in module scope so one video
// serves many words without re-hitting any API.

// ── Invidious instance list ───────────────────────────────────────────────────

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

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g,       (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

// Normalise the diverse response shapes returned by RapidAPI caption services.
function parseRapidApiResponse(data, lang) {
  // Shape 1: flat array of segments  [{ text, start|offset, dur|duration }]
  // Shape 2: { subtitles|transcript|captions: [...] }
  // Shape 3: { data: { captions: [...] } }
  // youtube-transcript3: { success, transcript: [{ text, offset, duration, lang }] }
  const items = Array.isArray(data)
    ? data
    : data?.transcript ?? data?.subtitles ?? data?.captions
      ?? data?.data?.captions ?? data?.data?.subtitles ?? null
  if (!Array.isArray(items) || !items.length) return null
  const entries = items.map(it => ({
    text:     decodeHtmlEntities(String(it.text ?? it.utf8 ?? '').replace(/\n/g, ' ').trim()),
    // "offset" used by youtube-transcript3; "start" used by most others
    start:    parseFloat(it.offset ?? it.start ?? (it.tStartMs != null ? it.tStartMs / 1000 : 0)),
    duration: parseFloat(it.dur ?? it.duration ?? (it.dDurationMs != null ? it.dDurationMs / 1000 : 2)),
  })).filter(e => e.text && e.start >= 0)
  return entries.length ? { entries, lang } : null
}

// ── Word matching ─────────────────────────────────────────────────────────────

function containsWord(target, text) {
  const t = target.trim().toLowerCase()
  return t.length > 0 && text.toLowerCase().includes(t)
}

// ── Module-level state: caption cache + quota counters ────────────────────────
//
// Both persist across warm Lambda invocations (typically 5–30 min).
// Caption cache: videoId → { entries, lang, ts }
// Quota counts : sourceId → { count, month }   (month = "YYYY-M" UTC)

const _captionCache = new Map()
const _quota        = new Map()
const CAPTION_TTL   = 5 * 60 * 1000 // 5 min

function cacheGet(videoId) {
  const e = _captionCache.get(videoId)
  if (!e) return null
  if (Date.now() - e.ts > CAPTION_TTL) { _captionCache.delete(videoId); return null }
  return { entries: e.entries, lang: e.lang }
}

function cacheSet(videoId, entries, lang) {
  if (_captionCache.size >= 60) {
    const oldest = [..._captionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    _captionCache.delete(oldest[0])
  }
  _captionCache.set(videoId, { entries, lang, ts: Date.now() })
}

function quotaMonth() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`
}

function quotaUsed(id) {
  const e = _quota.get(id)
  if (!e || e.month !== quotaMonth()) return 0
  return e.count
}

function quotaInc(id) {
  const m = quotaMonth()
  const e = _quota.get(id)
  if (!e || e.month !== m) _quota.set(id, { count: 1, month: m })
  else e.count++
}

// ── Caption source adapters ───────────────────────────────────────────────────

async function tryInvidious(base, videoId, lang) {
  const langBase = lang.slice(0, 2)
  const isAuto   = t => /auto/i.test(t.label ?? '')
  const lc       = t => t.languageCode ?? t.language_code ?? ''
  try {
    const r = await fetch(`${base}/api/v1/captions/${videoId}`, {
      signal:  AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'szol-app/1.0' },
    })
    if (!r.ok) return null
    const data   = await r.json().catch(() => null)
    if (!data) return null
    const tracks = data.captions ?? []
    if (!tracks.length) return { noCaption: true }

    const pick = tracks.find(t => lc(t) === lang && !isAuto(t))
      ?? tracks.find(t => lc(t).startsWith(langBase) && !isAuto(t))
      ?? tracks.find(t => lc(t) === 'en' && !isAuto(t))
      ?? tracks.find(t => !isAuto(t))
      ?? tracks[0]
    if (!pick) return { noCaption: true }

    const capUrl = pick.url?.startsWith('http') ? pick.url : `${base}${pick.url}`
    try {
      const j3url = new URL(capUrl)
      j3url.searchParams.set('fmt', 'json3')
      const j3res = await fetch(j3url.toString(), { signal: AbortSignal.timeout(5000) })
      if (j3res.ok) {
        const j3 = await j3res.json().catch(() => null)
        if (j3?.events) {
          const entries = j3.events
            .filter(ev => ev.segs)
            .map(ev => ({
              text:     ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim(),
              start:    ev.tStartMs / 1000,
              duration: (ev.dDurationMs ?? 2000) / 1000,
            }))
            .filter(e => e.text)
          if (entries.length) return { entries, lang: lc(pick) }
        }
      }
    } catch {}

    const vttRes = await fetch(capUrl, { signal: AbortSignal.timeout(5000) })
    if (!vttRes.ok) return null
    const entries = parseVTT(await vttRes.text())
    return entries.length ? { entries, lang: lc(pick) } : null
  } catch {
    return null
  }
}

async function tryAnyInvidious(videoId, lang) {
  return new Promise(resolve => {
    let pending = INVIDIOUS.length, settled = false, bestNoCaption = null
    for (const base of INVIDIOUS) {
      tryInvidious(base, videoId, lang).then(r => {
        if (settled) return
        if (r && !r.noCaption) { settled = true; resolve(r); return }
        if (r?.noCaption) bestNoCaption = r
        if (--pending === 0) { settled = true; resolve(bestNoCaption) }
      })
    }
  })
}

async function tryYouTubeInnertube(videoId, lang) {
  const clients = [
    {
      url: 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc&prettyPrint=false',
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
      url: 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false',
      headers: {
        'Content-Type':             'application/json',
        'User-Agent':               'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name':    '3',
        'X-YouTube-Client-Version': '19.09.37',
      },
      client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' },
    },
    {
      url: 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false',
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

// Generic RapidAPI captions adapter — shared by all RapidAPI caption sources.
async function tryRapidApi(videoId, lang, host, path) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://${host}${path}`, {
      headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': key },
      signal:  AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const data = await r.json().catch(() => null)
    return parseRapidApiResponse(data, lang)
  } catch {
    return null
  }
}

// ── Source registry ───────────────────────────────────────────────────────────
//
// Add a new RapidAPI caption source by:
//   1. Adding env vars (e.g. YT_API_FULL_HOST) in Vercel → Settings → Environment
//   2. Adding an entry below with the correct host and endpoint path
//
// Sources are tried in order; exhausted or unconfigured sources are skipped.
// Free/unlimited sources sit at the bottom as the permanent fallback.

const SOURCES = [
  // ── RapidAPI: YouTube Transcript API (youtube-transcript3, Mahmudul Hasan) ──
  // Response: { success, transcript: [{ text, offset, duration, lang }] }
  // "offset" = start time in seconds (string). HTML entities in text.
  // Free tier: varies. Set YT_TRANSCRIPT3_LIMIT env var to cap (default 500).
  {
    id:     'yt-transcript3',
    limit:  () => parseInt(process.env.YT_TRANSCRIPT3_LIMIT ?? '500'),
    active: () => !!process.env.RAPIDAPI_KEY,
    fetch:  (v, l) => tryRapidApi(v, l,
      'youtube-transcript3.p.rapidapi.com',
      `/api/transcript?videoId=${encodeURIComponent(v)}&lang=${encodeURIComponent(l.slice(0, 2))}`
    ),
  },

  // ── RapidAPI: slot for a second caption service ───────────────────────────
  // To activate: set YT_CAPS2_HOST in Vercel env vars.
  // Optionally set YT_CAPS2_PATH to override the endpoint path template,
  // using {videoId} and {lang} as placeholders.
  // e.g. YT_CAPS2_PATH="/transcript?video_id={videoId}&language={lang}"
  {
    id:     'yt-caps2',
    limit:  () => parseInt(process.env.YT_CAPS2_LIMIT ?? '100'),
    active: () => !!(process.env.RAPIDAPI_KEY && process.env.YT_CAPS2_HOST),
    fetch:  (v, l) => {
      const path = (process.env.YT_CAPS2_PATH ?? '/captions?id={videoId}&lang={lang}')
        .replace('{videoId}', encodeURIComponent(v))
        .replace('{lang}',    encodeURIComponent(l.slice(0, 2)))
      return tryRapidApi(v, l, process.env.YT_CAPS2_HOST, path)
    },
  },

  // ── Free fallbacks (unlimited, but may be blocked by YouTube) ────────────
  { id: 'invidious', limit: () => Infinity, active: () => true, fetch: (v, l) => tryAnyInvidious(v, l) },
  { id: 'innertube', limit: () => Infinity, active: () => true, fetch: (v, l) => tryYouTubeInnertube(v, l) },
  { id: 'yt-direct', limit: () => Infinity, active: () => true, fetch: (v, l) => tryYouTubeDirect(v, l) },
]

// ── Caption fetch: cache-first, then source priority order ───────────────────

async function fetchCaptions(videoId, lang) {
  // 1. Cache hit — no API call at all
  const hit = cacheGet(videoId)
  if (hit) return hit

  // 2. Try each source in order, skipping inactive or quota-exhausted ones
  for (const src of SOURCES) {
    if (!src.active()) continue
    const lim = src.limit()
    if (lim !== Infinity && quotaUsed(src.id) >= lim) continue

    try {
      const result = await src.fetch(videoId, lang)
      if (result && !result.noCaption && result.entries?.length) {
        if (lim !== Infinity) quotaInc(src.id)
        cacheSet(videoId, result.entries, result.lang ?? lang)
        return result
      }
    } catch {}
  }

  return null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { word, words: wordsParam, lang = 'en', video_ids } = req.query

  if (!video_ids?.trim()) {
    return res.status(400).json({ detail: 'video_ids is required' })
  }

  const wordList = wordsParam
    ? wordsParam.split(',').map(w => w.trim()).filter(Boolean).slice(0, 20)
    : word?.trim() ? [word.trim()] : null

  if (!wordList?.length) {
    return res.status(400).json({ detail: 'word or words is required' })
  }

  const ids          = video_ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10)
  const MAX_PER_WORD = 5
  const clipsByWord  = Object.fromEntries(wordList.map(w => [w, []]))

  for (const videoId of ids) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) continue
    if (wordList.every(w => clipsByWord[w].length >= MAX_PER_WORD)) break

    const result = await fetchCaptions(videoId, lang)
    if (!result?.entries?.length) continue

    for (const entry of result.entries) {
      const text = entry.text?.replace(/\n/g, ' ').trim() || ''
      if (!text) continue
      for (const w of wordList) {
        if (clipsByWord[w].length >= MAX_PER_WORD) continue
        if (!containsWord(w, text)) continue
        clipsByWord[w].push({
          video_id:  videoId,
          start_sec: Math.floor(entry.start),
          end_sec:   Math.floor(entry.start + Math.max(2, entry.duration ?? 3)),
          context:   text,
        })
      }
    }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')

  // Single-word: return flat array (backward compat)
  if (!wordsParam) return res.status(200).json(clipsByWord[wordList[0]] ?? [])

  // Multi-word: return object keyed by word
  return res.status(200).json(clipsByWord)
}
