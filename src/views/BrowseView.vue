<template>
  <div class="browse-root">

    <!-- ════════════════════════════════════
         LANDING — Continue + Drawers
    ════════════════════════════════════ -->
    <template v-if="!level">

      <!-- Continue / Vocab summary -->
      <div v-if="inProgress.length || vocabCount > 0" class="continue-block">

        <div v-if="inProgress.length" class="continue-item" @click="resume(inProgress[0])">
          <span class="ci-label">{{ t(lang, 'resume') }}</span>
          <span class="ci-title">{{ inProgress[0].story_title || 'Untitled' }}</span>
          <span class="ci-meta">§{{ inProgress[0].sentence_index }}</span>
        </div>

        <div v-if="vocabCount > 0" class="vocab-row">
          <span class="vocab-text">{{ vocabCount }} word{{ vocabCount !== 1 ? 's' : '' }} saved</span>
          <button @click="$emit('go', 'vocab')" class="vocab-review-btn">Review →</button>
        </div>

      </div>

      <!-- Stories — shown directly -->
      <div class="stories-section">
        <div class="stories-header">
          <span class="section-label">{{ t(lang, 'storiesSection') }}</span>
        </div>
        <div v-if="storiesLoading" class="status-text">{{ t(lang, 'loading') }}</div>
        <div v-else-if="!stories.length" class="status-text italic-muted">{{ t(lang, 'noStoriesYet') }}</div>
        <div v-else class="item-list" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
          <button
            v-for="story in stories"
            :key="story.id"
            @click="$emit('load', story)"
            class="item-row"
          >
            <div class="item-title">{{ story.title }}</div>
            <div v-if="story.author" class="item-sub">{{ story.author }}</div>
          </button>
        </div>
      </div>

      <!-- Other categories -->
      <div class="drawer-list">
        <button @click="pick('podcasts')" class="drawer-row">
          <span class="drawer-label">{{ t(lang, 'podcasts') }}</span>
          <span class="drawer-arrow">→</span>
        </button>
        <button @click="pick('articles')" class="drawer-row">
          <span class="drawer-label">{{ t(lang, 'articles') }}</span>
          <span class="drawer-arrow">→</span>
        </button>
        <button @click="pick('history')" class="drawer-row">
          <span class="drawer-label">{{ t(lang, 'history') }}</span>
          <span class="drawer-arrow">→</span>
        </button>
      </div>

      <!-- Import URL — at the very bottom, minimal -->
      <div class="import-section">
        <button v-if="!showImport" @click="showImport = true" class="import-toggle">
          {{ t(lang, 'orPasteUrl') }}
        </button>
        <div v-else>
          <div class="import-row">
            <input
              v-model="importUrl"
              type="url"
              placeholder="https://…"
              @keydown.enter="fetchArticle"
              class="import-input"
              autofocus
            />
            <button @click="fetchArticle" :disabled="importLoading" class="import-btn">
              {{ importLoading ? '…' : t(lang, 'fetch') }}
            </button>
            <button @click="showImport = false; importPreview = null; importError = ''" class="import-cancel">×</button>
          </div>
          <div v-if="importError" class="import-error">{{ importError }}</div>
          <div v-if="importPreview" class="import-preview">
            <div class="ip-title">{{ importPreview.title }}</div>
            <div class="ip-excerpt">{{ importPreview.text.slice(0, 200) }}…</div>
            <div class="ip-actions">
              <button @click="confirmImport" class="ip-confirm">Save &amp; read</button>
              <button @click="importPreview = null" class="ip-discard">Discard</button>
            </div>
          </div>
        </div>
      </div>

    </template>


    <!-- ════════════════════════════════════
         PODCASTS — show list
    ════════════════════════════════════ -->
    <template v-else-if="level === 'podcasts' && !source">
      <div class="nav-bar">
        <button @click="back" class="back-link">← Archive</button>
        <span class="nav-title">{{ t(lang, 'podcasts') }}</span>
      </div>
      <div v-if="podcastLoading" class="status-text">{{ t(lang, 'loading') }}</div>
      <div v-else-if="!podcastShows.length" class="status-text">{{ t(lang, 'noPodcasts') }}</div>
      <div v-else class="item-list">
        <button
          v-for="[show, eps] in podcastShows"
          :key="show"
          @click="source = show"
          class="item-row"
        >
          <span class="item-title">{{ show }}</span>
          <span class="item-meta">{{ eps.length }} ep{{ eps.length !== 1 ? 's' : '' }}</span>
        </button>
      </div>
      <!-- Search / RSS import -->
      <div class="import-section" style="margin-top:1rem">
        <div class="import-row">
          <input
            v-model="rssUrl"
            type="text"
            placeholder="Search or paste RSS URL…"
            @keydown.enter="importRss"
            class="import-input"
          />
          <span v-if="searchLoading" class="import-spinner" />
          <button v-if="isUrl(rssUrl)" @click="importRss" :disabled="rssLoading" class="import-btn">
            {{ rssLoading ? '…' : t(lang, 'import') }}
          </button>
        </div>
        <div v-if="rssError" class="import-error">{{ rssError }}</div>
        <!-- iTunes search results -->
        <div v-if="searchResults.length" class="search-results">
          <div
            v-for="pod in searchResults"
            :key="pod.feed_url"
            class="search-row"
          >
            <img v-if="pod.artwork" :src="pod.artwork" class="search-art" />
            <div class="search-info">
              <div class="search-title">{{ pod.title }}</div>
              <div class="search-meta">{{ pod.publisher }}<span v-if="pod.episode_count"> · {{ pod.episode_count }} ep</span></div>
            </div>
            <button
              @click="subscribeFromSearch(pod.feed_url, pod.lang)"
              :disabled="subscribingFeed === pod.feed_url"
              class="import-btn"
            >{{ subscribingFeed === pod.feed_url ? '…' : 'Add' }}</button>
          </div>
        </div>
      </div>
    </template>

    <!-- PODCASTS — episodes -->
    <template v-else-if="level === 'podcasts' && source">
      <div class="nav-bar">
        <button @click="source = null" class="back-link">← Podcasts</button>
        <span class="nav-title">{{ source }}</span>
      </div>
      <div class="item-list">
        <button
          v-for="ep in episodesByShow"
          :key="ep.id"
          @click="listenEpisode(ep)"
          class="item-row"
        >
          <div>
            <div class="item-title">{{ ep.title }}</div>
            <div v-if="ep.duration_sec" class="item-sub">{{ Math.round(ep.duration_sec / 60) }} min</div>
          </div>
        </button>
      </div>
    </template>


    <!-- ════════════════════════════════════
         ARTICLES — source list
    ════════════════════════════════════ -->
    <template v-else-if="level === 'articles' && !source">
      <div class="nav-bar">
        <button @click="back" class="back-link">← Archive</button>
        <span class="nav-title">{{ t(lang, 'articles') }}</span>
      </div>
      <div v-if="feedLoading" class="status-text">{{ t(lang, 'loading') }}</div>
      <div v-else-if="!feedSources.length" class="status-text">{{ t(lang, 'noArticles') }}</div>
      <div v-else class="item-list">
        <button
          v-for="src in feedSources"
          :key="src"
          @click="source = src"
          class="item-row"
        >
          <span class="item-title">{{ src }}</span>
          <span class="item-meta">{{ feedBySource[src].length }}</span>
        </button>
      </div>
    </template>

    <!-- ARTICLES — items in source -->
    <template v-else-if="level === 'articles' && source">
      <div class="nav-bar">
        <button @click="source = null" class="back-link">← Articles</button>
        <span class="nav-title">{{ source }}</span>
      </div>
      <div class="item-list">
        <button
          v-for="item in feedBySource[source]"
          :key="item.id"
          @click="openFeed(item)"
          class="item-row"
          :class="{ 'opacity-40 cursor-wait': fetchingId === item.id }"
        >
          <div class="item-title">{{ item.title }}</div>
        </button>
      </div>
    </template>


    <!-- ════════════════════════════════════
         HISTORY
    ════════════════════════════════════ -->
    <template v-else-if="level === 'history'">
      <div class="nav-bar">
        <button @click="back" class="back-link">← Archive</button>
        <span class="nav-title">{{ t(lang, 'history') }}</span>
      </div>
      <div v-if="historyLoading" class="status-text">{{ t(lang, 'loading') }}</div>
      <template v-else>

        <div v-if="todayArticle" class="history-block">
          <div class="history-label">Featured today</div>
          <div class="history-title">{{ todayArticle.title }}</div>
          <div class="history-body">{{ todayArticle.extract?.slice(0, 380) }}…</div>
          <button @click="importToday" class="history-btn">Read →</button>
        </div>

        <div v-if="onThisDay.length" class="history-block">
          <div class="history-label">On this day</div>
          <div class="otd-list">
            <div v-for="(ev, i) in onThisDay.slice(0, 10)" :key="i" class="otd-row">
              <span class="otd-year">{{ ev.year }}</span>
              <span class="otd-text">{{ ev.text }}</span>
            </div>
          </div>
          <button @click="importOnThisDay" class="history-btn" style="margin-top:1rem;">Import as story →</button>
        </div>

        <div v-if="!todayArticle && !onThisDay.length" class="status-text">
          {{ t(lang, 'noToday') }}
        </div>

      </template>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { fetchCuratedStories, fetchFeed, fetchFeedArticle, fetchPodcasts, fetchPodcastRss, searchPodcasts, subscribePodcast, getAllProgress } from '../utils/api.js'
