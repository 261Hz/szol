// api/_auth.js — lightweight HS256 JWT verification for Vercel functions.
// Uses Node.js built-in crypto — no extra packages needed.
// Set SECRET_KEY in Vercel env vars (same value as on Render).

import { createHmac, timingSafeEqual } from 'node:crypto'

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function verifyJwt(token, secret) {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch {
    return null
  }
  try {
    const claims = JSON.parse(b64urlDecode(payload).toString())
    if (claims.exp && Date.now() / 1000 > claims.exp) return null
    return claims
  } catch {
    return null
  }
}

// Call at the top of any Vercel function that requires a logged-in user (including guests).
// Returns true and continues if valid; writes 401 and returns false if not.
export function requireAuth(req, res) {
  const secret = process.env.SECRET_KEY
  if (!secret) {
    // No secret configured — fail open in dev, closed in prod
    if (process.env.VERCEL_ENV === 'production') {
      res.status(503).json({ error: 'Auth not configured' })
      return false
    }
    return true
  }
  const auth = req.headers['authorization'] ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const claims = verifyJwt(token, secret)
  if (!claims) {
    res.status(401).json({ error: 'Authentication required' })
    return false
  }
  return true
}
