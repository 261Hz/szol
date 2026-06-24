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
          <button
            v-if="mode === 'native'"
            @click="showGuide = !showGuide"
            :class="showGuide ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'"
            class="text-sm px-3 py-1 rounded-full transition-all"
          >{{ francoLabel }} guide</button>
        </template>
        <button
          @click="ignorePunct = !ignorePunct"
          :class="ignorePunct ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'"
          class="text-sm px-3 py-1 rounded-full transition-all"
        >ignore punct.</button>
        <button
          @click="ignoreAccents = !ignoreAccents"
          :class="ignoreAccents ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'"
          class="text-sm px-3 py-1 rounded-full transition-all"
        >ignore accents</button>
        <button
          v-if="story"
          @click="emit('go', 'write')"
          class="text-sm px-3 py-1 rounded-full transition-all bg-gray-800 text-gray-400 hover:text-white ml-auto"
        >write →</button>
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
      <div
        class="leading-loose text-base cursor-text outline-none break-words min-h-16 font-serif"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        tabindex="0"
        @keydown="onKey"
        @focus="focused = true; focusMobileInput()"
        @blur="focused = false"
        ref="overlayEl"
      >
        <span v-if="done" class="text-accent-red font-medium">✓ {{ t(lang, 'done') ?? 'Complete!' }}</span>

        <!-- Inline-block buttons with explicit margin-right for word spacing -->
        <template v-else>
          <template v-for="(word, wi) in words" :key="wi">
            <button
              type="button"
              class="inline-block whitespace-nowrap rounded transition-colors hover:bg-ink-primary/8 active:bg-ink-primary/8 select-none bg-transparent border-0 p-0 font-[inherit] leading-[inherit] cursor-pointer"
              :class="savedWords.has(normalize(word.map(c => c.char).join(''))) ? 'underline decoration-accent-red decoration-dotted underline-offset-2' : ''"
              :style="(awaitingSpace && wi === currentWordIndex ? 'border-right:2px solid #2a241c;' : '') + (wi < words.length - 1 && !isCJK ? 'margin-right:0.45em;' : '')"
              @click.stop="tapWord(word.map(c => c.char).join(''), sentences[sentenceIdx])"
            ><ruby v-if="wordNum(word)" class="szol-num"><span v-for="(c, ci) in word" :key="ci" :class="charClass(wi, ci)">{{ c.char }}</span><rt>{{ wordNum(word) }}</rt></ruby><template v-else><template v-for="(c, ci) in word" :key="ci"><ruby v-if="showGuide && lang === 'zh' && charRoman(c.char)"><span :class="charClass(wi, ci)">{{ c.char }}</span><rt class="text-[0.6em] text-blue-300 font-normal not-italic leading-none">{{ charRoman(c.char) }}</rt></ruby><span v-else :class="charClass(wi, ci)">{{ c.char }}</span></template></template></button>
          </template>
        </template>
      </div>

      <!-- Hidden input must sit at top:0 (within the viewport) or iOS/Android won't fire keyboard    -->
      <!-- events on it. font-size:16px prevents iOS from auto-zooming the viewport on focus.         -->
      <input
        class="fixed pointer-events-none border-none outline-none opacity-0"
        style="top:0; left:0; width:1px; height:1px; font-size:16px; caret-color:transparent;"
        ref="hiddenInput"
        type="text"
        inputmode="text"
        autocorrect="off"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        @input="onMobileInput"
      />

      <!-- Arabic franco guide: full sentence transliteration shown below the box. -->
      <div
        v-if="showGuide && ['ar', 'arz'].includes(lang) && mode === 'native' && !done"
        class="text-xs text-blue-300 font-mono border border-blue-900/50 rounded-lg px-3 py-2 bg-blue-950/20 tracking-wide"
        dir="ltr"
      >{{ arabicToFranco(sentences[sentenceIdx] || '') }}</div>

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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { LANGS } from '../data/stories.js'
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
import { trackWord, saveProgress, getProgress } from '../utils/api.js'
import ClickableText from '../components/ClickableText.vue'
import { numToWords } from '../utils/numWords.js'
import { charPinyin, charFranco, chineseToPinyinText, arabicToFranco } from '../utils/romanization.js'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  { type: Object, default: () => new Set() },
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['saveWord', 'go'])

watch([() => props.story, () => props.lang, rootHighlightOn], ([, , on]) => {
  nextTick(() => on ? applyRoots(overlayEl.value, props.lang) : clearRoots())
})

// ── Mode (native / franco / pinyin) ──────────────────────────────────────────

const mode        = ref('native')
const showGuide   = ref(false)
const ignorePunct   = ref(false)
const ignoreAccents = ref(false)

