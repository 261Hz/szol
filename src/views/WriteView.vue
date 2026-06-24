<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-ink-muted text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <template v-else>

      <!-- ── Story text (flows like Retype) ───────────────────────────── -->
      <div class="rounded-2xl px-5 py-4" style="background:#fefce8; border:1px solid #e8dcc8;">
        <div class="font-serif leading-relaxed text-base" :dir="isRTL(lang) ? 'rtl' : 'ltr'" style="color:#2a241c;">

          <!-- CJK: character stream -->
          <template v-if="isCJK">
            <span v-for="(ch, ci) in cjkChars" :key="ci"
              :style="cjkCharStyle(ci)">{{ ch }}</span>
          </template>

          <!-- Non-CJK: sentence → word stream -->
          <template v-else>
            <template v-for="(sent, si) in sentences" :key="si">
              <span v-for="(word, wi) in sentenceWords(sent)" :key="wi"
                :style="wordStyle(si, wi)">{{ word }} </span>
            </template>
          </template>

        </div>
      </div>

      <!-- ── Writing area ──────────────────────────────────────────────── -->
      <div ref="paperCard" class="paper-card rounded-2xl overflow-hidden shadow-xl">

        <!-- Target word header -->
        <div class="paper-header px-5 pt-5 pb-3 flex items-center justify-between gap-3">
          <div class="paper-word select-none leading-none" :style="handwritingStyle" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ currentUnit }}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <!-- CJK mode toggle -->
            <div v-if="isCJK" class="flex gap-0.5">
              <button @click="freehandMode = false"
                class="text-xs px-2 py-0.5 rounded-full transition-all"
                :style="!freehandMode ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
                guided
              </button>
              <button @click="freehandMode = true"
                class="text-xs px-2 py-0.5 rounded-full transition-all"
                :style="freehandMode ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
                freehand
              </button>
            </div>
            <button @click="toggleFullscreen"
              class="text-amber-700/50 hover:text-amber-800 text-lg transition-colors"
              :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'">
              {{ isFullscreen ? '⊠' : '⛶' }}
            </button>
          </div>
        </div>

        <!-- CJK guided (HanziWriter) -->
        <div v-if="isCJK && !freehandMode" class="flex flex-col items-center gap-3 pb-5 px-5">
          <div ref="hanziContainer" class="hanzi-container rounded-xl" />
          <div v-if="charError" class="text-xs text-amber-700/60">Stroke data unavailable for this character.</div>
          <div v-if="quizDone" class="text-green-700 font-medium text-sm">✓ Done</div>
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

        <!-- Canvas (CJK freehand + all non-CJK) -->
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
            <button @click="runCheck" :disabled="aiChecking || checkResult !== null"
              class="px-4 py-2 text-sm rounded-lg bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-50 transition-all">
              {{ aiChecking ? 'Checking…' : '✦ Check' }}
            </button>
          </div>
          <!-- Pass / fail feedback -->
          <div v-if="checkResult !== null" class="text-center text-2xl font-bold py-1"
            :class="checkResult ? 'text-green-700' : 'text-red-600'">
            {{ checkResult ? '✓ Pass' : '✗ Fail' }}
          </div>
        </div>

      </div>
      <!-- ── End writing area ──────────────────────────────────────────── -->

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

    </template>
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

// ── Handwriting font per script ─────────────────────────────────────────────────
const handwritingStyle = computed(() => {
  if (['zh', 'zh-TW'].includes(props.lang)) return { fontFamily: "'Zhi Mang Xing', cursive",     fontSize: '4rem' }
  if (props.lang === 'ja')                  return { fontFamily: "'Kaisei Tokumin', serif",       fontSize: '4rem' }
  if (['ar', 'arz'].includes(props.lang))   return { fontFamily: "'Amiri', serif",                fontSize: '3.5rem' }
  if (props.lang === 'he')                  return { fontFamily: "'Playpen Sans Hebrew', cursive", fontSize: '4rem' }
  return { fontFamily: "'Patrick Hand', cursive", fontSize: '4rem' }
})

// ── Sentence / word / char splitting ────────────────────────────────────────────
const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim()).filter(Boolean)
})

function sentenceWords(sent) {
  return sent.trim().split(/\s+/).filter(Boolean)
}

const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.content].filter(c => /\p{L}/u.test(c))
})

// ── Navigation state ─────────────────────────────────────────────────────────────
const sentenceIdx = ref(0)
const wordIdx     = ref(0)
const unitIdx     = ref(0)   // CJK char index

const wordsInSentence = computed(() => sentenceWords(sentences.value[sentenceIdx.value] ?? ''))

