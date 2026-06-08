<!-- ListenView.vue — YouTube audio dictation practice. -->
<!-- User listens to a YouTube video segment by segment and types what they hear. -->
<!-- Words are colored green (correct) or purple (wrong) in real time. -->
<template>
  <!-- Hidden YouTube player container — IFrame API needs a real DOM node -->
  <div ref="ytContainerEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <div class="flex flex-col gap-4">

    <!-- ── Header ── -->
    <div class="flex items-center justify-between gap-3">
      <div class="flex flex-col gap-0.5 min-w-0">
        <h2 class="font-semibold text-gray-100 text-base truncate">{{ VIDEO.title }}</h2>
        <span class="text-xs text-gray-500 uppercase tracking-wide">{{ LANGS[lang]?.name ?? lang }}</span>
      </div>
      <button
        v-if="resumeSegment !== null"
        @click="resumeFromSaved"
        class="flex-shrink-0 text-xs text-emerald-400 border border-emerald-800 rounded-md px-2.5 py-1 hover:bg-emerald-950 transition-all"
      >Resume seg. {{ resumeSegment + 1 }}</button>
    </div>

    <!-- ── Difficulty toggle ── -->
    <div class="flex gap-1.5">
      <button
        v-for="d in ['easy', 'medium', 'hard']"
        :key="d"
        @click="setDifficulty(d)"
        :class="['text-xs px-3 py-1.5 rounded-full capitalize transition-all',
          difficulty === d ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
      >{{ d }}</button>
    </div>

    <!-- ── Waveform + timing ── -->
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
        <span>segment {{ segmentIdx + 1 }} / {{ SEGMENTS.length }}</span>
        <span>{{ fmtTime(currentTime) }} / {{ fmtTime(duration) }}</span>
      </div>
    </div>

    <!-- ── Player error ── -->
    <div v-if="playerError" class="text-xs text-red-400 text-center py-2">
      {{ playerError }}
    </div>

    <!-- ── Controls ── -->
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

    <!-- Loading indicator -->
    <div v-if="!playerReady && !playerError" class="text-xs text-gray-500 text-center">
      Loading player…
    </div>

    <!-- ── Input area ── -->
    <div class="flex flex-col gap-2">
      <textarea
        v-model="userInput"
        rows="3"
        placeholder="Type what you hear…"
        class="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-600 resize-none placeholder:text-gray-600 transition-all"
      />

      <!-- Word-by-word color feedback -->
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
          Accuracy: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
          <span class="ml-1 text-gray-600">({{ correctCount }}/{{ segmentWords.length }} words)</span>
        </span>
      </div>
    </div>

    <!-- ── Transcript reveal ── -->
    <div
      v-if="showTranscript"
      class="bg-slate-900 border border-emerald-800 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed"
    >{{ currentSegment.text }}</div>

    <!-- ── Action row ── -->
    <div class="flex items-center justify-between">
      <button
        @click="showTranscript = !showTranscript"
        class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-emerald-700 hover:text-emerald-400 transition-all"
      >{{ showTranscript ? 'Hide transcript' : 'Show correct text' }}</button>

      <button
        @click="nextSegment"
        :disabled="segmentIdx >= SEGMENTS.length - 1"
        class="text-xs px-4 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
      >Next segment →</button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Fuse from 'fuse.js'
import { LANGS } from '../data/stories.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

// ── Test video + hardcoded transcript ─────────────────────────────────────────

const VIDEO = {
  id:    'arj7oStGLkU',
  title: 'TED Talk — English Dictation Practice',
}

const SEGMENTS = [
  { start: 0,   end: 32,  text: "I want to start by offering you a free no-tech life hack and all it requires of you is this: that you change your posture for two minutes." },
  { start: 32,  end: 65,  text: "But before I give it away, I want to ask you to right now do a little audit of your body and what you're doing with your body." },
  { start: 65,  end: 95,  text: "So how many of you are sort of making yourselves smaller? Maybe you're hunching, crossing your legs, maybe wrapping your ankles." },
  { start: 95,  end: 125, text: "Sometimes we hold onto our arms like this. Sometimes we spread out. I see you. So I want you to pay attention to what you're doing right now." },
  { start: 125, end: 160, text: "We're going to come back to that in a few minutes, and I'm hoping that if you learn to tweak this a little bit, it could significantly change the way your life unfolds." },
]

// ── Difficulty ────────────────────────────────────────────────────────────────

const difficulty = ref('medium')

function setDifficulty(d) {
  difficulty.value = d
}

// ── Segment state ─────────────────────────────────────────────────────────────

const segmentIdx     = ref(0)
const userInput      = ref('')
const showTranscript = ref(false)
const resumeSegment  = ref(null)

const currentSegment = computed(() => SEGMENTS[segmentIdx.value])

// ── YouTube player ────────────────────────────────────────────────────────────

const ytContainerEl = ref(null)
const playerReady   = ref(false)
const playerError   = ref('')
const isPlaying     = ref(false)
const currentTime   = ref(0)
const duration      = ref(0)

let player      = null
let pollTimer   = null

function initPlayer() {
  if (!ytContainerEl.value) return
  try {
    player = new window.YT.Player(ytContainerEl.value, {
      width:    0,
      height:   0,
      videoId:  VIDEO.id,
      playerVars: {
        controls:       0,
        rel:            0,
        disablekb:      1,
        fs:             0,
        modestbranding: 1,
        iv_load_policy: 3,
        start:          SEGMENTS[0].start,
      },
      events: {
        onReady(e) {
          playerReady.value = true
          duration.value    = e.target.getDuration() || 0
          e.target.seekTo(SEGMENTS[segmentIdx.value].start, true)
          e.target.pauseVideo()
        },
        onStateChange(e) {
          const playing = e.data === window.YT.PlayerState.PLAYING
          isPlaying.value = playing
          if (playing) {
            startWave()
            pollTimer = setInterval(pollTime, 400)
          } else {
            stopWave()
            clearInterval(pollTimer)
          }
        },
        onError() {
          playerError.value = 'Video unavailable. The video may be restricted or deleted.'
          playerReady.value = false
        },
      },
    })
  } catch (e) {
    playerError.value = 'Could not load the YouTube player.'
  }
}

