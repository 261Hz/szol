// api.js — authenticated calls to the Szól FastAPI backend.
//
// Auth uses JWT stored in localStorage under 'szol_token'.
// The /login endpoint uses OAuth2PasswordRequestForm (form-encoded, not JSON),
// so login() sends username=<email>&password=<password> as application/x-www-form-urlencoded.

const API_URL = 'https://szol.onrender.com'

// Callbacks registered by the app so api.js can signal session expiry
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
// This collapses them into a readable string so the UI can display them directly.
function extractDetail(body) {
  const d = body?.detail
  if (!d) return null
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map(e => e.msg || JSON.stringify(e)).join(' · ')
  return String(d)
}

// Wraps fetch so every response is checked for 401 (token expired / invalid).
// On 401, clears the stored token and notifies the app so it can show the login modal.
// On network failure, throws a user-readable "Server unreachable" message instead of
// the opaque browser "Failed to fetch" string.
async function apiFetch(url, opts = {}) {
  let res
  try {
    res = await fetch(url, opts)
  } catch {
    throw Object.assign(new Error('Cannot reach the server. It may be starting up — please try again in a moment.'), { network: true })
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

export async function register(username, email, password, proficiency, native_lang) {
  const res = await apiFetch(`${API_URL}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      ...(proficiency ? { proficiency } : {}),
      ...(native_lang ? { native_lang } : {}),
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

// ── Word frequency tracking ───────────────────────────────────────────────────

export async function trackWord(word, lang, story_title = '') {
  if (!getToken()) return
  // fire-and-forget — never blocks the UI, errors are silently swallowed
  fetch(`${API_URL}/words/user`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ word, lang, story_title }),
  }).catch(() => {})
}

export async function getUserWords(lang) {
  const res = await apiFetch(`${API_URL}/words/user?lang=${lang}`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res || !res.ok) return []
  return await res.json()
}

// ── User vocab bank ───────────────────────────────────────────────────────────

export async function getAccountVocab() {
  const res = await apiFetch(`${API_URL}/vocab/user`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export function saveVocabWord(entry) {
  if (!getToken()) return
  // fire-and-forget
  fetch(`${API_URL}/vocab/user`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      word:       entry.word,
      lang:       entry.lang,
      pos:        entry.pos        || null,
      definition: entry.def        || null,
      example:    entry.ex         || null,
    }),
  }).catch(() => {})
}

export function removeVocabWord(word, lang) {
  if (!getToken()) return
  fetch(`${API_URL}/vocab/user?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).catch(() => {})
}

// ── Story progress ────────────────────────────────────────────────────────────

export function saveProgress(storyId, storyTitle, lang, tab, sentenceIndex) {
  if (!getToken()) return
  fetch(`${API_URL}/progress/user`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      story_id:       storyId,
      story_title:    storyTitle,
      lang,
      tab,
      sentence_index: sentenceIndex,
    }),
  }).catch(() => {})
}

export async function getProgress(storyId, tab) {
  const res = await apiFetch(
    `${API_URL}/progress/user?story_id=${encodeURIComponent(storyId)}&tab=${tab}`,
    { headers: authHeaders() }
  ).catch(() => null)
  if (!res || res.status === 404) return null
  if (!res.ok) return null
  return await res.json()
}
