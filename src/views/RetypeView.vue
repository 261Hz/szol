<!-- RetypeView.vue: typing practice through the story one sentence at a time. -->
<!--                                                                              -->
<!-- Layout:                                                                      -->
<!--   ┌─ completed sentences (faded, scrolls up) ─────────────────────┐          -->
<!--   │  [gray] Sentence one text here.                               │          -->
<!--   │  [gray] Another sentence already done.                        │          -->
<!--   ├─ active sentence ─────────────────────────────────────────────┤          -->
<!--   │  [green]Typed [cursor]curr[dim]ent word remaining words here  │          -->
<!--   ├─ progress ─────────────────────────────────────────────────────┤          -->
<!--   │  sentence 3 of 8  ████████░░░░ 62%                           │          -->
<!--   └───────────────────────────────────────────────────────────────┘          -->
<template>
  <div class="flex flex-col gap-4">

    <!-- No story selected yet. -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main typing interface. -->
    <div v-else class="flex flex-col gap-3">

      <!-- Franco / Pinyin mode toggle (Arabic and Chinese only). -->
      <div v-if="hasFranco" class="flex gap-2 text-sm">
        <button
          @click="mode = 'native'"
          :class="mode === 'native' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ nativeLabel }}</button>
        <button
          @click="mode = 'franco'"
          :class="mode === 'franco' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ francoLabel }}</button>
      </div>

      <!-- ── Completed-sentence history ──────────────────────────────────── -->
      <!-- Scrollable area that shows all sentences typed so far, faded gray. -->
      <!-- "max-h-40 overflow-y-auto" = max 10rem tall, scrolls if more. -->
      <!-- ref="historyEl" = JS reference so we can .scrollTop it automatically. -->
      <div
        v-if="completedSentences.length"
        ref="historyEl"
        class="max-h-40 overflow-y-auto flex flex-col gap-1 border border-gray-100 rounded-lg px-4 py-2"
      >
        <div
          v-for="(s, i) in completedSentences"
          :key="i"
          class="text-sm text-gray-300 leading-snug break-words"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >
          <ClickableText
            :text="s"
            :lang="lang"
            :savedWords="savedWords"
            @tap="({ word: w, sentence }) => tapWord(w, sentence)"
          />
        </div>
      </div>

      <!-- ── Active sentence ─────────────────────────────────────────────── -->
      <!-- This is the div the user focuses to type.                          -->
      <!-- tabindex="0" = makes a non-input element keyboard-focusable.       -->
      <!-- @keydown = captures every keypress while focused.                  -->
      <!-- @focus/@blur = show/hide the "click to type" hint.                 -->
      <!-- break-words = long words (URLs, German compounds) wrap gracefully.  -->
      <div
        class="leading-loose text-base select-none cursor-text outline-none border border-gray-200 rounded-lg p-4 transition-colors focus:border-emerald-400 break-words min-h-16"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        tabindex="0"
        @keydown="onKey"
        @focus="focused = true; focusMobileInput()"
        @blur="focused = false"
        ref="overlayEl"
      >
        <!-- Done state: all sentences completed. -->
        <span v-if="done" class="text-emerald-500 font-medium">✓ {{ t(lang, 'done') ?? 'Complete!' }}</span>

        <!-- Active sentence: render each word and space with color-coded state. -->
        <!-- Each word is wrapped in a clickable span: click speaks + saves to vocab. -->
        <template v-else>
          <template v-for="(word, wi) in words" :key="wi">
            <span
              class="cursor-pointer rounded"
              :class="savedWords.has(normalize(word.map(c => c.char).join(''))) ? 'underline decoration-emerald-400 decoration-dotted underline-offset-2' : ''"
              @click.stop="tapWord(word.map(c => c.char).join(''), sentences[sentenceIdx])"
            >
              <span v-for="(c, ci) in word" :key="ci" :class="charClass(wi, ci)">{{ c.char }}</span>
            </span>
            <span v-if="wi < words.length - 1" :class="spaceClass(wi)">{{ ' ' }}</span>
          </template>
        </template>
      </div>

      <!-- Hidden input triggers the on-screen keyboard on mobile devices. -->
      <input
        class="opacity-0 h-0 absolute"
        ref="hiddenInput"
        @keydown="onKey"
        v-model="inputBuffer"
      />

      <!-- ── Progress row ────────────────────────────────────────────────── -->
      <div class="flex items-center gap-3">
        <!-- Sentence counter. -->
        <div class="text-xs text-gray-400 whitespace-nowrap">
          {{ Math.min(completedSentences.length + 1, sentences.length) }} / {{ sentences.length }}
        </div>
        <!-- Progress bar track. -->
        <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <!-- Fill: width = % of sentences completed. -->
          <div
            class="h-full rounded-full transition-all duration-200"
            :style="{ width: pct + '%', background: barColor }"
          />
        </div>
        <div class="text-xs text-gray-400 min-w-8 text-right">{{ pct }}%</div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { LANGS } from '../data/stories.js'
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
import { trackWord, saveProgress, getProgress } from '../utils/api.js'
import ClickableText from '../components/ClickableText.vue'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  { type: Object, default: () => new Set() },
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['saveWord'])

