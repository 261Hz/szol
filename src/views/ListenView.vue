<template>
  <!-- Hidden YouTube IFrame container — must be a real DOM node (dictation player) -->
  <div ref="ytContainerEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <!-- HTML5 audio element for non-YouTube dictation sources -->
  <audio
    v-if="selectedStory && selectedStory.source_type !== 'youtube'"
    ref="audioEl"
    :src="selectedStory.audio_url"
    crossorigin="anonymous"
    preload="metadata"
    @loadedmetadata="onAudioLoaded"
    @timeupdate="onAudioTimeUpdate"
    @play="isPlaying = true; startWave()"
    @pause="isPlaying = false; stopWave()"
    @ended="isPlaying = false; stopWave()"
    @error="onAudioCorsError"
    style="display:none"
  />

  <!-- Clip viewer: opened from Vocab → Video tab -->
  <div v-if="activeClip" class="flex flex-col gap-2 mb-4 bg-slate-900 border border-blue-800 rounded-xl p-3">

    <!-- Header: title + test toggle + close -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-blue-400 font-medium">Video clip</span>
      <div class="flex items-center gap-3">
        <button
          @click="toggleTest"
          :class="testMode ? 'text-emerald-400 font-medium' : 'text-gray-500 hover:text-emerald-400'"
          class="text-xs transition-all"
          title="Listening comprehension test — hides transcript and disables CC"
        >🎧 Test</button>
        <button @click="closeClip" class="text-xs text-gray-500 hover:text-white transition-all">✕</button>
      </div>
    </div>

    <!-- YouTube player — cc_load_policy=0 always (test mode) or by default -->
    <div class="relative w-full rounded-lg overflow-hidden bg-black" style="padding-bottom:56.25%">
      <iframe
        :src="`https://www.youtube.com/embed/${activeClip.video_id}?start=${activeClip.start_sec}&cc_load_policy=0&rel=0`"
        class="absolute inset-0 w-full h-full"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      />
    </div>

    <!-- Normal view: transcript + report -->
    <template v-if="!testMode">
      <div class="flex items-start justify-between gap-2 px-1">
        <p v-if="activeClip.context" class="text-sm text-gray-300 leading-snug flex-1">{{ activeClip.context }}</p>
        <div class="flex-shrink-0 flex flex-col items-end gap-1">
          <button
            v-if="!clipReportSent"
            @click="clipReportOpen = !clipReportOpen; clipReportNote = ''"
            class="text-xs text-gray-600 hover:text-red-400 transition-all"
            title="Report a transcript error"
          >⚑ report</button>
          <span v-if="clipReportSent" class="text-xs text-green-500">Reported ✓</span>
          <div v-if="clipReportOpen && !clipReportSent" class="flex items-center gap-1">
            <input
              v-model="clipReportNote"
              type="text"
              placeholder="What's wrong?"
              class="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 placeholder-gray-600 w-40 focus:outline-none focus:border-red-700"
              @keydown.enter="submitClipReport"
              @keydown.escape="clipReportOpen = false"
            />
            <button @click="submitClipReport" class="text-xs text-red-400 hover:text-red-300">Send</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Test mode: type what you hear -->
    <template v-else>
      <!-- Input phase -->
      <template v-if="!testResult">
        <textarea
          v-model="testInput"
          placeholder="Listen and type what you hear…"
          rows="2"
          class="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-emerald-700"
          @keydown.meta.enter.prevent="checkAnswer"
          @keydown.ctrl.enter.prevent="checkAnswer"
        />
        <div class="flex items-center gap-2">
          <button
            @click="checkAnswer"
            :disabled="!testInput.trim()"
            class="text-xs px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-all"
          >Check</button>
          <span class="text-xs text-gray-600">Ctrl/Cmd+Enter</span>
        </div>
      </template>

      <!-- Results phase -->
      <template v-else>
        <div class="flex items-center gap-3 text-xs">
          <span :class="testResult.pct >= 80 ? 'text-green-400' : testResult.pct >= 50 ? 'text-yellow-400' : 'text-red-400'" class="font-medium">
            {{ testResult.correct }}/{{ testResult.total }} words
          </span>
          <button @click="testResult = null; testInput = ''" class="text-gray-600 hover:text-blue-400 transition-all">Try again</button>
        </div>
        <!-- Word-by-word colouring -->
        <p class="text-sm leading-relaxed">
          <template v-for="(s, i) in testResult.scored" :key="i">
            <span :class="s.ok ? 'bg-green-800 text-green-200 rounded px-0.5' : 'bg-purple-900 text-purple-200 rounded px-0.5'">{{ s.w }}</span>
            <span> </span>
          </template>
        </p>
        <!-- Reveal transcript -->
        <button
          v-if="!clipShowTranscript"
          @click="clipShowTranscript = true"
          class="text-xs text-blue-400 hover:text-blue-300 transition-all self-start"
        >Reveal transcript</button>
        <p v-if="clipShowTranscript" class="text-xs text-gray-400 leading-snug border-t border-gray-700 pt-2">{{ activeClip.context }}</p>
      </template>
    </template>

  </div>

  <div class="flex flex-col gap-3">

    <!-- Story picker -->
    <div v-if="!selectedStory" class="flex flex-col gap-3">

      <!-- ── Curated stories ── -->
      <div v-if="storiesLoading" class="text-sm text-gray-500 text-center py-10">{{ t(lang, 'loading') }}</div>
      <div v-else-if="storiesError" class="text-sm text-red-400 text-center py-6">{{ storiesError }}</div>
      <div v-else-if="!stories.length" class="text-sm text-gray-500 text-center py-6">
        {{ t(lang, 'noExercises') }}
      </div>
      <div v-if="stories.length" class="flex flex-col gap-2">
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

      <!-- Mode + difficulty toggles -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-1">
          <button
            @click="mode = 'dictation'; translationResult = null; showTranscript = false"
            :class="['text-xs px-3 py-1.5 rounded-full transition-all',
              mode === 'dictation' ? 'bg-sky-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
          >Dictation</button>
          <button
            @click="mode = 'translation'; translationResult = null; showTranscript = false"
            :class="['text-xs px-3 py-1.5 rounded-full transition-all',
              mode === 'translation' ? 'bg-violet-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
          >Translation</button>
        </div>
        <div v-if="mode === 'dictation'" class="flex gap-1.5">
          <button
            v-for="d in ['easy', 'medium', 'hard']"
            :key="d"
            @click="difficulty = d"
            :class="['text-xs px-3 py-1.5 rounded-full transition-all',
              difficulty === d ? 'bg-emerald-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white']"
          >{{ t(lang, d) }}</button>
        </div>
      </div>

      <!-- Waveform + timing -->
      <div class="bg-slate-900 rounded-xl px-4 pt-4 pb-3 flex flex-col gap-2">
        <svg width="100%" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wave-grad" x1="0" y1="60" x2="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   :stop-color="isPlaying ? '#7c3aed' : '#3b0764'" />
              <stop offset="100%" :stop-color="isPlaying ? '#10b981' : '#065f46'" />
            </linearGradient>
          </defs>
          <rect
            v-for="(h, i) in bars"
            :key="i"
            :x="i * 10 + 1"
            :width="8"
            :y="(60 - h) / 2"
            :height="h"
            rx="2"
            fill="url(#wave-grad)"
            :opacity="isPlaying ? 0.92 : 0.35"
          />
        </svg>
        <div class="flex justify-between text-xs text-gray-500">
          <span v-if="segments.length">{{ t(lang, 'segment') }} {{ segmentIdx + 1 }} / {{ segments.length }}</span>
          <span v-else-if="selectedStory?.source_type === 'podcast'">🎙 {{ selectedStory.source }}</span>
          <span v-else>–</span>
          <span>{{ fmtTime(currentTime) }} / {{ fmtTime(segments.length ? segDuration : duration) }}</span>
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
          :placeholder="mode === 'translation' ? `Type your ${TRANSLATE_TO_OPTIONS.find(o => o.code === translateTo)?.label ?? ''} translation…` : t(lang, 'typeWhatYouHear')"
          @keydown.space="mode === 'dictation' ? playWordTick() : undefined"
          class="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-600 resize-none placeholder:text-gray-600 transition-all"
        />

        <!-- Dictation: word-by-word colour feedback -->
        <template v-if="mode === 'dictation'">
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
          <div v-if="accuracy !== null" class="flex justify-end">
            <span class="text-xs text-gray-500">
              {{ t(lang, 'accuracy') }}: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
              <span class="ml-1 text-gray-600">({{ correctCount }}/{{ segmentWords.length }} {{ t(lang, 'words') }})</span>
            </span>
          </div>
        </template>

        <!-- Translation: check button + result -->
        <template v-else>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-gray-500">Translate to:</span>
            <select
              v-model="translateTo"
              class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none"
            >
              <option v-for="opt in TRANSLATE_TO_OPTIONS" :key="opt.code" :value="opt.code">{{ opt.label }}</option>
            </select>
          </div>
          <div v-if="sameLang" class="text-xs text-yellow-400">Source and target language are the same — pick a different language to translate to.</div>
          <div v-else class="flex items-center gap-2">
            <button
              @click="runTranslationCheck"
              :disabled="!userInput.trim() || translationChecking"
              class="text-xs px-4 py-1.5 rounded-md bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 transition-all"
            >{{ translationChecking ? 'Checking…' : 'Check translation' }}</button>
          </div>
          <div v-if="translationResult" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <span
                :class="['text-sm font-bold px-2.5 py-0.5 rounded-full',
                  translationResult.score >= 80 ? 'bg-emerald-900 text-emerald-300' :
                  translationResult.score >= 55 ? 'bg-yellow-900 text-yellow-300' :
                                                   'bg-red-900 text-red-300']"
              >{{ translationResult.score }}%</span>
              <span class="text-xs text-gray-400 leading-snug">{{ translationResult.feedback }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Transcript / original text reveal -->
      <div
        v-if="showTranscript && currentSegment"
        class="bg-slate-900 border border-emerald-800 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed"
        :dir="isRTL(props.lang) ? 'rtl' : 'ltr'"
      >{{ currentSegment.text }}</div>


      <!-- Action row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            v-if="mode === 'dictation' ? userInput.trim() : translationResult"
            @click="showTranscript = !showTranscript"
            class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-emerald-700 hover:text-emerald-400 transition-all"
          >{{ showTranscript ? t(lang, 'hideTranscript') : (mode === 'translation' ? 'Show original' : t(lang, 'showCorrectText')) }}</button>

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
import { fetchListenStories, checkTranslation } from '../utils/api.js'
import { t } from '../utils/i18n.js'
import { isRTL } from '../utils/rtl.js'
import { spokenNumbers } from '../utils/spokenNumbers.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
  clip:        Object,  // { video_id, start_sec, context } from Vocab → Video tab
})

