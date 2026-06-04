<!-- WriteView.vue: handwriting / stroke order practice. -->
<!-- For Chinese/Japanese: animated stroke order via Hanzi Writer + a tracing quiz. -->
<!-- For other scripts (Arabic, Hebrew, Greek, Russian): free canvas drawing with self-grading. -->
<!-- For Latin scripts (Spanish, French, etc.): a note + optional free drawing. -->
<template>
  <!-- Outer container stacks items vertically. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is selected. -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main practice interface. -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header: story title, language name, and position counter. -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg">{{ story.title }}</div>
          <div class="text-xs text-gray-400">{{ LANGS[lang]?.name }}</div>
        </div>
        <!-- Progress counter: different text for CJK (characters) vs others (sentence/word). -->
        <div class="text-xs text-gray-400 font-medium">
          <!-- isCJK = true for Chinese and Japanese. Shows "char 5 / 120". -->
          <span v-if="isCJK">{{ unitIdx + 1 }} / {{ cjkChars.length }}</span>
          <!-- For other languages: shows "S2/5 · W3/8" (sentence 2 of 5, word 3 of 8). -->
          <span v-else>S{{ sentenceIdx + 1 }}/{{ sentences.length }} · W{{ wordIdx + 1 }}/{{ wordsInSentence.length }}</span>
        </div>
      </div>

      <!-- Progress bar showing overall completion through the story. -->
      <div class="h-1 bg-gray-100 rounded-full overflow-hidden">
        <!-- progressPct is a computed number 0–100. -->
        <div
          class="h-full bg-emerald-400 transition-all duration-300"
          :style="{ width: progressPct + '%' }"
        />
      </div>

      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- CJK SECTION (Chinese / Japanese): Hanzi Writer stroke practice -->
      <!-- ═══════════════════════════════════════════════════════════════ -->
      <!-- v-if="isCJK" = only shown when language is 'zh' or 'ja'. -->
      <div v-if="isCJK" class="flex flex-col items-center gap-4">
        <!-- Large faint preview of the character above the drawing area. -->
        <!-- "select-none" prevents the character from being accidentally selected/highlighted. -->
        <div class="text-5xl font-light text-gray-300 select-none">{{ currentUnit }}</div>

        <!-- Container div where Hanzi Writer injects its SVG canvas. -->
        <!-- ref="hanziContainer" gives us a JavaScript reference to this DOM element. -->
        <!-- "style" here sets inline CSS (fixed pixel size required by Hanzi Writer). -->
        <div
          ref="hanziContainer"
          class="rounded-xl border border-gray-200 bg-gray-50"
          style="width:220px;height:220px"
        />

        <!-- Shown when Hanzi Writer can't find stroke data for this character. -->
        <!-- Not all Chinese/Japanese characters are in the Hanzi Writer dataset. -->
        <div v-if="charError" class="text-xs text-gray-400">
          Stroke data not available for this character.
        </div>

        <!-- Green success message after completing the quiz. -->
        <div v-if="quizDone" class="text-emerald-600 font-medium text-sm">✓ Complete!</div>

        <!-- Control buttons for the Hanzi Writer. -->
        <div class="flex gap-3">
          <!-- Animate: plays the stroke order animation so you can watch how it's drawn. -->
          <!-- :disabled="!!charError" = disable button if charError is truthy. !! = cast to boolean. -->
          <button
            @click="animate"
            :disabled="!!charError"
            class="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
          >Animate</button>
          <!-- Practice: starts the interactive tracing quiz (you draw over the character). -->
          <!-- Disabled while a quiz is already in progress. -->
          <button
            @click="startQuiz"
            :disabled="!!charError || quizActive"
            class="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
          >{{ quizActive ? 'Practising…' : 'Practice' }}</button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════ -->
      <!-- NON-CJK SECTION: canvas drawing for script and Latin languages -->
      <!-- ═══════════════════════════════════════════════════════════════════════ -->
      <!-- v-else = shown when isCJK is false. -->
      <div v-else class="flex flex-col items-center gap-4">

        <!-- Latin language notice: drawing is optional, just for practice. -->
        <!-- v-if="isLatin" = shown only for Latin-alphabet languages (Spanish, French, etc.). -->
        <div
          v-if="isLatin"
          class="text-xs text-gray-400 text-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-100 w-full"
        >
          Handwriting practice is most useful for non-Latin scripts, but you can still trace here freely.
        </div>

        <!-- The target word to practice writing, shown large above the canvas. -->
        <!-- "tracking-widest" = extra space between letters for clarity. -->
        <div
          class="text-4xl font-semibold text-center tracking-widest"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ currentUnit }}</div>

        <!-- The drawing canvas where the user writes with their mouse or finger. -->
        <!-- ref="canvas" gives us a JS reference to this element so we can call canvas APIs. -->
        <!-- width="300" height="300" sets canvas dimensions in pixels. -->
        <!-- "touch-none" = disable browser's default touch gestures (so drawing isn't interrupted). -->
        <!-- "cursor-crosshair" = show a + cursor so users know it's a drawing area. -->
        <!-- @mousedown / @mousemove / @mouseup = desktop mouse drawing events. -->
        <!-- @touchstart / @touchmove / @touchend = mobile touch drawing events. -->
        <!-- .prevent on touch events calls event.preventDefault() to stop page scrolling while drawing. -->
        <canvas
          ref="canvas"
          class="rounded-xl border-2 border-gray-200 bg-white touch-none cursor-crosshair"
          @mousedown="startDraw" @mousemove="moveDraw" @mouseup="stopDraw" @mouseleave="stopDraw"
          @touchstart="startDraw" @touchmove.prevent="moveDraw" @touchend="stopDraw" @touchcancel="stopDraw"
        />

        <!-- Buttons below the canvas. -->
        <div class="flex gap-3">
          <!-- Clear button: wipes the canvas so the user can try again. -->
          <button
            @click="clearCanvas"
            class="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
          >Clear</button>
          <!-- Self-report buttons: only shown for non-Latin scripts. -->
          <!-- Latin doesn't have correct/wrong because there's no automatic check. -->
          <!-- <template> is a Vue wrapper that renders nothing itself -- just groups elements. -->
          <template v-if="isScript">
            <!-- ✓ Correct: user decides they wrote it right. -->
            <button
              @click="report(true)"
              class="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
            >✓ Correct</button>
            <!-- ✗ Wrong: user decides they need more practice. -->
            <button
              @click="report(false)"
              class="px-4 py-2 text-sm rounded-lg bg-red-400 text-white hover:bg-red-500 transition-all"
            >✗ Wrong</button>
          </template>
        </div>

        <!-- Feedback message after self-reporting. -->
        <!-- selfReport is true (correct), false (wrong), or null (not yet reported). -->
        <!-- v-if="selfReport !== null" = only show when a report has been made. -->
        <!-- !== means "not exactly equal to". -->
        <div
          v-if="selfReport !== null"
          class="text-sm font-medium"
          :class="selfReport ? 'text-emerald-600' : 'text-red-500'"
        >{{ selfReport ? 'Marked correct!' : 'Keep practising.' }}</div>

      </div>

      <!-- Navigation: Back on the left, Next on the right. -->
      <div class="flex justify-between mt-2">
        <!-- Back button: always visible but disabled on the very first item. -->
        <!-- :disabled="isFirst" = grayed out and unclickable when on the first unit. -->
        <button
          @click="goPrev"
          :disabled="isFirst"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-all"
        >← Back</button>
        <!-- Next button: disabled on the very last item (shows "Done ✓" then). -->
        <button
          @click="goNext"
          :disabled="isLast"
          class="text-sm px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >{{ isLast ? 'Done ✓' : 'Next →' }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
