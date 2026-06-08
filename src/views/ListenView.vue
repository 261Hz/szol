<!-- ListenView.vue — YouTube audio dictation. -->
<!-- Curated video segments are stored in the backend (video_stories table). -->
<!-- YouTube is used only as a player — captions come from our database. -->
<template>
  <!-- Hidden YouTube player container -->
  <div ref="ytEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <div class="flex flex-col gap-4">

    <!-- ── Curated video list ── -->
    <div class="flex flex-col gap-1.5">
      <div v-if="loading" class="text-xs text-gray-500 text-center py-4">Loading…</div>
      <div v-else-if="!curatedVideos.length" class="text-xs text-gray-500 text-center py-4">
        No curated videos yet for this language.
      </div>
      <div
        v-for="v in curatedVideos"
        :key="v.id"
        @click="selectVideo(v)"
        :class="['flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
          activeVideo?.id === v.id ? 'border-emerald-600 bg-emerald-950' : 'border-gray-700 hover:border-emerald-800']"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="text-sm font-medium text-gray-100 truncate">{{ v.title }}</span>
          <span class="text-xs text-gray-500">{{ v.author ?? v.source }} · {{ v.segments.length }} segments</span>
        </div>
        <span class="text-xs text-emerald-600 flex-shrink-0 ml-2">{{ activeVideo?.id === v.id ? '▶ playing' : 'Listen →' }}</span>
      </div>
    </div>

    <!-- ── Custom URL + transcript paste ── -->
    <details class="border border-gray-800 rounded-lg overflow-hidden">
      <summary class="px-3 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300 select-none">+ Custom video</summary>
      <div class="px-3 pb-3 pt-2 flex flex-col gap-2 border-t border-gray-800">
        <div class="flex gap-2">
          <input
            v-model="urlInput"
            type="text"
            placeholder="YouTube URL or video ID…"
            @keydown.enter="loadCustomVideo"
            class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-emerald-600 placeholder:text-gray-600 transition-all"
          />
          <button @click="loadCustomVideo" :disabled="!urlInput.trim()"
            class="text-sm px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all">Load</button>
        </div>
        <div class="flex gap-2">
          <textarea
            v-model="transcriptInput"
            rows="2"
            placeholder="Paste transcript (YouTube → … → Open transcript → copy)"
            class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 outline-none focus:border-emerald-600 placeholder:text-gray-500 resize-none transition-all"
          />
          <button @click="loadTranscript" :disabled="!transcriptInput.trim()"
            class="text-sm px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 self-start transition-all">Set</button>
        </div>
        <div v-if="customError" class="text-xs text-red-400">{{ customError }}</div>
      </div>
    </details>

    <!-- ── Player (shown once a video is selected) ── -->
    <template v-if="activeVideo">

      <!-- Difficulty -->
      <div class="flex gap-1.5">
        <button v-for="d in ['easy','medium','hard']" :key="d" @click="difficulty = d"
          :class="['text-xs px-3 py-1.5 rounded-full capitalize transition-all',
            difficulty === d ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
        >{{ d }}</button>
      </div>

      <!-- Waveform -->
      <div class="bg-slate-900 rounded-xl px-4 pt-4 pb-3 flex flex-col gap-2">
        <svg width="100%" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
          <rect v-for="(h, i) in bars" :key="i"
            :x="i * 10 + 1" :width="8" :y="(60 - h) / 2" :height="h" rx="2"
            :fill="isPlaying ? '#10b981' : '#065f46'"
            :opacity="isPlaying ? 0.85 : 0.4"
          />
        </svg>
        <div class="flex justify-between text-xs text-gray-500">
          <span>segment {{ segmentIdx + 1 }} / {{ activeVideo.segments.length }}</span>
          <span>{{ fmtTime(currentTime) }} / {{ fmtTime(duration) }}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-center gap-6">
        <button @click="rewind" :disabled="!playerReady"
          class="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white disabled:opacity-30 transition-all">
          <span class="text-lg">⏮</span><span class="text-xs">10s</span>
        </button>
        <button @click="togglePlay" :disabled="!playerReady"
          :class="['w-14 h-14 rounded-full text-2xl flex items-center justify-center transition-all',
            playerReady ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-800 text-gray-600']"
        >{{ isPlaying ? '⏸' : '▶' }}</button>
        <button @click="seekToSegmentStart" :disabled="!playerReady"
          class="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white disabled:opacity-30 transition-all">
          <span class="text-lg">↩</span><span class="text-xs">restart</span>
        </button>
      </div>
      <div v-if="!playerReady && !playerError" class="text-xs text-gray-500 text-center">Loading player…</div>
      <div v-if="playerError" class="text-xs text-red-400 text-center">{{ playerError }}</div>

      <!-- Dictation input -->
      <div class="flex flex-col gap-2">
        <textarea
          v-model="userInput"
          rows="3"
          placeholder="Type what you hear…"
          class="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-600 resize-none placeholder:text-gray-600 transition-all"
        />
        <div v-if="comparedWords.length" class="flex flex-wrap gap-1.5 px-1">
          <span v-for="(w, i) in comparedWords" :key="i"
            :class="['text-sm px-1.5 py-0.5 rounded font-mono',
              w.state === 'correct' ? 'bg-emerald-900 text-emerald-300' :
              w.state === 'wrong'   ? 'bg-purple-900 text-purple-300' : 'text-gray-500']"
          >{{ w.typed }}</span>
        </div>
        <div v-if="accuracy !== null" class="flex justify-end">
          <span class="text-xs text-gray-500">
            Accuracy: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
          </span>
        </div>
      </div>

      <!-- Transcript reveal -->
      <div v-if="showTranscript && currentSegment"
        class="bg-slate-900 border border-emerald-800 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed">
        {{ currentSegment.text }}
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between">
        <button @click="showTranscript = !showTranscript"
          class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-emerald-700 hover:text-emerald-400 transition-all">
          {{ showTranscript ? 'Hide transcript' : 'Show correct text' }}
        </button>
        <button @click="nextSegment" :disabled="segmentIdx >= activeVideo.segments.length - 1"
          class="text-xs px-4 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all">
          Next segment →
        </button>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Fuse from 'fuse.js'

