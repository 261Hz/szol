<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-ink-muted text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <template v-else>

      <!-- ── CJK mode toggle ───────────────────────────────────────────── -->
      <div v-if="isCJK" class="flex gap-0.5">
        <button @click="setMode('guided')"
          class="text-xs px-2 py-0.5 rounded-full transition-all"
          :style="mode === 'guided' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
          guided
        </button>
        <button @click="setMode('write')"
          class="text-xs px-2 py-0.5 rounded-full transition-all"
          :style="mode !== 'guided' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
          write
        </button>
      </div>

      <!-- ── HanziWriter (CJK guided mode) ─────────────────────────────── -->
      <div v-if="usesHanzi"
        class="rounded-2xl flex flex-col items-center gap-3 py-5 px-5"
        style="background:#fefce8; border:1px solid #e8dcc8;">
        <div class="self-stretch font-serif text-sm leading-relaxed select-none"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'" style="color:#2a241c; max-height:80px; overflow:hidden;">
          <span v-for="(u, i) in rewriteUnits" :key="i" :style="unitStyle(i)">{{ u }}</span>
        </div>
        <div ref="hanziContainer" class="hanzi-container rounded-xl" />
        <div v-if="charError" class="text-xs" style="color:rgba(140,122,102,0.6)">Stroke data unavailable.</div>
        <div v-if="quizDone" class="text-sm font-medium" style="color:#38a169">✓ Done</div>
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

      <!-- ── Full-page story text (write mode) ─────────────────────────── -->
      <div v-else
        class="font-serif leading-relaxed select-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        style="color:#2a241c; font-size:1.15rem; padding-bottom:280px; display:flex; flex-wrap:wrap; gap:0.2em 0.35em; align-items:baseline;">
        <span
          v-for="(u, i) in rewriteUnits"
          :key="i"
          :data-current="i === unitIdx ? '1' : undefined"
          :style="unitStyle(i)"
        >{{ u }}</span>
      </div>

      <!-- ── Back link ──────────────────────────────────────────────────── -->
      <div v-if="!usesHanzi">
        <button @click="emit('go', 'retype')"
          class="text-sm px-3 py-1.5 rounded-lg transition-all"
          style="color:#8c7a66; border:1px solid rgba(140,122,102,0.3);">
          ← retype
        </button>
      </div>

    </template>
  </div>

  <!-- ── Canvas: teleported to body so position:fixed works from any parent ── -->
  <teleport to="body">
    <div v-if="story && !usesHanzi"
      class="fixed bottom-0 left-0 right-0 z-40"
      style="background:rgba(254,252,232,0.92); border-top:1px solid rgba(140,122,102,0.25); backdrop-filter:blur(4px);">

      <!-- Controls strip above canvas -->
      <div class="flex items-center justify-between px-4 py-1.5">
        <div class="flex items-center gap-2">
          <span v-if="checkResult === true" class="text-base font-bold" style="color:#38a169">✓</span>
          <span v-else-if="checkResult === false" class="text-base font-bold" style="color:#8b3a3a">✗</span>
          <span v-else-if="checking" class="text-xs" style="color:#8c7a66;">…</span>
          <span v-else-if="mlkitDownloading" class="text-xs" style="color:#8c7a66;">downloading model…</span>
          <span v-else class="text-xs" style="color:rgba(140,122,102,0.5);">write the word</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs" style="color:rgba(140,122,102,0.5);">{{ progressLabel }}</span>
          <button @click="clearCanvas"
            class="text-xs px-2 py-0.5 rounded-full"
            style="color:rgba(26,26,46,0.38); border:1px solid rgba(140,122,102,0.3);">
            clear
          </button>
        </div>
      </div>

      <!-- The canvas itself -->
      <canvas
        ref="canvasEl"
        class="w-full block touch-none"
        style="cursor:crosshair; display:block;"
        @pointerdown.prevent="startStroke"
        @pointermove="extendStroke"
        @pointerup="endStroke"
        @pointercancel="endStroke"
        @pointerleave="endStroke"
      />
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import HanziWriter from 'hanzi-writer'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { compareStrokes, getHanziTemplate, PASS_THRESHOLD } from '../utils/strokeRecognizer.js'
import { recognizeInk, googleRecognizeInk } from '../utils/api.js'
import { Capacitor } from '@capacitor/core'
import { DigitalInk } from 'capacitor-mlkit-digitalink-plugin'

