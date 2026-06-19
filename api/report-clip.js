// api/report-clip.js — receives transcript error reports from the clip viewer.
// Reports go to Vercel logs (filter "CLIP REPORT") and a Google Sheet via
// SHEETS_WEBHOOK_URL (Apps Script web app URL set in Vercel env vars).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'method not allowed' })

  const { video_id, start_sec, word, lang, category, note } = req.body ?? {}
  if (!video_id) return res.status(400).json({ detail: 'video_id required' })

  const report = {
    ts:        new Date().toISOString(),
    video_id,
    start_sec,
    word:      word     ?? '',
    lang:      lang     ?? '',
    category:  category ?? '',
    note:      (note ?? '').slice(0, 500),
    url:       `https://youtu.be/${video_id}?t=${start_sec ?? 0}`,
  }

  console.log('CLIP REPORT', JSON.stringify(report))

  const webhook = process.env.SHEETS_WEBHOOK_URL
  if (webhook) {
    const payload = process.env.SHEETS_SECRET
      ? { ...report, secret: process.env.SHEETS_SECRET }
      : report
    fetch(webhook, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(() => {})
  }

  return res.status(200).json({ ok: true })
}
