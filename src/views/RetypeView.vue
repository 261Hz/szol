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
    <div v-if="!story" class="text-gray-500 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main typing interface. -->
    <div v-else class="flex flex-col gap-3">

      <!-- Mode toggles: Franco/Pinyin (Arabic + Chinese) and Ignore Punctuation (all languages). -->
      <div class="flex gap-2 flex-wrap">
        <template v-if="hasFranco">
          <button
            @click="mode = 'native'"
            :class="mode === 'native' ? 'bg-gray-800 text-white' : 'bg-gray-800 text-gray-400'"
            class="text-sm px-3 py-1 rounded-full transition-all"
          >{{ nativeLabel }}</button>
          <button
            @click="mode = 'franco'"
            :class="mode === 'franco' ? 'bg-gray-800 text-white' : 'bg-gray-800 text-gray-400'"
            class="text-sm px-3 py-1 rounded-full transition-all"
          >{{ francoLabel }}</button>
        </template>
        <button
          @click="ignorePunct = !ignorePunct"
          :class="ignorePunct ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'"
          class="text-sm px-3 py-1 rounded-full transition-all"
        >ignore punct.</button>
      </div>

      <!-- ── Completed-sentence history ──────────────────────────────────── -->
      <!-- Scrollable area that shows all sentences typed so far, faded gray. -->
      <!-- "max-h-40 overflow-y-auto" = max 10rem tall, scrolls if more. -->
      <!-- ref="historyEl" = JS reference so we can .scrollTop it automatically. -->
      <div
        v-if="completedSentences.length"
        ref="historyEl"
        class="max-h-40 overflow-y-auto flex flex-col gap-1 border border-gray-800 rounded-lg px-4 py-2"
      >
        <div
          v-for="(s, i) in completedSentences"
          :key="i"
          class="text-sm text-gray-600 leading-snug break-words"
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
        class="leading-loose text-base cursor-text outline-none border border-gray-700 rounded-lg p-4 transition-colors focus:border-green-600 break-words min-h-16"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        tabindex="0"
        @keydown="onKey"
        @focus="focused = true; focusMobileInput()"
        @blur="focused = false"
        ref="overlayEl"
      >
        <!-- Done state: all sentences completed. -->
        <span v-if="done" class="text-green-400 font-medium">✓ {{ t(lang, 'done') ?? 'Complete!' }}</span>

        <!-- Active sentence: render each word and space with color-coded state. -->
        <!-- Each word is wrapped in a clickable span: click speaks + saves to vocab. -->
        <template v-else>
          <template v-for="(word, wi) in words" :key="wi">
            <button
              type="button"
              class="inline whitespace-nowrap rounded transition-colors hover:bg-green-950 active:bg-green-950 select-none bg-transparent border-0 p-0 m-0 font-[inherit] leading-[inherit] cursor-pointer"
              :class="savedWords.has(normalize(word.map(c => c.char).join(''))) ? 'underline decoration-green-500 decoration-dotted underline-offset-2' : ''"
              @click.stop="tapWord(word.map(c => c.char).join(''), sentences[sentenceIdx])"
            ><ruby v-if="wordNum(word)" class="szol-num"><span v-for="(c, ci) in word" :key="ci" :class="charClass(wi, ci)">{{ c.char }}</span><rt>{{ wordNum(word) }}</rt></ruby><template v-else><span v-for="(c, ci) in word" :key="ci" :class="charClass(wi, ci)">{{ c.char }}</span></template></button>
            <span v-if="wi < words.length - 1 && !isCJK" :class="spaceClass(wi)">{{ ' ' }}</span>
          </template>
        </template>
      </div>

      <!-- Hidden input triggers the on-screen keyboard on mobile devices. -->
      <!-- fixed+top-0+left-0 prevents the browser from scroll-jumping to reveal it on focus. -->
      <input
        class="fixed top-0 left-0 w-0 h-0 opacity-0 pointer-events-none border-none outline-none"
        ref="hiddenInput"
        type="text"
        inputmode="text"
        autocorrect="off"
        autocomplete="off"
        autocapitalize="off"
        @keydown="onKey"
        @input="onMobileInput"
      />

      <!-- ── Progress row ────────────────────────────────────────────────── -->
      <div class="flex items-center gap-3">
        <!-- Sentence counter. -->
        <div class="text-xs text-gray-500 whitespace-nowrap">
          {{ Math.min(completedSentences.length + 1, sentences.length) }} / {{ sentences.length }}
        </div>
        <!-- Progress bar track. -->
        <div class="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <!-- Fill: width = % of sentences completed. -->
          <div
            class="h-full rounded-full transition-all duration-200"
            :style="{ width: pct + '%', background: barColor }"
          />
        </div>
        <div class="text-xs text-gray-500 min-w-8 text-right">{{ pct }}%</div>
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
import { numToWords } from '../utils/numWords.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  { type: Object, default: () => new Set() },
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['saveWord'])