const ML_KIT_LANG = {
  'zh': 'zh-Hans-CN', 'zh-TW': 'zh-Hant-TW', 'ja': 'ja-JP', 'ko': 'ko-KR',
  'ar': 'ar',         'he': 'he-IL',           'ru': 'ru-RU', 'uk': 'uk-UA',
  'bg': 'bg-BG',      'el': 'el-GR',
  'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'it': 'it-IT',
  'pt': 'pt-PT', 'nl': 'nl-NL', 'pl': 'pl-PL', 'sv': 'sv-SE', 'tr': 'tr-TR',
  'hu': 'hu-HU', 'fi': 'fi-FI', 'da': 'da-DK', 'cs': 'cs-CZ', 'ro': 'ro-RO',
}

const props = defineProps({ story: Object, lang: String })
const emit  = defineEmits(['go'])

const isCJK    = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))
const isNative = computed(() => Capacitor.isNativePlatform())

// ── Single source of truth ────────────────────────────────────────────────────
const rewriteUnits = computed(() => {
  if (!props.story) return []
  const text = props.story.content.trim()
  if (isCJK.value) return [...text].filter(c => /\p{L}/u.test(c))
  return text.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
})

const unitIdx = ref(0)

const currentUnit = computed(() => rewriteUnits.value[unitIdx.value] ?? '')
const isFirst     = computed(() => unitIdx.value === 0)
const isLast      = computed(() => unitIdx.value >= rewriteUnits.value.length - 1)

const progressLabel = computed(() => `${unitIdx.value + 1} / ${rewriteUnits.value.length}`)

function goNext() { if (!isLast.value) unitIdx.value++ }

// ── Story text colour helpers ────────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:700; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.3);'

const hwFont = computed(() =>
  props.lang === 'he' ? 'font-family:"Playpen Sans Hebrew",serif;' : ''
)

function unitStyle(i) {
  const f = hwFont.value
  if (i < unitIdx.value)   return f + DONE_STYLE
  if (i === unitIdx.value) return f + CURRENT_STYLE
  return f + FUTURE_STYLE
}

// ── Auto-scroll current word into view above the canvas strip ────────────────
const CANVAS_TOTAL_H = 260

function scrollToCurrent() {
  nextTick(() => {
    const el = document.querySelector('[data-current="1"]')
    if (!el) return
    const rect = el.getBoundingClientRect()
    const usable = window.innerHeight - CANVAS_TOTAL_H
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - usable * 0.35), behavior: 'smooth' })
  })
}

// ── Canvas ───────────────────────────────────────────────────────────────────
// ── ML Kit (native only) ─────────────────────────────────────────────────────
const mlkitDownloading = ref(false)

function mlkitLang() { return ML_KIT_LANG[props.lang] || 'en-US' }

async function ensureMLKitModel() {
  if (!Capacitor.isNativePlatform()) return
  const lang = mlkitLang()
  try {
    const { models } = await DigitalInk.getDownloadedModels()
    if (models.includes(lang)) return
    mlkitDownloading.value = true
    await new Promise(resolve => {
      DigitalInk.downloadSingularModel({ model: lang }, r => { if (r.done) resolve() })
    })
  } catch { /* ignore — recognition falls back gracefully */ }
  finally { mlkitDownloading.value = false }
}

const canvasEl    = ref(null)
const checking    = ref(false)
const checkResult = ref(null)
const failCount   = ref(0)
let ctx            = null
let autoCheckTimer = null
let drawing        = false
let canvasCssWidth = 0

// Stroke data collected locally — no dependency on Chrome HW API
let userStrokes        = []   // completed strokes: {x,y}[][]
let currentStrokePts   = []   // points in the stroke being drawn

// ── W3C Handwriting Recognition API (web non-CJK, Chromium) ──────────────────
let hwRecognizer = null
let hwDrawing    = null
let hwStroke     = null
let hwStartTime  = 0

async function initHandwritingRecognizer() {
  if (isNative.value || isCJK.value || !('createHandwritingRecognizer' in navigator)) return
  try {
    if (hwRecognizer) { try { hwRecognizer.finish() } catch {} }
    hwRecognizer = await navigator.createHandwritingRecognizer({ languages: [props.lang] })
    resetHwDrawing()
  } catch (err) {
    console.warn('W3C Handwriting API unavailable:', err)
    hwRecognizer = null
  }
}

function resetHwDrawing() {
  try { hwDrawing?.delete() } catch {}
  hwDrawing   = hwRecognizer?.startDrawing() ?? null
  hwStartTime = Date.now()
}

const CANVAS_HEIGHT = 220
const INK_COLOR     = '#1a1a2e'