// ── Mode (native / franco / pinyin) ──────────────────────────────────────────

const mode = ref('native')

// hasFranco = true for Arabic (both varieties) and Chinese, which have Latin-script alternates.
const hasFranco = computed(() => ['ar', 'arz', 'zh'].includes(props.lang))

const nativeLabel = computed(() => {
  if (props.lang === 'zh')               return '中文'
  if (['ar', 'arz'].includes(props.lang)) return 'عربي'
  return 'Native'
})

const francoLabel = computed(() => props.lang === 'zh' ? 'Pinyin' : 'Franco')

// activeText = the text being practiced: native script or its romanised version.
const activeText = computed(() => {
  if (mode.value === 'franco' && props.story?.franco) return props.story.franco
  return props.story?.content ?? ''
})

// ── Sentence splitting ────────────────────────────────────────────────────────

// splitSentences() breaks a text into sentence-sized chunks for the practice loop.
// Splits after sentence-ending punctuation (covering Latin, Arabic, CJK, Indic scripts).
// Falls back to fixed 10-word chunks when the text has no sentence punctuation.
function splitSentences(text) {
  // Lookbehind (?<=...) splits AFTER the punctuation mark, keeping it with its sentence.
  const parts = text
    .split(/(?<=[.!?؟।。！？…])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  // If only one chunk came out but the text is long, split it into ~10-word pieces.
  if (parts.length <= 1) {
    const wordArr = text.trim().split(/\s+/).filter(Boolean)
    if (wordArr.length <= 10) return [text.trim()]
    const chunks = []
    for (let i = 0; i < wordArr.length; i += 10) {
      chunks.push(wordArr.slice(i, i + 10).join(' '))
    }
    return chunks
  }

  return parts
}

// ── Per-word / per-character data structure ───────────────────────────────────

// buildWords() converts a sentence string into a structured array for rendering.
// Returns: [ [{char:'H', state:'untouched'}, ...], [...], ... ]
// Strips leading/trailing punctuation from each word so comparison is clean.
function buildWords(text) {
  return text.split(/\s+/)
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(w => w.length > 0)
    .map(word => word.split('').map(char => ({ char, state: 'untouched' })))
}

// ── Voice list ────────────────────────────────────────────────────────────────
const voices = useVoiceList()

// ── Word tap ──────────────────────────────────────────────────────────────────

// tapWord() is called when the user clicks a word anywhere in the retype view.
// wordText may be a raw token (with punctuation). sentence is the surrounding context.
// Speaks the word, then emits saveWord so App.vue can deduplicate and save.
function tapWord(wordText, sentence) {
  const clean = wordText.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return

  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt   = new SpeechSynthesisUtterance(clean)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)

  if (props.currentUser) {
    trackWord(clean, props.lang, props.story?.title ?? '')
  }

  emit('saveWord', { word: clean, lang: props.lang, sentence: sentence ?? '', story: props.story?.title ?? '' })
}

// ── Reactive state ────────────────────────────────────────────────────────────

const sentences          = ref([])  // all sentences in the story, split from activeText
const sentenceIdx        = ref(0)   // index of the sentence currently being typed
const completedSentences = ref([])  // the text of each sentence already finished (for history)
const words              = ref([])  // the structured word/char array for the current sentence
const currentWordIndex   = ref(0)
const currentCharIndex   = ref(0)
const awaitingSpace      = ref(false) // true = word just completed, waiting for Space/Enter
const focused            = ref(false)
const done               = ref(false) // true when all sentences have been typed
const inputBuffer        = ref('')    // mobile keyboard capture
const overlayEl          = ref(null)
const historyEl          = ref(null)
const hiddenInput        = ref(null)

// Rebuild the exercise whenever the story or mode changes, then restore saved progress.
watch([() => props.story, mode, activeText], async () => {
  sentences.value          = splitSentences(activeText.value)
  sentenceIdx.value        = 0
  completedSentences.value = []
  done.value               = false
  loadSentence(0)
  await nextTick()
  overlayEl.value?.focus()

  if (props.currentUser && props.story?.id) {
    const saved = await getProgress(props.story.id, 'retype')
    if (saved && saved.sentence_index > 0) {
      const idx = Math.min(saved.sentence_index, sentences.value.length - 1)
      completedSentences.value = sentences.value.slice(0, idx)
      sentenceIdx.value        = idx
      loadSentence(idx)
    }
  }
}, { immediate: true })

// loadSentence() prepares the word/char structure for a given sentence index.
function loadSentence(idx) {
  words.value            = buildWords(sentences.value[idx] ?? '')
  currentWordIndex.value = 0
  currentCharIndex.value = 0
  awaitingSpace.value    = false
}

