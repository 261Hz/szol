js// Vercel serverless function that pings the Render backend to keep it warm.
// Render's free tier spins down after 15 minutes of inactivity — cold starts take ~50 seconds.
// This function is called every 5 minutes by Vercel's cron scheduler (defined in vercel.json).
// fetch() makes a GET request to the backend; .catch(() => {}) silently ignores failures.

export default async function handler(req, res) {
  await fetch('https://szol.onrender.com/docs').catch(() => {})
  res.status(200).json({ ok: true })
}