<!-- ContentView: one surface for a content item. Tools are overlays, not tabs. -->
<!-- Handles: text stories (read/retype), podcast episodes (audio+dictation+translate), or both. -->
<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-sm text-center py-12" style="color:#8c7a66;">{{ t(lang, 'noStory') }}</div>

    <template v-else>

      <!-- ── Header ── -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold text-lg leading-snug break-words" style="color:#2a241c; font-family:'IM Fell English',serif;" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs mt-0.5" style="color:#8c7a66;">
            {{ LANGS[lang]?.name }}
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
          <div v-if="knownInText > 0" class="text-xs mt-0.5" style="color:#8b3a3a;">
            {{ knownInText }} {{ knownInText === 1 ? 'word' : 'words' }} from your collection
          </div>
        </div>
        <button
          v-if="story.content"
          @click="$emit('go', 'retype')"
          class="flex-shrink-0 text-sm border-b transition-all"
          style="border-color:rgba(139,58,58,0.4); color:#8b3a3a;"
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
      <div v-if="segments.length" class="flex gap-4 flex-wrap">
        <button
          v-for="tool in availableTools"
          :key="tool.key"
          @click="activeTool = tool.key"
          class="text-sm border-b-2 pb-0.5 transition-all"
          :style="activeTool === tool.key ? 'border-color:#2a241c; color:#2a241c;' : 'border-color:transparent; color:#8c7a66;'"
        >{{ tool.label }}</button>
      </div>

      <!-- ═══════════════════════ READ MODE ═══════════════════════ -->
      <template v-if="activeTool === 'read'">

        <!-- Pinyin toggle — Chinese only -->
        <div v-if="isChinese" class="flex gap-0.5">
          <button
            @click="showPinyin = !showPinyin"
            class="text-xs px-2 py-0.5 rounded-full transition-all"
            :style="showPinyin
              ? 'background:#2a2018; color:#e8dcc4;'
              : 'color:rgba(31,27,23,0.38);'"
          >pinyin</button>
        </div>

        <!-- Root mode switcher — Hebrew and Arabic only -->
        <div v-if="lang === 'ar' || lang === 'he'" class="flex gap-0.5">
          <button
            v-for="m in ROOT_MODES"
            :key="m.key"
            @click="rootMode = m.key"
            class="text-xs px-2 py-0.5 rounded-full transition-all"
            :style="rootMode === m.key
              ? 'background:#2a2018; color:#e8dcc4;'
              : 'color:rgba(31,27,23,0.38);'"
          >{{ m.label }}</button>
        </div>

        <div
          class="font-serif leading-[1.8] text-base"
          style="color:#2a241c;"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          :class="isRTL(lang) ? 'text-right text-lg' : ''"
        >
          <template v-for="(tok, i) in tokens" :key="i">
            <!-- Root mode: root consonants in blue, affixes hollowed in manuscript -->
            <span
              v-if="tok.type === 'word' && segMap.get(tok)"
              class="cursor-pointer"
              @click="tap(tok.text)"
            ><span
                v-for="(seg, si) in segMap.get(tok)"
                :key="si"
                :style="seg.role === 'root'
                  ? 'color:#3a4f6b;'
                  : seg.role === 'affix' && rootMode === 'manuscript'
                    ? 'color:transparent; -webkit-text-stroke:0.7px rgba(42,36,28,0.35);'
                    : ''"
              >{{ seg.ch }}</span></span>
            <!-- Chinese with pinyin ruby -->
            <span
              v-else-if="tok.type === 'word' && isChinese && showPinyin"
              @click="tap(tok.text)"
              class="cursor-pointer"
              :style="savedWords?.has(normalize(tok.text))
                ? 'color:#8b3a3a; text-decoration:underline; text-underline-offset:2px;'
                : ''"
            ><ruby v-for="(ch, ci) in tok.text" :key="ci" style="ruby-align:center"><span>{{ ch }}</span><rt style="font-size:0.55em; color:#8b3a3a; font-family:sans-serif; letter-spacing:0; font-style:normal;">{{ charPinyin(ch) }}</rt></ruby></span>
            <!-- Plain word — no root data, or roots off -->
            <span
              v-else-if="tok.type === 'word'"
              @click="tap(tok.text)"
              class="cursor-pointer"
              :style="savedWords?.has(normalize(tok.text))
                ? 'color:#8b3a3a; text-decoration:underline; text-underline-offset:2px;'
                : ''"
            >{{ tok.text }}</span>
            <span v-else>{{ tok.text }}</span>
          </template>
        </div>

        <!-- Word panel -->
        <div v-if="tapped" class="flex flex-col gap-2 py-3" style="border-left:2px solid rgba(139,58,58,0.3); padding-left:1rem;">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-xl font-semibold" style="color:#2a241c; font-family:'IM Fell English',serif;" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ tapped.word }}</div>
              <div v-if="tapped.root" class="text-xs mt-0.5" style="font-family:'EB Garamond',serif; color:#8b3a3a; font-style:italic;">
                √ {{ tapped.root }}
                <template v-if="tapped.rootFamily.length > 1">
                  <span style="color:rgba(31,27,23,0.28);"> · </span>
                  <span
                    v-for="(w, wi) in tapped.rootFamily.slice(0, 4)"
                    :key="wi"
                    class="cursor-pointer hover:underline"
                    style="color:rgba(31,27,23,0.5);"
                    @click="tap(w)"
                  >{{ w }} </span>
                </template>
              </div>
            </div>
            <button
              @click="saveWord"
              :disabled="savedWords?.has(normalize(tapped.word))"
              class="text-xs border-b transition-all disabled:opacity-40 flex-shrink-0"
              style="border-color:rgba(139,58,58,0.4); color:#8b3a3a;"
            >{{ savedWords?.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}</button>
          </div>
          <div v-if="tapped.sentence" class="text-sm italic" style="color:#8c7a66;" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
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
        <div v-if="relatedStories.length" class="flex flex-col gap-2 pt-4 mt-2" style="border-top:1px solid rgba(42,36,28,0.08);">
          <div class="text-xs uppercase tracking-widest" style="color:#8c7a66;">Also in your collection</div>
          <div class="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              v-for="s in relatedStories"
              :key="s.id"
              @click="$emit('switch-story', s)"
              class="flex-shrink-0 text-left transition-all"
              style="max-width:150px"
            >
              <div class="text-xs font-medium leading-snug line-clamp-2 border-b" style="color:#5a4a3b; border-color:rgba(42,36,28,0.15);" :dir="isRTL(s.lang) ? 'rtl' : 'ltr'">{{ s.title }}</div>
              <div class="text-[10px] mt-1" style="color:#8b3a3a;">{{ s.score }} known</div>
            </button>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════ DICTATION / TRANSLATE MODE ═══════════════════════ -->
      <template v-else-if="activeTool === 'dictation' || activeTool === 'translate'">

        <!-- Segment player -->
        <div class="px-4 py-3 flex flex-col gap-3" style="background:rgba(42,36,28,0.04); border:1px solid rgba(42,36,28,0.08); border-radius:2px;">
          <div class="flex items-center justify-between text-xs" style="color:#8c7a66;">
            <span>{{ t(lang, 'segment') }} {{ segmentIdx + 1 }} / {{ segments.length }}</span>
            <span>{{ fmtTime(currentTime) }}</span>
          </div>

          <div class="flex items-center justify-center gap-8">
            <button
              @click="replaySegment"
              class="transition-all flex flex-col items-center gap-0.5"
              style="color:#8c7a66;"
              title="Replay"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M1 4v6h6M3.51 15a9 9 0 1 0 .49-3.2" />
              </svg>
              <span class="text-[10px]">replay</span>
            </button>

            <button
              @click="story.audio_url ? playSegment() : ttsSaySegment()"
              class="w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all text-xl"
              style="border-color:#2a241c; color:#2a241c;"
              onmouseover="this.style.background='rgba(42,36,28,0.06)'" onmouseout="this.style.background=''"
            >{{ isPlaying || isSpeaking ? '⏸' : '▶' }}</button>

            <button
              @click="nextSegment"
              :disabled="segmentIdx >= segments.length - 1"
              class="transition-all flex flex-col items-center gap-0.5 disabled:opacity-30"
              style="color:#8c7a66;"
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
          class="w-full bg-transparent border-0 border-b px-0 py-2 text-sm resize-none transition-all"
          style="color:#2a241c; border-color:rgba(42,36,28,0.2); font-family:'EB Garamond',serif;"
        />

        <!-- Dictation scoring -->
        <template v-if="activeTool === 'dictation'">
          <div v-if="comparedWords.length" class="flex flex-wrap gap-1.5 px-1">
            <span
              v-for="(w, i) in comparedWords"
              :key="i"
              class="text-sm px-1.5 py-0.5 font-mono"
              :style="w.state === 'correct' ? 'color:#5a4a3b; text-decoration:underline; text-decoration-color:rgba(90,74,59,0.4);' :
                      w.state === 'wrong'   ? 'color:#8b3a3a; text-decoration:underline; text-decoration-style:wavy; text-decoration-color:rgba(139,58,58,0.5);' :
                                              'color:#8c7a66;'"
            >{{ w.typed }}</span>
          </div>
          <div v-if="accuracy !== null" class="text-right text-xs" style="color:#8c7a66;">
            <span style="color:#5a4a3b; font-weight:500;">{{ accuracy }}%</span>
            ({{ comparedWords.filter(w => w.state === 'correct').length }}/{{ segmentWords.length }})
          </div>
        </template>

        <!-- Reveal + action row -->
        <div class="flex items-center justify-between gap-2">
          <button
            @click="showTranscript = !showTranscript"
            class="text-xs border-b transition-all"
            style="border-color:rgba(42,36,28,0.2); color:#8c7a66;"
          >{{ showTranscript ? 'Hide text' : 'Show text' }}</button>

          <button
            v-if="segmentIdx < segments.length - 1"
            @click="nextSegment"
            class="text-xs border-b transition-all"
            style="border-color:rgba(42,36,28,0.3); color:#5a4a3b;"
          >Next →</button>
        </div>

        <!-- Transcript text -->
        <div
          v-if="showTranscript && currentSegment"
          class="px-4 py-3 text-sm leading-relaxed"
          style="border-left:2px solid rgba(42,36,28,0.15); color:#2a241c; font-family:'EB Garamond',serif;"
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
import { rootMode, preFetchRoots } from '../utils/rootHighlight.js'
import { charPinyin } from '../utils/romanization.js'

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

// ── Root annotation ───────────────────────────────────────────────────────────

const isChinese  = computed(() => ['zh', 'zh-TW'].includes(props.lang))
const showPinyin = ref(false)

const ROOT_MODES = [
  { key: 'off',        label: 'Text' },
  { key: 'roots',      label: 'Roots' },
  { key: 'manuscript', label: 'Manuscript' },
]

const wordRootMap = ref({})

watch(
  [() => props.story, () => props.lang, rootMode],
  async ([story, lang, mode]) => {
    if (mode === 'off' || !story || !['ar', 'he'].includes(lang)) {
      wordRootMap.value = {}
      return
    }
    const words = [...new Set(
      story.content.split(/\s+/)
        .map(w => w.replace(/[^\p{L}\p{M}]/gu, '').replace(/[ְ-ׇً-ٰٟ]/g, ''))
        .filter(Boolean)
    )]
    wordRootMap.value = await preFetchRoots(words, lang)
  },
  { immediate: true }
)

const rootFamilyMap = computed(() => {
  const map = {}
  for (const [word, root] of Object.entries(wordRootMap.value)) {
    if (!map[root]) map[root] = []
    if (!map[root].includes(word)) map[root].push(word)
  }
  return map
})

// Per-token character segmentation: root consonants vs. prefix/suffix/binyan letters.
// Driven by Dicta's shoresh — root chars appear in order within the word form (Semitic
// root-and-pattern morphology). Non-letter chars (punctuation attached to word) pass through.
const segMap = computed(() => {
  if (rootMode.value === 'off') return new Map()
  const out = new Map()
  for (const tok of tokens.value) {
    if (tok.type !== 'word' || !tok.clean) continue
    const root = wordRootMap.value[tok.clean]
    if (!root) continue
    const rootChars = [...root]
    const chars     = [...tok.text]
    const rootIdx   = new Set()
    let ri = 0
    for (let i = 0; i < chars.length && ri < rootChars.length; i++) {
      if (/[\p{L}\p{M}]/u.test(chars[i]) && chars[i] === rootChars[ri]) {
        rootIdx.add(i); ri++
      }
    }
    if (ri < rootChars.length) continue  // couldn't match all root chars — skip
    out.set(tok, chars.map((ch, i) => ({
      ch,
      role: rootIdx.has(i) ? 'root' : /[\p{L}\p{M}]/u.test(ch) ? 'affix' : 'punct',
    })))
  }
  return out
})

// ── Read mode: tokens + word tap ─────────────────────────────────────────────
const tokens = computed(() => {
  if (!props.story?.content) return []
  return props.story.content.split(/(\s+)/).map(tok => ({
    type:  /^\s+$/.test(tok) ? 'space' : 'word',
    text:  tok,
    clean: tok.replace(/[^\p{L}\p{M}]/gu, '').replace(/[ְ-ׇً-ٰٟ]/g, ''),
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

  const root       = wordRootMap.value[clean] ?? null
  const rootFamily = root ? (rootFamilyMap.value[root] ?? []) : []
  tapped.value = { word: clean, sentence, root, rootFamily }
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
