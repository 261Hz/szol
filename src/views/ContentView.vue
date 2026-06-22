<!-- ContentView: one surface for a content item. Tools are overlays, not tabs. -->
<!-- Handles: text stories (read/retype), podcast episodes (audio+dictation+translate), or both. -->
<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-gray-500 text-sm text-center py-12">{{ t(lang, 'noStory') }}</div>

    <template v-else>

      <!-- ── Header ── -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold text-lg leading-snug break-words" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            {{ LANGS[lang]?.name }}
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
          <div v-if="knownInText > 0" class="text-xs text-green-500 mt-0.5">
            {{ knownInText }} {{ knownInText === 1 ? 'word' : 'words' }} from your collection
          </div>
        </div>
        <button
          v-if="story.content"
          @click="$emit('go', 'retype')"
          class="flex-shrink-0 text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all"
        >{{ t(lang, 'retype') }} →</button>
      </div>

      <!-- ── Hidden audio element ── -->
      <audio
        v-if="story.audio_url"
        ref="audioEl"
        :src="story.audio_url"
        preload="metadata"
        @timeupdate="onTimeUpdate"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
        style="display:none"
      />

      <!-- ── Tool selector (only when tools beyond read are available) ── -->
      <div v-if="segments.length" class="flex gap-1.5 flex-wrap">
        <button
          v-for="tool in availableTools"
          :key="tool.key"
          @click="activeTool = tool.key"
          :class="['text-xs px-3 py-1.5 rounded-full transition-all',
            activeTool === tool.key ? tool.activeCls : 'bg-gray-900 text-gray-500 border border-gray-800 hover:text-gray-300']"
        >{{ tool.label }}</button>
      </div>

      <!-- ═══════════════════════ READ MODE ═══════════════════════ -->
      <template v-if="activeTool === 'read'">
        <div
          class="leading-loose text-base"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          :class="isRTL(lang) ? 'text-right text-lg' : ''"
        >
          <span v-for="(tok, i) in tokens" :key="i">
            <span
              v-if="tok.type === 'word'"
              @click="tap(tok.text)"
              :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                savedWords?.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '']"
            >{{ tok.text }}</span>
            <span v-else>{{ tok.text }}</span>
          </span>
        </div>

        <!-- Word panel -->
        <div v-if="tapped" class="border border-green-700 rounded-lg p-4 bg-green-950 flex flex-col gap-2">
          <div class="flex items-start justify-between">
            <div class="text-xl font-semibold" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ tapped.word }}</div>
            <button
              @click="saveWord"
              :disabled="savedWords?.has(normalize(tapped.word))"
              class="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all"
            >{{ savedWords?.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}</button>
          </div>
          <div v-if="tapped.sentence" class="text-sm text-gray-400 italic" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ tapped.sentence }}
          </div>
          <ExamplesPanel
            :word="tapped.word"
            :lang="lang"
            :savedWords="savedWords"
            :currentUser="currentUser"
            @tap="({ word: w, sentence }) => tap(w, sentence)"
          />
        </div>

        <!-- Related stories strip -->
        <div v-if="relatedStories.length" class="flex flex-col gap-2 pt-3 border-t border-gray-800">
          <div class="text-xs text-gray-700 uppercase tracking-widest">Also in your collection</div>
          <div class="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              v-for="s in relatedStories"
              :key="s.id"
              @click="$emit('switch-story', s)"
              class="flex-shrink-0 text-left border border-gray-800 rounded-lg p-2.5 hover:border-green-800 transition-all"
              style="max-width:150px"
            >
              <div class="text-xs text-gray-300 font-medium leading-snug line-clamp-2" :dir="isRTL(s.lang) ? 'rtl' : 'ltr'">{{ s.title }}</div>
              <div class="text-[10px] text-green-600 mt-1">{{ s.score }} known</div>
            </button>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════ DICTATION / TRANSLATE MODE ═══════════════════════ -->
      <template v-else-if="activeTool === 'dictation' || activeTool === 'translate'">

        <!-- Segment player -->
        <div class="bg-gray-900 rounded-xl px-4 py-3 flex flex-col gap-3">
          <div class="flex items-center justify-between text-xs text-gray-600">
            <span>{{ t(lang, 'segment') }} {{ segmentIdx + 1 }} / {{ segments.length }}</span>
            <span>{{ fmtTime(currentTime) }}</span>
          </div>

          <div class="flex items-center justify-center gap-8">
            <button
              @click="replaySegment"
              class="text-gray-500 hover:text-white transition-all flex flex-col items-center gap-0.5"
              title="Replay"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M1 4v6h6M3.51 15a9 9 0 1 0 .49-3.2" />
              </svg>
              <span class="text-[10px]">replay</span>
            </button>

            <button
              @click="story.audio_url ? playSegment() : ttsSaySegment()"
              :class="['w-14 h-14 rounded-full text-2xl flex items-center justify-center transition-all',
                activeTool === 'dictation' ? 'bg-sky-700 hover:bg-sky-600' : 'bg-violet-700 hover:bg-violet-600',
                'text-white']"
            >{{ isPlaying || isSpeaking ? '⏸' : '▶' }}</button>

            <button
              @click="nextSegment"
              :disabled="segmentIdx >= segments.length - 1"
              class="text-gray-500 hover:text-white disabled:opacity-30 transition-all flex flex-col items-center gap-0.5"
              title="Next segment"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M5 4l10 8-10 8V4zM19 5v14" />
              </svg>
              <span class="text-[10px]">next</span>
            </button>
          </div>
        </div>

        <!-- Input -->
        <textarea
          v-model="userInput"
          rows="3"
          :placeholder="activeTool === 'translate' ? 'Write your translation…' : 'Write what you hear…'"
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-sky-600 resize-none placeholder:text-gray-600 transition-all"
        />

        <!-- Dictation scoring -->
        <template v-if="activeTool === 'dictation'">
          <div v-if="comparedWords.length" class="flex flex-wrap gap-1.5 px-1">
            <span
              v-for="(w, i) in comparedWords"
              :key="i"
              :class="['text-sm px-1.5 py-0.5 rounded font-mono',
                w.state === 'correct' ? 'bg-green-900 text-green-300' :
                w.state === 'wrong'   ? 'bg-purple-900 text-purple-300' :
                                        'text-gray-600']"
            >{{ w.typed }}</span>
          </div>
          <div v-if="accuracy !== null" class="text-right text-xs text-gray-600">
            <span class="text-green-400 font-medium">{{ accuracy }}%</span>
            ({{ comparedWords.filter(w => w.state === 'correct').length }}/{{ segmentWords.length }})
          </div>
        </template>

        <!-- Reveal + action row -->
        <div class="flex items-center justify-between gap-2">
          <button
            @click="showTranscript = !showTranscript"
            class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-sky-700 hover:text-sky-400 transition-all"
          >{{ showTranscript ? 'Hide text' : 'Show text' }}</button>

          <button
            v-if="segmentIdx < segments.length - 1"
            @click="nextSegment"
            class="text-xs px-4 py-1.5 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition-all"
          >Next →</button>
        </div>

        <!-- Transcript text -->
        <div
          v-if="showTranscript && currentSegment"
          class="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 leading-relaxed"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ currentSegment.text }}</div>

      </template>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'