const currentUnit = computed(() => {
  if (isCJK.value) return cjkChars.value[unitIdx.value] ?? ''
  return wordsInSentence.value[wordIdx.value] ?? ''
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

// ── Story text styling (Retype-like) ────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:600; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.4);'

function cjkCharStyle(ci) {
  if (ci < unitIdx.value)  return DONE_STYLE
  if (ci === unitIdx.value) return CURRENT_STYLE
  return FUTURE_STYLE
}

function wordStyle(si, wi) {
  const before = si < sentenceIdx.value || (si === sentenceIdx.value && wi < wordIdx.value)
  const isCurr = si === sentenceIdx.value && wi === wordIdx.value
  if (before)  return DONE_STYLE
  if (isCurr)  return CURRENT_STYLE
  return FUTURE_STYLE
}

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

// ── Fullscreen ───────────────────────────────────────────────────────────────────
const paperCard    = ref(null)
const isFullscreen = ref(false)

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else paperCard.value?.requestFullscreen()
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  nextTick(() => {
    if (isCJK.value && !freehandMode.value) initWriter()
    else setupCanvas()
  })
}

// ── Chrome Handwriting Recognition API (progressive enhancement) ────────────────
let hwRecognizer = null
let hwDrawing    = null
let hwCurStroke  = null

async function setupHWApi(lang) {
  if (!('createHandwritingRecognizer' in navigator)) return
  try {
    hwRecognizer ??= await navigator.createHandwritingRecognizer({ languages: [lang] })
    hwDrawing = hwRecognizer.startDrawing({ alternatives: 2 })
  } catch {
    hwRecognizer = null
    hwDrawing    = null
  }
}

// ── CJK freehand mode ────────────────────────────────────────────────────────────
const freehandMode = ref(false)

// ── Tesseract (Latin OCR fallback) ───────────────────────────────────────────────
let _tesseractWorker = null

async function _getTesseract() {
  if (!_tesseractWorker) {
    const { createWorker } = await import('tesseract.js')
    _tesseractWorker = await createWorker('eng')
  }
  return _tesseractWorker
}

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
  oc.fillStyle = '#ffffff'; oc.fillRect(0, 0, cw, ch)
  oc.strokeStyle = '#000000'; oc.lineWidth = 3; oc.lineCap = 'round'; oc.lineJoin = 'round'
  for (const stroke of strokes) {
    if (stroke.length < 2) continue
    oc.beginPath(); oc.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) oc.lineTo(stroke[i].x, stroke[i].y)
    oc.stroke()
  }
  return off
}

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
  // Try Chrome Handwriting API first (no wasm cost; works on ChromeOS/Android)
  if (hwDrawing) {
    try {
      const predictions = await hwDrawing.getPrediction()
      const got = normLatin(predictions[0]?.text ?? '')
      const target = normLatin(currentUnit.value)
      if (got) {
        hwDrawing.clear()
        return levenshtein(got, target) <= Math.max(1, Math.floor(target.length / 4))
      }
    } catch {}
  }
  // Tesseract.js
  try {
    const worker = await _getTesseract()
    const off    = inkCanvas()
    if (!off) return false
    const { data: { text } } = await worker.recognize(off)
    const got    = normLatin(text)
    const target = normLatin(currentUnit.value)
    if (!got || !target) return false
    return levenshtein(got, target) <= Math.max(1, Math.floor(target.length / 4))
  } catch {
    const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
    return result?.passed ?? false
  }
}

function isRTLStrokeOrder() {
  if (strokes.length < 3) return true
  const half = Math.ceil(strokes.length / 2)
  const avgX = ss => { const pts = ss.flat(); return pts.reduce((s, p) => s + p.x, 0) / pts.length }
  return avgX(strokes.slice(0, half)) > avgX(strokes.slice(half))
}

// ── HanziWriter ──────────────────────────────────────────────────────────────────
const hanziContainer = ref(null)
const quizActive     = ref(false)
const quizDone       = ref(false)
const charError      = ref(false)
let writer = null

function initWriter() {
  if (!hanziContainer.value || !currentUnit.value) return
  hanziContainer.value.innerHTML = ''
  quizActive.value = false; quizDone.value = false; charError.value = false; writer = null
  const size = Math.min(hanziContainer.value.clientWidth || 300, 400)
  try {
    writer = HanziWriter.create(hanziContainer.value, currentUnit.value, {
      width: size, height: size, padding: 12,
      showOutline: true,
      strokeColor: '#1a1a2e', outlineColor: '#c8b99a',
      strokeAnimationSpeed: 1, delayBetweenStrokes: 300,
      onLoadCharDataError: () => { charError.value = true },
    })
  } catch { charError.value = true }
}

