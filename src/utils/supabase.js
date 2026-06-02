// Supabase is a service that provides a database and storage in the cloud.
// This file sets up the connection to Supabase and provides functions to read/write data.

// Import the function that creates a Supabase client (a "client" is the object you use to talk to the database).
import { createClient } from '@supabase/supabase-js'

// import.meta.env lets Vite (the build tool) inject environment variables at build time.
// Variables starting with VITE_ are available in the frontend code.
// These values live in your .env.local file and are NOT committed to git for security.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL      // the web address of your Supabase project
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY // the public API key (safe to expose in frontend)

// Debug log: prints the URL to the browser console so you can verify it loaded correctly.
// You can open the console in Chrome: F12 → Console tab.
console.log('Supabase URL:', supabaseUrl)

// Create the Supabase client -- this is the object used to make all database requests.
// If either value is undefined (missing from .env.local), this will throw an error and the page will be blank.
export const supabase = createClient(supabaseUrl, supabaseKey)

// fetchCommunityStories() downloads all stories that users have shared with the community.
// "async" means this function does work that takes time (like a network request).
// You use "await" inside async functions to pause until the slow thing finishes.
export async function fetchCommunityStories() {
  // .from('community_stories') selects which database table to query.
  // .select('*') means "get all columns" (* = wildcard = everything).
  // .order('created_at', { ascending: false }) sorts newest stories first.
  const { data } = await supabase
    .from('community_stories')
    .select('*')
    .order('created_at', { ascending: false })
  // Return the data array, or an empty array [] if data is null (no results or error).
  return data || []
}

// submitStory() sends a new story to the community_stories table in the database.
// "story" is an object containing the title, text, language, author, etc.
export async function submitStory(story) {
  // .insert(story) adds a new row to the table with the story data.
  // .select() tells Supabase to return the newly inserted row (so we get the assigned ID back).
  // .single() expects exactly one result.
  const { data, error } = await supabase
    .from('community_stories')
    .insert(story)
    .select()
    .single()
  // If Supabase returned an error (e.g. validation failed), throw it so the caller can handle it.
  // "throw" stops the function and sends the error up to whoever called this function.
  if (error) throw error
  // Return the newly created story object (including its database-assigned ID).
  return data
}

// fetchCuratedStories() downloads the hand-picked, reviewed stories from the curated_stories table.
export async function fetchCuratedStories() {
  // .order('sequence_order', { ascending: true }) sorts by the manually set order number (1, 2, 3...).
  const { data } = await supabase
    .from('curated_stories')
    .select('*')
    .order('sequence_order', { ascending: true })
  return data || []
}