const emit = defineEmits(['closeClip', 'openAuth'])

const activeClip = ref(props.clip ?? null)
watch(() => props.clip, c => { activeClip.value = c ?? null })

function closeClip() {
  activeClip.value = null
  clipReportOpen.value = false
  clipReportSent.value = false
  emit('closeClip')
}

const clipReportOpen = ref(false)
const clipReportNote = ref('')
const clipReportSent = ref(false)

// ── Listening test ────────────────────────────────────────────────────────────
const testMode       = ref(false)
const testInput      = ref('')
const testResult     = ref(null)
const clipShowTranscript = ref(false)

function toggleTest() {
  testMode.value = !testMode.value
  testInput.value = ''
  testResult.value = null
  clipShowTranscript.value = false
}

function checkAnswer() {
  if (!testInput.value.trim() || !activeClip.value?.context) return
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, '').trim()
  const words  = norm(testInput.value).split(/\s+/).filter(Boolean)
  const refSet = new Set(norm(activeClip.value.context).split(/\s+/).filter(Boolean))
  const scored = words.map(w => ({ w, ok: refSet.has(w) }))
  const correct = scored.filter(s => s.ok).length
  testResult.value = { scored, correct, total: words.length, pct: words.length ? Math.round(correct / words.length * 100) : 0 }
}

