<template>
  <div class="flex flex-col gap-5">

    <div v-if="!story" class="text-sm text-center py-12" style="color:rgba(31,27,23,0.4); font-style:italic;">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else-if="!hasRecognition && !whisperEnabled" class="text-center py-12 flex flex-col gap-2">
      <div class="text-sm" style="color:rgba(31,27,23,0.5);">Speech recognition not supported in this browser.</div>
      <div class="text-xs" style="color:rgba(31,27,23,0.35);">Try Chrome or Edge, or download the on-device model below.</div>
    </div>

    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold" style="font-family:'IM Fell English',serif; color:#1f1b17;" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ story.title }}</div>
          <div class="text-xs" style="color:rgba(31,27,23,0.4);">{{ LANGS[lang]?.name }}</div>
        </div>
        <div class="text-xs" style="color:rgba(31,27,23,0.4);">{{ currentIdx + 1 }} / {{ sentences.length }}</div>
      </div>

      <!-- Progress bar -->
      <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(31,27,23,0.1);">
        <div
          class="h-full rounded-full transition-all duration-300"
          style="background:#8b3a3a;"
          :style="{ width: ((currentIdx + 1) / sentences.length * 100) + '%' }"
        />
      </div>

      <!-- Sentence display -->
      <div
        ref="sentenceEl"
        class="text-xl leading-relaxed p-5 break-words"
        style="background:rgba(31,27,23,0.05); border:1px solid rgba(31,27,23,0.1); border-radius:4px;"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
      >
        <span
          v-for="(word, i) in sentenceWords"
          :key="i"
          class="inline-block whitespace-nowrap transition-colors duration-300"
          :class="isRTL(lang) ? 'ml-1' : 'mr-1'"
          :style="wordColor(i)"
        >{{ word }}</span>
      </div>

      <!-- Live interim transcript (Web Speech API only) -->
      <div
        v-if="recording && liveTranscript"
        class="text-sm px-1 leading-snug"
        style="color:rgba(31,27,23,0.65); min-height:1.25rem;"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
      >{{ liveTranscript }}</div>

      <!-- Transcribing indicator (Whisper path) -->
      <div
        v-else-if="isTranscribing"
        class="text-sm px-1"
        style="color:rgba(31,27,23,0.4); font-style:italic;"
      >Transcribing…</div>

      <!-- Final heard text (after scoring) -->
      <div
        v-else-if="scored && transcript"
        class="text-sm px-1"
        style="color:rgba(31,27,23,0.4); font-style:italic;"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
      >{{ transcript }}</div>

      <!-- Controls -->
      <div class="flex gap-2 flex-wrap">
        <button
          @click="speakSentence"
          :disabled="recording || isTranscribing"
          class="flex items-center gap-1.5 px-3 py-2 text-sm transition-all disabled:opacity-40"
          style="border:1px solid rgba(31,27,23,0.18); border-radius:3px; color:rgba(31,27,23,0.6);"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
          Listen
        </button>

        <button
          @click="recording ? stopRecording() : startRecording()"
          :disabled="isTranscribing || (whisperEnabled && !whisperReady && !hasRecognition)"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
          :style="recording
            ? 'background:#8b3a3a; color:#e8dcc4; border-radius:3px;'
            : 'border:1px solid rgba(31,27,23,0.18); border-radius:3px; color:rgba(31,27,23,0.7);'"
        >
          <span v-if="recording" class="w-2 h-2 rounded-full bg-white" style="animation:pulse 1s infinite;" />
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 2.74-2.9 4.86-5.91 4.97V19h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-3.03C8.99 15.86 6.58 13.74 6.09 11H7.1c.45 2.19 2.4 3.84 4.9 3.84 2.5 0 4.45-1.65 4.9-3.84h1.01z"/></svg>
          {{ recording ? 'Listening…' : 'Speak' }}
        </button>

        <button
          v-if="scored"
          @click="reset"
          class="px-3 py-2 text-sm transition-all"
          style="border:1px solid rgba(31,27,23,0.15); border-radius:3px; color:rgba(31,27,23,0.5);"
        >Try again</button>

        <!-- Engine indicator -->
        <span
          v-if="whisperReady"
          class="self-center text-xs px-2"
          style="color:rgba(31,27,23,0.3);"
        >Whisper</span>
      </div>

      <!-- Score -->
      <div
        v-if="scored && result"
        class="flex items-center gap-4 p-4"
        style="border-radius:4px;"
        :style="result.pct >= 80
          ? 'background:rgba(74,120,60,0.08); border:1px solid rgba(74,120,60,0.22);'
          : 'background:rgba(139,58,58,0.07); border:1px solid rgba(139,58,58,0.2);'"
      >
        <div class="text-3xl font-bold" :style="result.pct >= 80 ? 'color:#4a783c;' : 'color:#8b3a3a;'">{{ result.pct }}%</div>
        <div class="text-sm" style="color:rgba(31,27,23,0.5);">{{ result.correct }} / {{ result.total }} words</div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-1">
        <button
          v-if="currentIdx > 0"
          @click="prev"
          class="text-sm px-3 py-1.5 transition-all"
          style="border:1px solid rgba(31,27,23,0.15); border-radius:3px; color:rgba(31,27,23,0.5);"
        >Back</button>
        <div v-else />
        <button
          v-if="scored || transcript"
          @click="next"
          class="text-sm px-4 py-1.5 transition-all"
          style="background:#8b3a3a; color:#e8dcc4; border-radius:3px;"
        >{{ currentIdx < sentences.length - 1 ? 'Next' : 'Done' }}</button>
      </div>

      <!-- ── Whisper download section ── -->
      <div class="mt-2" style="border-top:1px solid rgba(31,27,23,0.08); padding-top:1rem;">

        <!-- Downloading progress -->
        <div v-if="whisperDownloading" class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs" style="color:rgba(31,27,23,0.4);">
            <span>Downloading speech model…</span>
            <span>{{ whisperPct }}%</span>
          </div>
          <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(31,27,23,0.1);">
            <div class="h-full rounded-full transition-all duration-300" style="background:#8b3a3a;" :style="{ width: whisperPct + '%' }" />
          </div>
        </div>

        <!-- Download error -->
        <div v-else-if="whisperError" class="flex flex-col gap-1.5">
          <div class="text-xs" style="color:#8b3a3a;">Download failed — check connection or storage.</div>
          <button @click="downloadWhisper" class="self-start text-xs px-2.5 py-1 transition-all" style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.55);">Retry</button>
        </div>

        <!-- Prompt: not yet decided -->
        <div v-else-if="whisperEnabled === null" class="flex flex-col gap-2">
          <div class="text-xs" style="color:rgba(31,27,23,0.5);">Download Whisper for better recognition — especially for Arabic &amp; Hebrew (~150 MB).</div>
          <div class="flex gap-2">
            <button
              @click="downloadWhisper"
              class="text-xs px-2.5 py-1 transition-all"
              style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.6);"
            >Download</button>
            <button
              @click="skipWhisper"
              class="text-xs transition-all"
              style="color:rgba(31,27,23,0.3);"
            >Use browser recognition</button>
          </div>
        </div>

        <!-- Whisper ready -->
        <div v-else-if="whisperReady && whisperEnabled === 'on'" class="flex items-center justify-between">
          <span class="text-xs" style="color:rgba(31,27,23,0.35);">On-device speech model active.</span>
          <button @click="skipWhisper" class="text-xs transition-all" style="color:rgba(31,27,23,0.3);">Switch to browser</button>
        </div>

        <!-- Whisper opted out -->
        <div v-else-if="whisperEnabled === 'off'" class="flex items-center gap-2">
          <span class="text-xs" style="color:rgba(31,27,23,0.3);">Using browser recognition.</span>
          <button @click="downloadWhisper" class="text-xs transition-all" style="color:rgba(31,27,23,0.4); text-decoration:underline;">Switch to Whisper</button>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'
