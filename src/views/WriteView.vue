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
        style="color:#2a241c; font-size:1.15rem; padding-bottom:220px;">
        <span
          v-for="(u, i) in rewriteUnits"
          :key="i"
          :data-current="i === unitIdx ? '1' : undefined"
          :style="unitStyle(i)"
          :class="!isCJK && i < rewriteUnits.length - 1 ? 'mr-[0.3em]' : ''"
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
import { recognizeInk } from '../utils/api.js'

const props = defineProps({ story: Object, lang: String })
const emit  = defineEmits(['go'])

const isCJK = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))

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

function unitStyle(i) {
  if (i < unitIdx.value)   return DONE_STYLE
  if (i === unitIdx.value) return CURRENT_STYLE
  return FUTURE_STYLE
}

// ── Auto-scroll current word into view above the canvas strip ────────────────
const CANVAS_TOTAL_H = 200

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

const CANVAS_HEIGHT = 160
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
  if (!ctx || !canvasEl.value) return
  const w = canvasCssWidth || window.innerWidth
  ctx.clearRect(0, 0, w, CANVAS_HEIGHT)
  if (currentUnit.value) {
    ctx.save()
    ctx.font = `bold ${Math.min(CANVAS_HEIGHT * 0.7, 100)}px serif`
    ctx.fillStyle = 'rgba(139,58,58,0.07)'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(currentUnit.value, w / 2, CANVAS_HEIGHT / 2)
    ctx.restore()
  }
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
}

function extendStroke(e) {
  if (!drawing || !ctx) return
  const { x, y } = getXY(e)
  currentStrokePts.push({ x, y })
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function endStroke() {
  if (!drawing) return
  drawing = false
  if (currentStrokePts.length > 1) userStrokes.push([...currentStrokePts])
  currentStrokePts = []
  clearTimeout(autoCheckTimer)
  autoCheckTimer = setTimeout(runCheck, 1000)
}

// ── Recognition ──────────────────────────────────────────────────────────────
async function runCheck() {
  if (checking.value || checkResult.value === true || userStrokes.length === 0) return
  checking.value = true
  let passed = false

  if (isCJK.value) {
    // Try backend first: per-stroke comparison, better than whole-char $1
    const result = await recognizeInk(userStrokes, props.lang, currentUnit.value)
    if (result !== null) {
      passed = result.match
    } else {
      // Backend unreachable: fall back to local $1 recognizer
      const template = await getHanziTemplate(currentUnit.value)
      if (template) {
        passed = compareStrokes(userStrokes, template) < PASS_THRESHOLD
      } else {
        passed = userStrokes.length >= 1
      }
    }
  } else {
    // Latin / RTL: stroke-count heuristic (no template library yet)
    const minStrokes = Math.max(1, Math.ceil(currentUnit.value.length / 4))
    passed = userStrokes.length >= minStrokes
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
})

onUnmounted(() => {
  clearTimeout(autoCheckTimer)
  window.removeEventListener('resize', onResize)
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
