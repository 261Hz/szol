<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-gray-500 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else class="flex flex-col gap-3">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg">{{ story.title }}</div>
          <div class="text-xs text-gray-500">{{ LANGS[lang]?.name }}</div>
        </div>
        <div class="text-xs text-gray-500 font-medium">
          <span v-if="isCJK">{{ unitIdx + 1 }} / {{ cjkChars.length }}</span>
          <span v-else>S{{ sentenceIdx + 1 }}/{{ sentences.length }} · W{{ wordIdx + 1 }}/{{ wordsInSentence.length }}</span>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div class="h-full bg-green-600 transition-all duration-300" :style="{ width: progressPct + '%' }" />
      </div>

      <!-- ── Paper card ─────────────────────────────────────────────────── -->
      <div ref="paperCard" class="paper-card rounded-2xl overflow-hidden shadow-xl">

        <!-- Paper header: reference word -->
        <div class="paper-header px-5 pt-5 pb-3 flex items-start justify-between">
          <div class="flex flex-col gap-0.5">
            <div
              class="paper-word select-none leading-none"
              :style="handwritingStyle"
              :dir="isRTL(lang) ? 'rtl' : 'ltr'"
            >{{ currentUnit }}</div>
            <div class="text-xs text-amber-700/60 mt-1">{{ unitLabel }}</div>
          </div>
          <button
            @click="toggleFullscreen"
            class="text-amber-700/50 hover:text-amber-800 text-lg mt-0.5 transition-colors"
            :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          >{{ isFullscreen ? '⊠' : '⛶' }}</button>
        </div>

        <!-- ── CJK: Hanzi Writer ──────────────────────────────────────── -->
        <div v-if="isCJK" class="flex flex-col items-center gap-3 pb-5 px-5">
          <div ref="hanziContainer" class="hanzi-container rounded-xl" />
          <div v-if="charError" class="text-xs text-amber-700/60">Stroke data unavailable for this character.</div>
          <div v-if="quizDone" class="text-green-700 font-medium text-sm">✓ Complete!</div>
          <div class="flex gap-3">
            <button @click="animate" :disabled="!!charError"
              class="px-4 py-2 text-sm rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-30 transition-all">
              Animate
            </button>
            <button @click="startQuiz" :disabled="!!charError || quizActive"
              class="px-4 py-2 text-sm rounded-lg bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-40 transition-all">
              {{ quizActive ? 'Practising…' : 'Practice' }}
            </button>
          </div>
        </div>

        <!-- ── Non-CJK: free canvas ───────────────────────────────────── -->
        <div v-else class="flex flex-col gap-3 pb-5 px-5">
          <div v-if="isLatin" class="text-xs text-amber-700/50 text-center">
            Handwriting practice is most useful for non-Latin scripts, but you can trace here freely.
          </div>
          <canvas
            ref="canvas"
            class="paper-canvas w-full rounded-xl touch-none cursor-crosshair border border-amber-200"
            @mousedown="startDraw" @mousemove="moveDraw" @mouseup="stopDraw" @mouseleave="stopDraw"
            @touchstart="startDraw" @touchmove.prevent="moveDraw" @touchend="stopDraw" @touchcancel="stopDraw"
          />
          <div class="flex gap-3 justify-center flex-wrap">
            <button @click="clearCanvasAndGuides"
              class="px-4 py-2 text-sm rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-all">
              Clear
            </button>
            <button @click="runCheck" :disabled="aiChecking"
              class="px-4 py-2 text-sm rounded-lg bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-50 transition-all">
              {{ aiChecking ? 'Checking…' : '✦ Check' }}
            </button>
            <template v-if="isScript">
              <button @click="report(true)"
                class="px-4 py-2 text-sm rounded-lg bg-green-700 text-white hover:bg-green-600 transition-all">
                ✓ Correct
              </button>
              <button @click="report(false)"
                class="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-all">
                ✗ Wrong
              </button>
            </template>
          </div>
          <div v-if="selfReport !== null" class="text-sm font-medium text-center"
            :class="selfReport ? 'text-green-700' : 'text-red-600'">
            {{ selfReport ? 'Marked correct!' : 'Keep practising.' }}
          </div>
          <div v-if="aiFeedback" class="text-sm text-amber-900 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
            {{ aiFeedback }}
          </div>
        </div>

      </div>
      <!-- ── End paper card ──────────────────────────────────────────── -->

      <!-- Navigation -->
      <div class="flex justify-between">
        <button @click="goPrev" :disabled="isFirst"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-all">
          ← Back
        </button>
        <button @click="goNext" :disabled="isLast"
          class="text-sm px-4 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">
          {{ isLast ? 'Done ✓' : 'Next →' }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import HanziWriter from 'hanzi-writer'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { checkHandwriting } from '../utils/api.js'

const props = defineProps({ story: Object, lang: String })

const isCJK    = computed(() => ['zh', 'ja'].includes(props.lang))
const isScript = computed(() => ['ar', 'arz', 'he', 'el', 'ru'].includes(props.lang))
const isLatin  = computed(() => !isCJK.value && !isScript.value)

// ── Handwriting font per script ────────────────────────────────────────────────
const handwritingStyle = computed(() => {
  if (props.lang === 'zh')               return { fontFamily: "'Zhi Mang Xing', cursive",    fontSize: '4rem' }
  if (props.lang === 'ja')               return { fontFamily: "'Kaisei Tokumin', serif",      fontSize: '4rem' }
  if (['ar', 'arz'].includes(props.lang)) return { fontFamily: "'Amiri', serif",               fontSize: '3.5rem' }
  if (props.lang === 'he')               return { fontFamily: "'Rubik', sans-serif",            fontSize: '3.5rem' }
  return { fontFamily: "'Patrick Hand', cursive", fontSize: '4rem' }
})

// ── Navigation ──────────────────────────────────────────────────────────────────
const sentenceIdx = ref(0)
const wordIdx     = ref(0)
const unitIdx     = ref(0)

const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim()).filter(Boolean)
})

