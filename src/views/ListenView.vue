<!-- ListenView.vue — YouTube audio dictation practice. -->
<!-- User listens to a YouTube video segment by segment and types what they hear. -->
<!-- Words are colored green (correct) or purple (wrong) in real time. -->
<template>
  <!-- Hidden YouTube player container — IFrame API needs a real DOM node -->
  <div ref="ytContainerEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <div class="flex flex-col gap-4">

    <!-- ── Video URL input ── -->
    <div class="flex gap-2">
      <input
        v-model="urlInput"
        type="text"
        placeholder="Paste a YouTube URL or video ID…"
        @keydown.enter="loadVideo"
        class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-600 placeholder:text-gray-600 transition-all"
      />
      <button
        @click="loadVideo"
        :disabled="captionsLoading || !urlInput.trim()"
        class="text-sm px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
      >{{ captionsLoading ? '…' : 'Load' }}</button>
    </div>

    <!-- ── Header (shown once a video is loaded) ── -->
    <div v-if="videoTitle" class="flex items-center justify-between gap-3">
      <div class="flex flex-col gap-0.5 min-w-0">
        <h2 class="font-semibold text-gray-100 text-base truncate">{{ videoTitle }}</h2>
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
        <span>segment {{ segmentIdx + 1 }} / {{ segments.length }}</span>
        <span>{{ fmtTime(currentTime) }} / {{ fmtTime(duration) }}</span>
      </div>
    </div>

    <!-- ── Captions loading / error ── -->
    <div v-if="captionsLoading" class="text-xs text-gray-500 text-center py-1">Loading captions…</div>
    <div v-if="captionsError" class="text-xs text-red-400 text-center py-1">{{ captionsError }}</div>

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
      v-if="showTranscript && currentSegment"
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
        :disabled="segmentIdx >= segments.length - 1"
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

// ── Video config ──────────────────────────────────────────────────────────────

const videoId    = ref('')
const videoTitle = ref('')
const urlInput   = ref('')

function extractVideoId(input) {
  input = input.trim()
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,                   // watch?v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,               // youtu.be/ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,     // embed/ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,    // shorts/ID
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,      // live/ID
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,         // /v/ID
  ]
  for (const re of patterns) {
    const m = input.match(re)
    if (m) return m[1]
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
  return null
}

async function loadVideo() {
  const id = extractVideoId(urlInput.value)
  if (!id) { captionsError.value = 'Could not find a YouTube video ID in that URL.'; return }

  // Tear down existing player
  if (player?.destroy) { player.destroy(); player = null }
  playerReady.value = false
  isPlaying.value   = false
  segments.value    = []
  segmentIdx.value  = 0
  userInput.value   = ''
  showTranscript.value = false
  videoId.value     = id
  videoTitle.value  = ''

  await fetchCaptions(id)
  if (captionsError.value) return  // captions required — don't load player

  // Check resume
  const saved = JSON.parse(localStorage.getItem('szol_video_progress') || '{}')
  const vp    = saved[id]
  resumeSegment.value = (vp && vp.segmentIndex > 0 && vp.segmentIndex < segments.value.length)
    ? vp.segmentIndex : null

  loadYTApi(id)
}

// ── Captions / segments (fetched dynamically) ─────────────────────────────────

const segments        = ref([])
const captionsLoading = ref(false)
const captionsError   = ref('')

// Parse YouTube json3 caption events into ~15-word practice segments.
function parseCaptions(json) {
  const events = (json.events || []).filter(e => e.segs)
  const result = []
  let cur = { startMs: 0, endMs: 0, words: [] }

  for (const ev of events) {
    const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
    if (!text) continue
    const evEnd = ev.tStartMs + (ev.dDurationMs ?? 2000)
    if (!cur.words.length) cur.startMs = ev.tStartMs
    cur.endMs = evEnd
    cur.words.push(...text.split(/\s+/).filter(Boolean))
    // Flush at ~15 words or ~22 seconds
    if (cur.words.length >= 15 || (evEnd - cur.startMs) >= 22000) {
      result.push({ start: Math.floor(cur.startMs / 1000), end: Math.ceil(cur.endMs / 1000), text: cur.words.join(' ') })
      cur = { startMs: 0, endMs: 0, words: [] }
    }
  }
  if (cur.words.length) {
    result.push({ start: Math.floor(cur.startMs / 1000), end: Math.ceil(cur.endMs / 1000), text: cur.words.join(' ') })
  }
  return result
}