function stripDia(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// hasFranco = true for Arabic (both varieties) and Chinese, which have Latin-script alternates.
const hasFranco = computed(() => ['ar', 'arz', 'zh', 'zh-TW'].includes(props.lang))

const nativeLabel = computed(() => {
  if (['zh', 'zh-TW'].includes(props.lang)) return props.lang === 'zh-TW' ? '繁體' : '中文'
  if (['ar', 'arz'].includes(props.lang)) return 'عربي'
  return 'Native'
})

const francoLabel = computed(() => ['zh', 'zh-TW'].includes(props.lang) ? 'Pinyin' : 'Franco')

// francoText = auto-generated romanisation when story has no .franco field.
const francoText = ref('')
watch([() => props.story, () => props.lang, mode], () => {
  if (!hasFranco.value || mode.value !== 'franco') { francoText.value = ''; return }
  if (props.story?.franco) { francoText.value = props.story.franco; return }
  const content = props.story?.content ?? ''
  if (['zh', 'zh-TW'].includes(props.lang)) {
    francoText.value = chineseToPinyinText(content)
  } else if (['ar', 'arz'].includes(props.lang)) {
    francoText.value = arabicToFranco(content)
  }
}, { immediate: true })

// activeText = the text being practiced: native script or its romanised version.
const activeText = computed(() => {
  if (mode.value === 'franco') return francoText.value || props.story?.content || ''
  return props.story?.content ?? ''
})

// Per-character romanisation for the guide overlay.
function charRoman(char) {
  if (props.lang === 'zh') return charPinyin(char)
  if (['ar', 'arz'].includes(props.lang)) return charFranco(char)
  return ''
}

// ── CJK detection ─────────────────────────────────────────────────────────────

const CJK_LANGS = new Set(['ja', 'zh', 'zh-TW', 'cmn', 'yue', 'ko'])
// In franco/pinyin mode Chinese text is Latin — behave like a space-separated language.
const isCJK = computed(() => CJK_LANGS.has(props.lang) && mode.value === 'native')

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
    .flatMap(w => ignorePunct.value
      ? w.split(/[^\p{L}\p{N}]+/u).filter(Boolean)   // split on punct so "don't" → ["don","t"]
      : [w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')])  // trim leading/trailing only
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

watch(ignorePunct,   () => { loadSentence(sentenceIdx.value); saveLocalProgress() })
watch(ignoreAccents, () => { loadSentence(sentenceIdx.value); saveLocalProgress() })

// Flush progress to server when the user navigates away mid-story.
function flushProgress() {
  if (!props.currentUser || !props.story?.id || done.value) return
  if (sentenceIdx.value === 0 && currentWordIndex.value === 0) return
  saveLocalProgress()
  saveProgress(props.story.id, props.story.title ?? '', props.lang, 'retype', sentenceIdx.value)
}

function onVisibilityHide() { if (document.visibilityState === 'hidden') flushProgress() }

onMounted(()   => document.addEventListener('visibilitychange', onVisibilityHide))
onUnmounted(() => { document.removeEventListener('visibilitychange', onVisibilityHide); flushProgress() })

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
  const match    = ignoreAccents.value
    ? stripDia(e.key) === stripDia(expected)
    : e.key === expected

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
      // Word typed correctly
      if (props.currentUser) {
        const wordText = words.value[wi].map(c => c.char).join('')
        trackWord(wordText, props.lang, props.story?.title ?? '')
      }
      if (isCJK.value) {
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
}

// ── Mobile input handler ──────────────────────────────────────────────────────
// e.target.value holds only the characters typed since the last clear (we clear after each event).
// This is more reliable than e.data which is null on many Android composition keyboards.
function onMobileInput(e) {
  if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
    onKey({ key: 'Backspace', preventDefault: () => {} })
    e.target.value = ''
    return
  }
  const text = e.target.value
  for (const char of text) {
    onKey({ key: char === '\n' ? ' ' : char, preventDefault: () => {} })
  }
  e.target.value = ''
}

// ── Character / space styling ─────────────────────────────────────────────────

// charClass() returns CSS classes for a single character based on state + cursor position.
function charClass(wi, ci) {
  const state     = words.value[wi]?.[ci]?.state
  const isCurrent = wi === currentWordIndex.value && ci === currentCharIndex.value && !awaitingSpace.value

  // Future words (not yet reached) are shown in light gray so the full sentence is readable.
  const isFuture = wi > currentWordIndex.value

  return {
    'text-ink-primary':            state === 'correct',
    'text-accent-red':             state === 'wrong',
    'text-ink-soft':               state === 'untouched' && !isFuture,
    'text-ink-muted':              isFuture,
    'border-b-2 border-ink-primary': isCurrent,
  }
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
