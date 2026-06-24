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

      <!-- ── HanziWriter (CJK guided, or write-mode on non-Chrome) ─────── -->
      <div v-if="isCJK && (mode === 'guided' || !hwApiAvailable)"
        class="rounded-2xl flex flex-col items-center gap-3 py-5 px-5"
        style="background:#fefce8; border:1px solid #e8dcc8;">

        <!-- mini story progress text above HanziWriter -->
        <div class="self-stretch font-serif text-sm leading-relaxed select-none"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'" style="color:#2a241c; max-height:80px; overflow:hidden;">
          <span v-for="(ch, ci) in cjkChars" :key="ci" :style="charStyle(ci)">{{ ch }}</span>
        </div>

        <div ref="hanziContainer" class="hanzi-container rounded-xl" />
        <div v-if="charError" class="text-xs text-amber-700/60">Stroke data unavailable.</div>
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

      <!-- ── Story text + canvas overlay ───────────────────────────────── -->
      <div v-else class="relative rounded-2xl overflow-hidden"
        style="background:#fefce8; border:1px solid #e8dcc8;">

        <!-- Scrollable story text (behind canvas) -->
        <div ref="storyScroll"
          class="font-serif leading-relaxed px-5 py-4 overflow-y-auto select-none"
          style="max-height:52vh; color:#2a241c;"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'">
          <template v-if="isCJK">
            <span v-for="(ch, ci) in cjkChars" :key="ci"
              :data-current="ci === unitIdx ? '1' : undefined"
              :style="charStyle(ci)">{{ ch }}</span>
          </template>
          <template v-else>
            <template v-for="(sent, si) in sentences" :key="si">
              <span v-for="(word, wi) in sentenceWords(sent)" :key="si+'-'+wi"
                :data-current="si === sentenceIdx && wi === wordIdx ? '1' : undefined"
                :style="wordStyle(si, wi)">{{ word }} </span>
            </template>
          </template>
          <!-- extra bottom padding so last words scroll above canvas -->
          <div style="height:4rem;" />
        </div>

        <!-- Canvas overlay — transparent so story text shows through -->
        <canvas
          ref="canvasEl"
          class="absolute bottom-0 left-0 w-full touch-none"
          style="cursor:crosshair;"
          @pointerdown.prevent="startStroke"
          @pointermove="extendStroke"
          @pointerup="endStroke"
          @pointercancel="endStroke"
          @pointerleave="endStroke"
        />

        <!-- Top controls row (result + clear) -->
        <div class="absolute top-2 right-3 flex items-center gap-2 z-10">
          <span v-if="checkResult !== null" class="text-base font-bold"
            :style="checkResult ? 'color:#38a169' : 'color:#8b3a3a'">
            {{ checkResult ? '✓' : '✗' }}
          </span>
          <span v-else-if="checking" class="text-xs" style="color:#8c7a66;">…</span>
          <button @click="clearCanvas"
            class="text-xs px-2 py-0.5 rounded-full"
            style="color:rgba(26,26,46,0.38); border:1px solid rgba(140,122,102,0.3); background:rgba(254,252,232,0.8);">
            clear
          </button>
        </div>

        <!-- Hint after 2 fails -->
        <div v-if="failCount >= 2"
          class="absolute bottom-1 left-0 w-full text-center text-xs pointer-events-none"
          style="color:rgba(140,122,102,0.5);">
          {{ currentUnit }}
        </div>
      </div>

      <!-- ── Navigation ─────────────────────────────────────────────────── -->
      <div class="flex justify-between items-center">
        <button @click="goPrev" :disabled="isFirst"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-all">
          ← Back
        </button>
        <div class="flex items-center gap-2">
          <button v-if="story" @click="emit('go', 'retype')"
            class="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-all">
            ← retype
          </button>
          <button @click="goNext" :disabled="isLast"
            class="text-sm px-4 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">
            {{ isLast ? 'Done ✓' : 'Next →' }}
          </button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import HanziWriter from 'hanzi-writer'
import { isRTL }  from '../utils/rtl.js'
import { t }      from '../utils/i18n.js'

const props = defineProps({ story: Object, lang: String })
const emit  = defineEmits(['go'])

const isCJK = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))

// ── Story parsing ────────────────────────────────────────────────────────────────
const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content.split(/(?<=[.!?؟।。！？])\s+/).map(s => s.trim()).filter(Boolean)
})

