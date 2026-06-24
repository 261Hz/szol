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
          <span v-for="(ch, ci) in cjkChars" :key="ci" :style="charStyle(ci)">{{ ch }}</span>
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

      <!-- ── Full-page story text (non-Hanzi modes) ─────────────────────── -->
      <div v-else
        class="font-serif leading-relaxed select-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        style="color:#2a241c; font-size:1.15rem; padding-bottom:220px;">
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
      </div>

      <!-- ── Navigation (top-right, small) ─────────────────────────────── -->
      <div v-if="!usesHanzi" class="flex justify-between items-center">
        <button @click="emit('go', 'retype')"
          class="text-sm px-3 py-1.5 rounded-lg transition-all"
          style="color:#8c7a66; border:1px solid rgba(140,122,102,0.3);">
          ← retype
        </button>
        <button v-if="!hwApiAvailable" @click="advanceManual"
          class="text-sm px-4 py-1.5 rounded-lg transition-all"
          style="background:#2a241c; color:#e8dcc4;">
          Next →
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
          <span v-else class="text-xs" style="color:rgba(140,122,102,0.5);">
            {{ hwApiAvailable ? 'write the word' : 'write for practice' }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="!isFirst" class="text-xs" style="color:rgba(140,122,102,0.5);">
            {{ progressLabel }}
          </span>
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
import { isRTL }  from '../utils/rtl.js'
import { t }      from '../utils/i18n.js'

const props = defineProps({ story: Object, lang: String })
const emit  = defineEmits(['go'])

const isCJK = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))

// ── Story parsing ────────────────────────────────────────────────────────────
const sentences = computed(() => {
  if (!props.story) return []
  return props.story.content.split(/(?<=[.!?؟।。！？])\s+/).map(s => s.trim()).filter(Boolean)
})

function sentenceWords(sent) { return sent.trim().split(/\s+/).filter(Boolean) }

const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.content].filter(c => /\p{L}/u.test(c))
})

// ── Navigation ───────────────────────────────────────────────────────────────
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

const totalUnits = computed(() =>
  isCJK.value ? cjkChars.value.length : sentences.value.reduce((n, s) => n + sentenceWords(s).length, 0)
)

const currentUnitNum = computed(() => {
  if (isCJK.value) return unitIdx.value + 1
  let n = 0
  for (let si = 0; si < sentences.value.length; si++) {
    const ws = sentenceWords(sentences.value[si])
    if (si < sentenceIdx.value) { n += ws.length; continue }
    n += wordIdx.value + 1; break
  }
  return n
})

const progressLabel = computed(() => `${currentUnitNum.value} / ${totalUnits.value}`)

function goNext() {
  if (isCJK.value) {
    if (unitIdx.value < cjkChars.value.length - 1) unitIdx.value++
  } else {
    if (wordIdx.value < wordsInSentence.value.length - 1) wordIdx.value++
    else if (sentenceIdx.value < sentences.value.length - 1) { sentenceIdx.value++; wordIdx.value = 0 }
  }
}

function advanceManual() {
  clearCanvas()
  if (!isLast.value) goNext()
}

// ── Story text colour helpers ────────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:700; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.3);'

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

// ── Auto-scroll current word into view above the canvas strip ────────────────
const CANVAS_TOTAL_H = 200   // canvas + controls strip (px) — keep in sync with canvas height

function scrollToCurrent() {
  nextTick(() => {
    const el = document.querySelector('[data-current="1"]')
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vh   = window.innerHeight
    const usable = vh - CANVAS_TOTAL_H   // viewport area above canvas
    const targetScroll = window.scrollY + rect.top - usable * 0.35
    window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  })
}

// ── Chrome Handwriting Recognition API ──────────────────────────────────────
const hwApiAvailable = 'createHandwritingRecognizer' in navigator
let hwRecognizer = null
let hwDrawing    = null
let hwCurStroke  = null