function animate()   { writer?.animateCharacter() }

function startQuiz() {
  if (!writer || quizActive.value) return
  quizActive.value = true
  quizDone.value   = false
  writer.quiz({
    onComplete: () => {
      quizActive.value = false
      quizDone.value   = true
      if (!isLast.value) setTimeout(() => { goNext() }, 1000)
    }
  })
}

// ── Canvas drawing ───────────────────────────────────────────────────────────────
const canvas      = ref(null)
const checkResult = ref(null)
const aiChecking  = ref(false)
const failCount   = ref(0)
let ctx           = null
let drawing       = false
let strokes       = []
let currentStroke = null

const PAPER_COLOR = '#fefce8'
const INK_COLOR   = '#1a1a2e'
const GUIDE_COLOR = '#e8dcc8'

function setupCanvas() {
  if (!canvas.value) return
  const dpr      = window.devicePixelRatio || 1
  const cssWidth = canvas.value.parentElement?.clientWidth - 40 || 320
  const cssHeight = isFullscreen.value ? window.innerHeight * 0.55 : Math.max(cssWidth * 0.65, 260)
  canvas.value.width  = cssWidth  * dpr
  canvas.value.height = cssHeight * dpr
  canvas.value.style.width  = cssWidth  + 'px'
  canvas.value.style.height = cssHeight + 'px'
  ctx = canvas.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  clearCanvasAndGuides()
}

function drawGuideLines() {
  if (!ctx || !canvas.value) return
  const w = parseInt(canvas.value.style.width)
  const h = parseInt(canvas.value.style.height)
  ctx.save(); ctx.strokeStyle = GUIDE_COLOR; ctx.lineWidth = 0.75
  for (let y = 38; y < h; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
  ctx.restore()
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
}

function clearCanvasAndGuides() {
  if (!ctx || !canvas.value) return
  const w = parseInt(canvas.value.style.width)
  const h = parseInt(canvas.value.style.height)
  ctx.save(); ctx.fillStyle = PAPER_COLOR; ctx.fillRect(0, 0, w, h); ctx.restore()
  drawGuideLines()
  strokes = []; currentStroke = null
  checkResult.value = null; failCount.value = 0
  if (hwDrawing) { try { hwDrawing.clear() } catch {} }
}

function drawTraceGuide() {
  if (!ctx || !canvas.value || !currentUnit.value) return
  const w = parseInt(canvas.value.style.width)
  const h = parseInt(canvas.value.style.height)
  const sz = Math.min(w, h) * 0.7
  ctx.save()
  ctx.font = `bold ${sz}px ${handwritingStyle.value.fontFamily}`
  ctx.fillStyle = 'rgba(150,100,40,0.10)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.direction = isRTL(props.lang) ? 'rtl' : 'ltr'
  ctx.fillText(currentUnit.value, w / 2, h / 2)
  ctx.restore()
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
}

function annotatedImage() {
  if (!canvas.value) return null
  const dpr = window.devicePixelRatio || 1
  const cw  = parseInt(canvas.value.style.width)
  const ch  = parseInt(canvas.value.style.height)
  const off = document.createElement('canvas')
  off.width = cw * dpr; off.height = ch * dpr
  const oc = off.getContext('2d')
  oc.setTransform(dpr, 0, 0, dpr, 0, 0)
  oc.drawImage(canvas.value, 0, 0, cw, ch)
  const palette = ['#e53e3e','#dd6b20','#d69e2e','#38a169','#3182ce','#805ad5']
  strokes.forEach((stroke, i) => {
    if (!stroke.length) return
    const { x, y } = stroke[0]; const color = palette[i % palette.length]
    oc.beginPath(); oc.arc(x, y, 9, 0, Math.PI * 2); oc.fillStyle = color; oc.fill()
    oc.fillStyle = '#fff'; oc.font = 'bold 11px sans-serif'
    oc.textAlign = 'center'; oc.textBaseline = 'middle'
    oc.fillText(String(i + 1), x, y)
  })
  const allPts = strokes.flat()
  if (!allPts.length) return off.toDataURL('image/png').split(',')[1]
  const PAD  = 20
  const minX = Math.max(0,          Math.min(...allPts.map(p => p.x)) - PAD) * dpr
  const minY = Math.max(0,          Math.min(...allPts.map(p => p.y)) - PAD) * dpr
  const maxX = Math.min(off.width,  Math.max(...allPts.map(p => p.x)) + PAD) * dpr
  const maxY = Math.min(off.height, Math.max(...allPts.map(p => p.y)) + PAD) * dpr
  const crop = document.createElement('canvas')
  crop.width = maxX - minX; crop.height = maxY - minY
  crop.getContext('2d').drawImage(off, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return crop.toDataURL('image/png').split(',')[1]
}

async function runCheck() {
  if (!canvas.value || aiChecking.value) return
  aiChecking.value = true; checkResult.value = null

  let passed = false

  if (isCJK.value && freehandMode.value) {
    if (hwDrawing) {
      try {
        const preds = await hwDrawing.getPrediction()
        passed = (preds[0]?.text?.trim() ?? '') === currentUnit.value
        hwDrawing.clear()
      } catch {
        const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
        passed = result?.passed ?? false
      }
    } else {
      const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
      passed = result?.passed ?? false
    }
  } else if (isLatin.value) {
    passed = await checkLatin()
  } else if (isRTL(props.lang)) {
    passed = isRTLStrokeOrder()
      ? ((await checkHandwriting(currentUnit.value, props.lang, annotatedImage()))?.passed ?? false)
      : false
  } else {
    const result = await checkHandwriting(currentUnit.value, props.lang, annotatedImage())
    passed = result?.passed ?? false
  }

  checkResult.value = passed
  aiChecking.value  = false

  if (passed) {
    failCount.value = 0
    // Auto-advance after brief success feedback
    if (!isLast.value) setTimeout(() => { goNext() }, 800)
  } else {
    failCount.value++
    if (failCount.value >= 2) drawTraceGuide()
  }
}

function getPos(e) {
  const rect = canvas.value.getBoundingClientRect()
  const src  = e.touches ? e.touches[0] : e
  return { x: src.clientX - rect.left, y: src.clientY - rect.top }
}

function startDraw(e) {
  drawing = true
  const p = getPos(e)
  currentStroke = [p]; strokes.push(currentStroke)
  if (hwDrawing && typeof HandwritingStroke !== 'undefined') {
    hwCurStroke = new HandwritingStroke()
    hwCurStroke.addPoint({ x: p.x, y: p.y, t: Date.now() })
  }
  ctx.beginPath(); ctx.moveTo(p.x, p.y)
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(p.x, p.y)
}

function moveDraw(e) {
  if (!drawing) return
  const p = getPos(e)
  currentStroke?.push(p)
  hwCurStroke?.addPoint({ x: p.x, y: p.y, t: Date.now() })
  ctx.lineTo(p.x, p.y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(p.x, p.y)
}

function stopDraw() {
  if (hwCurStroke && hwDrawing) { try { hwDrawing.addStroke(hwCurStroke) } catch {} hwCurStroke = null }
  drawing = false; currentStroke = null
}

// ── Watchers & lifecycle ─────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  await nextTick()
  if (isCJK.value) initWriter()
  else { setupCanvas(); await setupHWApi(props.lang) }
})

onUnmounted(async () => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} }
  if (_tesseractWorker) { await _tesseractWorker.terminate(); _tesseractWorker = null }
})