import { fetchFeaturedArticle, fetchOnThisDay } from '../utils/wikipedia.js'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  lang:        String,
  currentUser: Object,
  words:       { type: Array, default: () => [] },
})

const emit = defineEmits(['load', 'stories-loaded', 'go', 'open-listen'])

// ── Nav state ──────────────────────────────────────────────────
const level  = ref(null)
const source = ref(null)

function pick(cat) {
  level.value  = cat
  source.value = null
  if (cat === 'articles' && !feedItems.value.length)       loadFeed()
  if (cat === 'podcasts' && !podcastEpisodes.value.length) loadPodcasts()
  if (cat === 'history'  && !todayArticle.value)           loadHistory()
}

function back() { level.value = null; source.value = null }

// ── Vocab summary ──────────────────────────────────────────────
const vocabCount = computed(() =>
  props.words.filter(w => w.lang === props.lang).length
)

// ── In-progress ────────────────────────────────────────────────
const inProgress = ref([])

async function loadProgress() {
  if (!props.currentUser) { inProgress.value = []; return }
  const all  = await getAllProgress()
  const seen = new Set()
  inProgress.value = all
    .filter(p => p.lang === props.lang && p.sentence_index > 0)
    .filter(p => { if (seen.has(p.story_id)) return false; seen.add(p.story_id); return true })
    .slice(0, 4)
}

