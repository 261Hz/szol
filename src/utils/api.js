// api.js — authenticated calls to the Szól FastAPI backend.
//
// Auth uses JWT stored in localStorage under 'szol_token'.
// The /login endpoint uses OAuth2PasswordRequestForm (form-encoded, not JSON),
// so login() sends username=<email>&password=<password> as application/x-www-form-urlencoded.

const API_URL = 'https://szol.onrender.com'

function getToken() {
  return localStorage.getItem('szol_token')
}

function authHeaders(extra = {}) {
  const token = getToken()
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const body = new URLSearchParams()
  body.set('username', email) // OAuth2PasswordRequestForm uses 'username' for the identifier
  body.set('password', password)
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed')
  }
  const { access_token } = await res.json()
  localStorage.setItem('szol_token', access_token)
  return access_token
}

export async function register(username, email, password, proficiency, native_lang) {
  const res = await fetch(`${API_URL}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      ...(proficiency  ? { proficiency }  : {}),
      ...(native_lang  ? { native_lang }  : {}),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Registration failed')
  }
  return await res.json()
}

export async function getMe() {
  const token = getToken()
  if (!token) return null
  const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() })
  if (!res.ok) return null
  return await res.json()
}

export function logout() {
  localStorage.removeItem('szol_token')
}

// ── Word frequency tracking ───────────────────────────────────────────────────

export async function trackWord(word, lang, story_title = '') {
  const token = getToken()
  if (!token) return // silently skip if not logged in
  // fire-and-forget: don't await so it never blocks the UI
  fetch(`${API_URL}/words/user`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ word, lang, story_title }),
  }).catch(() => {}) // swallow network errors
}

export async function getUserWords(lang) {
  const res = await fetch(`${API_URL}/words/user?lang=${lang}`, {
    headers: authHeaders(),
  })
  if (!res.ok) return []
  return await res.json()
}
