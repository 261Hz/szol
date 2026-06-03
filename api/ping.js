// Vercel serverless function — pings Render backend every 5 minutes to prevent cold starts
export default async function handler(req, res) {
  // Only allow GET requests from Vercel's cron scheduler
  if (req.method !== 'GET') return res.status(405).end()
  
  await fetch('https://szol.onrender.com/docs').catch(() => {})
  res.status(200).json({ ok: true })
}