const props = defineProps({
  lang:        String,
  currentUser: Object,
  story:       Object,
})

const API_URL = 'https://szol.onrender.com'

// ── Curated videos ────────────────────────────────────────────────────────────

const curatedVideos = ref([])
const loading       = ref(false)

async function fetchCuratedVideos(lang) {
  loading.value = true
  try {
    const r = await fetch(`${API_URL}/listen-stories?lang=${lang}`)
    curatedVideos.value = r.ok ? await r.json() : []
  } catch { curatedVideos.value = [] }
  finally   { loading.value = false }
}

watch(() => props.lang, lang => { if (lang) fetchCuratedVideos(lang) }, { immediate: true })

// ── Active video + segments ───────────────────────────────────────────────────

const activeVideo    = ref(null)
const segmentIdx     = ref(0)
const userInput      = ref('')
const showTranscript = ref(false)
const difficulty     = ref('medium')

const currentSegment = computed(() => activeVideo.value?.segments[segmentIdx.value] ?? null)

function selectVideo(v) {
  if (player?.destroy) { player.destroy(); player = null }
  playerReady.value    = false
  playerError.value    = ''
  isPlaying.value      = false
  activeVideo.value    = v
  segmentIdx.value     = 0
  userInput.value      = ''
  showTranscript.value = false
  stopWave()
  loadYTApi(v.video_id)
}

// ── Custom URL + transcript paste ─────────────────────────────────────────────

const urlInput        = ref('')
const transcriptInput = ref('')
const customError     = ref('')

function extractVideoId(input) {
  input = input.trim()
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) { const m = input.match(re); if (m) return m[1] }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
  return null
}

function loadCustomVideo() {
  const id = extractVideoId(urlInput.value)
  if (!id) { customError.value = 'Could not find a YouTube video ID.'; return }
  customError.value = ''
  selectVideo({ id: 'custom-' + id, video_id: id, title: 'Custom video', segments: [] })
}

function loadTranscript() {
  const raw = transcriptInput.value.trim()
  if (!raw || !activeVideo.value) return
  const text = raw.split('\n').map(l => l.trim())
    .filter(l => l && !/^\d+:\d{2}(:\d{2})?$/.test(l))
    .join(' ').replace(/\s{2,}/g, ' ')
  const words = text.split(/\s+/).filter(Boolean)
  const segs  = []
  for (let i = 0; i < words.length; i += 15)
    segs.push({ start: 0, end: 0, text: words.slice(i, i + 15).join(' ') })
  if (!segs.length) { customError.value = 'Could not parse transcript.'; return }
  activeVideo.value     = { ...activeVideo.value, segments: segs }
  segmentIdx.value      = 0
  userInput.value       = ''
  showTranscript.value  = false
  transcriptInput.value = ''
}

// ── YouTube player ────────────────────────────────────────────────────────────

const ytEl        = ref(null)
const playerReady = ref(false)
const playerError = ref('')
const isPlaying   = ref(false)
const currentTime = ref(0)
const duration    = ref(0)