const wordsInSentence = computed(() =>
  (sentences.value[sentenceIdx.value] || '').trim().split(/\s+/).filter(Boolean)
)

const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.content].filter(c => /\p{L}/u.test(c))
})

const currentUnit = computed(() => {
  if (isCJK.value) return cjkChars.value[unitIdx.value] || ''
  return wordsInSentence.value[wordIdx.value] || ''
})

const unitLabel = computed(() => {
  if (isLatin.value) return ''
  const sentence = isCJK.value
    ? (sentences.value.find(s => s.includes(currentUnit.value)) || '')
    : (sentences.value[sentenceIdx.value] || '')
  return sentence.length > 60 ? sentence.slice(0, 58) + '…' : sentence
})

const isFirst = computed(() =>
  isCJK.value ? unitIdx.value === 0 : sentenceIdx.value === 0 && wordIdx.value === 0
)

const isLast = computed(() =>
  isCJK.value
    ? unitIdx.value >= cjkChars.value.length - 1
    : sentenceIdx.value >= sentences.value.length - 1 &&
      wordIdx.value >= wordsInSentence.value.length - 1
)

const progressPct = computed(() => {
  if (isCJK.value) {
    return cjkChars.value.length ? ((unitIdx.value + 1) / cjkChars.value.length) * 100 : 0
  }
  const total = sentences.value.reduce((s, x) => s + x.trim().split(/\s+/).filter(Boolean).length, 0)
  const done  = sentences.value.slice(0, sentenceIdx.value).reduce((s, x) => s + x.trim().split(/\s+/).filter(Boolean).length, 0) + wordIdx.value
  return total ? ((done + 1) / total) * 100 : 0
})

function goNext() {
  if (isCJK.value) {
    if (unitIdx.value < cjkChars.value.length - 1) unitIdx.value++
  } else {
    if (wordIdx.value < wordsInSentence.value.length - 1) wordIdx.value++
    else if (sentenceIdx.value < sentences.value.length - 1) { sentenceIdx.value++; wordIdx.value = 0 }
  }
}

function goPrev() {
  if (isCJK.value) {
    if (unitIdx.value > 0) unitIdx.value--
  } else {
    if (wordIdx.value > 0) wordIdx.value--
    else if (sentenceIdx.value > 0) { sentenceIdx.value--; wordIdx.value = wordsInSentence.value.length - 1 }
  }
}

// ── Fullscreen ──────────────────────────────────────────────────────────────────
const paperCard   = ref(null)
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else paperCard.value?.requestFullscreen()
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  // Re-init canvas/writer after fullscreen change (size may have changed)
  nextTick(() => {
    if (isCJK.value) initWriter()
    else             setupCanvas()
  })
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

// ── Hanzi Writer ────────────────────────────────────────────────────────────────
const hanziContainer = ref(null)
const quizActive     = ref(false)
const quizDone       = ref(false)
const charError      = ref(false)
let writer = null

function initWriter() {
  if (!hanziContainer.value || !currentUnit.value) return
  hanziContainer.value.innerHTML = ''
  quizActive.value = false
  quizDone.value   = false
  charError.value  = false
  writer           = null
  const size = Math.min(hanziContainer.value.clientWidth || 300, 400)
  try {
    writer = HanziWriter.create(hanziContainer.value, currentUnit.value, {
      width:                size,
      height:               size,
      padding:              12,
      showOutline:          true,
      strokeColor:          '#1a1a2e',
      outlineColor:         '#c8b99a',
      strokeAnimationSpeed: 1,
      delayBetweenStrokes:  300,
      onLoadCharDataError:  () => { charError.value = true },
    })
  } catch { charError.value = true }
}

function animate()   { writer?.animateCharacter() }

