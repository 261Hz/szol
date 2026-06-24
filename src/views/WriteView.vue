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
            <div class="text-xs text-amber-700/60 mt-1" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ unitLabel }}</div>
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
          </div>
          <div v-if="checkResult !== null" class="text-center text-2xl font-bold py-1"
            :class="checkResult ? 'text-green-700' : 'text-red-600'">
            {{ checkResult ? '✓ Pass' : '✗ Fail' }}
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

const isCJK    = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))
const isScript = computed(() => ['ar', 'arz', 'he', 'el', 'ru'].includes(props.lang))
const isLatin  = computed(() => !isCJK.value && !isScript.value)

// ── Handwriting font per script ────────────────────────────────────────────────
const handwritingStyle = computed(() => {
  if (['zh', 'zh-TW'].includes(props.lang)) return { fontFamily: "'Zhi Mang Xing', cursive",    fontSize: '4rem' }
  if (props.lang === 'ja')               return { fontFamily: "'Kaisei Tokumin', serif",      fontSize: '4rem' }
  if (['ar', 'arz'].includes(props.lang)) return { fontFamily: "'Amiri', serif",               fontSize: '3.5rem' }
  if (props.lang === 'he')               return { fontFamily: "'Playpen Sans Hebrew', cursive",   fontSize: '4rem' }
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
onUnmounted(async () => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (_tesseractWorker) { await _tesseractWorker.terminate(); _tesseractWorker = null }
})

// ── Latin OCR via Tesseract.js ──────────────────────────────────────────────────
let _tesseractWorker = null

async function _getTesseract() {
  if (!_tesseractWorker) {
    const { createWorker } = await import('tesseract.js')
    _tesseractWorker = await createWorker('eng')
  }
  return _tesseractWorker
}

// Clean ink-on-white canvas for Tesseract (no guide lines, no paper tint)
function inkCanvas() {
  if (!canvas.value || !strokes.length) return null
  const dpr = window.devicePixelRatio || 1
  const cw  = parseInt(canvas.value.style.width)
  const ch  = parseInt(canvas.value.style.height)
  const off = document.createElement('canvas')
  off.width  = cw * dpr
  off.height = ch * dpr
  const oc = off.getContext('2d')
  oc.setTransform(dpr, 0, 0, dpr, 0, 0)
  oc.fillStyle = '#ffffff'
  oc.fillRect(0, 0, cw, ch)
  oc.strokeStyle = '#000000'
  oc.lineWidth   = 3
  oc.lineCap     = 'round'
  oc.lineJoin    = 'round'
  for (const stroke of strokes) {
    if (stroke.length < 2) continue
    oc.beginPath()
    oc.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) oc.lineTo(stroke[i].x, stroke[i].y)
    oc.stroke()
  }
  return off
}

// Strip diacritics then lower-case for language-agnostic Latin comparison
function normLatin(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => i || j))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1])
  return d[m][n]
}

async function checkLatin() {
  try {
    const worker = await _getTesseract()
    const off    = inkCanvas()
    if (!off) return false
    const { data: { text } } = await worker.recognize(off)
    const got    = normLatin(text)
    const target = normLatin(currentUnit.value)
    if (!got || !target) return false
    const maxErr = Math.max(1, Math.floor(target.length / 4))
    return levenshtein(got, target) <= maxErr
  } catch {
    // Tesseract unavailable — fall back to LLM
    const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
    return result?.passed ?? false
  }
}

// ── RTL coordinate check ────────────────────────────────────────────────────────
// For Arabic/Hebrew: early strokes should have a higher x (more to the right)
// than late strokes. Compares the average x of the first half vs second half.
function isRTLStrokeOrder() {
  if (strokes.length < 3) return true // can't judge with < 3 strokes
  const half = Math.ceil(strokes.length / 2)
  const avgX = ss => { const pts = ss.flat(); return pts.reduce((s, p) => s + p.x, 0) / pts.length }
  return avgX(strokes.slice(0, half)) > avgX(strokes.slice(half))
}

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
const checkResult  = ref(null)  // null | true | false
const aiChecking   = ref(false)
const failCount    = ref(0)
let ctx           = null
let drawing       = false
let strokes       = []          // [[{x,y},...], ...] — one array per pen-down→up
let currentStroke = null

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
  strokes       = []
  currentStroke = null
  checkResult.value = null
  failCount.value   = 0
}

