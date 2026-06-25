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

export async function register(username, email, password, proficiency, target_lang, native_lang, cfTurnstileResponse = null) {
  const url = cfTurnstileResponse
    ? `${API_URL}/users/?cf_turnstile_response=${encodeURIComponent(cfTurnstileResponse)}`
    : `${API_URL}/users/`
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      password,
      native_lang,
      target_lang,
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


export async function updateSettings(settings) {
  const res = await apiFetch(`${API_URL}/users/me`, {
    method:  'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body:    JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Failed to update settings')
  return await res.json()
}

export async function deleteAccount() {
  const res = await apiFetch(`${API_URL}/users/me`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete account')
}

export async function discoverUsers(nativeLang) {
  const res = await apiFetch(`${API_URL}/users/discover?native_lang=${nativeLang}`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
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

export async function getWordExamples(word, lang, limit = 5) {
  const res = await fetch(
    `${API_URL}/words/examples?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}&limit=${limit}`
  ).catch(() => null)
  if (!res?.ok) return []
  return await res.json() // [{ sentence, score }, ...]
}

export async function getWordFrequency(word, lang) {
  const res = await fetch(`${API_URL}/words/frequency?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`)
    .catch(() => null)
  if (!res?.ok) return null
  return await res.json() // { word, lang, frequency_rank: number | null }
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
  })
    .then(r => { if (!r.ok) console.warn(`[vocab] save failed ${r.status}`, entry.word) })
    .catch(e => console.warn('[vocab] save error', e.message, entry.word))
}

export function removeVocabWord(word, lang) {
  if (!getToken()) return
  fetch(`${API_URL}/vocab/user?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  }).catch(() => {})
}

export async function getVocabClips(word, lang) {
  const res = await fetch(
    `/api/find-clips?word=${encodeURIComponent(word)}&lang=${encodeURIComponent(lang)}`,
    { headers: authHeaders() }
  ).catch(() => null)
  if (!res?.ok) return []
  return await res.json().catch(() => [])
}

// Fire-and-forget: ask the backend to queue a word for clip generation.
// Works for guests and logged-in users alike — no auth required.
export function requestWordClip(word, lang) {
  const w = word?.trim()
  if (!w || w.length < 2 || w.length > 40) return
  fetch('/api/queue-word', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word: w, lang }),
  }).catch(() => {})
}

// ── User stories (private, synced to account) ────────────────────────────────

export async function saveUserStory(story) {
  if (!getToken()) return null
  const res = await apiFetch(`${API_URL}/user-stories/`, {
    method:  'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body:    JSON.stringify({
      title:   story.title,
      content: story.content,
      franco:  story.franco ?? null,
      lang:    story.lang,
    }),
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json()
}

export async function getUserStories(lang) {
  const res = await apiFetch(`${API_URL}/user-stories/?lang=${lang}`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function deleteUserStory(id) {
  if (!getToken()) return
  fetch(`${API_URL}/user-stories/${id}`, {
    method:  'DELETE',
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

export async function getAllProgress() {
  const res = await apiFetch(`${API_URL}/progress/user/all`, {
    headers: authHeaders(),
  }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
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

// ── Stories ───────────────────────────────────────────────────────────────────

export async function fetchCuratedStories(lang) {
  const r = await fetch(`${API_URL}/stories?lang=${lang}`)
  return await r.json().catch(() => [])
}

export async function fetchConceptTranslations(concept, category, lang) {
  const cacheKey = `szol_concept_${new Date().toDateString()}_${lang}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return cached
  } catch {}
  const res = await apiFetch(`${API_URL}/concept-of-day`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ concept, category, lang }),
  })
  if (!res.ok) throw new Error('Could not load concept.')
  const { sentence } = await res.json()
  try { localStorage.setItem(cacheKey, sentence) } catch {}
  return sentence
}

export async function fetchListenStories(lang) {
  const r = await fetch(`${API_URL}/listen-stories?lang=${lang}`)
  return await r.json().catch(() => [])
}


// Fetch timed segments for a YouTube video via the Vercel transcript-segments function.
// Returns { video_id, title, lang, is_autogenerated, segments } or throws.
export async function fetchYouTubeTranscript(videoId, lang) {
  const { fetchVideoMetadata } = await import('./transcriptFetcher.js')
  const v = encodeURIComponent(videoId)
  const l = encodeURIComponent(lang)

  const metaPromise = fetchVideoMetadata(videoId)
  const vercelRes   = await fetch(`/api/transcript-segments?v=${v}&lang=${l}`, { headers: authHeaders() })
  const vercelData  = await vercelRes.json().catch(() => ({}))
  if (vercelRes.ok) {
    const meta = await metaPromise
    if (meta?.title) vercelData.title = meta.title
    return vercelData
  }
  throw Object.assign(
    new Error(vercelData?.detail ?? 'Could not fetch transcript.'),
    { status: vercelRes.status }
  )
}