function startQuiz() {
  if (!writer || quizActive.value) return
  quizActive.value = true
  quizDone.value   = false
  writer.quiz({ onComplete: () => { quizActive.value = false; quizDone.value = true } })
}

// ── Canvas drawing ──────────────────────────────────────────────────────────────
const canvas       = ref(null)
const selfReport   = ref(null)
const aiFeedback   = ref(null)
const aiChecking   = ref(false)
let ctx     = null
let drawing = false

const PAPER_COLOR = '#fefce8'
const INK_COLOR   = '#1a1a2e'
const GUIDE_COLOR = '#e8dcc8'

function setupCanvas() {
  if (!canvas.value) return
  const dpr       = window.devicePixelRatio || 1
  const cssWidth  = canvas.value.parentElement?.clientWidth - 40 || 320  // account for px-5
  const cssHeight = isFullscreen.value ? window.innerHeight * 0.55 : Math.max(cssWidth * 0.65, 260)
  canvas.value.width        = cssWidth  * dpr
  canvas.value.height       = cssHeight * dpr
  canvas.value.style.width  = cssWidth  + 'px'
  canvas.value.style.height = cssHeight + 'px'
  ctx = canvas.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = INK_COLOR
  ctx.fillStyle   = INK_COLOR
  ctx.lineWidth   = 3
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  clearCanvasAndGuides()
}

function drawGuideLines() {
  if (!ctx || !canvas.value) return
  const w = parseInt(canvas.value.style.width)
  const h = parseInt(canvas.value.style.height)
  ctx.save()
  ctx.strokeStyle = GUIDE_COLOR
  ctx.lineWidth   = 0.75
  const spacing = 38
  for (let y = spacing; y < h; y += spacing) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.restore()
  // Reset drawing style
  ctx.strokeStyle = INK_COLOR
  ctx.fillStyle   = INK_COLOR
  ctx.lineWidth   = 3
}

function clearCanvasAndGuides() {
  if (!ctx || !canvas.value) return
  const w = parseInt(canvas.value.style.width)
  const h = parseInt(canvas.value.style.height)
  ctx.save()
  ctx.fillStyle = PAPER_COLOR
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  drawGuideLines()
  aiFeedback.value = null
}

async function runCheck() {
  if (!canvas.value || aiChecking.value) return
  aiChecking.value = true
  aiFeedback.value = null
  // Export canvas as base64 PNG (strip the data: prefix)
  const dataUrl = canvas.value.toDataURL('image/png')
  const b64     = dataUrl.split(',')[1]
  const result  = await checkHandwriting(currentUnit.value, props.lang, b64)
  aiFeedback.value = result?.feedback || 'Could not get feedback — try again.'
  aiChecking.value = false
}

function getPos(e) {
  const rect = canvas.value.getBoundingClientRect()
  const src  = e.touches ? e.touches[0] : e
  return { x: src.clientX - rect.left, y: src.clientY - rect.top }
}

function startDraw(e) {
  drawing = true
  const p = getPos(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function moveDraw(e) {
  if (!drawing) return
  const p = getPos(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function stopDraw() { drawing = false }

function report(correct) {
  selfReport.value = correct
  window.clarity?.('event', correct ? 'write_correct' : 'write_incorrect')
}

// ── Watchers & lifecycle ────────────────────────────────────────────────────────
onMounted(async () => {
  await nextTick()
  if (isCJK.value) initWriter()
  else setupCanvas()
})

watch(unitIdx, async () => {
  if (!isCJK.value) return
  await nextTick()
  initWriter()
})

watch([sentenceIdx, wordIdx], async () => {
  if (isCJK.value) return
  selfReport.value  = null
  aiFeedback.value  = null
  await nextTick()
  if (canvas.value) clearCanvasAndGuides()
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0
  wordIdx.value     = 0
  unitIdx.value     = 0
  selfReport.value  = null
  quizActive.value  = false
  quizDone.value    = false
  charError.value   = false
  writer            = null
  if (props.story) window.clarity?.('event', 'write_started')
  await nextTick()
  if (isCJK.value) initWriter()
  else setupCanvas()
})
</script>

<style scoped>
/* Paper card — light mode (normal) */
.paper-card {
  background: #fefce8;
  border: 1px solid #e8dcc8;
}

.paper-header {
  border-bottom: 1px solid #e8dcc8;
}

.paper-word {
  color: #1a1a2e;
}

/* Fullscreen: expand canvas height and center everything */
.paper-card:fullscreen {
  display: flex;
  flex-direction: column;
  background: #fefce8;
  overflow-y: auto;
}

.paper-card:fullscreen .paper-header {
  flex-shrink: 0;
}

.paper-card:fullscreen .paper-word {
  font-size: 5rem;
}

/* Hanzi container fills its space */
.hanzi-container {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  background: #fefce8;
  overflow: hidden;
}
</style>