// ref = reactive variable. computed = auto-updating derived value.
// watch = run code when something changes. onMounted = run after component appears.
// nextTick = wait for Vue to finish updating the DOM before running code.
import { ref, computed, watch, onMounted, nextTick } from 'vue'
// HanziWriter is a library for animating and quizzing Chinese/Japanese character strokes.
import HanziWriter from 'hanzi-writer'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'

const props = defineProps({ story: Object, lang: String })

// Language classification computed properties.
// These auto-update when props.lang changes.
const isCJK    = computed(() => ['zh', 'ja'].includes(props.lang))    // Chinese or Japanese
const isScript = computed(() => ['ar', 'arz', 'he', 'el', 'ru'].includes(props.lang)) // non-Latin script
const isLatin  = computed(() => !isCJK.value && !isScript.value)      // everything else

// ── Navigation state ────────────────────────────────────────────────────────────

// sentenceIdx tracks which sentence we're on (for non-CJK languages).
const sentenceIdx = ref(0)
// wordIdx tracks which word within the current sentence.
const wordIdx     = ref(0)
// unitIdx tracks which character we're on (for CJK, which goes char-by-char through the whole story).
const unitIdx     = ref(0)

// sentences splits the story text into an array of sentences.
const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content
    .split(/(?<=[.!?؟।。！？])\s+/) // split after sentence-ending punctuation
    .map(s => s.trim())              // strip whitespace from each sentence
    .filter(Boolean)                 // remove empty strings
})

// wordsInSentence gives the individual words of the current sentence (for non-CJK).
const wordsInSentence = computed(() =>
  (sentences.value[sentenceIdx.value] ?? '').trim().split(/\s+/).filter(Boolean)
)

// cjkChars extracts every letter character from the entire story text (for CJK practice).
// [...str] spreads a string into an array of individual characters.
// /\p{L}/u matches any Unicode letter. .filter keeps only letter characters (skips spaces, punctuation).
const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.content].filter(c => /\p{L}/u.test(c))
})