export async function addListenFromUrl(url, lang) {
  const res = await apiFetch(`${API_URL}/listen-stories/from-url`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, lang }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Could not fetch transcript.')
  }
  return await res.json()
}

export async function searchYouTube(query, lang, maxResults = 8) {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY
  if (!key) return []
  const params = new URLSearchParams({
    part:            'snippet',
    q:               query,
    type:            'video',
    videoCaption:    'closedCaption',
    videoEmbeddable: 'true',
    safeSearch:      'strict',
    relevanceLanguage: lang,
    maxResults:      String(maxResults),
    key,
  })
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return []
    return ((await r.json()).items ?? []).map(item => ({
      videoId:   item.id.videoId,
      title:     item.snippet.title,
      channel:   item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
    }))
  } catch {
    return []
  }
}

export async function fetchCommunityStories(lang) {
  const r = await fetch(`${API_URL}/stories/community?lang=${lang}`)
  return await r.json().catch(() => [])
}

export async function submitStory(story) {
  const res = await apiFetch(`${API_URL}/stories`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(story),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to submit story')
  }
  return await res.json()
}

// ── Feed stories (ingested from external RSS sources) ────────────────────────

export async function fetchLearnerCounts() {
  const res = await apiFetch(`${API_URL}/stats/learners`).catch(() => null)
  if (!res?.ok) return {}
  return await res.json()
}

export async function fetchFeed(lang, skip = 0, limit = 20) {
  const res = await apiFetch(
    `${API_URL}/feed/?lang=${encodeURIComponent(lang)}&skip=${skip}&limit=${limit}`
  ).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function fetchFeedArticle(url) {
  const res = await fetch(`${API_URL}/feed/fetch`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url }),
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json().catch(() => null)
}