import { normalize, scoreWords } from '../utils/scoring.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'
import { saveProgress, getProgress } from '../utils/api.js'
import { transcribe, preloadSpeech, onSpeechProgress } from '../utils/localSpeech.js'
import { blobToWhisperBuffer } from '../utils/audioUtils.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

const sentenceEl     = ref(null)
const voices         = useVoiceList()
const hasRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

const currentIdx     = ref(0)
const transcript     = ref('')
const liveTranscript = ref('')
const result         = ref(null)
const scored         = ref(false)
const recording      = ref(false)
const isTranscribing = ref(false)

// Whisper state
const whisperEnabled    = ref(localStorage.getItem('szol_whisper') ?? null) // 'on' | 'off' | null
const whisperReady      = ref(false)
const whisperDownloading = ref(false)
const whisperPct        = ref(0)
const whisperError      = ref(false)

let recognition  = null
let mediaRecorder = null
let audioChunks  = []

// Track Whisper download progress
let _pendingFiles = 0, _doneFiles = 0
const _removeProgress = onSpeechProgress((info) => {
  if (info.status === 'initiate') {
    _pendingFiles++
    whisperDownloading.value = true
  } else if (info.status === 'progress') {
    whisperDownloading.value = true
    whisperPct.value = Math.round(info.progress ?? 0)
  } else if (info.status === 'done' || info.status === 'ready') {
    _doneFiles++
    if (_doneFiles >= _pendingFiles && _pendingFiles > 0) {
      whisperPct.value = 100
      setTimeout(() => {
        whisperDownloading.value = false
        _pendingFiles = 0; _doneFiles = 0
      }, 600)
    }
  }
})
onUnmounted(() => _removeProgress())