// advanceSentence() is called when the user correctly finishes the last word of a sentence.
// It pushes the completed text to history, moves to the next sentence, and saves progress.
async function advanceSentence() {
  completedSentences.value.push(sentences.value[sentenceIdx.value])
  sentenceIdx.value++

  if (props.currentUser && props.story?.id) {
    saveProgress(props.story.id, props.story.title ?? '', props.lang, 'retype', sentenceIdx.value)
  }

  if (sentenceIdx.value >= sentences.value.length) {
    done.value = true
    return
  }

  loadSentence(sentenceIdx.value)

  // Scroll the history panel to the bottom so the latest completed sentence is visible.
  await nextTick()
  if (historyEl.value) {
    historyEl.value.scrollTop = historyEl.value.scrollHeight
  }
}

// ── Keyboard handler ──────────────────────────────────────────────────────────

function onKey(e) {
  if (done.value || !words.value.length) return

  const wi   = currentWordIndex.value
  const ci   = currentCharIndex.value
  const word = words.value[wi]
  const isLastWord = wi === words.value.length - 1

  // Ignore all modifier/control keys except Backspace.
  if (e.key.length > 1 && e.key !== 'Backspace') return

  // ── Space: advance word (or sentence) ──────────────────────────────────
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    if (!awaitingSpace.value) return

    awaitingSpace.value = false

    if (!isLastWord) {
      // Move to the next word within the same sentence.
      currentWordIndex.value++
      currentCharIndex.value = 0
    } else {
      // Last word of the sentence done — advance to the next sentence.
      advanceSentence()
    }
    return
  }

  // ── Backspace ──────────────────────────────────────────────────────────
  if (e.key === 'Backspace') {
    e.preventDefault()
    if (awaitingSpace.value) {
      // Cancel the completed state and go back to fixing the last character.
      awaitingSpace.value = false
      words.value[wi].forEach(c => c.state = 'untouched')
      currentCharIndex.value = 0
    } else if (ci > 0) {
      words.value[wi][ci - 1].state = 'untouched'
      currentCharIndex.value--
    }
    return
  }

  // If waiting for Space, ignore any other keys.
  if (awaitingSpace.value) return

  e.preventDefault()

  // ── Character matching ─────────────────────────────────────────────────
  const expected = word[ci].char
  const match    = e.key === expected

  words.value[wi][ci].state = match ? 'correct' : 'wrong'
  currentCharIndex.value++

  // Check if the full word has been typed.
  if (currentCharIndex.value === word.length) {
    const hasError = word.some(c => c.state === 'wrong')
    if (hasError) {
      // Reset word — user must retype it from scratch.
      words.value[wi].forEach(c => c.state = 'untouched')
      currentCharIndex.value = 0
    } else {
      // Word typed correctly: wait for Space before advancing.
      awaitingSpace.value = true
    }
  }
}

// ── Character / space styling ─────────────────────────────────────────────────

// charClass() returns CSS classes for a single character based on state + cursor position.
function charClass(wi, ci) {
  const state     = words.value[wi]?.[ci]?.state
  const isCurrent = wi === currentWordIndex.value && ci === currentCharIndex.value && !awaitingSpace.value

  // Future words (not yet reached) are shown in light gray so the full sentence is readable.
  const isFuture = wi > currentWordIndex.value

  return {
    'text-emerald-600':          state === 'correct',
    'text-red-500':              state === 'wrong',
    'text-gray-800':             state === 'untouched' && !isFuture,
    'text-gray-300':             isFuture,
    'border-b-2 border-gray-700': isCurrent,
  }
}

// spaceClass() styles the space between words.
function spaceClass(wi) {
  const word     = words.value[wi]
  const done     = word.every(c => c.state === 'correct')
  const isActive = wi === currentWordIndex.value

  // Show cursor underline on the space when awaiting Space to advance.
  if (awaitingSpace.value && isActive) return 'border-b-2 border-gray-700'
  // Space after a completed word inherits the "done" color; space before future words is dim.
  if (done)          return 'text-gray-800'
  if (wi > currentWordIndex.value) return 'text-gray-300'
  return 'text-gray-800'
}

// ── Progress ──────────────────────────────────────────────────────────────────

// pct = percentage of sentences completed (0–100).
const pct = computed(() => {
  const total = sentences.value.length
  if (!total) return 0
  return Math.round((completedSentences.value.length / total) * 100)
})

const barColor = computed(() => {
  if (pct.value >= 90) return '#10b981' // emerald green
  if (pct.value >= 60) return '#f59e0b' // amber
  return '#ef4444'                       // red (just starting)
})

// ── Mobile keyboard helper ────────────────────────────────────────────────────

// On mobile, tap on the overlay and focus the hidden input to open the keyboard.
function focusMobileInput() {
  hiddenInput.value?.focus()
}
</script>
