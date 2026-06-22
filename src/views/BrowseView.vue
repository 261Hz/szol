<template>
  <div class="pb-12">

    <!-- Continue reading -->
    <section v-if="inProgress.length" class="mb-10">
      <div class="row-label">Continue</div>
      <div class="card-row">
        <button
          v-for="p in inProgress"
          :key="p.story_id"
          @click="resume(p)"
          class="content-card"
        >
          <div class="card-stripe" :style="{ background: langColor(p.lang) }" />
          <div class="card-title">{{ p.story_title || p.story_id }}</div>
          <div class="card-meta">{{ p.tab }} · §{{ p.sentence_index }}</div>
        </button>
      </div>
    </section>

    <!-- Stories -->
    <section class="mb-10">
      <div class="row-label">Stories</div>
      <div v-if="storiesLoading" class="empty-msg">Loading…</div>
      <div v-else-if="!stories.length" class="empty-msg">No stories yet for this language.</div>
      <div v-else class="card-row">
        <button
          v-for="story in stories"
          :key="story.id"
          @click="$emit('load', story)"
          class="content-card"
        >
          <div class="card-stripe" :style="{ background: langColor(lang) }" />
          <div class="card-title" :dir="isRTL(story.lang) ? 'rtl' : 'ltr'">{{ story.title }}</div>
          <div class="card-meta">{{ story.author || 'curated' }}</div>
        </button>
      </div>
    </section>

    <!-- Articles -->
    <section class="mb-10">
      <div class="row-label">Articles</div>
      <div v-if="feedLoading && !feedItems.length" class="empty-msg">Loading…</div>
      <div v-else-if="!feedItems.length" class="empty-msg">No articles for this language yet.</div>
      <div v-else class="card-row">
        <button
          v-for="item in feedItems"
          :key="item.id"
          @click="openFeed(item)"
          class="content-card"
          :class="{ 'opacity-40 cursor-wait': fetchingId === item.id }"
        >
          <div class="card-stripe" style="background:#3a4f6b;" />
          <div class="card-title">{{ item.title }}</div>
          <div class="card-meta">{{ item.source_name }}</div>
        </button>
      </div>
    </section>

    <!-- Podcasts -->
    <section class="mb-10">
      <div class="row-label">Podcasts</div>
      <div v-if="podcastLoading && !podcastShows.length" class="empty-msg">Loading…</div>
      <div v-else-if="!podcastShows.length" class="empty-msg">No podcasts for this language yet.</div>
      <div v-else class="card-row">
        <button
          v-for="[show, eps] in podcastShows"
          :key="show"
          @click="listenEpisode(eps[0])"
          class="content-card"
        >
          <div class="card-stripe" style="background:#a88a4a;" />
          <div class="card-title">{{ show }}</div>
          <div class="card-meta">{{ eps.length }} episode{{ eps.length !== 1 ? 's' : '' }}</div>
        </button>
      </div>
    </section>

    <!-- Import URL — minimal, tucked at bottom -->
    <section class="mt-6 pt-6" style="border-top: 1px solid rgba(245,235,220,0.06);">
      <div class="row-label">Import URL</div>
      <div class="flex gap-2">
        <input
          v-model="importUrl"
          type="url"
          placeholder="https://…"
          @keydown.enter="fetchArticle"
          class="import-input"
        />
        <button
          @click="fetchArticle"
          :disabled="importLoading"
          class="import-btn"
        >{{ importLoading ? '…' : 'Fetch' }}</button>
      </div>
      <div v-if="importError" class="text-xs mt-1" style="color:#b45a5a;">{{ importError }}</div>
      <div v-if="importPreview" class="mt-3 p-3 rounded" style="background:rgba(245,235,220,0.04); border:1px solid rgba(245,235,220,0.08);">
        <div class="text-sm mb-2" style="color:rgba(245,235,220,0.82); font-family:'EB Garamond',serif;">{{ importPreview.title }}</div>
        <div class="text-xs mb-3" style="color:rgba(245,235,220,0.4);">{{ importPreview.text.slice(0, 200) }}…</div>
        <div class="flex gap-2">
          <button @click="confirmImport" class="import-btn">Save as story</button>
          <button @click="importPreview = null; importError = ''" class="cancel-btn">Discard</button>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { fetchCuratedStories, fetchFeed, fetchFeedArticle, fetchPodcasts, getAllProgress } from '../utils/api.js'