watch(activeClip, () => {
  clipReportOpen.value = false
  clipReportSent.value = false
  testMode.value = false
  testInput.value = ''
  testResult.value = null
  clipShowTranscript.value = false
})

async function submitClipReport() {
  const clip = activeClip.value
  if (!clip) return
  await fetch('/api/report-clip', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      video_id:  clip.video_id,
      start_sec: clip.start_sec,
      word:      clip.context ?? '',
      lang:      props.lang ?? '',
      note:      clipReportNote.value.trim(),
    }),
  }).catch(() => {})
  clipReportOpen.value = false
  clipReportSent.value = true
}

// ── Story list ────────────────────────────────────────────────────────────────

const stories         = ref([])
const storiesLoading  = ref(false)
const storiesError    = ref('')
const selectedStory   = ref(null)

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

watch(() => props.lang, () => {
  backToList()
  if (props.currentUser) loadStories()
})

watch(() => props.story, (newStory) => {
  if (newStory) loadStory(newStory)
})

// ── Load a story into the player ──────────────────────────────────────────────

const segments       = ref([])
const segmentIdx     = ref(0)
const userInput      = ref('')
const showTranscript = ref(false)
const resumeSegment  = ref(null)
const difficulty     = ref('medium')
const mode           = ref('dictation') // 'dictation' | 'translation'
const translateTo    = ref(props.lang === 'en' ? 'es' : 'en')

