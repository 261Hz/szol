// api/queue-word.js — public Vercel proxy for submitting a word to the clip queue.
// Accepts { word, lang } from any client (no auth needed from the browser).
// Forwards to the backend with X-Worker-Secret so the worker will process it.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { word, lang } = req.body ?? {}
  if (!word?.trim() || !lang?.trim()) {
    return res.status(400).json({ detail: 'word and lang required' })
  }

  const secret = process.env.WORKER_SECRET
  if (!secret) return res.status(500).json({ detail: 'server misconfigured' })

  try {
    const r = await fetch(`${process.env.BACKEND_URL ?? 'https://szol.onrender.com'}/vocab/words/request`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': secret },
      body:    JSON.stringify({ word: word.trim(), lang: lang.trim() }),
      signal:  AbortSignal.timeout(8000),
    })
    const body = await r.json().catch(() => ({}))
    return res.status(r.ok ? 200 : r.status).json(body)
  } catch {
    return res.status(502).json({ detail: 'backend unreachable' })
  }
}