// If already opted in, silently load from cache on mount
onMounted(async () => {
  if (whisperEnabled.value === 'on') {
    try {
      await preloadSpeech()
      whisperReady.value = true
    } catch {
      whisperReady.value = false
    }
  }
})

watch([() => props.story, () => props.lang, rootHighlightOn], ([, , on]) => {
  nextTick(() => on ? applyRoots(sentenceEl.value, props.lang) : clearRoots())
})

watch([() => props.story, () => props.currentUser], async ([story, user]) => {
  currentIdx.value = 0
  reset()
  if (user && story?.id) {
    const saved = await getProgress(story.id, 'speak')
    if (saved?.sentence_index > 0)
      currentIdx.value = Math.min(saved.sentence_index, sentences.value.length - 1)
  }
})

const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
})

function splitUnits(text) {
  if (['zh', 'zh-TW', 'ja'].includes(props.lang))
    return [...text].filter(c => /\p{L}/u.test(c))
  return text.trim().split(/\s+/).filter(Boolean)
}

const sentenceWords = computed(() =>
  splitUnits(sentences.value[currentIdx.value] ?? '')
)

function alignWords(target, spoken) {
  const t = target.map(w => normalize(w))
  const s = spoken.map(w => normalize(w))
  const m = t.length, n = s.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = t[i-1] === s[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
  const matched = new Set()
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (t[i-1] === s[j-1]) { matched.add(i - 1); i--; j-- }
    else if (dp[i-1][j] >= dp[i][j-1]) i--
    else j--
  }
  return target.map((_, idx) => matched.has(idx) ? 'correct' : 'wrong')
}

const wordStatuses = computed(() => {
  if (!scored.value || !transcript.value) return []
  return alignWords(sentenceWords.value, splitUnits(transcript.value))
})

function wordColor(i) {
  if (!scored.value) return 'color:#1f1b17;'
  return wordStatuses.value[i] === 'correct'
    ? 'color:#4a783c; font-weight:500;'
    : 'color:#9b4545;'
}

