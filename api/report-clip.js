// api/report-clip.js — receives transcript error reports from the clip viewer.
// Reports appear in Vercel function logs: vercel.com → project → Logs.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'method not allowed' })

  const { video_id, start_sec, word, lang, note } = req.body ?? {}
  if (!video_id) return res.status(400).json({ detail: 'video_id required' })

  const report = {
    ts:        new Date().toISOString(),
    video_id,
    start_sec,
    word:      word  ?? '',
    lang:      lang  ?? '',
    note:      (note ?? '').slice(0, 500),
    url:       `https://youtu.be/${video_id}?t=${start_sec ?? 0}`,
  }

  // Visible in Vercel function logs — filter by "CLIP REPORT" to find these
  console.log('CLIP REPORT', JSON.stringify(report))

  return res.status(200).json({ ok: true })
}