// currentUnit is the thing currently being practiced: a character (CJK) or a word (other).
const currentUnit = computed(() => {
  if (isCJK.value) return cjkChars.value[unitIdx.value] ?? '' // current character
  return wordsInSentence.value[wordIdx.value] ?? ''            // current word
})

// isFirst = true when there's nothing before the current position (can't go back).
const isFirst = computed(() =>
  isCJK.value ? unitIdx.value === 0 : sentenceIdx.value === 0 && wordIdx.value === 0
)

// isLast = true when there's nothing after the current position (finished).
const isLast = computed(() =>
  isCJK.value
    ? unitIdx.value >= cjkChars.value.length - 1
    : sentenceIdx.value >= sentences.value.length - 1 &&
      wordIdx.value >= wordsInSentence.value.length - 1
)

// progressPct calculates how far through the story the user is (0–100%).
const progressPct = computed(() => {
  if (isCJK.value) {
    // For CJK: simple fraction of characters done.
    return cjkChars.value.length ? ((unitIdx.value + 1) / cjkChars.value.length) * 100 : 0
  }
  // For non-CJK: count total words across all sentences, then count how many are done.
  const total = sentences.value.reduce(
    // .reduce() accumulates a running total. sum starts at 0, adds each sentence's word count.
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0
  )
  // Count words in all sentences BEFORE the current one.
  const done = sentences.value.slice(0, sentenceIdx.value).reduce(
    // .slice(0, sentenceIdx) gets all sentences before the current one.
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0
  ) + wordIdx.value // add the current word's index within its sentence
  return total ? ((done + 1) / total) * 100 : 0
})

// goNext() advances to the next character (CJK) or word/sentence (other).
function goNext() {
  if (isCJK.value) {
    if (unitIdx.value < cjkChars.value.length - 1) unitIdx.value++ // move to next char
  } else {
    if (wordIdx.value < wordsInSentence.value.length - 1) {
      wordIdx.value++ // still words left in this sentence
    } else if (sentenceIdx.value < sentences.value.length - 1) {
      sentenceIdx.value++ // jump to the next sentence
      wordIdx.value = 0   // reset to first word of new sentence
    }
  }
}

// goPrev() goes back one step.
function goPrev() {
  if (isCJK.value) {
    if (unitIdx.value > 0) unitIdx.value-- // move to previous char
  } else {
    if (wordIdx.value > 0) {
      wordIdx.value-- // go back one word within same sentence
    } else if (sentenceIdx.value > 0) {
      sentenceIdx.value-- // go to previous sentence
      // Go to the LAST word of that previous sentence.
      // wordsInSentence recalculates immediately since sentenceIdx just changed.
      wordIdx.value = wordsInSentence.value.length - 1
    }
  }
}

// ── Hanzi Writer (CJK only) ─────────────────────────────────────────────────────

// ref to the div that Hanzi Writer will inject its SVG into.
const hanziContainer = ref(null)
// quizActive = true while the interactive tracing quiz is running.
const quizActive = ref(false)
// quizDone = true after the user successfully completes a quiz.
const quizDone   = ref(false)
// charError = true if Hanzi Writer can't find stroke data for this character.
const charError  = ref(false)
// writer holds the HanziWriter instance (created by HanziWriter.create()).
let writer = null

// initWriter() creates a new Hanzi Writer for the current character.
function initWriter() {
  if (!hanziContainer.value || !currentUnit.value) return // safety check
  hanziContainer.value.innerHTML = '' // clear any previous writer from the container
  // Reset state flags.
  quizActive.value = false
  quizDone.value   = false
  charError.value  = false
  writer           = null
  try {
    // HanziWriter.create(element, character, options) creates the writer and injects an SVG.
    writer = HanziWriter.create(hanziContainer.value, currentUnit.value, {
      width:                210,       // width of the drawing area in pixels
      height:               210,       // height of the drawing area in pixels
      padding:              10,        // space around the character inside the box
      showOutline:          true,      // show a faint gray outline of the correct character shape
      strokeColor:          '#1a1a1a', // color of the strokes (almost black)
      outlineColor:         '#d1d5db', // color of the guide outline (light gray)
      strokeAnimationSpeed: 1,         // animation speed multiplier (1 = normal)
      delayBetweenStrokes:  300,       // pause between each stroke in milliseconds
      // Called if character data fails to load (not all characters are in the dataset).
      onLoadCharDataError: () => { charError.value = true },
    })
  } catch {
    // catch {} handles any unexpected errors silently and marks the character as unavailable.
    charError.value = true
  }
}

// animate() plays the stroke-order animation for the current character.
// ?. = optional chaining: only calls .animateCharacter() if writer is not null.
function animate() { writer?.animateCharacter() }

