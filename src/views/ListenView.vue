<template>
  <!-- Hidden YouTube IFrame container — must be a real DOM node (dictation player) -->
  <div ref="ytContainerEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <!-- HTML5 audio element for non-YouTube dictation sources -->
  <audio
    v-if="selectedStory && selectedStory.source_type !== 'youtube'"
    ref="audioEl"
    :src="selectedStory.audio_url"
    preload="metadata"
    @loadedmetadata="onAudioLoaded"
    @timeupdate="onAudioTimeUpdate"
    @play="isPlaying = true; startWave()"
    @pause="isPlaying = false; stopWave()"
    @ended="isPlaying = false; stopWave()"
    style="display:none"
  />

  <div class="flex flex-col gap-3">

    <!-- Story picker -->
    <div v-if="!selectedStory" class="flex flex-col gap-3">

      <!-- ── Import from YouTube ── -->
      <div class="flex flex-col gap-2">
        <button
          @click="importExpanded = !importExpanded; importError = ''"
          class="w-full text-left flex items-center gap-2 bg-slate-900 border border-dashed border-gray-700 hover:border-emerald-700 rounded-lg px-4 py-3 transition-all"
        >
          <span class="text-base leading-none">📥</span>
          <span class="text-sm text-gray-400">Import from YouTube URL</span>
          <span class="ml-auto text-gray-600 text-xs">{{ importExpanded ? '▲' : '▼' }}</span>
        </button>

        <div v-if="importExpanded" class="flex flex-col gap-3 px-1">

          <!-- ── Local corpus word search ── -->
          <div v-if="importedStories.length" class="flex flex-col gap-2">
            <div class="flex gap-2">
              <input
                v-model="wordQuery"
                placeholder="Find a word in your videos…"
                @keydown.enter="searchLocalCorpus"
                :disabled="importing"
                class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-600 placeholder:text-gray-600 disabled:opacity-50 transition-all"
              />
              <button
                @click="searchLocalCorpus"
                :disabled="importing || !wordQuery.trim()"
                class="px-4 py-2 bg-violet-700 text-white text-sm rounded-lg hover:bg-violet-600 disabled:opacity-40 transition-all whitespace-nowrap"
              >Find</button>
            </div>

            <div v-if="wordResults.length" class="flex flex-col gap-2 max-h-52 overflow-y-auto">
              <div v-for="r in wordResults" :key="r.video_id" class="flex flex-col gap-1">
                <div class="text-xs text-gray-400 font-medium truncate">{{ r.title }}</div>
                <div
                  v-for="h in r.hits.slice(0, 3)"
                  :key="h.start"
                  class="flex items-center gap-2 bg-slate-800 rounded px-2 py-1.5"
                >
                  <span class="text-[10px] text-gray-500 flex-shrink-0 tabular-nums">{{ fmtTime(h.start) }}</span>
                  <span class="text-xs text-gray-300 flex-1 min-w-0 truncate">{{ excerptAround(h.context, wordQuery) }}</span>
                  <button
                    @click="openAtTime(r.video_id, h.start)"
                    class="flex-shrink-0 text-[10px] px-2 py-0.5 bg-violet-700 text-white rounded hover:bg-violet-600 transition-all"
                  >▶</button>
                </div>
              </div>
            </div>
            <p v-else-if="wordSearched" class="text-xs text-gray-600 px-1">
              {{ hasWordData ? 'No matches found.' : 'Re-import videos to enable word search.' }}
            </p>

            <div v-if="hasYTSearch" class="flex items-center gap-2">
              <div class="flex-1 border-t border-gray-800"></div>
              <span class="text-xs text-gray-600">search YouTube</span>
              <div class="flex-1 border-t border-gray-800"></div>
            </div>
          </div>

          <!-- ── YouTube search (requires VITE_YOUTUBE_API_KEY) ── -->
          <div v-if="hasYTSearch" class="flex flex-col gap-2">
            <div class="flex gap-2">
              <input
                v-model="ytSearchQuery"
                :placeholder="`Search ${LANGS[lang]?.name ?? lang} videos with captions…`"
                @keydown.enter="runYTSearch"
                :disabled="ytSearching || importing"
                class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-600 placeholder:text-gray-600 disabled:opacity-50 transition-all"
              />
              <button
                @click="runYTSearch"
                :disabled="ytSearching || importing || !ytSearchQuery.trim()"
                class="px-4 py-2 bg-sky-700 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-40 transition-all whitespace-nowrap"
              >{{ ytSearching ? '…' : 'Search' }}</button>
            </div>

            <!-- Vocab chips -->
            <div v-if="vocabChips.length" class="flex flex-wrap gap-1.5">
              <button
                v-for="w in vocabChips"
                :key="w.word"
                @click="ytSearchQuery = w.word; runYTSearch()"
                class="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-gray-700 text-gray-400 hover:text-white hover:border-sky-600 transition-all"
              >{{ w.word }}</button>
            </div>

            <!-- Search results -->
            <div v-if="ytSearchResults.length" class="flex flex-col gap-2 max-h-80 overflow-y-auto pr-0.5">
              <div
                v-for="r in ytSearchResults"
                :key="r.videoId"
                class="flex gap-3 bg-slate-800 rounded-lg p-2 items-start"
              >
                <img :src="r.thumbnail" alt="" class="w-24 h-[54px] object-cover rounded flex-shrink-0 bg-slate-700" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-gray-100 leading-snug line-clamp-2">{{ r.title }}</div>
                  <div class="text-xs text-gray-500 mt-0.5 truncate">{{ r.channel }}</div>
                </div>
                <button
                  @click="doImport(r.videoId)"
                  :disabled="importing"
                  class="flex-shrink-0 text-xs px-2.5 py-1 bg-emerald-700 text-white rounded-md hover:bg-emerald-600 disabled:opacity-40 transition-all mt-0.5"
                >Import</button>
              </div>
            </div>

            <!-- divider -->
            <div class="flex items-center gap-2">
              <div class="flex-1 border-t border-gray-800"></div>
              <span class="text-xs text-gray-600">or paste URL</span>
              <div class="flex-1 border-t border-gray-800"></div>
            </div>
          </div>

          <!-- ── URL paste ── -->
          <div class="flex gap-2">
            <input
              v-model="importUrl"
              placeholder="https://youtube.com/watch?v=..."
              @keydown.enter="importFromUrl"
              :disabled="importing"
              class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-600 placeholder:text-gray-600 disabled:opacity-50 transition-all"
            />
            <button
              @click="importFromUrl"
              :disabled="importing || !importUrl.trim()"
              class="px-4 py-2 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-all whitespace-nowrap"
            >{{ importing ? '…' : 'Import' }}</button>
          </div>

          <p v-if="importError" class="text-xs text-red-400 px-1">{{ importError }}</p>
          <p class="text-xs text-gray-600 px-1">Captions are cached on this device — no server storage.</p>
        </div>
      </div>

      <!-- ── Locally imported stories ── -->
      <div v-if="importedStories.length" class="flex flex-col gap-2">
        <p class="text-xs text-gray-600 px-1">Saved on this device</p>
        <div
          v-for="story in importedStories"
          :key="story.video_id"
          class="w-full flex items-center gap-2 bg-slate-900 border border-gray-700 hover:border-sky-700 rounded-lg px-4 py-3 transition-all"
        >
          <button class="flex-1 text-left min-w-0" @click="loadStory(importedStoryObj(story))">
            <div class="font-medium text-sm text-gray-100 leading-snug truncate">{{ story.title }}</div>
            <div class="text-xs text-gray-500 mt-0.5 flex gap-2 flex-wrap">
              <span class="text-sky-600">📥 imported</span>
              <span>{{ story.segments.length }} {{ t(lang, 'segment') }}</span>
              <span v-if="story.is_autogenerated" class="text-yellow-600">{{ t(lang, 'autoCaptions') }}</span>
            </div>
          </button>
          <button
            @click="removeImport(story.video_id)"
            class="flex-shrink-0 text-gray-600 hover:text-red-400 text-sm transition-all px-1"
            title="Remove from this device"
          >✕</button>
        </div>
      </div>

      <!-- ── Curated stories ── -->
      <div v-if="storiesLoading" class="text-sm text-gray-500 text-center py-10">{{ t(lang, 'loading') }}</div>
      <div v-else-if="storiesError" class="text-sm text-red-400 text-center py-6">{{ storiesError }}</div>
      <div v-else-if="!stories.length && !importedStories.length" class="text-sm text-gray-500 text-center py-6">
        {{ t(lang, 'noExercises') }}
      </div>
      <div v-if="stories.length" class="flex flex-col gap-2">
        <p v-if="importedStories.length" class="text-xs text-gray-600 px-1">Curated exercises</p>
        <button
          v-for="story in stories"
          :key="story.id"
          @click="loadStory(story)"
          class="w-full text-left bg-slate-900 border border-gray-700 hover:border-emerald-700 rounded-lg px-4 py-3 transition-all"
        >
          <div class="font-medium text-sm text-gray-100 leading-snug">{{ story.title }}</div>
          <div class="text-xs text-gray-500 mt-0.5 flex gap-2 flex-wrap">
            <span v-if="story.author">{{ story.author }}</span>
            <span v-if="story.source" class="text-gray-600">{{ story.source }}</span>
            <span>{{ story.segments.length }} {{ t(lang, 'segment') }}</span>
            <span v-if="story.is_autogenerated" class="text-yellow-600">{{ t(lang, 'autoCaptions') }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Player -->
    <div v-else class="flex flex-col gap-4">

      <!-- Back + header -->
      <div class="flex items-start gap-3">
        <button
          @click="backToList"
          class="flex-shrink-0 text-gray-500 hover:text-white text-lg leading-none pt-0.5 transition-all"
          title="Back to list"
        >←</button>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <h2 class="font-semibold text-gray-100 text-base leading-snug">{{ selectedStory.title }}</h2>
          <div class="text-xs text-gray-500 flex gap-2">
            <span v-if="selectedStory.author">{{ selectedStory.author }}</span>
            <span v-if="selectedStory.source" class="uppercase tracking-wide">{{ selectedStory.source }}</span>
            <span>{{ LANGS[selectedStory.lang]?.name ?? selectedStory.lang }}</span>
          </div>
        </div>
        <button
          v-if="resumeSegment !== null"
          @click="resumeFromSaved"
          class="flex-shrink-0 text-xs text-emerald-400 border border-emerald-800 rounded-md px-2.5 py-1 hover:bg-emerald-950 transition-all"
        >{{ t(lang, 'resumeSeg') }} {{ resumeSegment + 1 }}</button>
      </div>

      <!-- Auto-generated transcript warning -->
      <div
        v-if="selectedStory.is_autogenerated"
        class="text-xs text-yellow-400 bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2"
      >
        {{ t(lang, 'autoGeneratedWarning') }}
      </div>

      <!-- Difficulty toggle -->
      <div class="flex gap-1.5">
        <button
          v-for="d in ['easy', 'medium', 'hard']"
          :key="d"
          @click="difficulty = d"
          :class="['text-xs px-3 py-1.5 rounded-full transition-all',
            difficulty === d ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
        >{{ t(lang, d) }}</button>
      </div>

      <!-- Waveform + timing -->
      <div class="bg-slate-900 rounded-xl px-4 pt-4 pb-3 flex flex-col gap-2">
        <svg width="100%" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
          <rect
            v-for="(h, i) in bars"
            :key="i"
            :x="i * 10 + 1"
            :width="8"
            :y="(60 - h) / 2"
            :height="h"
            rx="2"
            :fill="isPlaying ? '#10b981' : '#065f46'"
            :opacity="isPlaying ? 0.85 : 0.4"
          />
        </svg>
        <div class="flex justify-between text-xs text-gray-500">
          <span>{{ t(lang, 'segment') }} {{ segmentIdx + 1 }} / {{ segments.length }}</span>
          <span>{{ fmtTime(currentTime) }} / {{ fmtTime(segDuration) }}</span>
        </div>
      </div>

      <!-- Word highlight (visible during playback when word-level data is available) -->
      <div v-if="selectedStory?.words" class="h-7 flex items-center justify-center">
        <span
          v-if="currentWord && isPlaying"
          class="text-emerald-400 font-bold text-base tracking-wider"
        >{{ currentWord.raw }}</span>
      </div>

      <!-- Player error -->
      <div v-if="playerError" class="text-xs text-red-400 text-center py-2">{{ playerError }}</div>

      <!-- Controls -->
      <div class="flex items-center justify-center gap-6">
        <button
          @click="rewind"
          :disabled="!playerReady"
          class="text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-all flex flex-col items-center gap-0.5"
        >
          <span class="text-lg">⏮</span>
          <span class="text-xs">10s</span>
        </button>

        <button
          @click="togglePlay"
          :disabled="!playerReady"
          :class="['w-14 h-14 rounded-full text-2xl flex items-center justify-center transition-all',
            playerReady ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-800 text-gray-600']"
        >{{ isPlaying ? '⏸' : '▶' }}</button>

        <button
          @click="seekToSegmentStart"
          :disabled="!playerReady"
          class="text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-all flex flex-col items-center gap-0.5"
        >
          <span class="text-lg">↩</span>
          <span class="text-xs">restart</span>
        </button>
      </div>

      <div v-if="!playerReady && !playerError" class="text-xs text-gray-500 text-center">
        {{ t(lang, 'loadingPlayer') }}
      </div>

      <!-- Input area -->
      <div class="flex flex-col gap-2">
        <textarea
          v-model="userInput"
          rows="3"
          :placeholder="t(lang, 'typeWhatYouHear')"
          @keydown.space="playWordTick"
          class="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-600 resize-none placeholder:text-gray-600 transition-all"
        />

        <!-- Word-by-word colour feedback -->
        <div v-if="comparedWords.length" class="flex flex-wrap gap-1.5 px-1">
          <span
            v-for="(w, i) in comparedWords"
            :key="i"
            :class="['text-sm px-1.5 py-0.5 rounded font-mono transition-colors',
              w.state === 'correct' ? 'bg-emerald-900 text-emerald-300' :
              w.state === 'wrong'   ? 'bg-purple-900 text-purple-300' :
                                      'text-gray-500']"
          >{{ w.typed }}</span>
        </div>

        <!-- Accuracy badge -->
        <div v-if="accuracy !== null" class="flex justify-end">
          <span class="text-xs text-gray-500">
            {{ t(lang, 'accuracy') }}: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
            <span class="ml-1 text-gray-600">({{ correctCount }}/{{ segmentWords.length }} {{ t(lang, 'words') }})</span>
          </span>
        </div>
      </div>

      <!-- Transcript reveal -->
      <div
        v-if="showTranscript && currentSegment"
        class="bg-slate-900 border border-emerald-800 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed"
      >{{ currentSegment.text }}</div>

      <!-- Action row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            @click="showTranscript = !showTranscript"
            class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-emerald-700 hover:text-emerald-400 transition-all"
          >{{ showTranscript ? t(lang, 'hideTranscript') : t(lang, 'showCorrectText') }}</button>

          <button
            v-if="selectedStory.audio_url"
            @click="downloadAudio"
            :disabled="downloadingAudio"
            class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-sky-700 hover:text-sky-400 disabled:opacity-40 transition-all"
            title="Download audio for offline use"
          >{{ downloadingAudio ? '…' : t(lang, 'downloadAudio') }}</button>
        </div>

        <button
          @click="nextSegment"
          :disabled="segmentIdx >= segments.length - 1"
          class="text-xs px-4 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >{{ t(lang, 'nextSegment') }}</button>
      </div>

    </div>
  </div>


