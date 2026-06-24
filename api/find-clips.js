// api/find-clips.js — returns YouTube clips for a word in captions.
// Strategy (fastest-first, cheapest-first):
//   1. Backend DB  — pre-populated by worker.py context indexing (no filmot quota)
//   2. Filmot API  — live search; result is CDN-cached 24 h so repeats are free

import { requireAuth } from './_auth.js'

const FILMOT_LANGS = new Set(['nl','en','fr','de','id','it','ko','pt','ru','es','tr','vi','ja','hi','iw','ar'])
const BACKEND      = 'https://szol.onrender.com'

// Filmot returns Hindi/Bengali videos tagged "English (auto-generated)" because
// words like "timetable" appear as loan words in their phonetically-transcribed captions.
// These marker words are unambiguous romanized Hindi/Bengali — never found in English text.
const HINDI_BN_RE = /\b(?:hai|hain|nahi|toh|yeh|woh|karo|karke|lekin|theek|hoga|honge|hoti|hota|karna|lena|dena|sakta|chahiye|aami|tumi|hobe|ache)\b/i

function contextLooksEnglish(ctx, lang) {
  if (lang !== 'en') return true
  if (HINDI_BN_RE.test(ctx)) return false
  // Korean language-learning videos repeat each word in pairs: "timetable timetable bus bus"
  const words = ctx.toLowerCase().split(/\s+/)
  let adj = 0
  for (let i = 0; i < words.length - 1; i++) if (words[i] === words[i + 1]) adj++
  return adj < 3
}

function dedup(clips) {
  const seen = new Set()
  return clips.filter(c => {
    const key = `${c.video_id}:${c.start_sec}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Check if worker.py already indexed clips for this word (or a word from the same
// transcript segment). Render may be sleeping — 500 ms hard timeout so we don't
// add visible latency; cold-start takes ~30 s and falls through to filmot.
async function fromBackend(word, lang) {
  try {
    const r = await fetch(
      `${BACKEND}/vocab/clips?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}&limit=10`,
      { signal: AbortSignal.timeout(500) }
    )
    if (!r.ok) return null
    const data = await r.json()
    if (!Array.isArray(data) || !data.length) return null
    const clips = dedup(data.map(c => ({
      video_id:  c.video_id,
      start_sec: c.start_sec,
      end_sec:   c.end_sec,
      context:   c.context ?? '',
    }))).slice(0, 5)
    return clips.length ? clips : null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  const { word, lang = 'en' } = req.query
  if (!word?.trim()) return res.status(400).json({ detail: 'word required' })

  const w        = word.trim()
  const langCode = lang.slice(0, 2)

  // ── 1. Backend cache (worker.py context index) ────────────────────────────
  const cached = await fromBackend(w, langCode)
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.status(200).json(cached)
  }

  // ── 2. Filmot live search ─────────────────────────────────────────────────
  const params = new URLSearchParams({
    query:        w,
    hitFormat:    '0',
    maxQueryTime: '100',
    page:         '1',
  })
  if (FILMOT_LANGS.has(langCode)) params.set('lang', langCode)

  try {
    const r = await fetch(
      `https://filmot-tube-metadata-archive.p.rapidapi.com/getsearchsubtitles?${params}`,
      {
        headers: {
          'x-rapidapi-host': 'filmot-tube-metadata-archive.p.rapidapi.com',
          'x-rapidapi-key':  process.env.FILMOT_API_KEY ?? '',
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!r.ok) return res.status(r.status).json({ detail: 'filmot error' })
    const data = await r.json()

    const clips = []
    for (const result of data.result ?? []) {
      const video_id = result.id
      if (!video_id) continue
      for (const hit of result.hits ?? []) {
        const start = parseFloat(hit.start ?? 0)
        const dur   = parseFloat(hit.dur   ?? 3)
        const ctx   = [hit.ctx_before, hit.token, hit.ctx_after].filter(Boolean).join(' ').trim()
        if (!contextLooksEnglish(ctx, langCode)) continue
        clips.push({
          video_id,
          start_sec: Math.floor(start),
          end_sec:   Math.ceil(start + Math.max(dur, 3)),
          context:   ctx,
        })
        if (clips.length >= 5) break
      }
      if (clips.length >= 5) break  // examine up to all results pages but cap final list
    }

    // CDN-cache for 24 h so the same word never hits filmot again within a day
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.status(200).json(dedup(clips))
  } catch (e) {
    return res.status(500).json({ detail: String(e) })
  }
}
