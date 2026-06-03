// api.js — authenticated calls to the Szól FastAPI backend.
//
// Auth uses JWT stored in localStorage under 'szol_token'.
// /login accepts OAuth2PasswordRequestForm (form-encoded), so we send
// username=<email>&password=<password> as application/x-www-form-urlencoded.

const API_URL = 'https://szol.onrender.com'

// App.vue registers a callback here so api.js can signal a 401
// without importing Vue reactivity directly.
const _onUnauthorized = []
export function onUnauthorized(cb) { _onUnauthorized.push(cb) }

function notifyUnauthorized() {
  localStorage.removeItem('szol_token')
  _onUnauthorized.forEach(cb => cb())
}

function getToken() {
  return localStorage.getItem('szol_token')
}

function authHeaders(extra = {}) {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
}

// FastAPI validation errors are returned as an array of {msg, loc, type} objects.
// Collapse them into a readable string.
function extractDetail(body) {
  const d = body?.detail
  if (!d) return null
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map(e => e.msg || JSON.stringify(e)).join(' · ')
  return String(d)
}

// Core fetch wrapper: checks for 401 (token expired) and converts network failures
// into a friendly message instead of the browser's opaque "Failed to fetch".
async function apiFetch(url, opts = {}) {
  let res
  try {
    res = await fetch(url, opts)
  } catch {
    throw Object.assign(
      new Error('Cannot reach the server. It may be starting up — please try again in a moment.'),
      { network: true }
    )
  }
  if (res.status === 401) {
    notifyUnauthorized()
    throw new Error('Session expired. Please log in again.')
  }
  return res
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const body = new URLSearchParams()
  body.set('username', email) // OAuth2PasswordRequestForm uses 'username' for the identifier
  body.set('password', password)
  const res = await apiFetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const err  = new Error(extractDetail(json) || 'Invalid email or password.')
    err.detail = json.detail
    throw err
  }
  const { access_token } = await res.json()
  localStorage.setItem('szol_token', access_token)
  return access_token
}

export async function register(username, email, password, proficiency) {
  const res = await apiFetch(`${API_URL}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      ...(proficiency ? { proficiency } : {}),
    }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const err  = new Error(extractDetail(json) || 'Registration failed.')
    err.detail = json.detail
    throw err
  }
  return await res.json()
}

export async function getMe() {
  const token = getToken()
  if (!token) return null
  let res
  try {
    res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() })
  } catch {
    return null // silently fail on startup if server is unreachable
  }
  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized()
    return null
  }
  return await res.json()
}

export function logout() {
  localStorage.removeItem('szol_token')
}

// ── Word frequency tracking (fire-and-forget) ─────────────────────────────────

export function trackWord(word, lang, story_title = '') {
  if (!getToken()) return
  fetch(`${API_URL}/words/user`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ word, lang, story_title }),
  }).catch(() => {}) // never blocks the UI
}

export async function getUserWords(lang) {
  const res = await apiFetch(`${API_URL}/words/user?lang=${lang}`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}