watch(freehandMode, async (isFree) => {
  checkResult.value = null; failCount.value = 0
  await nextTick()
  if (!isCJK.value) return
  if (isFree) {
    setupCanvas(); await setupHWApi(props.lang)
  } else {
    if (hwRecognizer) { try { hwRecognizer.finish() } catch {} hwRecognizer = null; hwDrawing = null }
    initWriter()
  }
})

// Reset canvas/writer when the target word/char changes
watch([unitIdx, wordIdx, sentenceIdx], async ([newU], [oldU]) => {
  checkResult.value = null; quizDone.value = false
  await nextTick()
  if (isCJK.value) {
    if (freehandMode.value) clearCanvasAndGuides()
    else initWriter()
  } else {
    if (canvas.value) clearCanvasAndGuides()
  }
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0; wordIdx.value = 0; unitIdx.value = 0
  freehandMode.value = false
  quizActive.value = false; quizDone.value = false; charError.value = false; writer = null
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} hwRecognizer = null; hwDrawing = null }
  await nextTick()
  if (isCJK.value) initWriter()
  else { setupCanvas(); await setupHWApi(props.lang) }
})
</script>

<style scoped>
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

.paper-card:fullscreen {
  display: flex;
  flex-direction: column;
  background: #fefce8;
  overflow-y: auto;
}

.paper-card:fullscreen .paper-header { flex-shrink: 0; }
.paper-card:fullscreen .paper-word   { font-size: 5rem; }

.hanzi-container {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  background: #fefce8;
  overflow: hidden;
}
</style>