</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Fuse from 'fuse.js'
import { LANGS } from '../data/stories.js'
import { fetchListenStories, fetchYouTubeTranscript, searchYouTube, getAccountVocab } from '../utils/api.js'
import { cacheImport, getCachedImport, listCachedImports, deleteCachedImport, searchWordInImports } from '../utils/transcriptCache.js'
import { t } from '../utils/i18n.js'
import { isRTL } from '../utils/rtl.js'
import { spokenNumbers } from '../utils/spokenNumbers.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

// ── Story list ────────────────────────────────────────────────────────────────

const stories         = ref([])
const storiesLoading  = ref(false)
const storiesError    = ref('')
const selectedStory   = ref(null)
const importedStories = ref([])  // locally cached imports from IndexedDB

async function loadStories() {
  storiesLoading.value = true
  storiesError.value   = ''
  try {
    stories.value = await fetchListenStories(props.lang)
  } catch {
    storiesError.value = 'Could not load listening exercises.'
  } finally {
    storiesLoading.value = false
  }
}

async function loadImportedStories() {
  const all = await listCachedImports().catch(() => [])
  importedStories.value = all.filter(s => s.lang === props.lang)
}

watch(() => props.lang, () => {
  backToList()
  loadStories()
  loadImportedStories()
})

// ── YouTube import + search ───────────────────────────────────────────────────

