// api/fetch-transcript.js — proxy + parse a transcript URL (SRT, VTT, JSON)
// Usage: GET /api/fetch-transcript?url=https://...

function parseSecs(ts) {
  const s = ts.trim().replace(',', '.')
  const parts = s.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(s) || 0
}

function parseTranscript(text) {
  // JSON
  try {
    const j = JSON.parse(text)
    const arr = j.segments ?? j.results?.items ?? null
    if (Array.isArray(arr)) {
      return arr.map(s => ({
        start: Number(s.start ?? s.startTime ?? 0),
        end:   Number(s.end   ?? s.endTime   ?? 0),
        text:  (s.text ?? s.body ?? s.alternatives?.[0]?.content ?? '').trim(),
      })).filter(s => s.text)
    }
  } catch {}

  // SRT / VTT
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\n+/)
  const segs = []
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const arrow = lines.findIndex(l => l.includes('-->'))
    if (arrow < 0) continue
    const parts = lines[arrow].split('-->')
    if (parts.length < 2) continue
    const start = parseSecs(parts[0].trim())
    const end   = parseSecs(parts[1].split(/\s/)[0].trim())
    const body  = lines.slice(arrow + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (body) segs.push({ start, end, text: body })
  }
  return segs
}

export default async function handler(req, res) {
  const url = req.query.url
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Expected an http(s) URL.' })
  }

  let text
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'szol-app/1.0', 'Accept': '*/*' },
    })
    if (!r.ok) return res.status(502).json({ error: `Upstream returned ${r.status}` })
    text = await r.text()
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach transcript URL.' })
  }

  const segments = parseTranscript(text)
  if (!segments.length) return res.status(404).json({ error: 'No segments parsed from transcript.' })

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
  return res.status(200).json({ segments })
}
