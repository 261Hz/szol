<template>
  <div class="flex flex-col gap-5">

    <div v-if="!story" class="text-sm text-center py-12" style="color:rgba(31,27,23,0.4); font-style:italic;">
      {{ t(lang, 'noStory') }}
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
        class="text-xl p-5 break-words"
        :style="`background:rgba(31,27,23,0.05); border:1px solid rgba(31,27,23,0.1); border-radius:4px; line-height:${lang === 'ja' && furiganaTokens.length ? '2.8' : isRTL(lang) ? '2.2' : '1.7'};`"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
      >
        <template v-if="lang === 'ja' && furiganaTokens.length">
          <ruby
            v-for="(tok, i) in furiganaTokens"
            :key="i"
            class="transition-colors duration-300"
            style="margin-right:0.15em; ruby-align:center;"
            :style="wordColor(i)"
          >{{ tok.w }}<rt v-if="tok.r" style="font-size:0.55em; color:inherit; letter-spacing:0.05em;">{{ tok.r }}</rt></ruby>
        </template>
        <span
          v-else
          v-for="(word, i) in sentenceWords"
          :key="i"
          class="inline-block whitespace-nowrap transition-colors duration-300"
          :class="isRTL(lang) ? 'ml-1' : 'mr-1'"
          :style="wordColor(i)"
        >{{ (lang === 'he' && nikudWords[i]) ? nikudWords[i] : word }}</span>
      </div>

      <!-- Color key -->
      <div v-if="scored" class="flex gap-4 text-xs" style="color:rgba(31,27,23,0.38);">
        <span><span style="color:#4a783c; font-weight:600;">■</span> correct</span>
        <span><span style="color:#a06020; font-weight:600;">■</span> close</span>
        <span><span style="color:#9b4545; font-weight:600;">■</span> missed</span>
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
          :disabled="isTranscribing"
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
          v-if="engineLabel"
          class="self-center text-xs px-2"
          style="color:rgba(31,27,23,0.3);"
        >{{ engineLabel }}</span>
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
        <div class="flex flex-col gap-0.5">
          <div class="text-sm" style="color:rgba(31,27,23,0.5);">{{ result.correct }} / {{ result.total }} words</div>
          <div v-if="clarity !== null" class="text-xs" style="color:rgba(31,27,23,0.35);">pronunciation clarity {{ Math.round(clarity * 100) }}%</div>
        </div>
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

      <!-- ── Offline backup section (web only) ── -->
      <div v-if="!isNative" class="mt-2" style="border-top:1px solid rgba(31,27,23,0.08); padding-top:1rem;">

        <!-- Downloading progress -->
        <div v-if="whisperDownloading" class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs" style="color:rgba(31,27,23,0.4);">
            <span>Downloading offline model…</span>
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

        <!-- Offline model ready -->
        <div v-else-if="whisperReady" class="flex items-center justify-between">
          <span class="text-xs" style="color:rgba(31,27,23,0.35);">Offline backup active · Groq when online.</span>
          <button @click="skipWhisper" class="text-xs transition-all" style="color:rgba(31,27,23,0.25);">Remove</button>
        </div>

        <!-- Offer offline backup -->
        <div v-else class="flex items-center justify-between">
          <span class="text-xs" style="color:rgba(31,27,23,0.35);">Groq Whisper · server</span>
          <button @click="downloadWhisper" class="text-xs transition-all" style="color:rgba(31,27,23,0.35); text-decoration:underline;">+ offline backup (~150 MB)</button>
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
import { normalize } from '../utils/scoring.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'
import { saveProgress, getProgress, fetchFurigana, fetchNikud, transcribeViaBackend } from '../utils/api.js'
import { transcribe, preloadSpeech, onSpeechProgress } from '../utils/localSpeech.js'
import { blobToWhisperBuffer } from '../utils/audioUtils.js'
import { isNative, startNativeRecognition, stopNativeRecognition } from '../utils/nativeSpeech.js'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

const sentenceEl     = ref(null)
const voices         = useVoiceList()
const hasRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

const currentIdx      = ref(0)
const furiganaTokens  = ref([])
const nikudAllWords   = ref([])  // nikudded words for every sentence: [[w,...], [w,...]]
const nikudWords      = computed(() => nikudAllWords.value[currentIdx.value] ?? [])
const transcript      = ref('')
const clarity         = ref(null) // Whisper avg_logprob → 0-1 pronunciation clarity
const liveTranscript = ref('')
const result         = ref(null)
const scored         = ref(false)
const recording      = ref(false)
const isTranscribing = ref(false)
const usedEngine     = ref(null) // 'groq' | 'local' | 'browser' | 'native'

const engineLabel = computed(() => {
  if (isNative) return usedEngine.value ? 'Google ASR' : null
  if (usedEngine.value === 'groq')    return 'Groq'
  if (usedEngine.value === 'local')   return 'whisper · local'
  if (usedEngine.value === 'browser') return 'browser ASR'
  return null
})

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

// Furigana: per-sentence (needs sentence-level context for accuracy)
watch([() => props.lang, currentIdx, () => props.story], async () => {
  furiganaTokens.value = []
  if (props.lang !== 'ja') return
  const text = sentences.value[currentIdx.value]
  if (!text) return
  const data = await fetchFurigana(text)
  furiganaTokens.value = data?.tokens ?? []
}, { immediate: true })

// Nikud: once per story — vocalize full content then split into sentences.
// Sending paragraph-level text is more reliable than per-sentence calls.
watch([() => props.lang, () => props.story], async () => {
  nikudAllWords.value = []
  if (props.lang !== 'he' || !props.story?.content) return
  const data = await fetchNikud(props.story.content)
  if (!data?.text) return
  const vocSentences = data.text
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
  nikudAllWords.value = vocSentences.map(s => s.split(/\s+/).filter(Boolean))
}, { immediate: true })

