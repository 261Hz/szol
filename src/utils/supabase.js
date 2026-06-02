import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase URL:', supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseKey)

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

export async function fetchCuratedStories() {
  const { data } = await supabase
    .from('curated_stories')
    .select('*')
    .order('sequence_order', { ascending: true })
  return data || []
}