const importUrl        = ref('')
const importExpanded   = ref(false)
const importing        = ref(false)
const importError      = ref('')
const hasYTSearch      = !!import.meta.env.VITE_YOUTUBE_API_KEY

const ytSearchQuery    = ref('')
const ytSearchResults  = ref([])
const ytSearching      = ref(false)
const vocabChips       = ref([])

const wordQuery    = ref('')
const wordResults  = ref([])
const wordSearched = ref(false)
const hasWordData  = computed(() => importedStories.value.some(s => s.words?.length > 0))

watch(importExpanded, async (open) => {
  if (open && hasYTSearch && !vocabChips.value.length) {
    try {
      const vocab = await getAccountVocab()
      vocabChips.value = vocab.filter(w => w.lang === props.lang).slice(0, 14)
    } catch {}
  }
})

function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim()
  return null
}

async function doImport(videoId) {
  importError.value = ''
  importing.value   = true
  try {
    const cached = await getCachedImport(videoId, props.lang)
    if (cached) {
      importUrl.value      = ''
      importExpanded.value = false
      ytSearchResults.value = []
      loadStory(importedStoryObj(cached))
      return
    }
    const data = await fetchYouTubeTranscript(videoId, props.lang)
    await cacheImport(data)
    await loadImportedStories()
    importUrl.value      = ''
    importExpanded.value = false
    ytSearchResults.value = []
    loadStory(importedStoryObj(data))
  } catch (err) {
    importError.value = err.status === 429
      ? 'YouTube is rate-limiting the server right now. Try again in a few minutes.'
      : (err.message || 'Could not import this video.')
  } finally {
    importing.value = false
  }
}