function sentenceWords(sent) { return sent.trim().split(/\s+/).filter(Boolean) }

const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.content].filter(c => /\p{L}/u.test(c))
})

// ── Navigation ───────────────────────────────────────────────────────────────────
const sentenceIdx = ref(0)
const wordIdx     = ref(0)
const unitIdx     = ref(0)

const wordsInSentence = computed(() => sentenceWords(sentences.value[sentenceIdx.value] ?? ''))

const currentUnit = computed(() =>
  isCJK.value ? (cjkChars.value[unitIdx.value] ?? '') : (wordsInSentence.value[wordIdx.value] ?? '')
)

const isFirst = computed(() =>
  isCJK.value ? unitIdx.value === 0 : sentenceIdx.value === 0 && wordIdx.value === 0
)

const isLast = computed(() =>
  isCJK.value
    ? unitIdx.value >= cjkChars.value.length - 1
    : sentenceIdx.value >= sentences.value.length - 1 &&
      wordIdx.value >= wordsInSentence.value.length - 1
)

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

// ── Story text colour helpers ────────────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:700; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.35);'

function charStyle(ci) {
  if (ci < unitIdx.value)   return DONE_STYLE
  if (ci === unitIdx.value) return CURRENT_STYLE
  return FUTURE_STYLE
}

function wordStyle(si, wi) {
  const past = si < sentenceIdx.value || (si === sentenceIdx.value && wi < wordIdx.value)
  const curr = si === sentenceIdx.value && wi === wordIdx.value
  return past ? DONE_STYLE : curr ? CURRENT_STYLE : FUTURE_STYLE
}

// ── Auto-scroll current word into view above the canvas strip ────────────────────
const storyScroll = ref(null)

function scrollToCurrent() {
  const container = storyScroll.value
  if (!container) return
  const el = container.querySelector('[data-current="1"]')
  if (!el) return
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  const relTop = eRect.top - cRect.top + container.scrollTop
  container.scrollTo({ top: Math.max(0, relTop - 40), behavior: 'smooth' })
}

// ── Chrome Handwriting Recognition API ──────────────────────────────────────────
const hwApiAvailable = 'createHandwritingRecognizer' in navigator
let hwRecognizer = null
let hwDrawing    = null
let hwCurStroke  = null

function hwLang(lang) {
  return lang === 'zh-TW' ? 'zh-TW' : lang === 'zh' ? 'zh' : lang === 'ja' ? 'ja' : lang
}

async function initHW() {
  if (!hwApiAvailable) return
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} hwRecognizer = null; hwDrawing = null }
  try {
    hwRecognizer = await navigator.createHandwritingRecognizer({ languages: [hwLang(props.lang)] })
    hwDrawing    = hwRecognizer.startDrawing({ alternatives: 8 })
  } catch {}
}

// ── Canvas ───────────────────────────────────────────────────────────────────────
const canvasEl    = ref(null)
const checking    = ref(false)
const checkResult = ref(null)
const failCount   = ref(0)
let ctx            = null
let autoCheckTimer = null
let strokeCount    = 0

const CANVAS_HEIGHT = 160   // px — strip at bottom of story card
const INK_COLOR     = '#1a1a2e'

function setupCanvas() {
  if (!canvasEl.value) return
  const dpr      = window.devicePixelRatio || 1
  const cssWidth = canvasEl.value.parentElement?.clientWidth || 340
  canvasEl.value.width        = cssWidth      * dpr
  canvasEl.value.height       = CANVAS_HEIGHT * dpr
  canvasEl.value.style.width  = cssWidth      + 'px'
  canvasEl.value.style.height = CANVAS_HEIGHT + 'px'
  ctx = canvasEl.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  clearCanvas()
}

function clearCanvas() {
  clearTimeout(autoCheckTimer)
  if (!ctx || !canvasEl.value) return
  const w = parseInt(canvasEl.value.style.width)
  const h = parseInt(canvasEl.value.style.height)
  // Transparent clear — story text shows through
  ctx.clearRect(0, 0, w, h)
  // Subtle top border line so user knows where the canvas starts
  ctx.save()
  ctx.strokeStyle = 'rgba(140,122,102,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.stroke()
  ctx.restore()
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
  checkResult.value = null; failCount.value = 0; strokeCount = 0
  if (hwDrawing) { try { hwDrawing.clear() } catch {} }
}