// ── Mode (native / franco / pinyin) ──────────────────────────────────────────

const mode        = ref('native')
const ignorePunct = ref(false)

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

// ── CJK detection ─────────────────────────────────────────────────────────────

const CJK_LANGS = new Set(['ja', 'zh', 'cmn', 'yue', 'ko'])
const isCJK = computed(() => CJK_LANGS.has(props.lang))

// ── Sentence splitting ────────────────────────────────────────────────────────

function splitSentences(text) {
  if (isCJK.value) {
    // CJK sentences end with 。！？ with no space before the next character
    const parts = text.split(/(?<=[。！？…\n])/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) return parts
    // Fallback: 30-character chunks
    const chunks = []
    for (let i = 0; i < text.length; i += 30) {
      const c = text.slice(i, i + 30).trim()
      if (c) chunks.push(c)
    }
    return chunks.length ? chunks : [text.trim()]
  }

  const parts = text
    .split(/(?<=[.!?؟।。！？…])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

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

function buildWords(text) {
  if (isCJK.value) {
    // Each character is its own "word" — no spaces in CJK
    return [...text]
      .filter(c => !(/\s/.test(c)))
      .filter(c => !ignorePunct.value || /[\p{L}\p{N}]/u.test(c))
      .map(char => [{ char, state: 'untouched' }])
  }
  return text.split(/\s+/)
    .map(w => ignorePunct.value
      ? w.replace(/[^\p{L}\p{N}]/gu, '')
      : w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
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

  emit('saveWord', { word: clean, lang: props.lang, langName: LANGS[props.lang]?.name ?? props.lang, sentence: sentence ?? '', story: props.story?.title ?? '' })
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

// ── Local progress helpers ────────────────────────────────────────────────────

function localKey() {
  return props.story?.id ? `szol_retype_${props.story.id}_${mode.value}` : null
}

function saveLocalProgress() {
  const key = localKey()
  if (!key) return
  localStorage.setItem(key, JSON.stringify({
    s: sentenceIdx.value,
    w: currentWordIndex.value,
  }))
}

function clearLocalProgress() {
  const key = localKey()
  if (key) localStorage.removeItem(key)
}

// Rebuild the exercise whenever the story or mode changes, then restore saved progress.
watch([() => props.story, mode, activeText], async () => {
  sentences.value          = splitSentences(activeText.value)
  sentenceIdx.value        = 0
  completedSentences.value = []
  done.value               = false
  loadSentence(0)
  await nextTick()
  overlayEl.value?.focus()
  // On mobile, also focus the hidden input to open the keyboard
  hiddenInput.value?.focus()

  // Sentence-level restore from backend (logged-in users, cross-device).
  let restoredSentence = 0
  if (props.currentUser && props.story?.id) {
    const saved = await getProgress(props.story.id, 'retype')
    if (saved && saved.sentence_index > 0) {
      restoredSentence = Math.min(saved.sentence_index, sentences.value.length - 1)
      completedSentences.value = sentences.value.slice(0, restoredSentence)
      sentenceIdx.value        = restoredSentence
      loadSentence(restoredSentence)
    }
  }

  // Word-level restore from localStorage (all users, same device).
  const raw = props.story?.id ? localStorage.getItem(localKey()) : null
  if (raw) {
    try {
      const local = JSON.parse(raw)
      const localS = local.s ?? 0
      const localW = local.w ?? 0
      if (localS >= restoredSentence && (localS > restoredSentence || localW > 0)) {
        const targetS = Math.min(localS, sentences.value.length - 1)
        completedSentences.value = sentences.value.slice(0, targetS)
        sentenceIdx.value        = targetS
        loadSentence(targetS)
        // Restore word position: mark all completed words green, place cursor at start of current word.
        if (localW > 0 && localW < words.value.length) {
          for (let wi = 0; wi < localW; wi++) {
            words.value[wi].forEach(c => { c.state = 'correct' })
          }
          currentWordIndex.value = localW
        }
      }
    } catch {}
  }
}, { immediate: true })

// Toggling ignorePunct only rebuilds the current sentence — no progress reset.
watch(ignorePunct, () => {
  loadSentence(sentenceIdx.value)
  saveLocalProgress()
})

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
    clearLocalProgress()
    window.clarity?.('event', 'retype_completed')
    return
  }

  loadSentence(sentenceIdx.value)
  saveLocalProgress()

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
      saveLocalProgress()
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
      window.clarity?.('event', 'retype_error')
      // Reset word — user must retype it from scratch.
      words.value[wi].forEach(c => c.state = 'untouched')
      currentCharIndex.value = 0
    } else if (isCJK.value) {
      // CJK: no spaces between characters — auto-advance immediately
      if (!isLastWord) {
        currentWordIndex.value++
        currentCharIndex.value = 0
        saveLocalProgress()
      } else {
        advanceSentence()
      }
    } else {
      // Latin/etc: wait for Space before advancing to next word
      awaitingSpace.value = true
    }
  }
}