async function importFromUrl() {
  const url     = importUrl.value.trim()
  if (!url) return
  const videoId = extractVideoId(url)
  if (!videoId) { importError.value = 'Could not find a YouTube video ID in that URL.'; return }
  await doImport(videoId)
}

async function runYTSearch() {
  const q = ytSearchQuery.value.trim()
  if (!q || ytSearching.value) return
  ytSearching.value    = true
  ytSearchResults.value = []
  importError.value    = ''
  try {
    ytSearchResults.value = await searchYouTube(q, props.lang)
  } finally {
    ytSearching.value = false
  }
}

async function removeImport(videoId) {
  await deleteCachedImport(videoId, props.lang).catch(() => {})
  await loadImportedStories()
  if (selectedStory.value?.id === `local_${videoId}`) backToList()
}

async function searchLocalCorpus() {
  const q = wordQuery.value.trim()
  if (!q) return
  wordSearched.value = true
  wordResults.value  = await searchWordInImports(q, props.lang).catch(() => [])
}

async function openAtTime(videoId, startSec) {
  const cached = await getCachedImport(videoId, props.lang).catch(() => null)
  if (!cached) return
  importExpanded.value = false
  wordResults.value    = []
  wordSearched.value   = false
  wordQuery.value      = ''
  await loadStory(importedStoryObj(cached), startSec)
}