import ExamplesPanel from '../components/ExamplesPanel.vue'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  Object,
  currentUser: Object,
  storyPool:   { type: Array, default: () => [] },
  echoesFor:   { type: Function, default: null },
})

const emit = defineEmits(['go', 'saveWord', 'switch-story'])

// ── Tool management ──────────────────────────────────────────────────────────
const activeTool = ref('read')

const availableTools = computed(() => {
  const tools = [{ key: 'read', label: 'Read', activeCls: 'bg-gray-700 text-white' }]
  if (segments.value.length) {
    tools.push({ key: 'dictation', label: 'Dictation', activeCls: 'bg-sky-700 text-white' })
    tools.push({ key: 'translate', label: 'Translate', activeCls: 'bg-violet-700 text-white' })
  }
  return tools
})

watch(() => props.story, () => {
  activeTool.value   = 'read'
  tapped.value       = null
  segmentIdx.value   = 0
  userInput.value    = ''
  showTranscript.value = false
})

// ── Segments ─────────────────────────────────────────────────────────────────
const segments       = computed(() => props.story?.segments ?? [])
const segmentIdx     = ref(0)
const currentSegment = computed(() => segments.value[segmentIdx.value] ?? null)

function nextSegment() {
  if (segmentIdx.value < segments.value.length - 1) {
    segmentIdx.value++
    userInput.value    = ''
    showTranscript.value = false
    if (isPlaying.value) audioEl.value?.pause()
    isSpeaking.value = false
    speechSynthesis.cancel()
  }
}

// ── Audio ────────────────────────────────────────────────────────────────────
const audioEl    = ref(null)
const currentTime = ref(0)
const isPlaying   = ref(false)