async function initHW() {
  if (!hwApiAvailable) return
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} hwRecognizer = null; hwDrawing = null }
  try {
    hwRecognizer = await navigator.createHandwritingRecognizer({ languages: [props.lang === 'zh-TW' ? 'zh-TW' : props.lang === 'zh' ? 'zh' : props.lang] })
    hwDrawing    = hwRecognizer.startDrawing({ alternatives: 8 })
  } catch {}
}

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvasEl    = ref(null)
const checking    = ref(false)
const checkResult = ref(null)
const failCount   = ref(0)
let ctx            = null
let autoCheckTimer = null
let strokeCount    = 0
let drawing        = false
let canvasCssWidth = 0

const CANVAS_HEIGHT = 160
const INK_COLOR     = '#1a1a2e'

function setupCanvas() {
  const el = canvasEl.value
  if (!el) return
  const dpr      = window.devicePixelRatio || 1
  // Use the element's actual laid-out width so pointer coords and canvas coords agree.
  // window.innerWidth drifts when the fixed container has scrollbars or padding.
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
  if (!ctx || !canvasEl.value) return
  const w = canvasCssWidth || window.innerWidth
  const h = CANVAS_HEIGHT
  ctx.clearRect(0, 0, w, h)
  // Ghost trace guide: always show target word faintly
  if (currentUnit.value) {
    ctx.save()
    ctx.font = `bold ${Math.min(h * 0.7, 100)}px serif`
    ctx.fillStyle = 'rgba(139,58,58,0.07)'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(currentUnit.value, (canvasCssWidth || window.innerWidth) / 2, h / 2)
    ctx.restore()
  }
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
  checkResult.value = null; strokeCount = 0
  if (hwDrawing) { try { hwDrawing.clear() } catch {} }
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
  if (hwDrawing && typeof HandwritingStroke !== 'undefined') {
    hwCurStroke = new HandwritingStroke()
    hwCurStroke.addPoint({ x, y, t: Date.now() })
  }
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function extendStroke(e) {
  if (!drawing || !ctx) return
  const { x, y } = getXY(e)
  hwCurStroke?.addPoint({ x, y, t: Date.now() })
  ctx.lineTo(x, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function endStroke() {
  if (!drawing) return
  drawing = false
  strokeCount++
  if (hwCurStroke && hwDrawing) {
    try { hwDrawing.addStroke(hwCurStroke) } catch {}
    hwCurStroke = null
  }
  clearTimeout(autoCheckTimer)
  if (hwApiAvailable) autoCheckTimer = setTimeout(runCheck, 1200)
}

// ── Recognition ──────────────────────────────────────────────────────────────
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

async function runCheck() {
  if (checking.value || checkResult.value === true || strokeCount === 0 || !hwDrawing) return
  checking.value = true
  let passed = false
  try {
    const preds = await hwDrawing.getPrediction()
    passed = preds.some(p => isMatch(p.text ?? '', currentUnit.value))
    if (passed) hwDrawing.clear()
  } catch (err) { console.error('HW recognition:', err) }
  checkResult.value = passed
  checking.value    = false
  if (passed) {
    failCount.value = 0
    if (!isLast.value) setTimeout(() => { clearCanvas(); goNext(); scrollToCurrent() }, 700)
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

const usesHanzi = computed(() => isCJK.value && (mode.value === 'guided' || !hwApiAvailable))

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

// Teleported canvas appears asynchronously after the component mounts.
// Watch the ref so setupCanvas runs the moment the DOM element is available.
watch(canvasEl, (el) => { if (el) setupCanvas() })

onMounted(async () => {
  await initHW()
  if (isCJK.value) nextTick(initWriter)
  else             setupCanvas()   // no-op if canvasEl not yet in DOM; watcher handles that case
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  clearTimeout(autoCheckTimer)
  window.removeEventListener('resize', onResize)
  if (hwRecognizer) { try { hwRecognizer.finish() } catch {} }
})

watch([unitIdx, wordIdx, sentenceIdx], () => {
  quizDone.value = false; checkResult.value = null; failCount.value = 0
  if (usesHanzi.value) nextTick(initWriter)
  else                 nextTick(() => { clearCanvas(); scrollToCurrent() })
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0; wordIdx.value = 0; unitIdx.value = 0
  mode.value = 'guided'; quizActive.value = false; quizDone.value = false
  charError.value = false; writer = null; checkResult.value = null; failCount.value = 0
  await initHW()
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