// ── Mobile input handler ──────────────────────────────────────────────────────
// On mobile, the hidden input receives input events with accumulated text.
// We need to process each character and call onKey for each one.
function onMobileInput(e) {
  const input = e.target
  const text = input.value
  
  // Process each character in the input
  for (const char of text) {
    if (char === ' ' || char === '\n') {
      // Space or Enter
      const syntheticEvent = { key: ' ', preventDefault: () => {} }
      onKey(syntheticEvent)
    } else if (char === 'Backspace' || char === '\b') {
      // Backspace
      const syntheticEvent = { key: 'Backspace', preventDefault: () => {} }
      onKey(syntheticEvent)
    } else {
      // Regular character - use the actual character as the key
      // This preserves case information from the mobile keyboard
      const syntheticEvent = { key: char, preventDefault: () => {} }
      onKey(syntheticEvent)
    }
  }
  
  // Clear the input for next batch of characters, but keep focus
  input.value = ''
}

// ── Character / space styling ─────────────────────────────────────────────────

// charClass() returns CSS classes for a single character based on state + cursor position.
function charClass(wi, ci) {
  const state     = words.value[wi]?.[ci]?.state
  const isCurrent = wi === currentWordIndex.value && ci === currentCharIndex.value && !awaitingSpace.value

  // Future words (not yet reached) are shown in light gray so the full sentence is readable.
  const isFuture = wi > currentWordIndex.value

  return {
    'text-green-400':          state === 'correct',
    'text-purple-400':           state === 'wrong',
    'text-gray-100':             state === 'untouched' && !isFuture,
    'text-gray-600':             isFuture,
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
  if (done)          return 'text-gray-100'
  if (wi > currentWordIndex.value) return 'text-gray-600'
  return 'text-gray-100'
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

// ── Number pronunciation ──────────────────────────────────────────────────────

function wordNum(word) {
  const text = word.map(c => c.char).join('')
  if (!/^\d+$/.test(text)) return null
  return numToWords(parseInt(text, 10), props.lang)
}

// ── Mobile keyboard helper ────────────────────────────────────────────────────

// On mobile, tap on the overlay and focus the hidden input to open the keyboard.
function focusMobileInput() {
  hiddenInput.value?.focus()
}

</script>