function onTimeUpdate() {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  if (currentSegment.value && audioEl.value.currentTime >= currentSegment.value.end) {
    audioEl.value.pause()
  }
}

function playSegment() {
  if (!audioEl.value || !currentSegment.value) return
  if (isPlaying.value) { audioEl.value.pause(); return }
  audioEl.value.currentTime = currentSegment.value.start
  audioEl.value.play()
}

function replaySegment() {
  if (props.story?.audio_url && audioEl.value && currentSegment.value) {
    audioEl.value.currentTime = currentSegment.value.start
    audioEl.value.play()
  } else {
    isSpeaking.value = false
    speechSynthesis.cancel()
    ttsSaySegment()
  }
}

function fmtTime(sec) {
  const s = Math.floor(sec ?? 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── TTS fallback when no audio_url ───────────────────────────────────────────
const voices    = useVoiceList()
const isSpeaking = ref(false)

function ttsSaySegment() {
  if (!currentSegment.value) return
  if (isSpeaking.value) { speechSynthesis.cancel(); isSpeaking.value = false; return }
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt   = new SpeechSynthesisUtterance(currentSegment.value.text)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  utt.onend   = () => { isSpeaking.value = false }
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)
  isSpeaking.value = true
}

// ── Dictation scoring ─────────────────────────────────────────────────────────
const userInput      = ref('')
const showTranscript = ref(false)

const segmentWords = computed(() => {
  return (currentSegment.value?.text ?? '').split(/\s+/).filter(Boolean)
})

const comparedWords = computed(() => {
  if (!userInput.value.trim() || !currentSegment.value) return []
  const norm  = s => (s || '').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  const typed = userInput.value.trim().split(/\s+/).filter(Boolean)
  const ref   = segmentWords.value.map(norm)
  return typed.map((w, i) => ({
    typed: w,
    state: norm(w) === (ref[i] ?? '') ? 'correct' : 'wrong',
  }))
})

const accuracy = computed(() => {
  if (!comparedWords.value.length || !segmentWords.value.length) return null
  const correct = comparedWords.value.filter(w => w.state === 'correct').length
  return Math.round(correct / segmentWords.value.length * 100)
})

// ── Read mode: tokens + word tap ─────────────────────────────────────────────
const tokens = computed(() => {
  if (!props.story?.content) return []
  return props.story.content.split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
})

const tapped = ref(null)

function tap(word, contextSentence) {
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return

  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt   = new SpeechSynthesisUtterance(clean)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)

  const sentence = contextSentence
    ?? props.story?.content.split(/(?<=[.!?؟।。！？])\s*/).find(s => s.includes(word))
    ?? ''
  tapped.value = { word: clean, sentence }
}

function saveWord() {
  if (!tapped.value) return
  emit('saveWord', {
    word:     tapped.value.word,
    lang:     props.lang,
    sentence: tapped.value.sentence,
    story:    props.story?.title ?? '',
  })
}

// ── Known words in text ───────────────────────────────────────────────────────
const knownInText = computed(() => {
  if (!props.story?.content || !props.savedWords?.size) return 0
  const seen = new Set()
  for (const raw of props.story.content.split(/\s+/)) {
    const n = normalize(raw)
    if (n && props.savedWords.has(n)) seen.add(n)
  }
  return seen.size
})

// ── Related stories (uses echo index if available, falls back to overlap scan) ──
const relatedStories = computed(() => {
  if (!props.story) return []
  if (props.echoesFor) {
    const echoes  = props.echoesFor(props.story)
    const byStory = {}
    for (const ev of echoes) {
      if (!byStory[ev.exposureId] || ev.triggers.length > byStory[ev.exposureId].score) {
        const s = props.storyPool.find(s => s.id === ev.exposureId)
        if (s) byStory[ev.exposureId] = { ...s, score: ev.triggers.length }
      }
    }
    return Object.values(byStory).sort((a, b) => b.score - a.score).slice(0, 5)
  }
  if (!props.storyPool?.length || !props.savedWords?.size) return []
  return props.storyPool
    .filter(s => s.id !== props.story?.id && s.lang === props.lang)
    .map(s => {
      const text = s.content ?? s.text ?? ''
      const seen = new Set()
      for (const raw of text.split(/\s+/)) {
        const n = normalize(raw)
        if (n && props.savedWords.has(n)) seen.add(n)
      }
      return { ...s, score: seen.size }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
})
</script>