async function fetchCaptions(id) {
  captionsLoading.value = true
  captionsError.value   = ''
  try {
    // 1. Get track list to distinguish manual vs auto-generated.
    const listRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&type=list`
    )
    const listXml = await listRes.text()
    console.log('[szol] timedtext list:', listXml.slice(0, 800))

    const tracks = []
    for (const m of listXml.matchAll(/<track\b([^>]*)>/g)) {
      const attr = m[1]
      const lang = attr.match(/lang_code="([^"]*)"/)?.[1] ?? ''
      const name = attr.match(/\bname="([^"]*)"/)?.[1]  ?? ''
      const kind = attr.match(/\bkind="([^"]*)"/)?.[1]  ?? ''
      if (lang) tracks.push({ lang, name, kind })
    }
    console.log('[szol] parsed tracks:', tracks)

    // 2. If list is empty, try direct fetch as fallback (some videos skip the list).
    if (!tracks.length) {
      const direct = await fetch(
        `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=en&fmt=json3`
      )
      const data = await direct.json()
      console.log('[szol] direct fetch events:', data.events?.length)
      if (data.events?.length) {
        segments.value = parseCaptions(data)
        return
      }
      captionsError.value = 'This video has no captions. Choose a video with subtitles.'
      return
    }

    const manual = tracks.filter(t => t.kind !== 'asr' && !t.name.toLowerCase().includes('auto'))
    if (!manual.length) {
      captionsError.value = 'This video only has auto-generated captions. Choose a video with manually reviewed subtitles.'
      return
    }

    const pick = manual.find(t => t.lang.startsWith('en')) ?? manual[0]
    const captionRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=${pick.lang}&name=${encodeURIComponent(pick.name)}&fmt=json3`
    )
    const data = await captionRes.json()
    if (!data.events?.length) { captionsError.value = 'Caption track is empty.'; return }
    segments.value = parseCaptions(data)
    if (!segments.value.length) captionsError.value = 'Could not parse captions.'
  } catch (e) {
    captionsError.value = `Failed to load captions: ${e.message}`
  } finally {
    captionsLoading.value = false
  }
}

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

const currentSegment = computed(() => segments.value[segmentIdx.value] ?? null)

// ── YouTube player ────────────────────────────────────────────────────────────

const ytContainerEl = ref(null)
const playerReady   = ref(false)
const playerError   = ref('')
const isPlaying     = ref(false)
const currentTime   = ref(0)
const duration      = ref(0)

let player      = null
let pollTimer   = null

function initPlayer(id) {
  if (!ytContainerEl.value) return
  try {
    player = new window.YT.Player(ytContainerEl.value, {
      width:    0,
      height:   0,
      videoId:  id,
      playerVars: {
        controls:       0,
        rel:            0,
        disablekb:      1,
        fs:             0,
        modestbranding: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady(e) {
          playerReady.value = true
          duration.value    = e.target.getDuration() || 0
          const startAt = segments.value[segmentIdx.value]?.start ?? 0
          e.target.seekTo(startAt, true)
          e.target.pauseVideo()
          if (!videoTitle.value || videoTitle.value === 'Loading…') {
            videoTitle.value = e.target.getVideoData?.()?.title ?? 'YouTube Dictation'
          }
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

function loadYTApi(id) {
  if (window.YT?.Player) {
    initPlayer(id)
    return
  }
  window.onYouTubeIframeAPIReady = () => initPlayer(id)
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s   = document.createElement('script')
    s.src     = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { playerError.value = 'Failed to load YouTube API.' }
    document.head.appendChild(s)
  }
}

function pollTime() {
  if (!player?.getCurrentTime) return
  currentTime.value = player.getCurrentTime()
  const seg = segments.value[segmentIdx.value]
  if (!seg) return
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
  if (segmentIdx.value >= segments.value.length - 1) return
  const next = segments.value[segmentIdx.value + 1]
  if (player) { player.pauseVideo(); player.seekTo(next.start, true) }
  segmentIdx.value++
  userInput.value      = ''
  showTranscript.value = false
  currentTime.value    = next.start
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
  (currentSegment.value?.text ?? '').split(/\s+/).filter(Boolean)
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
  all[videoId.value] = { segmentIndex: segmentIdx.value, timestamp: Date.now() }
  localStorage.setItem('szol_video_progress', JSON.stringify(all))
}

function resumeFromSaved() {
  const idx = resumeSegment.value
  resumeSegment.value  = null
  segmentIdx.value     = idx
  userInput.value      = ''
  showTranscript.value = false
  const startAt = segments.value[idx]?.start ?? 0
  if (player && playerReady.value) {
    player.seekTo(startAt, true)
    currentTime.value = startAt
  }
}

watch(segmentIdx, saveProgress)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  // Pre-load the YT API script so it's ready when the user submits a video.
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
})

onUnmounted(() => {
  clearInterval(pollTimer)
  stopWave()
  if (player?.destroy) player.destroy()
})
</script>