function excerptAround(text, word, radius = 30) {
  const idx = (text ?? '').toLowerCase().indexOf(word.toLowerCase())
  if (idx === -1) return (text ?? '').slice(0, 60)
  const s = Math.max(0, idx - radius)
  const e = Math.min(text.length, idx + word.length + radius)
  return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '')
}

// Converts an IndexedDB-cached import into the same shape the player expects.
function importedStoryObj(data) {
  return {
    id:              `local_${data.video_id}`,
    video_id:        data.video_id,
    source_type:     'youtube',
    title:           data.title,
    lang:            data.lang,
    is_autogenerated: data.is_autogenerated,
    segments:        data.segments,
    words:           data.words ?? null,
    audio_url:       null,
    author:          null,
    source:          'YouTube',
    _isImport:       true,
  }
}

// ── Load a story into the player ──────────────────────────────────────────────

const segments       = ref([])
const segmentIdx     = ref(0)
const userInput      = ref('')
const showTranscript = ref(false)
const resumeSegment  = ref(null)
const difficulty     = ref('medium')

async function loadStory(story, startAt = null) {
  teardown()
  selectedStory.value  = story
  segments.value       = story.segments
  segmentIdx.value     = 0
  userInput.value      = ''
  showTranscript.value = false
  _pendingStartAt      = startAt

  const saved = JSON.parse(localStorage.getItem('szol_listen_progress') || '{}')
  const vp    = saved[story.id]
  resumeSegment.value = (startAt === null && vp && vp.segmentIndex > 0 && vp.segmentIndex < story.segments.length)
    ? vp.segmentIndex : null

  if (story.source_type === 'youtube') {
    loadYTApi(story.video_id)
  } else {
    await nextTick()
    if (audioEl.value) {
      audioEl.value.currentTime = story.segments[0]?.start ?? 0
      if (audioEl.value.readyState >= 1) onAudioLoaded()
    }
  }
}