function speakSentence() {
  const sentence = sentences.value[currentIdx.value]
  if (!sentence) return
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt   = new SpeechSynthesisUtterance(sentence)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.speak(utt)
}

// ── Whisper path ──────────────────────────────────────────────────────────────

async function startRecordingWhisper() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      if (!audioChunks.length) return
      isTranscribing.value = true
      try {
        const blob  = new Blob(audioChunks, { type: mediaRecorder.mimeType })
        const audio = await blobToWhisperBuffer(blob)
        transcript.value = await transcribe(audio, props.lang)
        result.value     = scoreWords(sentences.value[currentIdx.value] ?? '', transcript.value)
        scored.value     = true
      } catch {
        // silent — user can retry
      } finally {
        isTranscribing.value = false
      }
    }
    mediaRecorder.start()
    recording.value = true
  } catch {
    recording.value = false
  }
}

function stopRecordingWhisper() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  recording.value = false
}

// ── Web Speech API path ───────────────────────────────────────────────────────

function startRecordingWebSpeech() {
  const SR    = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return
  recognition = new SR()
  recognition.lang            = LANGS[props.lang]?.bcp47 ?? props.lang
  recognition.interimResults  = true
  recognition.maxAlternatives = 1

  recognition.onresult = (e) => {
    const parts = Array.from(e.results)
    liveTranscript.value = parts.map(r => r[0].transcript).join('')
    if (e.results[e.results.length - 1].isFinal) {
      transcript.value     = liveTranscript.value
      liveTranscript.value = ''
      result.value         = scoreWords(sentences.value[currentIdx.value] ?? '', transcript.value)
      scored.value         = true
      recording.value      = false
    }
  }

  recognition.onend = () => {
    recording.value = false
    if (liveTranscript.value && !scored.value) {
      transcript.value     = liveTranscript.value
      liveTranscript.value = ''
      result.value         = scoreWords(sentences.value[currentIdx.value] ?? '', transcript.value)
      scored.value         = true
    }
  }

  recognition.onerror = () => { recording.value = false; liveTranscript.value = '' }

  recording.value      = true
  liveTranscript.value = ''
  recognition.start()
}

function stopRecordingWebSpeech() {
  recognition?.stop()
  recording.value = false
}

// ── Unified entry points ──────────────────────────────────────────────────────

function startRecording() {
  if (whisperReady.value) startRecordingWhisper()
  else startRecordingWebSpeech()
}

function stopRecording() {
  if (whisperReady.value) stopRecordingWhisper()
  else stopRecordingWebSpeech()
}

// ── Whisper download ──────────────────────────────────────────────────────────

async function downloadWhisper() {
  localStorage.setItem('szol_whisper', 'on')
  whisperEnabled.value    = 'on'
  whisperError.value      = false
  whisperDownloading.value = true
  whisperPct.value        = 0
  _pendingFiles = 0; _doneFiles = 0
  try {
    await preloadSpeech()
    whisperReady.value = true
  } catch {
    whisperError.value = true
  } finally {
    whisperDownloading.value = false
  }
}

function skipWhisper() {
  localStorage.setItem('szol_whisper', 'off')
  whisperEnabled.value = 'off'
  whisperReady.value   = false
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function reset() {
  transcript.value     = ''
  liveTranscript.value = ''
  result.value         = null
  scored.value         = false
  recording.value      = false
  isTranscribing.value = false
  recognition?.stop()
  speechSynthesis.cancel()
}

function next() {
  if (currentIdx.value < sentences.value.length - 1) {
    currentIdx.value++
    if (props.currentUser && props.story?.id)
      saveProgress(props.story.id, props.story.title ?? '', props.lang, 'speak', currentIdx.value)
    reset()
  }
}

function prev() {
  if (currentIdx.value > 0) { currentIdx.value--; reset() }
}

onUnmounted(() => {
  recognition?.stop()
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  speechSynthesis.cancel()
})
</script>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
</style>
