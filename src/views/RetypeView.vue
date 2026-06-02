<!-- RetypeView.vue: typing practice. -->
<!-- The story text is shown character by character. The user types along and gets instant feedback. -->
<!-- Each character turns green when typed correctly, red when wrong. -->
<!-- Wrong words reset (you must type the whole word correctly to move on). -->
<template>
  <!-- Outer container. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is selected yet. -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main typing interface. -->
    <div v-else class="flex flex-col gap-4">

      <!-- Toggle for Franco/Pinyin mode (only for Arabic and Chinese). -->
      <!-- hasFranco = computed boolean: true if this language has an alternate romanized script. -->
      <div v-if="hasFranco" class="flex gap-2 text-sm">
        <!-- Native script button (e.g. Arabic, Chinese). Active when mode === 'native'. -->
        <button
          @click="mode = 'native'"
          :class="mode === 'native' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ nativeLabel }}</button>
        <!-- Romanized button (Franco for Arabic, Pinyin for Chinese). -->
        <button
          @click="mode = 'franco'"
          :class="mode === 'franco' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ francoLabel }}</button>
      </div>

      <!-- Story text display with per-character coloring. -->
      <!-- "select-none" = prevents mouse selection of text (so double-click doesn't select). -->
      <!-- "cursor-text" = shows a text cursor on hover (indicates you can type here). -->
      <!-- "outline-none" = removes the browser's default blue focus box. -->
      <!-- tabindex="0" = makes this div focusable via keyboard (Tab key). -->
      <!-- @keydown="onKey" = calls onKey() whenever a key is pressed while focused. -->
      <!-- @focus / @blur = update "focused" to show/hide the "click to type" hint. -->
      <!-- ref="overlayEl" = gives us a JavaScript reference to this element. -->
      <div
        class="leading-loose text-base select-none cursor-text outline-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        tabindex="0"
        @keydown="onKey"
        @focus="focused = true"
        @blur="focused = false"
        ref="overlayEl"
      >
        <!-- Loop over each word in the words array. wi = word index. -->
        <!-- <template> is a Vue grouping element -- it renders no HTML itself. -->
        <template v-for="(word, wi) in words" :key="wi">
          <!-- Loop over each character in this word. ci = character index. -->
          <!-- charClass(wi, ci) returns Tailwind color classes based on state. -->
          <span
            v-for="(c, ci) in word"
            :key="ci"
            :class="charClass(wi, ci)"
          >{{ c.char }}</span>
          <!-- Space between words (not after the last word). -->
          <!-- v-if="wi < words.length - 1" = show space for all words except the last. -->
          <!-- spaceClass(wi) colors the space based on whether the word was completed. -->
          <!-- &nbsp; = non-breaking space (HTML entity). Regular spaces collapse in HTML. -->
          <span v-if="wi < words.length - 1" :class="spaceClass(wi)">&nbsp;</span>
        </template>
      </div>

      <!-- Hidden input element captures keyboard input on mobile devices. -->
      <!-- On mobile, a physical keyboard isn't always available, so a hidden <input> -->
      <!-- triggers the on-screen keyboard when focused. The input itself is invisible. -->
      <!-- "opacity-0 h-0 absolute" = invisible, no height, positioned out of normal flow. -->
      <!-- ref="hiddenInput" = JS reference so we can call .focus() on it programmatically. -->
      <!-- v-model="inputBuffer" = two-way binding (captures what's typed). -->
      <input
        class="opacity-0 h-0 absolute"
        ref="hiddenInput"
        @keydown="onKey"
        v-model="inputBuffer"
      />

      <!-- "Click to type" hint: shown when nothing is focused. -->
      <!-- ?? = nullish coalescing: fallback string if translation is missing. -->
      <div v-if="!focused" class="text-xs text-gray-400 text-center">
        {{ t(lang, 'clickToType') ?? 'Click text to start typing' }}
      </div>

      <!-- Progress bar row. -->
      <div class="flex items-center gap-3">
        <!-- Bar track: full width, gray background. "overflow-hidden" clips the colored fill. -->
        <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <!-- Colored fill: width is the completion percentage. Color changes by score. -->
          <!-- :style="{ width: pct + '%', background: barColor }" applies inline CSS. -->
          <!-- "transition-all duration-200" = smoothly animates width changes over 200ms. -->
          <div
            class="h-full rounded-full transition-all duration-200"
            :style="{ width: pct + '%', background: barColor }"
          />
        </div>
        <!-- Percentage number on the right. "min-w-8" prevents layout shifting. -->
        <div class="text-xs text-gray-400 min-w-8 text-right">{{ pct }}%</div>
      </div>

    </div>
  </div>
</template>

<script setup>
// ref = reactive variable. computed = auto-updating value.
// watch = run code when something changes. nextTick = wait for DOM update.
import { ref, computed, watch, nextTick } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'

// This component receives the story and language from App.vue.
const props = defineProps({
  story: Object,
  lang:  String,
})

// ── Mode (native vs franco/pinyin) ──────────────────────────────────────────────

// mode tracks which script the user is practicing: 'native' or 'franco'.
const mode = ref('native')

// hasFranco = true if this language has a Latin-alphabet alternative (Arabic, Egyptian Arabic, Chinese).
const hasFranco = computed(() =>
  ['ar', 'arz', 'zh'].includes(props.lang)
)

// nativeLabel = the button label for the native script toggle.
const nativeLabel = computed(() => {
  if (props.lang === 'zh') return '中文'            // Chinese characters
  if (['ar', 'arz'].includes(props.lang)) return 'عربي' // Arabic script
  return 'Native'                                   // default fallback
})

// francoLabel = the button label for the romanized script toggle.
const francoLabel = computed(() => {
  if (props.lang === 'zh') return 'Pinyin' // romanized Chinese pronunciation
  return 'Franco'                          // romanized Arabic (used online)
})

// activeText = the text being practiced: either the native text or the franco/pinyin version.
const activeText = computed(() => {
  // Use franco text only if mode is franco AND the story actually has franco text.
  if (mode.value === 'franco' && props.story?.franco) return props.story.franco
  // Otherwise use the main story text (or empty string if no story loaded).
  return props.story?.text ?? ''
})

// ── Word / character data structure ─────────────────────────────────────────────

// buildWords() converts a text string into a structured array used for rendering and tracking.
// Returns an array of words, where each word is an array of character objects.
// Example: "Hi!" → [ [{char:'H', state:'untouched'}, {char:'i', state:'untouched'}] ]
// (Punctuation at the start/end of each word is stripped for clean comparison.)
function buildWords(text) {
  return text.split(/\s+/)                                  // split text into words by whitespace
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')) // strip leading/trailing punctuation
    // [^\p{L}\p{N}] = NOT a Unicode letter (\p{L}) or number (\p{N})
    // ^ at the start of the pattern = "beginning of string"
    // $ at the end = "end of string"
    // | = "OR": strip from start OR from end
    .filter(w => w.length > 0)                             // remove empty strings (pure punctuation words)
    .map(word => word.split('').map(char => ({ char, state: 'untouched' })))
    // .split('') = split word into individual characters
    // Each character becomes an object { char: 'H', state: 'untouched' }
    // state can be 'untouched', 'correct', or 'wrong'
}

// Reactive state variables for the typing exercise.
const words            = ref([])    // the structured word/char array (built by buildWords)
const currentWordIndex = ref(0)     // which word the user is currently typing
const currentCharIndex = ref(0)     // which character within that word
const inputBuffer      = ref('')    // captures mobile keyboard input (not displayed)
const awaitingSpace    = ref(false) // true when a word is complete and waiting for Space key
const focused          = ref(false) // true when the typing area has keyboard focus
const overlayEl        = ref(null)  // reference to the clickable text div
const hiddenInput      = ref(null)  // reference to the hidden mobile input

// watch() monitors multiple values and re-runs when any change.
// Here: rebuild the word structure whenever the story, mode, or text changes.
// { immediate: true } = also run once immediately when the component first loads.
watch([() => props.story, mode, activeText], () => {
  words.value            = buildWords(activeText.value) // rebuild from scratch
  currentWordIndex.value = 0     // reset to the beginning
  currentCharIndex.value = 0
  inputBuffer.value      = ''
  awaitingSpace.value    = false
}, { immediate: true })

// ── Keyboard handler ─────────────────────────────────────────────────────────────

// onKey() processes every keypress while the typing area is focused.
function onKey(e) {
  if (!words.value.length) return // no words = nothing to type

  // Shorthand variables for current position.
  const wi   = currentWordIndex.value // current word index
  const ci   = currentCharIndex.value // current character index within word
  const word = words.value[wi]        // the current word array

  // Ignore modifier-only keys (Shift, Ctrl, Alt, etc.) and non-character keys except Backspace.
  // e.key.length > 1 catches things like 'Shift', 'ArrowLeft', 'Enter'.
  // But 'Backspace'.length === 9 > 1, so we exclude it with the && !== check.
  if (e.key.length > 1 && e.key !== 'Backspace') return

  // Handle the Space key: advances to the next word after completing the current one.
  if (e.key === ' ') {
    e.preventDefault() // prevent the page from scrolling or the browser doing something with the space
    if (awaitingSpace.value) {
      awaitingSpace.value    = false      // consume the space: no longer waiting
      currentWordIndex.value++            // move to the next word
      currentCharIndex.value = 0          // start at the first character of the new word
    }
    return // don't process space as a typed character
  }

  // Handle Backspace: undo the last action.
  if (e.key === 'Backspace') {
    e.preventDefault()
    if (awaitingSpace.value) {
      // If waiting for space, cancel completion and go back to fixing the last character.
      awaitingSpace.value = false
      words.value[wi].forEach(c => c.state = 'untouched') // reset all chars in word
      currentCharIndex.value = 0 // go back to start of word
    } else if (ci > 0) {
      // Otherwise, un-type the previous character.
      words.value[wi][ci - 1].state = 'untouched' // mark it as not yet typed
      currentCharIndex.value--                      // move cursor back one position
    }
    return
  }

  // If we're waiting for Space (word just completed), ignore all other keys.
  if (awaitingSpace.value) return

  // Prevent the browser's default action for this key (e.g. typing in a textarea).
  e.preventDefault()

  // Compare the typed key against the expected character.
  const expected = word[ci].char // the character the user needs to type
  const typed    = e.key         // what the user actually pressed

  // Strict match: must type exactly the right character (including diacritics like é, ñ, ü).
  const match = typed === expected

  // Update the character's state based on whether it matched.
  words.value[wi][ci].state = match ? 'correct' : 'wrong'
  currentCharIndex.value++   // advance to next character position

  // Check if the user has typed the last character of this word.
  if (currentCharIndex.value === word.length) {
    // Check if any character in this word was typed incorrectly.
    const hasError = word.some(c => c.state === 'wrong')
    if (hasError) {
      // Reset the whole word: user must retype it from the beginning.
      words.value[wi].forEach(c => c.state = 'untouched')
      currentCharIndex.value = 0 // go back to start of word
    } else if (wi < words.value.length - 1) {
      // Word typed perfectly! Require Space to advance to the next word.
      awaitingSpace.value = true
      // Don't advance yet -- wait for the space keypress.
    }
    // If it's the last word (wi === words.value.length - 1), do nothing. Exercise complete!
  }
}

// ── Character / space styling ────────────────────────────────────────────────────

// charClass() returns CSS classes for a single character based on its state and position.
function charClass(wi, ci) {
  // ?. = optional chaining: safely access nested properties.
  const state     = words.value[wi]?.[ci]?.state // 'untouched', 'correct', or 'wrong'
  // isCurrent = true if this is the character the user should type next (shows underline cursor).
  const isCurrent = wi === currentWordIndex.value && ci === currentCharIndex.value
  // Return an object where keys are CSS class names and values are booleans.
  // Vue applies the class only when the value is true.
  return {
    'text-red-500':          state === 'wrong',                                  // wrong = red
    'text-gray-800':         state === 'correct' || state === 'untouched',       // normal = dark gray
    'border-b-2 border-gray-800': isCurrent,                                     // cursor = underline
  }
}

// spaceClass() returns CSS classes for the space between two words.
function spaceClass(wi) {
  const word = words.value[wi] // the word BEFORE this space
  // done = true if every character in this word was typed correctly.
  const done = word.every(c => c.state === 'correct') // .every() = true only if ALL pass the test
  // If we're waiting for Space after completing this word, show a cursor underline on the space.
  if (awaitingSpace.value && wi === currentWordIndex.value) {
    return 'border-b-2 border-gray-800'
  }
  // Otherwise: dark if word is done, light gray if not yet reached.
  return done ? 'text-gray-800' : 'text-gray-300'
}

// ── Progress ──────────────────────────────────────────────────────────────────────

// pct = percentage of words completed correctly (0–100).
const pct = computed(() => {
  const total = words.value.length // total number of words in the story
  if (!total) return 0             // avoid division by zero
  // .filter() keeps only words where EVERY character is correct.
  const done = words.value.filter(w => w.every(c => c.state === 'correct')).length
  return Math.round((done / total) * 100) // round to nearest whole number
})

// barColor = the color of the progress bar, changes based on score.
const barColor = computed(() => {
  if (pct.value >= 90) return '#10b981' // emerald green: great score
  if (pct.value >= 60) return '#f59e0b' // amber yellow: okay score
  return '#ef4444'                       // red: low score (just starting)
})
</script>