function setupCanvas() {
  const el = canvasEl.value
  if (!el) return
  const dpr      = window.devicePixelRatio || 1
  const rect     = el.getBoundingClientRect()
  canvasCssWidth = rect.width || window.innerWidth
  el.width        = canvasCssWidth * dpr
  el.height       = CANVAS_HEIGHT  * dpr
  el.style.width  = canvasCssWidth + 'px'
  el.style.height = CANVAS_HEIGHT  + 'px'
  ctx = el.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  clearCanvas()
}

function clearCanvas() {
  clearTimeout(autoCheckTimer)
  userStrokes = []; currentStrokePts = []
  if (Capacitor.isNativePlatform()) DigitalInk.erase().catch(() => {})
  if (hwRecognizer) resetHwDrawing()
  if (!ctx || !canvasEl.value) return
  const w = canvasCssWidth || window.innerWidth
  ctx.clearRect(0, 0, w, CANVAS_HEIGHT)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
  checkResult.value = null
}

function getXY(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function startStroke(e) {
  if (!ctx) setupCanvas()
  if (!ctx) return
  drawing = true
  canvasEl.value.setPointerCapture(e.pointerId)
  clearTimeout(autoCheckTimer)
  checkResult.value = null
  const { x, y } = getXY(e)
  currentStrokePts = [{ x, y }]
  ctx.beginPath()
  ctx.moveTo(x, y)
  if (hwDrawing) { hwStroke = new HandwritingStroke(); hwStroke.addPoint({ x, y, t: Date.now() - hwStartTime }) }
}

function extendStroke(e) {
  if (!drawing || !ctx) return
  const { x, y } = getXY(e)
  currentStrokePts.push({ x, y })
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y)
  if (hwStroke) hwStroke.addPoint({ x, y, t: Date.now() - hwStartTime })
}

function endStroke(e) {
  if (!drawing) return
  drawing = false
  if (currentStrokePts.length > 1) {
    const stroke = [...currentStrokePts]
    userStrokes.push(stroke)
    if (Capacitor.isNativePlatform()) {
      DigitalInk.logStrokes({
        x: stroke.map(p => p.x),
        y: stroke.map(p => p.y),
      }).catch(() => {})
    }
  }
  currentStrokePts = []
  if (hwStroke && hwDrawing) { hwDrawing.addStroke(hwStroke); hwStroke = null }
  clearTimeout(autoCheckTimer)
  autoCheckTimer = setTimeout(runCheck, 1000)
}

// ── Cropped snapshot (kept for potential future use) ─────────────────────────
function getCleanCanvasImage() {
  const PAD = 12
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of userStrokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
  }
  if (!isFinite(minX)) return null
  const cropX = Math.max(0, minX - PAD)
  const cropY = Math.max(0, minY - PAD)
  const cropW = maxX - minX + PAD * 2
  const cropH = maxY - minY + PAD * 2
  const dpr = window.devicePixelRatio || 1
  const off = document.createElement('canvas')
  off.width  = Math.round(cropW * dpr)
  off.height = Math.round(cropH * dpr)
  const c = off.getContext('2d')
  c.scale(dpr, dpr)
  c.translate(-cropX, -cropY)
  c.fillStyle = '#ffffff'
  c.fillRect(cropX, cropY, cropW, cropH)
  c.strokeStyle = '#000000'
  c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round'
  for (const stroke of userStrokes) {
    if (stroke.length < 2) continue
    c.beginPath(); c.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) c.lineTo(stroke[i].x, stroke[i].y)
    c.stroke()
  }
  return off.toDataURL('image/png').split(',')[1]
}

function normWord(s) {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '')
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[a.length][b.length]
}

