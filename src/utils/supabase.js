import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Word cache
export async function lookupCached(word, lang) {
  const { data } = await supabase
    .from('word_cache')
    .select('*')
    .eq('word', word)
    .eq('lang', lang)
    .single()
  return data || null
}

export async function cacheWord(entry) {
  await supabase
    .from('word_cache')
    .upsert(entry, { onConflict: 'word,lang' })
}

// Community stories
export async function fetchCommunityStories() {
  const { data } = await supabase
    .from('community_stories')
    .select('*')
    .order('created_at', { ascending: false })
  return data || []
}

export async function submitStory(story) {
  const { data, error } = await supabase
    .from('community_stories')
    .insert(story)
    .select()
    .single()
  if (error) throw error
  return data
}