function backToList() {
  teardown()
  selectedStory.value  = null
  segments.value       = []
  segmentIdx.value     = 0
  userInput.value      = ''
  showTranscript.value = false
  resumeSegment.value  = null
}

// ── YouTube player (dictation) ────────────────────────────────────────────────

const ytContainerEl = ref(null)
const playerReady   = ref(false)
const playerError   = ref('')
const isPlaying     = ref(false)
const currentTime   = ref(0)
const duration      = ref(0)

let player          = null
let pollTimer       = null
let _pendingStartAt = null

function initPlayer(id) {
  if (!ytContainerEl.value) return
  try {
    player = new window.YT.Player(ytContainerEl.value, {
      width:    0,
      height:   0,
      videoId:  id,
      playerVars: { controls: 0, rel: 0, disablekb: 1, fs: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady(e) {
          playerReady.value = true
          duration.value    = e.target.getDuration() || 0
          let seekTarget = segments.value[segmentIdx.value]?.start ?? 0
          if (_pendingStartAt !== null) {
            seekTarget = _pendingStartAt
            const idx  = segments.value.findIndex(s => s.start <= _pendingStartAt && s.end >= _pendingStartAt)
            if (idx >= 0) segmentIdx.value = idx
            _pendingStartAt = null
          }
          e.target.seekTo(seekTarget, true)
          e.target.pauseVideo()
        },
        onStateChange(e) {
          const playing = e.data === window.YT.PlayerState.PLAYING
          isPlaying.value = playing
          if (playing) {
            startWave()
            pollTimer = setInterval(pollYTTime, 150)
          } else {
            stopWave()
            clearInterval(pollTimer)
            pollTimer = null
          }
        },
        onError() {
          playerError.value = 'Video unavailable — it may be restricted or deleted.'
          playerReady.value = false
        },
      },
    })
  } catch {
    playerError.value = 'Could not load the YouTube player.'
  }
}