function drawTraceGuide() {
  if (!ctx || !canvasEl.value) return
  const w = parseInt(canvasEl.value.style.width)
  const h = parseInt(canvasEl.value.style.height)
  ctx.save()
  ctx.font = `bold ${h * 0.65}px serif`
  ctx.fillStyle = 'rgba(139,58,58,0.08)'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(currentUnit.value, w / 2, h / 2)
  ctx.restore()
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
}

function getXY(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function startStroke(e) {
  canvasEl.value.setPointerCapture(e.pointerId)
  clearTimeout(autoCheckTimer)
  checkResult.value = null
  const { x, y } = getXY(e)
  if (hwDrawing && typeof HandwritingStroke !== 'undefined') {
    hwCurStroke = new HandwritingStroke()
    hwCurStroke.addPoint({ x, y, t: Date.now() })
  }
  ctx.beginPath(); ctx.moveTo(x, y)
  ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x, y)
}

function extendStroke(e) {
  if (!(e.buttons & 1) && e.pointerType === 'mouse') return
  const { x, y } = getXY(e)
  hwCurStroke?.addPoint({ x, y, t: Date.now() })
  ctx.lineTo(x, y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y)
}

function endStroke() {
  strokeCount++
  if (hwCurStroke && hwDrawing) {
    try { hwDrawing.addStroke(hwCurStroke) } catch {}
    hwCurStroke = null
  }
  clearTimeout(autoCheckTimer)
  autoCheckTimer = setTimeout(runCheck, 1200)
}

// ── Recognition ──────────────────────────────────────────────────────────────────
function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => i || j))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = a[i-1] === b[j-1] ? d[i-1][j-1] : 1 + Math.min(d[i-1][j], d[i][j-1], d[i-1][j-1])
  return d[m][n]
}

function isMatch(got, expected) {
  if (isCJK.value) return got.trim() === expected
  const g = norm(got), t = norm(expected)
  return levenshtein(g, t) <= Math.max(1, Math.floor(t.length / 4))
}

function minExpectedStrokes(target) {
  if (isCJK.value) return Math.max(1, Math.round(target.length * 2))
  return Math.max(1, Math.round(target.replace(/\s/g, '').length * 1.2))
}

async function runCheck() {
  if (checking.value || checkResult.value === true || strokeCount === 0) return
  checking.value = true
  let passed = false
  if (hwDrawing) {
    try {
      const preds = await hwDrawing.getPrediction()
      passed = preds.some(p => isMatch(p.text ?? '', currentUnit.value))
      if (passed) hwDrawing.clear()
    } catch {}
  } else {
    passed = strokeCount >= minExpectedStrokes(currentUnit.value)
  }
  checkResult.value = passed
  checking.value    = false
  if (passed) {
    failCount.value = 0
    if (!isLast.value) setTimeout(() => { clearCanvas(); goNext() }, 700)
  } else {
    failCount.value++
    if (failCount.value >= 2) drawTraceGuide()
  }
}

// ── HanziWriter ──────────────────────────────────────────────────────────────────
const mode           = ref('guided')
const hanziContainer = ref(null)
const quizActive     = ref(false)
const quizDone       = ref(false)
const charError      = ref(false)
let writer = null

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

// ── Lifecycle ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await initHW()
  if (isCJK.value) nextTick(initWriter)
  else             nextTick(setupCanvas)
})

onUnmounted(() => {
  clearTimeout(autoCheckTimer)
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} }
})

const usesHanzi = computed(() => isCJK.value && (mode.value === 'guided' || !hwApiAvailable))

watch([unitIdx, wordIdx, sentenceIdx], () => {
  quizDone.value = false; checkResult.value = null; failCount.value = 0
  if (usesHanzi.value) nextTick(initWriter)
  else                 nextTick(() => { clearCanvas(); nextTick(scrollToCurrent) })
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0; wordIdx.value = 0; unitIdx.value = 0
  mode.value = 'guided'; quizActive.value = false; quizDone.value = false
  charError.value = false; writer = null; checkResult.value = null; failCount.value = 0
  await initHW()
  if (isCJK.value) nextTick(initWriter)
  else             nextTick(setupCanvas)
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