let player    = null
let pollTimer = null

function initPlayer(videoId) {
  if (!ytEl.value) return
  try {
    player = new window.YT.Player(ytEl.value, {
      width: 0, height: 0, videoId,
      playerVars: { controls: 0, rel: 0, disablekb: 1, fs: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady(e) {
          playerReady.value = true
          duration.value    = e.target.getDuration() || 0
          const start       = activeVideo.value?.segments[0]?.start ?? 0
          e.target.seekTo(start, true)
          e.target.pauseVideo()
          const data = e.target.getVideoData?.()
          if (data?.title && activeVideo.value?.title === 'Custom video')
            activeVideo.value = { ...activeVideo.value, title: data.title }
        },
        onStateChange(e) {
          isPlaying.value = e.data === window.YT.PlayerState.PLAYING
          if (isPlaying.value) { startWave(); pollTimer = setInterval(pollTime, 400) }
          else { stopWave(); clearInterval(pollTimer) }
        },
        onError() { playerError.value = 'Video unavailable or restricted.' },
      },
    })
  } catch { playerError.value = 'Could not load the YouTube player.' }
}

function loadYTApi(videoId) {
  if (window.YT?.Player) { initPlayer(videoId); return }
  window.onYouTubeIframeAPIReady = () => initPlayer(videoId)
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
}

function pollTime() {
  if (!player?.getCurrentTime) return
  currentTime.value = player.getCurrentTime()
  const seg = currentSegment.value
  if (seg?.end > 0 && currentTime.value >= seg.end) {
    player.pauseVideo(); currentTime.value = seg.end
  }
}

function togglePlay() {
  if (!player || !playerReady.value) return
  isPlaying.value ? player.pauseVideo() : player.playVideo()
}

function rewind() {
  if (!player || !playerReady.value) return
  const min = currentSegment.value?.start ?? 0
  player.seekTo(Math.max(min, (player.getCurrentTime() || 0) - 10), true)
}

function seekToSegmentStart() {
  if (!player || !playerReady.value) return
  const start = currentSegment.value?.start ?? 0
  player.seekTo(start, true); currentTime.value = start
}

function nextSegment() {
  if (!activeVideo.value || segmentIdx.value >= activeVideo.value.segments.length - 1) return
  const next = activeVideo.value.segments[segmentIdx.value + 1]
  if (player) { player.pauseVideo(); if (next.start > 0) player.seekTo(next.start, true) }
  segmentIdx.value++; userInput.value = ''; showTranscript.value = false
  if (next.start > 0) currentTime.value = next.start
}

function fmtTime(s) {
  s = Math.floor(s || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Waveform ──────────────────────────────────────────────────────────────────

const BASE_HEIGHTS = Array.from({ length: 40 }, (_, i) =>
  Math.max(4, Math.round((Math.sin((i / 39) * Math.PI) * 0.6 + Math.sin(i * 1.7) * 0.25 + 0.5) * 44 + 6))
)
const bars    = ref([...BASE_HEIGHTS])
let waveTimer = null

function startWave() {
  if (waveTimer) return
  waveTimer = setInterval(() => {
    bars.value = BASE_HEIGHTS.map(b => Math.max(4, Math.min(56, b + (Math.random() - 0.5) * 28)))
  }, 90)
}
function stopWave() { clearInterval(waveTimer); waveTimer = null; bars.value = [...BASE_HEIGHTS] }

// ── Word comparison ───────────────────────────────────────────────────────────

function normalizeWord(w) {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function wordMatch(typed, expected) {
  if (difficulty.value === 'hard')   return typed === expected
  const t = normalizeWord(typed), e = normalizeWord(expected)
  if (difficulty.value === 'medium') return t === e
  return new Fuse([e], { threshold: 0.4 }).search(t).length > 0
}

const segmentWords  = computed(() => (currentSegment.value?.text ?? '').split(/\s+/).filter(Boolean))
const userWords     = computed(() => userInput.value.trim().split(/\s+/).filter(Boolean))
const comparedWords = computed(() =>
  userWords.value.map((w, i) => {
    const exp = segmentWords.value[i]
    if (!exp) return { typed: w, state: 'extra' }
    return { typed: w, state: wordMatch(w, exp) ? 'correct' : 'wrong' }
  })
)
const accuracy = computed(() => {
  if (!userWords.value.length) return null
  return Math.round(comparedWords.value.filter(w => w.state === 'correct').length / segmentWords.value.length * 100)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
})

onUnmounted(() => {
  clearInterval(pollTimer); stopWave()
  if (player?.destroy) player.destroy()
})
</script>
