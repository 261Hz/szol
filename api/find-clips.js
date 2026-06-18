// api/find-clips.js — calls filmot to find YouTube clips for a word in captions.
// Falls back when backend DB has no pre-cached clips for this word.

const FILMOT_LANGS = new Set(['nl','en','fr','de','id','it','ko','pt','ru','es','tr','vi','ja','hi','iw','ar'])

export default async function handler(req, res) {
  const { word, lang = 'en' } = req.query
  if (!word?.trim()) return res.status(400).json({ detail: 'word required' })

  const params = new URLSearchParams({
    query:        word.trim(),
    hitFormat:    '0',
    maxQueryTime: '100',
    page:         '1',
  })
  const langCode = lang.slice(0, 2)
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
        clips.push({
          video_id,
          start_sec: Math.floor(start),
          end_sec:   Math.ceil(start + Math.max(dur, 3)),
          context:   ctx,
        })
        if (clips.length >= 5) break
      }
      if (clips.length >= 5) break
    }

    // Cache at CDN edge for 24 h so the same word doesn't burn filmot quota on repeat visits
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.status(200).json(clips)
  } catch (e) {
    return res.status(500).json({ detail: String(e) })
  }
}