function loadYTApi() {
  if (window.YT?.Player) {
    initPlayer()
    return
  }
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    if (prev) prev()
    initPlayer()
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s  = document.createElement('script')
    s.src    = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { playerError.value = 'Failed to load YouTube API. Check your connection.' }
    document.head.appendChild(s)
  }
}

function pollTime() {
  if (!player?.getCurrentTime) return
  currentTime.value = player.getCurrentTime()
  const seg = SEGMENTS[segmentIdx.value]
  if (currentTime.value >= seg.end) {
    player.pauseVideo()
    currentTime.value = seg.end
  }
}

function togglePlay() {
  if (!player || !playerReady.value) return
  if (isPlaying.value) {
    player.pauseVideo()
  } else {
    player.playVideo()
  }
}

function rewind() {
  if (!player || !playerReady.value) return
  const newTime = Math.max(SEGMENTS[segmentIdx.value].start, (player.getCurrentTime() || 0) - 10)
  player.seekTo(newTime, true)
  currentTime.value = newTime
}

function seekToSegmentStart() {
  if (!player || !playerReady.value) return
  player.seekTo(SEGMENTS[segmentIdx.value].start, true)
  currentTime.value = SEGMENTS[segmentIdx.value].start
  if (isPlaying.value) player.playVideo()
}

function nextSegment() {
  if (segmentIdx.value >= SEGMENTS.length - 1) return
  if (player) { player.pauseVideo(); player.seekTo(SEGMENTS[segmentIdx.value + 1].start, true) }
  segmentIdx.value++
  userInput.value      = ''
  showTranscript.value = false
  currentTime.value    = SEGMENTS[segmentIdx.value].start
}

function fmtTime(secs) {
  const s = Math.floor(secs || 0)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// ── Waveform animation ────────────────────────────────────────────────────────

// 40 bars with varied base heights for a realistic look
const BASE_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  const envelope = Math.sin((i / 39) * Math.PI)        // peaks in the middle
  const detail   = Math.sin(i * 1.7) * 0.25            // local variation
  return Math.max(4, Math.round((envelope * 0.6 + detail + 0.5) * 44 + 6))
})

const bars = ref([...BASE_HEIGHTS])
let waveTimer = null

function startWave() {
  if (waveTimer) return
  waveTimer = setInterval(() => {
    bars.value = BASE_HEIGHTS.map((base, i) => {
      const noise = (Math.random() - 0.5) * 28
      return Math.max(4, Math.min(56, base + noise))
    })
  }, 90)
}

function stopWave() {
  clearInterval(waveTimer)
  waveTimer = null
  bars.value = [...BASE_HEIGHTS]
}

// ── Word comparison ───────────────────────────────────────────────────────────

function normalizeWord(w) {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]/g, '')         // keep only letters + digits
}

function wordMatch(typed, expected) {
  if (difficulty.value === 'hard')  return typed === expected
  const t = normalizeWord(typed)
  const e = normalizeWord(expected)
  if (difficulty.value === 'medium') return t === e
  // Easy: fuzzy via Fuse.js
  const fuse = new Fuse([e], { threshold: 0.4 })
  return fuse.search(t).length > 0
}

const segmentWords = computed(() =>
  currentSegment.value.text.split(/\s+/).filter(Boolean)
)

const userWords = computed(() =>
  userInput.value.trim().split(/\s+/).filter(w => w)
)

const comparedWords = computed(() =>
  userWords.value.map((w, i) => {
    const expected = segmentWords.value[i]
    if (!expected) return { typed: w, state: 'extra' }
    return { typed: w, state: wordMatch(w, expected) ? 'correct' : 'wrong' }
  })
)

const correctCount = computed(() =>
  comparedWords.value.filter(w => w.state === 'correct').length
)

const accuracy = computed(() => {
  if (!userWords.value.length) return null
  return Math.round((correctCount.value / segmentWords.value.length) * 100)
})

// ── localStorage progress ─────────────────────────────────────────────────────

function saveProgress() {
  const all = JSON.parse(localStorage.getItem('szol_video_progress') || '{}')
  all[VIDEO.id] = { segmentIndex: segmentIdx.value, timestamp: Date.now() }
  localStorage.setItem('szol_video_progress', JSON.stringify(all))
}

function resumeFromSaved() {
  const idx = resumeSegment.value
  resumeSegment.value = null
  segmentIdx.value    = idx
  userInput.value     = ''
  showTranscript.value = false
  if (player && playerReady.value) {
    player.seekTo(SEGMENTS[idx].start, true)
    currentTime.value = SEGMENTS[idx].start
  }
}

watch(segmentIdx, saveProgress)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  const saved = JSON.parse(localStorage.getItem('szol_video_progress') || '{}')
  const vp    = saved[VIDEO.id]
  if (vp && vp.segmentIndex > 0 && vp.segmentIndex < SEGMENTS.length) {
    resumeSegment.value = vp.segmentIndex
  }
  loadYTApi()
})

onUnmounted(() => {
  clearInterval(pollTimer)
  stopWave()
  if (player?.destroy) player.destroy()
})
</script>