const translationResult   = ref(null) // { score, feedback }
const translationChecking = ref(false)

const TRANSLATE_TO_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
]

const sameLang = computed(() => props.lang === translateTo.value)

async function runTranslationCheck() {
  if (!currentSegment.value || !userInput.value.trim() || translationChecking.value || sameLang.value) return
  translationChecking.value = true
  translationResult.value   = null
  const result = await checkTranslation(
    currentSegment.value.text,
    userInput.value.trim(),
    props.lang,
    translateTo.value,
  )
  translationResult.value   = result
  translationChecking.value = false
}

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
    setupAnalyser()
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
  if (seg?.end != null && currentTime.value >= seg.end) {
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
  if (seg?.end != null && currentTime.value >= seg.end) {
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
  userInput.value         = ''
  showTranscript.value    = false
  translationResult.value = null
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown() {
  clearInterval(pollTimer); pollTimer = null
  stopWave()
  if (_mediaSrc) { try { _mediaSrc.disconnect() } catch {} _mediaSrc = null; _analyser = null }
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

// ── Waveform (Web Audio API analyser with fake-animation fallback) ────────────

const BASE_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  const envelope = Math.sin((i / 39) * Math.PI)
  const detail   = Math.sin(i * 1.7) * 0.25
  return Math.max(4, Math.round((envelope * 0.6 + detail + 0.5) * 44 + 6))
})

const bars      = ref([...BASE_HEIGHTS])
let waveTimer   = null
let _analyser   = null
let _mediaSrc   = null
let _rafId      = null

function setupAnalyser() {
  if (!audioEl.value || _mediaSrc) return
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {})
    const src = _audioCtx.createMediaElementSource(audioEl.value)
    const an  = _audioCtx.createAnalyser()
    an.fftSize = 128
    an.smoothingTimeConstant = 0.78
    src.connect(an)
    an.connect(_audioCtx.destination)
    _mediaSrc = src
    _analyser = an
  } catch {
    _mediaSrc = null
    _analyser = null
  }
}

function onAudioCorsError() {
  _mediaSrc = null
  _analyser = null
}

function startWave() {
  stopWave()
  if (_analyser) {
    const buf  = new Uint8Array(_analyser.frequencyBinCount)
    const step = buf.length / 40
    function tick() {
      _analyser.getByteFrequencyData(buf)
      bars.value = Array.from({ length: 40 }, (_, i) => {
        const v = buf[Math.floor(i * step)]
        return Math.max(4, Math.round((v / 255) * 52 + 4))
      })
      _rafId = requestAnimationFrame(tick)
    }
    _rafId = requestAnimationFrame(tick)
  } else {
    waveTimer = setInterval(() => {
      bars.value = BASE_HEIGHTS.map(b => Math.max(4, Math.min(56, b + (Math.random() - 0.5) * 28)))
    }, 90)
  }
}

function stopWave() {
  cancelAnimationFrame(_rafId); _rafId = null
  clearInterval(waveTimer);     waveTimer = null
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
  if (props.currentUser) loadStories()
  if (props.story) loadStory(props.story)
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