// startQuiz() starts the interactive tracing exercise.
function startQuiz() {
  if (!writer || quizActive.value) return // don't start if no writer or already in progress
  quizActive.value = true
  quizDone.value   = false
  // .quiz() overlays an input area over the character. The user draws each stroke.
  writer.quiz({
    // onComplete fires when the user successfully draws all strokes.
    // summaryData contains mistake counts (not used here).
    onComplete: () => {
      quizActive.value = false // quiz is over
      quizDone.value   = true  // show the "✓ Complete!" message
    },
  })
}

// ── Canvas drawing (non-CJK) ─────────────────────────────────────────────────────

// ref to the <canvas> HTML element.
const canvas     = ref(null)
// selfReport is null (not yet reported), true (correct), or false (wrong).
const selfReport = ref(null)
// ctx (short for "context") is the drawing API object obtained from the canvas.
let ctx     = null
// drawing = true while the user is holding the mouse button / touching the screen.
let drawing = false

// setupCanvas() initializes the canvas drawing context and clears the canvas.
// Scales the canvas backing store by devicePixelRatio so strokes are crisp on high-DPR screens.
function setupCanvas() {
  if (!canvas.value) return
  const dpr  = window.devicePixelRatio || 1
  const size = 300
  canvas.value.width        = size * dpr
  canvas.value.height       = size * dpr
  canvas.value.style.width  = size + 'px'
  canvas.value.style.height = size + 'px'
  ctx = canvas.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // absolute scale — safe to call repeatedly
  ctx.strokeStyle = '#1a1a1a'
  ctx.fillStyle   = '#1a1a1a'
  ctx.lineWidth   = 4
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  clearCanvas()
}

// getPos() returns CSS-pixel coordinates within the canvas.
// After ctx.setTransform(dpr,...), drawing at CSS coords maps to the correct device pixels.
function getPos(e) {
  const rect = canvas.value.getBoundingClientRect()
  const src  = e.touches ? e.touches[0] : e
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top,
  }
}

// startDraw() begins a new brush stroke when the user presses down.
function startDraw(e) {
  drawing = true
  const p = getPos(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  // Draw a dot immediately so single taps leave a visible mark.
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

// moveDraw() extends the stroke as the user drags.
// After stroking, beginPath+moveTo starts a fresh sub-path so each segment is drawn once
// (avoids replaying the entire accumulated path on every move event).
function moveDraw(e) {
  if (!drawing) return
  const p = getPos(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

// stopDraw() ends the stroke when the user releases or leaves the canvas.
function stopDraw() { drawing = false }

// clearCanvas() wipes everything drawn on the canvas.
// Uses 300×300 CSS coordinates — ctx.setTransform scales to device pixels automatically.
function clearCanvas() {
  ctx?.clearRect(0, 0, 300, 300)
}

// report() records the user's self-assessment of their writing.
// "correct" is true (they think they got it right) or false (they think they were wrong).
function report(correct) { selfReport.value = correct }

// ── Lifecycle hooks & watchers ───────────────────────────────────────────────────

// onMounted runs once after the component's HTML has been added to the page.
// nextTick() waits until Vue has finished rendering the DOM before running the callback.
// This is needed because ref("hanziContainer") and ref("canvas") are only set after render.
onMounted(async () => {
  await nextTick()                    // wait for the DOM to be ready
  if (isCJK.value) initWriter()       // set up Hanzi Writer if this is a CJK language
  else setupCanvas()                  // set up the drawing canvas otherwise
})

// When the user moves to a different character (unitIdx changes), reinitialize Hanzi Writer.
watch(unitIdx, async () => {
  if (!isCJK.value) return            // don't run this for non-CJK languages
  await nextTick()                    // wait for Vue to render the new container
  initWriter()                        // create a fresh writer for the new character
})

// When the user moves to a different word (sentenceIdx or wordIdx changes), clear the canvas.
watch([sentenceIdx, wordIdx], async () => {
  if (isCJK.value) return             // not relevant for CJK
  selfReport.value = null             // reset the self-report buttons
  await nextTick()
  if (canvas.value) clearCanvas()     // wipe the canvas for the new word
})

// When the language or story changes, reset everything and start fresh.
watch([() => props.lang, () => props.story], async () => {
  // () => props.lang is an arrow function used as a "getter" -- watch needs a function, not a raw value.
  sentenceIdx.value = 0  // reset to first sentence
  wordIdx.value     = 0  // reset to first word
  unitIdx.value     = 0  // reset to first character
  selfReport.value  = null
  quizActive.value  = false
  quizDone.value    = false
  charError.value   = false
  writer            = null // discard the old Hanzi Writer instance
  await nextTick()
  if (isCJK.value) initWriter()
  else setupCanvas()
})
</script>