// Faint tracing guide drawn after 2 failed attempts.
function drawTraceGuide() {
  if (!ctx || !canvas.value || !currentUnit.value) return
  const w   = parseInt(canvas.value.style.width)
  const h   = parseInt(canvas.value.style.height)
  const sz  = Math.min(w, h) * 0.7
  const family = handwritingStyle.value.fontFamily
  ctx.save()
  ctx.font          = `bold ${sz}px ${family}`
  ctx.fillStyle     = 'rgba(150,100,40,0.10)'
  ctx.textAlign     = 'center'
  ctx.textBaseline  = 'middle'
  ctx.direction     = isRTL(props.lang) ? 'rtl' : 'ltr'
  ctx.fillText(currentUnit.value, w / 2, h / 2)
  ctx.restore()
  // restore drawing style
  ctx.strokeStyle = INK_COLOR
  ctx.fillStyle   = INK_COLOR
  ctx.lineWidth   = 3
}

// Offscreen copy of the canvas with coloured numbered circles at each stroke's
// start point so the vision model can assess stroke order.
function annotatedImage() {
  if (!canvas.value) return null
  const dpr = window.devicePixelRatio || 1
  const cw  = parseInt(canvas.value.style.width)
  const ch  = parseInt(canvas.value.style.height)
  const off = document.createElement('canvas')
  off.width  = cw * dpr
  off.height = ch * dpr
  const oc   = off.getContext('2d')
  oc.setTransform(dpr, 0, 0, dpr, 0, 0)
  oc.drawImage(canvas.value, 0, 0, cw, ch)
  const palette = ['#e53e3e','#dd6b20','#d69e2e','#38a169','#3182ce','#805ad5']
  strokes.forEach((stroke, i) => {
    if (!stroke.length) return
    const { x, y } = stroke[0]
    const color    = palette[i % palette.length]
    oc.beginPath(); oc.arc(x, y, 9, 0, Math.PI * 2)
    oc.fillStyle = color; oc.fill()
    oc.fillStyle = '#fff'; oc.font = 'bold 11px sans-serif'
    oc.textAlign = 'center'; oc.textBaseline = 'middle'
    oc.fillText(String(i + 1), x, y)
  })
  // Crop to bounding box of drawn strokes — sends only what was written
  const allPts = strokes.flat()
  if (!allPts.length) return off.toDataURL('image/png').split(',')[1]
  const PAD  = 20
  const minX = Math.max(0,          Math.min(...allPts.map(p => p.x)) - PAD) * dpr
  const minY = Math.max(0,          Math.min(...allPts.map(p => p.y)) - PAD) * dpr
  const maxX = Math.min(off.width,  Math.max(...allPts.map(p => p.x)) + PAD) * dpr
  const maxY = Math.min(off.height, Math.max(...allPts.map(p => p.y)) + PAD) * dpr
  const cropW = maxX - minX
  const cropH = maxY - minY
  const crop  = document.createElement('canvas')
  crop.width  = cropW
  crop.height = cropH
  crop.getContext('2d').drawImage(off, minX, minY, cropW, cropH, 0, 0, cropW, cropH)
  return crop.toDataURL('image/png').split(',')[1]
}

async function runCheck() {
  if (!canvas.value || aiChecking.value) return
  aiChecking.value  = true
  checkResult.value = null

  let passed = false
  if (isLatin.value) {
    // Client-side OCR — no backend call
    passed = await checkLatin()
  } else if (isRTL(props.lang)) {
    // Coordinate check for writing direction first
    if (!isRTLStrokeOrder()) {
      passed = false
    } else {
      const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
      passed = result?.passed ?? false
    }
  } else {
    // Greek, Russian, etc. — LLM character check
    const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
    passed = result?.passed ?? false
  }

  checkResult.value = passed
  if (!passed) {
    failCount.value++
    if (failCount.value >= 2) drawTraceGuide()
  } else {
    failCount.value = 0
  }
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
  currentStroke = [p]
  strokes.push(currentStroke)
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
  currentStroke?.push(p)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function stopDraw() { drawing = false; currentStroke = null }

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

  checkResult.value = null
  await nextTick()
  if (canvas.value) clearCanvasAndGuides()
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0
  wordIdx.value     = 0
  unitIdx.value     = 0

  quizActive.value  = false
  quizDone.value    = false
  charError.value   = false
  writer            = null
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