function resume(p) {
  const story = stories.value.find(s => s.id === p.story_id)
  if (story) emit('load', story)
}

// ── Stories ────────────────────────────────────────────────────
const storiesLoading = ref(true)
const stories        = ref([])

async function loadStories(lang) {
  storiesLoading.value = true
  const curated = await fetchCuratedStories(lang)
  const saved   = JSON.parse(localStorage.getItem('szol_local_stories') || '[]').filter(s => s.lang === lang)
  stories.value = [...curated, ...saved]
  storiesLoading.value = false
  emit('stories-loaded', stories.value)
}

// ── Articles ───────────────────────────────────────────────────
const feedLoading = ref(false)
const feedItems   = ref([])
const fetchingId  = ref(null)

const feedSources = computed(() =>
  [...new Set(feedItems.value.map(f => f.source_name))].sort()
)

const feedBySource = computed(() => {
  const map = {}
  for (const item of feedItems.value) {
    const k = item.source_name
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return map
})

async function loadFeed() {
  feedLoading.value = true
  feedItems.value   = await fetchFeed(props.lang, 0, 80)
  feedLoading.value = false
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

// ── Podcasts ───────────────────────────────────────────────────
const podcastLoading  = ref(false)
const podcastEpisodes = ref([])

// RSS-imported feed (user-provided URL, not in backend)
// Persisted to localStorage so episodes survive navigation
const RSS_KEY     = 'szol_rss_feeds'
function loadSavedFeeds() {
  try { return JSON.parse(localStorage.getItem(RSS_KEY) || '[]') } catch { return [] }
}
const rssUrl        = ref('')
const rssLoading    = ref(false)
const rssError      = ref('')
const rssTitle      = ref('')
const rssEpisodes   = ref(loadSavedFeeds().flatMap(f => f.episodes))
const searchResults = ref([])
const searchLoading = ref(false)
const subscribingFeed = ref(null)
let   _searchTimer  = null
// Pre-populate title from first saved feed
;(() => { const feeds = loadSavedFeeds(); if (feeds.length) rssTitle.value = feeds[0].title })()

const isUrl = (s) => /^https?:\/\//i.test(s.trim())

watch(rssUrl, (val) => {
  clearTimeout(_searchTimer)
  searchResults.value = []
  rssError.value = ''
  if (isUrl(val) || val.trim().length < 2) return
  _searchTimer = setTimeout(async () => {
    searchLoading.value = true
    searchResults.value = await searchPodcasts(val.trim())
    searchLoading.value = false
  }, 400)
})

async function subscribeFromSearch(feedUrl) {
  subscribingFeed.value = feedUrl
  rssError.value = ''
  const result = await subscribePodcast(feedUrl, props.lang)
  subscribingFeed.value = null
  searchResults.value = []
  rssUrl.value = ''
  await loadPodcasts()
  if (result?.podcast_name) source.value = result.podcast_name
}

function saveRssFeed(title, episodes) {
  const feeds = loadSavedFeeds().filter(f => f.title !== title)
  feeds.unshift({ title, episodes })
  localStorage.setItem(RSS_KEY, JSON.stringify(feeds.slice(0, 5)))
}

function parseDurSec(d) {
  if (!d) return null
  const p = d.trim().split(':').map(Number)
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  if (p.length === 2) return p[0] * 60 + p[1]
  const n = Number(d)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function importRss() {
  const url = rssUrl.value.trim()
  if (!url || rssLoading.value || !isUrl(url)) return
  rssLoading.value = true
  rssError.value   = ''
  const data = await fetchPodcastRss(url)
  rssLoading.value = false
  if (!data?.episodes?.length) {
    rssError.value = data?.detail ?? t(props.lang, 'noRssEpisodes')
    return
  }
  rssTitle.value    = data.title
  const mapped = data.episodes.map(ep => ({
    id:           ep.id ?? ep.audio_url,
    title:        ep.title,
    lang:         props.lang,
    podcast_name: data.title,
    image_url:    data.image ?? null,
    audio_url:    ep.audio_url,
    duration_sec: parseDurSec(String(ep.duration_sec ?? '')),
    segments:     [],
    source_type:  'podcast',
  }))
  rssEpisodes.value = [...rssEpisodes.value.filter(e => e.podcast_name !== data.title), ...mapped]
  saveRssFeed(data.title, mapped)
  source.value = data.title
}

const podcastShows = computed(() => {
  const map = new Map()
  for (const ep of [...podcastEpisodes.value, ...rssEpisodes.value]) {
    const n = ep.podcast_name ?? 'Unknown'
    if (!map.has(n)) map.set(n, [])
    map.get(n).push(ep)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

const episodesByShow = computed(() => {
  return [...podcastEpisodes.value, ...rssEpisodes.value].filter(ep => ep.podcast_name === source.value)
})

async function loadPodcasts() {
  podcastLoading.value  = true
  podcastEpisodes.value = await fetchPodcasts(props.lang)
  podcastLoading.value  = false
}

function listenEpisode(ep) {
  emit('open-listen', {
    id: ep.id, title: ep.title, lang: ep.lang, author: ep.podcast_name,
    source: ep.podcast_name, audio_url: ep.audio_url, segments: ep.segments || [], content: null,
    source_type: ep.source_type,
  })
}

// ── History ────────────────────────────────────────────────────
const historyLoading = ref(false)
const todayArticle   = ref(null)
const onThisDay      = ref([])

async function loadHistory() {
  historyLoading.value = true
  const [today, otd] = await Promise.all([fetchFeaturedArticle(props.lang), fetchOnThisDay(props.lang)])
  todayArticle.value   = today
  onThisDay.value      = otd
  historyLoading.value = false
}

function importToday() {
  if (!todayArticle.value?.extract) return
  pushLocal({ title: todayArticle.value.title, content: todayArticle.value.extract, source: 'Wikipedia' })
}

function importOnThisDay() {
  if (!onThisDay.value.length) return
  const now  = new Date()
  const date = `${now.toLocaleString('default', { month: 'long' })} ${now.getDate()}`
  pushLocal({ title: `On This Day: ${date}`, content: onThisDay.value.map(ev => `${ev.year} — ${ev.text}`).join('\n\n'), source: 'Wikipedia' })
}

// ── Import URL ─────────────────────────────────────────────────
const showImport    = ref(false)
const importUrl     = ref('')
const importLoading = ref(false)
const importPreview = ref(null)
const importError   = ref('')

async function fetchArticle() {
  const url = importUrl.value.trim()
  if (!url) return
  importLoading.value = true
  importPreview.value = null
  importError.value   = ''
  try {
    const res  = await fetch(`/api/extract?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    if (data.error || !data.text) importError.value = data.error || 'Could not extract content.'
    else importPreview.value = data
  } catch (e) { importError.value = e.message }
  importLoading.value = false
}

function confirmImport() {
  if (!importPreview.value) return
  pushLocal({ title: importPreview.value.title, content: importPreview.value.text, source: importUrl.value })
  importUrl.value = ''; importPreview.value = null; showImport.value = false
}

function pushLocal({ title, content, source: src = '' }) {
  const story = { id: 'l' + Date.now(), title, content, lang: props.lang, local: true, source: src || undefined }
  const saved = JSON.parse(localStorage.getItem('szol_local_stories') || '[]')
  saved.push(story)
  localStorage.setItem('szol_local_stories', JSON.stringify(saved))
  stories.value.push(story)
  emit('load', story)
}

// ── Init ───────────────────────────────────────────────────────
async function init(lang) {
  level.value = null; source.value = null
  await Promise.all([loadStories(lang), loadProgress()])
}

onMounted(() => { if (props.lang) init(props.lang) })
watch(() => props.lang,        lang => { if (lang) { feedItems.value = []; podcastEpisodes.value = []; todayArticle.value = null; onThisDay.value = []; init(lang) } })
watch(() => props.currentUser, loadProgress)
</script>

<style scoped>
.browse-root {
  padding-bottom: 4rem;
}

/* ── Continue / Vocab block ── */
.continue-block {
  margin-bottom: 2.25rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(31,27,23,0.1);
}

.continue-item {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  cursor: pointer;
  padding: 0.25rem 0;
  margin-bottom: 0.75rem;
  background: none;
  border: none;
  text-align: left;
  width: 100%;
}
.continue-item:hover .ci-title { opacity: 0.65; }

.ci-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(31,27,23,0.35);
  font-family: 'EB Garamond', serif;
  flex-shrink: 0;
}

.ci-title {
  font-size: 0.9rem;
  color: #1f1b17;
  font-family: 'EB Garamond', serif;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: opacity 0.12s;
}

.ci-meta {
  font-size: 0.65rem;
  color: rgba(31,27,23,0.3);
  font-style: italic;
  flex-shrink: 0;
}

.vocab-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.vocab-text {
  font-size: 0.78rem;
  color: rgba(31,27,23,0.45);
  font-family: 'EB Garamond', serif;
  font-style: italic;
}

.vocab-review-btn {
  font-size: 0.72rem;
  color: #8b3a3a;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'IM Fell English', serif;
  padding: 0;
  transition: opacity 0.12s;
}
.vocab-review-btn:hover { opacity: 0.7; }

/* ── Stories section ── */
.stories-section {
  margin-bottom: 2rem;
}

.stories-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(31,27,23,0.1);
}

.section-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(31,27,23,0.32);
  font-family: 'EB Garamond', serif;
}

.italic-muted {
  font-style: italic;
  color: rgba(31,27,23,0.3);
}

/* ── Drawer list ── */
.drawer-list {
  display: flex;
  flex-direction: column;
  margin-bottom: 3rem;
}

.drawer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  border-bottom: 1px solid rgba(31,27,23,0.1);
  cursor: pointer;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  text-align: left;
  transition: opacity 0.12s;
}
.drawer-row:first-child {
  border-top: 1px solid rgba(31,27,23,0.1);
}
.drawer-row:hover { opacity: 0.6; }

.drawer-label {
  font-size: 1.1rem;
  color: #1f1b17;
  font-family: 'IM Fell English', serif;
  letter-spacing: 0.01em;
}

.drawer-arrow {
  font-size: 0.78rem;
  color: rgba(31,27,23,0.28);
  font-family: 'EB Garamond', serif;
}

/* ── Import section ── */
.import-section {
  margin-top: 0.5rem;
}

.import-toggle {
  font-size: 0.72rem;
  color: rgba(31,27,23,0.3);
  font-style: italic;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: 'EB Garamond', serif;
  transition: color 0.12s;
}
.import-toggle:hover { color: rgba(31,27,23,0.65); }

.import-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.import-input {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(31,27,23,0.2);
  padding: 0.3rem 0.1rem;
  font-size: 0.8rem;
  color: #1f1b17;
  outline: none;
  font-family: 'EB Garamond', serif;
  font-style: italic;
}
.import-input::placeholder { color: rgba(31,27,23,0.22); }
.import-input:focus { border-color: rgba(31,27,23,0.45); }

.import-btn {
  font-size: 0.72rem;
  color: rgba(31,27,23,0.5);
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'IM Fell English', serif;
  transition: color 0.12s;
  padding: 0 0.25rem;
}
.import-btn:hover { color: #1f1b17; }
.import-btn:disabled { opacity: 0.3; }

.import-cancel {
  font-size: 0.8rem;
  color: rgba(31,27,23,0.3);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.25rem;
  transition: color 0.12s;
}
.import-cancel:hover { color: #8b3a3a; }

.import-error {
  font-size: 0.7rem;
  color: #8b3a3a;
  margin-top: 0.35rem;
  font-style: italic;
}

.import-spinner {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border: 1.5px solid rgba(31,27,23,0.2);
  border-top-color: rgba(31,27,23,0.55);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

.search-results {
  margin-top: 0.625rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(31,27,23,0.06);
}

.search-art {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 3px;
  object-fit: cover;
  flex-shrink: 0;
  opacity: 0.88;
}

.search-info {
  flex: 1;
  min-width: 0;
}

.search-title {
  font-size: 0.82rem;
  color: #1f1b17;
  font-family: 'EB Garamond', serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-meta {
  font-size: 0.65rem;
  color: rgba(31,27,23,0.35);
  font-style: italic;
  margin-top: 0.1rem;
}

.import-preview {
  margin-top: 0.875rem;
  padding: 0.875rem 0;
  border-top: 1px solid rgba(31,27,23,0.1);
}

.ip-title {
  font-size: 0.88rem;
  color: #1f1b17;
  font-family: 'EB Garamond', serif;
  margin-bottom: 0.35rem;
}

.ip-excerpt {
  font-size: 0.75rem;
  color: rgba(31,27,23,0.45);
  line-height: 1.55;
  margin-bottom: 0.75rem;
}

.ip-actions { display: flex; gap: 1rem; }

.ip-confirm {
  font-size: 0.72rem;
  color: #1f1b17;
  background: none;
  border: 1px solid rgba(31,27,23,0.2);
  border-radius: 2px;
  padding: 0.25rem 0.625rem;
  cursor: pointer;
  font-family: 'IM Fell English', serif;
  transition: border-color 0.12s;
}
.ip-confirm:hover { border-color: rgba(31,27,23,0.5); }

.ip-discard {
  font-size: 0.72rem;
  color: rgba(31,27,23,0.35);
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'EB Garamond', serif;
  font-style: italic;
  transition: color 0.12s;
}
.ip-discard:hover { color: #8b3a3a; }

/* ── Navigation bar (inside levels) ── */
.nav-bar {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 0.875rem;
  border-bottom: 1px solid rgba(31,27,23,0.1);
}

.back-link {
  font-size: 0.72rem;
  color: rgba(31,27,23,0.38);
  font-style: italic;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: 'EB Garamond', serif;
  transition: color 0.12s;
  flex-shrink: 0;
}
.back-link:hover { color: rgba(31,27,23,0.75); }

.nav-title {
  font-size: 1.05rem;
  color: #1f1b17;
  font-family: 'IM Fell English', serif;
  letter-spacing: 0.01em;
}

/* ── Item lists ── */
.item-list {
  display: flex;
  flex-direction: column;
}

.item-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(31,27,23,0.07);
  cursor: pointer;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  text-align: left;
  width: 100%;
  transition: opacity 0.12s;
}
.item-row:hover { opacity: 0.6; }

.item-title {
  font-size: 0.88rem;
  color: #1f1b17;
  font-family: 'EB Garamond', serif;
  line-height: 1.4;
}

.item-meta {
  font-size: 0.65rem;
  color: rgba(31,27,23,0.3);
  font-style: italic;
  flex-shrink: 0;
}

.item-sub {
  font-size: 0.65rem;
  color: rgba(31,27,23,0.35);
  font-style: italic;
  margin-top: 0.1rem;
}

/* ── Status text ── */
.status-text {
  font-size: 0.8rem;
  color: rgba(31,27,23,0.3);
  font-style: italic;
  padding: 0.5rem 0;
}

/* ── History ── */
.history-block {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(31,27,23,0.08);
}

.history-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(31,27,23,0.3);
  margin-bottom: 0.75rem;
  font-family: 'EB Garamond', serif;
}

.history-title {
  font-size: 1rem;
  color: #1f1b17;
  font-family: 'IM Fell English', serif;
  line-height: 1.3;
  margin-bottom: 0.6rem;
}

.history-body {
  font-size: 0.85rem;
  color: rgba(31,27,23,0.6);
  line-height: 1.7;
  margin-bottom: 0.875rem;
  font-family: 'EB Garamond', serif;
}

.history-btn {
  font-size: 0.72rem;
  color: rgba(31,27,23,0.5);
  background: none;
  border: 1px solid rgba(31,27,23,0.15);
  border-radius: 2px;
  padding: 0.25rem 0.625rem;
  cursor: pointer;
  font-family: 'IM Fell English', serif;
  transition: border-color 0.12s, color 0.12s;
}
.history-btn:hover { border-color: rgba(31,27,23,0.4); color: #1f1b17; }

.otd-list { display: flex; flex-direction: column; }

.otd-row {
  display: flex;
  gap: 0.875rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(31,27,23,0.05);
  align-items: baseline;
}

.otd-year {
  font-size: 0.65rem;
  color: rgba(31,27,23,0.28);
  font-family: 'EB Garamond', serif;
  flex-shrink: 0;
  min-width: 2.5rem;
}

.otd-text {
  font-size: 0.82rem;
  color: rgba(31,27,23,0.65);
  line-height: 1.5;
  font-family: 'EB Garamond', serif;
}
</style>