function loadYTApi(id) {
  if (window.YT?.Player) { initPlayer(id); return }
  window.onYouTubeIframeAPIReady = () => initPlayer(id)
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s   = document.createElement('script')
    s.src     = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { playerError.value = 'Failed to load YouTube API.' }
    document.head.appendChild(s)
  }
}

function pollYTTime() {
  if (!player?.getCurrentTime) return
  currentTime.value = player.getCurrentTime()
  const seg = segments.value[segmentIdx.value]
  if (seg && currentTime.value >= seg.end) {
    player.pauseVideo()
    currentTime.value = seg.end
  }
}

// ── HTML5 audio handlers ──────────────────────────────────────────────────────

const audioEl = ref(null)

function onAudioLoaded() {
  playerReady.value = true
  duration.value    = audioEl.value?.duration || 0
  const startAt = segments.value[segmentIdx.value]?.start ?? 0
  if (audioEl.value && Math.abs(audioEl.value.currentTime - startAt) > 1) {
    audioEl.value.currentTime = startAt
  }
}

function onAudioTimeUpdate() {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  const seg = segments.value[segmentIdx.value]
  if (seg && currentTime.value >= seg.end) {
    audioEl.value.pause()
    currentTime.value = seg.end
  }
}

// ── Unified player controls ───────────────────────────────────────────────────

function isYouTubeStory() { return selectedStory.value?.source_type === 'youtube' }

function togglePlay() {
  if (!playerReady.value) return
  if (isYouTubeStory()) {
    isPlaying.value ? player.pauseVideo() : player.playVideo()
  } else {
    isPlaying.value ? audioEl.value.pause() : audioEl.value.play()
  }
}

function rewind() {
  if (!playerReady.value) return
  const segStart = segments.value[segmentIdx.value]?.start ?? 0
  const newTime  = Math.max(segStart, (isYouTubeStory() ? player.getCurrentTime() : audioEl.value.currentTime) - 10)
  seekTo(newTime)
}

function seekToSegmentStart() {
  if (!playerReady.value) return
  seekTo(segments.value[segmentIdx.value]?.start ?? 0)
}

function seekTo(t) {
  if (isYouTubeStory()) {
    player.seekTo(t, true)
  } else if (audioEl.value) {
    audioEl.value.currentTime = t
  }
  currentTime.value = t
}

function nextSegment() {
  if (segmentIdx.value >= segments.value.length - 1) return
  const next = segments.value[segmentIdx.value + 1]
  seekTo(next.start)
  if (isYouTubeStory()) player.pauseVideo()
  else if (audioEl.value) audioEl.value.pause()
  segmentIdx.value++
  userInput.value      = ''
  showTranscript.value = false
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown() {
  clearInterval(pollTimer); pollTimer = null
  stopWave()
  if (player?.destroy) { player.destroy(); player = null }
  if (audioEl.value)   { audioEl.value.pause(); audioEl.value.currentTime = 0 }
  playerReady.value = false
  playerError.value = ''
  isPlaying.value   = false
  currentTime.value = 0
  duration.value    = 0
}

// ── Segment state ─────────────────────────────────────────────────────────────

const currentSegment = computed(() => segments.value[segmentIdx.value] ?? null)

const segDuration = computed(() => {
  const seg = currentSegment.value
  return seg ? (seg.end - seg.start) : 0
})

// Binary-search the word currently being spoken (requires word-level json3 data).
const currentWord = computed(() => {
  const words = selectedStory.value?.words
  if (!words?.length) return null
  const t = currentTime.value
  let lo = 0, hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    words[mid].start <= t ? (lo = mid) : (hi = mid - 1)
  }
  return words[lo]?.start <= t ? words[lo] : null
})

