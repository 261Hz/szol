import { createClient } from '@supabase/supabase-js'

// ── Supabase client (still used for word cache) ───────────────────────────────
// Supabase credentials come from environment variables set in Vercel dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Backend API URL ───────────────────────────────────────────────────────────
// All story requests now go through our FastAPI backend on Render
// instead of calling Supabase directly from the browser
const API_URL = 'https://szol.onrender.com'

// ── Stories (via FastAPI backend) ─────────────────────────────────────────────

// GET /stories?lang=es
// fetch() makes an HTTP GET request to our backend
// the backend queries Supabase and returns the results
export async function fetchCuratedStories(lang) {
  const r = await fetch(`${API_URL}/stories?lang=${lang}`)
  const data = await r.json()   // parse the JSON response
  return data || []             // return empty array if nothing comes back
}

// GET /stories/community?lang=es
// same pattern as above but hits the community stories endpoint
export async function fetchCommunityStories(lang) {
  const r = await fetch(`${API_URL}/stories/community?lang=${lang}`)
  const data = await r.json()
  return data || []
}

// POST /stories
// POST requests send data to the server — here we're submitting a new story
// we pass the story object as JSON in the request body
// Content-Type header tells the server we're sending JSON
export async function submitStory(story) {
  const token = localStorage.getItem('szol_token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const r = await fetch(`${API_URL}/stories`, {
    method: 'POST',
    headers,
    body: JSON.stringify(story),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to submit story')
  }
  return await r.json()
}

// ── Word cache (still via Supabase directly) ──────────────────────────────────
// We haven't moved word cache to the backend yet
// so these still call Supabase directly using the JS client

export async function lookupCached(word, lang) {
  const { data } = await supabase
    .from('word_cache')
    .select('*')
    .eq('word', word)    // filter where word = the tapped word
    .eq('lang', lang)    // and lang = current language
    .single()            // expect one result
  return data || null
}

export async function cacheWord(entry) {
  await supabase
    .from('word_cache')
    .upsert(entry, { onConflict: 'word,lang' })  // insert or update if already exists
}