function splitUnits(text) {
  if (props.lang === 'ja') {
    if (!('Segmenter' in Intl)) return [...text].filter(c => /\p{L}/u.test(c))
    const seg = new Intl.Segmenter('ja', { granularity: 'word' })
    return [...seg.segment(text)].filter(s => s.isWordLike).map(s => s.segment)
  }
  if (['zh', 'zh-TW'].includes(props.lang))
    return [...text].filter(c => /\p{L}/u.test(c))
  return text.trim().split(/\s+/).filter(Boolean)
}

const sentenceWords = computed(() => {
  if (props.lang === 'ja' && furiganaTokens.value.length)
    return furiganaTokens.value.map(t => t.w)
  if (props.lang === 'he' && nikudWords.value.length)
    return nikudWords.value
  return splitUnits(sentences.value[currentIdx.value] ?? '')
})

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

function editDist(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++)
      curr.push(a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]))
    prev = curr
  }
  return prev[b.length]
}

const wordScores = computed(() => {
  if (!scored.value || !transcript.value) return []
  const expected = sentenceWords.value.map(w => normalize(w))
  const spoken   = splitUnits(transcript.value).map(w => normalize(w))
  return expected.map(exp => {
    if (!spoken.length) return 0
    return spoken.reduce((best, sp) => {
      const maxLen = Math.max(exp.length, sp.length)
      const score  = maxLen ? 1 - editDist(exp, sp) / maxLen : 1
      return score > best ? score : best
    }, 0)
  })
})

function wordColor(i) {
  if (!scored.value) return 'color:#1f1b17;'
  const score = wordScores.value[i] ?? 0
  if (score >= 0.85) return 'color:#4a783c; font-weight:500;'
  if (score >= 0.40) return 'color:#a06020;'
  return 'color:#9b4545;'
}

function lcsScore() {
  const statuses = wordStatuses.value
  const correct  = statuses.filter(s => s === 'correct').length
  const total    = sentenceWords.value.length
  return { correct, total, pct: total > 0 ? Math.round(correct / total * 100) : 0 }
}

async function speakSentence() {
  const sentence = sentences.value[currentIdx.value]
  if (!sentence) return
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  if (isNative) {
    await TextToSpeech.stop().catch(() => {})
    await TextToSpeech.speak({ text: sentence, lang: bcp47, rate: 1.0, pitch: 1.0, volume: 1.0 }).catch(() => {})
  } else if (typeof speechSynthesis !== 'undefined') {
    const utt   = new SpeechSynthesisUtterance(sentence)
    utt.lang    = bcp47
    const voice = pickVoice(voices.value, bcp47, props.lang)
    if (voice) utt.voice = voice
    speechSynthesis.cancel()
    speechSynthesis.speak(utt)
  }
}

// ── Whisper path ──────────────────────────────────────────────────────────────

async function startRecordingWhisper() {
  if (!navigator.mediaDevices?.getUserMedia) {
    // Platform doesn't support getUserMedia — fall back to Web Speech API
    startRecordingWebSpeech()
    return
  }
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
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType })
        const hint = sentences.value[currentIdx.value]
        const res  = await transcribeViaBackend(blob, props.lang, hint)
        if (res?.text) {
          transcript.value = res.text
          clarity.value    = res.clarity ?? null
          usedEngine.value = 'groq'
        } else if (whisperReady.value) {
          const audio = await blobToWhisperBuffer(blob)
          transcript.value = await transcribe(audio, props.lang, hint)
          usedEngine.value = 'local'
        }
        scored.value = true
        result.value = lcsScore()
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
      usedEngine.value     = 'browser'
      scored.value         = true
      result.value         = lcsScore()
      recording.value      = false
    }
  }

  recognition.onend = () => {
    recording.value = false
    if (liveTranscript.value && !scored.value) {
      transcript.value     = liveTranscript.value
      liveTranscript.value = ''
      usedEngine.value     = 'browser'
      scored.value         = true
      result.value         = lcsScore()
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

// ── Native Android path ───────────────────────────────────────────────────────

async function startRecordingNative() {
  recording.value      = true
  liveTranscript.value = ''
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  try {
    const text = await startNativeRecognition(bcp47, (partial) => {
      liveTranscript.value = partial
    })
    transcript.value     = text
    liveTranscript.value = ''
    usedEngine.value     = 'native'
    scored.value         = true
    result.value         = lcsScore()
  } catch {
    // user can retry
  } finally {
    recording.value      = false
    liveTranscript.value = ''
  }
}

async function stopRecordingNative() {
  await stopNativeRecognition()
  // recording.value set to false in startRecordingNative's finally block
}

// ── Unified entry points ──────────────────────────────────────────────────────

function startRecording() {
  if (isNative) startRecordingNative()
  else          startRecordingWhisper()  // Groq backend → local fallback → browser
}

function stopRecording() {
  if (isNative) stopRecordingNative()
  else if (mediaRecorder && mediaRecorder.state !== 'inactive') stopRecordingWhisper()
  else          stopRecordingWebSpeech()
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
  clarity.value        = null
  scored.value         = false
  recording.value      = false
  isTranscribing.value = false
  usedEngine.value     = null
  recognition?.stop()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (isNative) TextToSpeech.stop().catch(() => {})
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
  if (isNative && recording.value) stopNativeRecognition().catch(() => {})
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
})
</script>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
</style>