import { isRTL } from '../utils/rtl.js'

const props = defineProps({
  lang:        String,
  currentUser: Object,
})

const emit = defineEmits(['load', 'stories-loaded'])

const LANG_COLORS = {
  en: '#3a5a8b', es: '#8b3a3a', fr: '#5a3a8b', de: '#5a5a6b',
  it: '#3a7a3a', ru: '#8b4a3a', he: '#3a5a8b', ar: '#3a7a5a',
  arz:'#3a7a5a', ja: '#8b3a4a', zh: '#7a3a3a', hu: '#a88a4a',
  el: '#5a3a8b', ko: '#3a5a8b', nl: '#3a5a8b', pl: '#8b3a3a',
  sv: '#3a5a7a', pt: '#3a7a5a',
}

function langColor(code) {
  return LANG_COLORS[code] ?? '#5a5a6b'
}

const inProgress      = ref([])
const storiesLoading  = ref(true)
const stories         = ref([])
const feedLoading     = ref(true)
const feedItems       = ref([])
const podcastLoading  = ref(true)
const podcastEpisodes = ref([])
const fetchingId      = ref(null)

const importUrl     = ref('')
const importLoading = ref(false)
const importPreview = ref(null)
const importError   = ref('')

const podcastShows = computed(() => {
  const map = new Map()
  for (const ep of podcastEpisodes.value) {
    const name = ep.podcast_name ?? 'Unknown'
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(ep)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

async function loadAll(lang) {
  storiesLoading.value  = true
  feedLoading.value     = true
  podcastLoading.value  = true
  stories.value         = []
  feedItems.value       = []
  podcastEpisodes.value = []

  const [curated, feed, pods] = await Promise.all([
    fetchCuratedStories(lang),
    fetchFeed(lang, 0, 16),
    fetchPodcasts(lang),
  ])

  const saved = JSON.parse(localStorage.getItem('szol_local_stories') || '[]').filter(s => s.lang === lang)
  stories.value = [...curated, ...saved]
  storiesLoading.value = false
  emit('stories-loaded', stories.value)

  feedItems.value   = feed
  feedLoading.value = false

  podcastEpisodes.value = pods
  podcastLoading.value  = false
}

async function loadProgress() {
  if (!props.currentUser) { inProgress.value = []; return }
  const all  = await getAllProgress()
  const seen = new Set()
  inProgress.value = all
    .filter(p => p.lang === props.lang && p.sentence_index > 0)
    .filter(p => { if (seen.has(p.story_id)) return false; seen.add(p.story_id); return true })
    .slice(0, 8)
}

function resume(progress) {
  const story = stories.value.find(s => s.id === progress.story_id)
  if (story) emit('load', story)
}

async function openFeed(item) {
  if (fetchingId.value) return
  const wc = (item.text || '').split(/\s+/).filter(Boolean).length
  if (wc >= 100) {
    emit('load', { id: item.id, title: item.title, content: item.text, lang: item.lang, source: item.source_name })
    return
  }
  fetchingId.value = item.id
  const data = await fetchFeedArticle(item.source_url)
  fetchingId.value = null
  const text = data?.text && data.text.split(/\s+/).length > wc ? data.text : item.text
  emit('load', { id: item.id, title: item.title, content: text, lang: item.lang, source: item.source_name })
}

function listenEpisode(ep) {
  emit('load', {
    id:        ep.id,
    title:     ep.title,
    lang:      ep.lang,
    author:    ep.podcast_name,
    source:    ep.podcast_name,
    audio_url: ep.audio_url,
    segments:  ep.segments || [],
    content:   null,
  })
}

async function fetchArticle() {
  const url = importUrl.value.trim()
  if (!url) return
  importLoading.value = true
  importPreview.value = null
  importError.value   = ''
  try {
    const res  = await fetch(`/api/extract?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    if (data.error || !data.text) {
      importError.value = data.error || 'Could not extract article content.'
    } else {
      importPreview.value = data
    }
  } catch (e) {
    importError.value = e.message
  }
  importLoading.value = false
}

function confirmImport() {
  if (!importPreview.value) return
  const story = {
    id:     'l' + Date.now(),
    title:  importPreview.value.title,
    content:importPreview.value.text,
    lang:   props.lang,
    local:  true,
    source: importUrl.value,
  }
  const saved = JSON.parse(localStorage.getItem('szol_local_stories') || '[]')
  saved.push(story)
  localStorage.setItem('szol_local_stories', JSON.stringify(saved))
  stories.value.push(story)
  importUrl.value     = ''
  importPreview.value = null
  emit('load', story)
}

onMounted(() => {
  if (props.lang) loadAll(props.lang)
  loadProgress()
})

watch(() => props.lang,        lang => { if (lang) loadAll(lang) })
watch(() => props.currentUser, loadProgress)
</script>

<style scoped>
.row-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(245,235,220,0.3);
  margin-bottom: 0.75rem;
  font-family: 'IM Fell English', serif;
}

.empty-msg {
  font-size: 0.78rem;
  color: rgba(245,235,220,0.22);
  padding: 0.25rem 0;
  font-style: italic;
}

.card-row {
  display: flex;
  gap: 0.625rem;
  overflow-x: auto;
  padding-bottom: 0.375rem;
  scrollbar-width: none;
}
.card-row::-webkit-scrollbar { display: none; }

.content-card {
  flex-shrink: 0;
  width: 148px;
  background: rgba(245,235,220,0.03);
  border: 1px solid rgba(245,235,220,0.07);
  border-radius: 5px;
  padding: 0.75rem 0.75rem 0.875rem;
  cursor: pointer;
  text-align: left;
  position: relative;
  overflow: hidden;
  transition: background 0.15s, border-color 0.15s;
}
.content-card:hover {
  background: rgba(245,235,220,0.07);
  border-color: rgba(245,235,220,0.14);
}

.card-stripe {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0.65;
}

.card-title {
  font-size: 0.78rem;
  line-height: 1.38;
  color: rgba(245,235,220,0.8);
  font-family: 'EB Garamond', serif;
  margin-top: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  font-size: 0.6rem;
  color: rgba(245,235,220,0.28);
  margin-top: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}

.import-input {
  flex: 1;
  background: rgba(245,235,220,0.04);
  border: 1px solid rgba(245,235,220,0.1);
  border-radius: 4px;
  padding: 0.375rem 0.625rem;
  font-size: 0.8rem;
  color: rgba(245,235,220,0.75);
  outline: none;
  font-family: 'EB Garamond', serif;
}
.import-input::placeholder { color: rgba(245,235,220,0.2); }
.import-input:focus { border-color: rgba(245,235,220,0.25); }

.import-btn {
  background: rgba(245,235,220,0.07);
  border: 1px solid rgba(245,235,220,0.12);
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: 0.78rem;
  color: rgba(245,235,220,0.65);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.import-btn:hover { background: rgba(245,235,220,0.12); }
.import-btn:disabled { opacity: 0.4; cursor: default; }

.cancel-btn {
  background: transparent;
  border: 1px solid rgba(245,235,220,0.08);
  border-radius: 4px;
  padding: 0.375rem 0.75rem;
  font-size: 0.78rem;
  color: rgba(245,235,220,0.35);
  cursor: pointer;
  transition: border-color 0.15s;
}
.cancel-btn:hover { border-color: rgba(180,90,90,0.4); color: #b45a5a; }
</style>