function fmtTime(secs) {
  const s = Math.floor(secs || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Waveform ──────────────────────────────────────────────────────────────────

const BASE_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  const envelope = Math.sin((i / 39) * Math.PI)
  const detail   = Math.sin(i * 1.7) * 0.25
  return Math.max(4, Math.round((envelope * 0.6 + detail + 0.5) * 44 + 6))
})

const bars = ref([...BASE_HEIGHTS])
let waveTimer = null

function startWave() {
  if (waveTimer) return
  waveTimer = setInterval(() => {
    bars.value = BASE_HEIGHTS.map(base => Math.max(4, Math.min(56, base + (Math.random() - 0.5) * 28)))
  }, 90)
}

function stopWave() {
  clearInterval(waveTimer); waveTimer = null
  bars.value = [...BASE_HEIGHTS]
}

// ── Word tick (audio feedback on word completion) ─────────────────────────────

let _audioCtx = null
function playWordTick() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_audioCtx.state === 'suspended') _audioCtx.resume()
    const osc  = _audioCtx.createOscillator()
    const gain = _audioCtx.createGain()
    osc.connect(gain)
    gain.connect(_audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, _audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, _audioCtx.currentTime + 0.04)
    gain.gain.setValueAtTime(0.07, _audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.08)
    osc.start(_audioCtx.currentTime)
    osc.stop(_audioCtx.currentTime + 0.08)
  } catch {}
}

// ── Word comparison ───────────────────────────────────────────────────────────

function normalizeWord(w) {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function wordMatch(typed, expected) {
  if (difficulty.value === 'hard')  return typed === expected
  const t = normalizeWord(typed)
  const e = normalizeWord(expected)
  if (difficulty.value === 'medium') return t === e
  return new Fuse([e], { threshold: 0.4 }).search(t).length > 0
}

const segmentWords = computed(() =>
  spokenNumbers(currentSegment.value?.text ?? '', props.lang).split(/\s+/).filter(Boolean)
)
const userWords    = computed(() => userInput.value.trim().split(/\s+/).filter(w => w))

const comparedWords = computed(() =>
  userWords.value.map((w, i) => {
    const expected = segmentWords.value[i]
    if (!expected) return { typed: w, state: 'extra' }
    return { typed: w, state: wordMatch(w, expected) ? 'correct' : 'wrong' }
  })
)

const correctCount = computed(() => comparedWords.value.filter(w => w.state === 'correct').length)

const accuracy = computed(() => {
  if (!userWords.value.length) return null
  return Math.round((correctCount.value / segmentWords.value.length) * 100)
})

// ── localStorage progress ─────────────────────────────────────────────────────

function saveProgress() {
  if (!selectedStory.value) return
  const all = JSON.parse(localStorage.getItem('szol_listen_progress') || '{}')
  all[selectedStory.value.id] = { segmentIndex: segmentIdx.value, timestamp: Date.now() }
  localStorage.setItem('szol_listen_progress', JSON.stringify(all))
}

function resumeFromSaved() {
  const idx = resumeSegment.value
  resumeSegment.value  = null
  segmentIdx.value     = idx
  userInput.value      = ''
  showTranscript.value = false
  seekTo(segments.value[idx]?.start ?? 0)
}

watch(segmentIdx, saveProgress)

// ── Audio download ────────────────────────────────────────────────────────────

const downloadingAudio = ref(false)

async function downloadAudio() {
  if (!selectedStory.value?.audio_url) return
  downloadingAudio.value = true
  try {
    const res  = await fetch(selectedStory.value.audio_url)
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const ext  = selectedStory.value.audio_url.split('.').pop().split('?')[0] || 'mp3'
    a.download = `${selectedStory.value.title}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    downloadingAudio.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  loadStories()
  loadImportedStories()
  // Pre-load YouTube iframe API (used by dictation player).
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
})

onUnmounted(() => {
  teardown()
})
</script>