// ── Recognition ──────────────────────────────────────────────────────────────
async function runCheck() {
  if (checking.value || checkResult.value === true || userStrokes.length === 0) return
  checking.value = true
  let passed = false

  if (Capacitor.isNativePlatform()) {
    // Native: ML Kit Digital Ink Recognition for all languages
    const result = await DigitalInk.doRecognition({
      model: mlkitLang(),
      writingArea: { w: canvasCssWidth || window.innerWidth, h: CANVAS_HEIGHT },
    }).catch(() => null)
    const top  = (result?.results?.candidates?.[0] ?? '').trim().toLowerCase()
    const want = currentUnit.value.trim().toLowerCase()
    passed = top !== '' && top === want
  } else if (isCJK.value) {
    // Web CJK: backend per-stroke geometric comparison; fall back to local $1
    const result = await recognizeInk(userStrokes, props.lang, currentUnit.value)
    if (result !== null) {
      passed = result.match
    } else {
      const template = await getHanziTemplate(currentUnit.value)
      passed = template ? compareStrokes(userStrokes, template) < PASS_THRESHOLD : userStrokes.length >= 1
    }
  } else if (hwDrawing) {
    // Web non-CJK: W3C Handwriting Recognition API (Chromium, on-device, zero deps)
    const predictions = await hwDrawing.getPrediction().catch(() => null)
    const got  = normWord(predictions?.[0]?.text ?? '')
    const want = normWord(currentUnit.value)
    const dist = levenshtein(got, want)
    passed = got !== '' && dist <= (want.length >= 5 ? 1 : 0)
  } else {
    // Web non-CJK fallback: Google Handwriting Input via backend proxy
    const result = await googleRecognizeInk(userStrokes, props.lang, canvasCssWidth, CANVAS_HEIGHT)
    const candidates = result?.candidates ?? (result?.text ? [result.text] : [])
    const want = normWord(currentUnit.value)
    passed = candidates.some(c => {
      const got  = normWord(c)
      const dist = levenshtein(got, want)
      return got !== '' && dist <= (want.length >= 5 ? 1 : 0)
    })
  }

  checkResult.value = passed
  checking.value    = false
  if (passed) {
    failCount.value = 0
    if (!isLast.value) setTimeout(() => { clearCanvas(); goNext(); scrollToCurrent() }, 600)
  } else {
    failCount.value++
  }
}

// ── HanziWriter ──────────────────────────────────────────────────────────────
const mode           = ref('guided')
const hanziContainer = ref(null)
const quizActive     = ref(false)
const quizDone       = ref(false)
const charError      = ref(false)
let writer = null

const usesHanzi = computed(() => isCJK.value && mode.value === 'guided')

function setMode(m) {
  mode.value = m
  checkResult.value = null; failCount.value = 0
  if (m === 'guided') nextTick(initWriter)
  else                nextTick(setupCanvas)
}

function initWriter() {
  if (!hanziContainer.value || !currentUnit.value) return
  hanziContainer.value.innerHTML = ''
  quizActive.value = false; quizDone.value = false; charError.value = false; writer = null
  const size = Math.min(hanziContainer.value.clientWidth || 300, 380)
  try {
    writer = HanziWriter.create(hanziContainer.value, currentUnit.value, {
      width: size, height: size, padding: 12,
      showOutline: true, strokeColor: '#1a1a2e', outlineColor: '#c8b99a',
      strokeAnimationSpeed: 1, delayBetweenStrokes: 300,
      onLoadCharDataError: () => { charError.value = true },
    })
  } catch { charError.value = true }
}

function animate()   { writer?.animateCharacter() }

function startQuiz() {
  if (!writer || quizActive.value) return
  quizActive.value = true; quizDone.value = false
  writer.quiz({
    onComplete: () => {
      quizActive.value = false; quizDone.value = true
      if (!isLast.value) setTimeout(goNext, 900)
    }
  })
}

// ── Window resize ────────────────────────────────────────────────────────────
function onResize() { if (!usesHanzi.value) setupCanvas() }

// ── Lifecycle ────────────────────────────────────────────────────────────────
watch(canvasEl, (el) => { if (el) setupCanvas() })

onMounted(() => {
  if (isCJK.value) nextTick(initWriter)
  else             setupCanvas()
  window.addEventListener('resize', onResize)
  ensureMLKitModel()
  initHandwritingRecognizer()
})

onUnmounted(() => {
  clearTimeout(autoCheckTimer)
  window.removeEventListener('resize', onResize)
  try { hwDrawing?.delete(); hwRecognizer?.finish() } catch {}
})

watch(unitIdx, () => {
  quizDone.value = false; checkResult.value = null; failCount.value = 0
  if (usesHanzi.value) nextTick(initWriter)
  else                 nextTick(() => { clearCanvas(); scrollToCurrent() })
})

watch([() => props.lang, () => props.story], () => {
  unitIdx.value = 0
  mode.value = 'guided'; quizActive.value = false; quizDone.value = false
  charError.value = false; writer = null; checkResult.value = null; failCount.value = 0
  if (isCJK.value) nextTick(initWriter)
  else             setupCanvas()
  ensureMLKitModel()
  nextTick(initHandwritingRecognizer)
})
</script>

<style scoped>
.hanzi-container {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  background: #fefce8;
  overflow: hidden;
}
</style>