export async function fetchPodcastRss(url) {
  const res = await fetch(`/api/podcast-rss?url=${encodeURIComponent(url)}`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return null
  return await res.json().catch(() => null)
}

export async function fetchArticleRss(url) {
  const res = await fetch(`/api/feeds?action=rss&url=${encodeURIComponent(url)}`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return null
  return await res.json().catch(() => null)
}

export async function searchFeeds(q) {
  const res = await fetch(`/api/feeds?action=search&q=${encodeURIComponent(q)}`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return []
  return await res.json().catch(() => [])
}

export async function fetchPodcasts(lang) {
  const res = await fetch(`${API_URL}/podcasts/?lang=${encodeURIComponent(lang)}`).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function searchPodcasts(q) {
  const res = await fetch(`${API_URL}/podcasts/search?q=${encodeURIComponent(q)}`).catch(() => null)
  if (!res?.ok) return []
  return await res.json().catch(() => [])
}

export async function subscribePodcast(feedUrl, lang, maxEpisodes = 10) {
  const res = await fetch(`${API_URL}/podcasts/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feed_url: feedUrl, lang, max_episodes: maxEpisodes }),
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json().catch(() => null)
}

export async function fetchPodcastTranscript(episodeId) {
  const res = await fetch(`${API_URL}/podcasts/${encodeURIComponent(episodeId)}/transcript`, {
    method: 'POST',
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json()
}

export async function savePodcastTranscript(episodeId, segments) {
  await fetch(`${API_URL}/podcasts/${encodeURIComponent(episodeId)}/transcript/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments }),
  }).catch(() => null)
}

export async function fetchOgjreTranscript(title) {
  if (!/#\d+/.test(title)) return null
  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // Titles like "#2516 - Guest" have no show name — prepend the JRE prefix
  const slug = /^#\d+/.test(title.trim())
    ? `joe-rogan-experience-${slugify(title.trim().slice(1))}`
    : slugify(title)
  // Use Vercel proxy — direct browser call blocked by ogjre.com CORS policy
  const res = await fetch(`/api/fetch-transcript?slug=${encodeURIComponent(slug)}`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return null
  return await res.json().catch(() => null)
}

export async function suggestSource(url, lang, note = '') {
  const res = await apiFetch(`${API_URL}/feed/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, lang: lang || null, note: note || null }),
  }).catch(() => null)
  return res?.ok ?? false
}

export async function fetchSubstackFeed(lang, limit = 10) {
  const res = await fetch(
    `/api/feeds?action=wp&lang=${encodeURIComponent(lang)}&limit=${limit}`,
    { headers: authHeaders() }
  ).catch(() => null)
  if (!res?.ok) return []
  return await res.json().catch(() => [])
}

// ── Voice messages ────────────────────────────────────────────────────────────

export async function getInbox() {
  const res = await apiFetch(`${API_URL}/messages/inbox`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function getSent() {
  const res = await apiFetch(`${API_URL}/messages/sent`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function markMessageRead(id) {
  await apiFetch(`${API_URL}/messages/${id}/read`, { method: 'PATCH', headers: authHeaders() }).catch(() => {})
}

export async function deleteMessage(id) {
  const res = await apiFetch(`${API_URL}/messages/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Delete failed')
}

export async function blockUser(userId) {
  const res = await apiFetch(`${API_URL}/messages/block/${userId}`, { method: 'POST', headers: authHeaders() })
  if (!res.ok) throw new Error('Block failed')
}

export async function fetchAudioBlob(msgId) {
  const res = await apiFetch(`${API_URL}/messages/${msgId}/audio`, { headers: authHeaders() }).catch(() => null)
  if (!res?.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function sendVoiceMessage(formData) {
  const res = await apiFetch(`${API_URL}/messages/`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to send message')
  }
  return await res.json()
}

export async function discoverPartners(targetLang) {
  const res = await apiFetch(
    `${API_URL}/users/discover?native_lang=${encodeURIComponent(targetLang)}`,
    { headers: authHeaders() }
  ).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

// ── Ink stroke recognizer ─────────────────────────────────────────────────────

// strokes: {x,y}[][] — send to MyScript iink cloud, returns { text: string|null }
export async function transcribeInk(strokes, lang) {
  try {
    const res = await fetch(`${API_URL}/ink/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strokes: strokes.map(s => s.map(p => ({ x: p.x, y: p.y }))),
        lang,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function tokenizeJapanese(text) {
  try {
    const res = await fetch(
      `${API_URL}/ink/tokenize?${new URLSearchParams({ text, lang: 'ja' })}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export async function googleRecognizeInk(strokes, lang, width, height) {
  try {
    const res = await fetch(`${API_URL}/ink/google-recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strokes: strokes.map(s => s.map(p => ({ x: p.x, y: p.y }))),
        lang,
        width,
        height,
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// strokes: {x,y}[][] — array of strokes, each stroke is array of points
// Returns { match: bool, score: float } or null if the backend is unreachable.
export async function recognizeInk(strokes, lang, expected) {
  try {
    const res = await fetch(`${API_URL}/ink/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strokes: strokes.map(s => s.map(p => ({ x: p.x, y: p.y }))),
        lang,
        expected,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Handwriting checker ───────────────────────────────────────────────────────

export async function checkTranslation(sourceText, translation, sourceLang, targetLang = 'en') {
  const res = await apiFetch(`${API_URL}/words/translate/check`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ source_text: sourceText, translation, source_lang: sourceLang, target_lang: targetLang }),
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json() // { score: number, feedback: string }
}

export async function checkHandwriting(word, lang, imagePng) {
  const res = await apiFetch(`${API_URL}/words/write/check`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word, lang, image_b64: imagePng }),
  }).catch(() => null)
  if (!res?.ok) return null
  return await res.json() // { feedback: string }
}

// ── AI tutor chat ─────────────────────────────────────────────────────────────

export async function sendChat({ message, storyContent, lang, history, vocab, proficiency }) {
  const res = await apiFetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      story_content: storyContent ?? '',
      lang:          lang          ?? 'en',
      history:       history       ?? [],
      vocab:         vocab         ?? [],
      proficiency:   proficiency   ?? null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Chat failed.')
  }
  return await res.json() // { reply: string }
}

// ── Diegetic Documents (collections of found documents) ───────────────────────

export async function fetchCollections(lang) {
  const res = await fetch(`${API_URL}/collections/?lang=${encodeURIComponent(lang)}`).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function fetchCollection(collectionId) {
  const res = await fetch(`${API_URL}/collections/${collectionId}`).catch(() => null)
  if (!res?.ok) return null
  return await res.json()
}

export async function fetchTodayDocuments(lang) {
  const res = await fetch(`${API_URL}/collections/today?lang=${encodeURIComponent(lang)}`).catch(() => null)
  if (!res?.ok) return []
  return await res.json()
}

export async function tutorChat({ messages, lang }) {
  let res
  try {
    res = await apiFetch(`${API_URL}/words/tutor/chat`, {
      method:  'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ lang, messages }),
    })
  } catch (e) {
    return { error: e.message }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.detail || `Server error ${res.status}` }
  return data // { reply, model, hf_error? }
}
