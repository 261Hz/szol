<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-ink-muted text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <template v-else>

      <!-- ── CJK / Arabic mode toggle ────────────────────────────────── -->
      <div v-if="hasGuidedMode" class="flex gap-0.5">
        <button @click="setMode('write')"
          class="text-xs px-2 py-0.5 rounded-full transition-all"
          :style="mode !== 'guided' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
          write
        </button>
        <button @click="setMode('guided')"
          class="text-xs px-2 py-0.5 rounded-full transition-all"
          :style="mode === 'guided' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
          practice
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

      <!-- ── Navigation (must be before story text — canvas covers content below 280px from bottom) -->
      <div v-if="!usesHanzi" class="flex gap-3">
        <button @click="emit('go', 'retype')"
          class="text-sm px-3 py-1.5 transition-all"
          style="color:#8c7a66; border:1px solid rgba(140,122,102,0.3); border-radius:3px;">
          ← retype
        </button>
        <button @click="emit('go', 'speak')"
          class="text-sm border-b transition-all"
          style="border-color:rgba(139,58,58,0.4); color:#8b3a3a;">
          speak →
        </button>
      </div>

      <!-- ── Full-page story text (write + Arabic practice mode) ────────── -->
      <div v-if="!usesHanzi"
        class="font-serif leading-relaxed select-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        style="color:#2a241c; font-size:1.15rem; padding-bottom:280px; display:flex; flex-wrap:wrap; gap:0.2em 0.35em; align-items:baseline;">
        <span
          v-for="(u, i) in rewriteUnits"
          :key="i"
          :data-current="i === unitIdx ? '1' : undefined"
          :style="unitStyle(i) + (i !== unitIdx ? 'cursor:pointer;' : '')"
          @click="i !== unitIdx && tapWord(u)"
        >{{ u }}</span>
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
          <span v-if="checkResult === true"  class="text-base font-bold" style="color:#38a169">✓</span>
          <span v-else-if="checkResult === false" class="text-base font-bold" style="color:#8b3a3a">✗</span>
          <span v-else-if="checking" class="text-xs" style="color:#8c7a66;">…</span>
          <span v-else class="text-xs" style="color:rgba(140,122,102,0.5);">write the word</span>
          <span
            v-if="recognizedText && checkResult !== null"
            class="text-sm font-serif"
            :style="checkResult ? 'color:#38a169;' : 'color:#8b3a3a;'"
          >{{ recognizedText }}</span>
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

      <!-- Canvas (overflow hidden — scrolled by the strip below) -->
      <div ref="scrollContainerEl" style="overflow:hidden;">
        <canvas
          ref="canvasEl"
          class="block touch-none"
          style="cursor:crosshair; display:block;"
          @pointerdown.prevent="startStroke"
          @pointermove="extendStroke"
          @pointerup="endStroke"
          @pointercancel="endStroke"
          @pointerleave="endStroke"
        />
      </div>
      <!-- Separate scroll strip so the scrollbar is never blocked by canvas pointer events -->
      <div ref="scrollBarEl"
        class="canvas-scroll-strip"
        :style="`overflow-x:auto; overflow-y:hidden; height:32px;${isRTL(lang) ? ' direction:rtl;' : ''}`"
        @scroll.passive="onScrollBarScroll">
        <div :style="`height:1px; width:${canvasCssWidth}px;`" />
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import HanziWriter from 'hanzi-writer'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { googleRecognizeInk } from '../utils/api.js'
import { Capacitor } from '@capacitor/core'
import { DigitalInkRecognition } from '@capacitor-mlkit/digital-ink-recognition'
import { LANGS } from '../data/stories.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

const ML_KIT_LANG = {
  'zh': 'zh-Hans-CN', 'zh-TW': 'zh-Hant-TW', 'ja': 'ja-JP', 'ko': 'ko-KR',
  'ar': 'ar',         'he': 'he-IL',           'ru': 'ru-RU', 'uk': 'uk-UA',
  'bg': 'bg-BG',      'el': 'el-GR',
  'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'it': 'it-IT',
  'pt': 'pt-PT', 'nl': 'nl-NL', 'pl': 'pl-PL', 'sv': 'sv-SE', 'tr': 'tr-TR',
  'hu': 'hu-HU', 'fi': 'fi-FI', 'da': 'da-DK', 'cs': 'cs-CZ', 'ro': 'ro-RO',
}

const props = defineProps({
  story:      Object,
  lang:       String,
  savedWords: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['go', 'saveWord'])

const voices = useVoiceList()

async function speakWord(word) {
  if (!word) return
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.stop().catch(() => {})
    await TextToSpeech.speak({ text: word, lang: bcp47, rate: 1.0, pitch: 1.0, volume: 1.0 }).catch(() => {})
    return
  }
  if (typeof speechSynthesis === 'undefined') return
  const utt   = new SpeechSynthesisUtterance(word)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)
}

const isCJK         = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))
const isArabic      = computed(() => props.lang === 'ar')
const hasGuidedMode = computed(() => isCJK.value || isArabic.value)
const isNative      = computed(() => Capacitor.isNativePlatform())

const arabicLetters = computed(() => {
  if (!isArabic.value || !currentUnit.value) return []
  return [...new Intl.Segmenter('ar', { granularity: 'grapheme' }).segment(currentUnit.value)].map(s => s.segment)
})

function jaSegment(text) {
  const seg = new Intl.Segmenter('ja', { granularity: 'word' })
  return [...seg.segment(text)].filter(s => s.isWordLike).map(s => s.segment)
}

// ── Single source of truth ────────────────────────────────────────────────────
const rewriteUnits = computed(() => {
  if (!props.story) return []
  const text = props.story.content.trim()
  if (props.lang === 'ja') return jaSegment(text)
  if (isCJK.value) return [...text].filter(c => /\p{L}/u.test(c))
  return text.split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
})

const unitIdx = ref(0)

const currentUnit = computed(() => rewriteUnits.value[unitIdx.value] ?? '')
const isFirst     = computed(() => unitIdx.value === 0)
const isLast      = computed(() => unitIdx.value >= rewriteUnits.value.length - 1)

const progressLabel = computed(() => `${unitIdx.value + 1} / ${rewriteUnits.value.length}`)

function normWord(s) {
  return s
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660) // Eastern Arabic-Indic → 0-9
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0) // Extended Arabic-Indic (Persian) → 0-9
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

// Fold katakana → hiragana so recognition variants match (e.g. ア→あ).
function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
}
function normJa(s) { return toHiragana(normWord(s)) }


function goNext() { if (!isLast.value) unitIdx.value++ }

// ── Story text colour helpers ────────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:700; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.3);'

const hwFont = computed(() =>
  props.lang === 'he' ? 'font-family:"Playpen Sans Hebrew",serif;' : ''
)

function isSaved(word) {
  return props.savedWords.has(word.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
}

function unitStyle(i) {
  const f    = hwFont.value
  const word = rewriteUnits.value[i] ?? ''
  const saved = isSaved(word) ? 'text-decoration:underline; text-decoration-style:dotted; text-decoration-color:#8b3a3a; text-underline-offset:3px;' : ''
  if (i < unitIdx.value)   return f + DONE_STYLE + saved
  if (i === unitIdx.value) return f + CURRENT_STYLE
  return f + FUTURE_STYLE + saved
}

function tapWord(word) {
  const clean = word.replace(/[^\p{L}\p{N}]/gu, '')
  if (!clean) return
  emit('saveWord', { word: clean, lang: props.lang, sentence: props.story?.content ?? '', story: props.story?.title ?? '' })
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
const mlkitReady = ref(true)   // false = model not yet ready; true = ready or web

function mlkitLang() { return ML_KIT_LANG[props.lang] || 'en-US' }

async function ensureMLKitModel(retries = 3) {
  if (!Capacitor.isNativePlatform()) return
  const lang = mlkitLang()
  const dbg = (s) => { console.log('[MLKit]', s) }
  dbg(`starting lang=${lang} retries=${retries}`)
  try {
    const { languageTags } = await DigitalInkRecognition.getDownloadedModels()
    dbg(`getDownloadedModels=${JSON.stringify(languageTags)}`)
    if (languageTags.includes(lang)) {
      dbg('already downloaded'); mlkitReady.value = true; return
    }
    mlkitReady.value = false
    dbg('calling downloadModel')
    await DigitalInkRecognition.downloadModel({ languageTag: lang })
    dbg('ready'); mlkitReady.value = true
  } catch (err) {
    dbg(`failed: ${err?.message ?? err}`)
    mlkitReady.value = false
    if (retries > 0) {
      dbg(`retry in 10s (${retries - 1} left)`)
      await new Promise(r => setTimeout(r, 10_000))
      ensureMLKitModel(retries - 1)
    }
  }
}

const canvasEl          = ref(null)
const scrollContainerEl = ref(null)
const scrollBarEl       = ref(null)

function setScrollLeft(val) {
  if (scrollBarEl.value) scrollBarEl.value.scrollLeft = val
  if (scrollContainerEl.value) {
    // RTL scrollbar: val=0 is right end, negative values go left.
    // Container has no direction:rtl, so its scrollLeft=0 is the left end.
    // Convert: containerSL = maxScroll + val (val ≤ 0 for RTL).
    const containerVal = isRTL(props.lang)
      ? (canvasCssWidth.value - window.innerWidth) + val
      : val
    scrollContainerEl.value.scrollLeft = containerVal
  }
}

function onScrollBarScroll(e) {
  if (!scrollContainerEl.value) return
  const containerVal = isRTL(props.lang)
    ? (canvasCssWidth.value - window.innerWidth) + e.target.scrollLeft
    : e.target.scrollLeft
  scrollContainerEl.value.scrollLeft = containerVal
}
const checking        = ref(false)
const checkResult     = ref(null)
const recognizedText  = ref(null)   // top candidate from last recognition run
const failCount       = ref(0)
let ctx            = null
let autoCheckTimer = null
let drawing        = false
const canvasCssWidth = ref(0)

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
  const dpr       = window.devicePixelRatio || 1
  const viewportW = window.innerWidth
  const wordLen   = currentUnit.value.length || 1
  canvasCssWidth.value  = Math.max(viewportW * 2, wordLen * 90 + 60)
  el.width              = canvasCssWidth.value * dpr
  el.height             = CANVAS_HEIGHT        * dpr
  el.style.width        = canvasCssWidth.value + 'px'
  el.style.height = CANVAS_HEIGHT  + 'px'
  ctx = el.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  clearCanvas()
  if (usesArabicGuide.value) drawArabicTemplate()
}

async function drawArabicTemplate() {
  if (!ctx || !currentUnit.value) return
  const vw       = window.innerWidth
  const sl       = isRTL(props.lang) ? Math.max(0, canvasCssWidth.value - window.innerWidth) : 0
  const baseline = Math.round(CANVAS_HEIGHT * 0.65)
  const fontSize = Math.round(CANVAS_HEIGHT * 0.52)

  await document.fonts.load(`bold ${fontSize}px "Amiri"`)

  // Baseline rule across visible width
  ctx.save()
  ctx.strokeStyle = 'rgba(140,122,102,0.3)'
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(sl + 20, baseline); ctx.lineTo(sl + vw - 20, baseline); ctx.stroke()
  ctx.restore()

  // Faded word sitting on baseline (offset to visible area)
  ctx.save()
  ctx.direction    = 'rtl'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font         = `bold ${fontSize}px "Amiri", serif`
  ctx.fillStyle    = 'rgba(140,122,102,0.2)'
  ctx.fillText(currentUnit.value, sl + vw / 2, baseline)
  ctx.restore()

  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
}

function clearCanvas() {
  clearTimeout(autoCheckTimer)
  userStrokes = []; currentStrokePts = []
  setScrollLeft(0)
  if (hwRecognizer) resetHwDrawing()
  if (!ctx || !canvasEl.value) return
  const w = canvasCssWidth.value || window.innerWidth
  ctx.clearRect(0, 0, w, CANVAS_HEIGHT)
  ctx.strokeStyle = INK_COLOR; ctx.fillStyle = INK_COLOR; ctx.lineWidth = 3
  checkResult.value   = null
  recognizedText.value = null
  if (usesArabicGuide.value) drawArabicTemplate()
}

function getXY(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

// Some mobile browsers only allow speechSynthesis to produce audio if speak()
// has been called synchronously inside a user gesture at least once -- later
// async calls (e.g. speakWord() after recognition finishes) go silent
// otherwise. Priming here piggybacks on the pointerdown gesture that starts
// every stroke.
let speechPrimed = false
function primeSpeech() {
  if (speechPrimed || typeof speechSynthesis === 'undefined' || Capacitor.isNativePlatform()) return
  speechPrimed = true
  speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

function startStroke(e) {
  primeSpeech()
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
    userStrokes.push([...currentStrokePts])
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

// ── Recognition ──────────────────────────────────────────────────────────────
async function runCheck() {
  if (checking.value || checkResult.value === true || userStrokes.length === 0) return
  checking.value = true
  recognizedText.value = null
  let passed = false

  if (Capacitor.isNativePlatform() && mlkitReady.value) {
    // Native: ML Kit Digital Ink Recognition for all languages, fully on-device.
    const result = await DigitalInkRecognition.recognize({
      languageTag: mlkitLang(),
      strokes: userStrokes.map(s => ({ points: s.map(p => ({ x: p.x, y: p.y })) })),
      writingArea: { width: canvasCssWidth.value || window.innerWidth, height: CANVAS_HEIGHT },
    }).catch((err) => { console.warn('[MLKit] recognize failed:', err); return null })
    const candidates = result?.candidates?.map(c => c.text) ?? []
    const top        = normWord(candidates[0] ?? '')
    const want       = normWord(currentUnit.value)
    const minStrokes = isCJK.value || isArabic.value ? 1 : want.length
    recognizedText.value = candidates[0] ?? null
    passed = top !== '' && top === want && userStrokes.length >= minStrokes
  } else if (isCJK.value) {
    // CJK / Japanese freeform: Google Handwriting Input
    const result = await googleRecognizeInk(userStrokes, props.lang, canvasCssWidth.value, CANVAS_HEIGHT)
    const top = result?.candidates?.[0] ?? result?.text ?? null
    recognizedText.value = top
    const norm = props.lang === 'ja' ? normJa : normWord
    const want = norm(currentUnit.value)
    passed = top !== null && want !== '' && userStrokes.length >= 1 && norm(top) === want
  } else if (hwDrawing) {
    // Web non-CJK: W3C Handwriting Recognition API (Chromium, on-device, zero deps)
    const predictions = await hwDrawing.getPrediction().catch(() => null)
    const top  = predictions?.[0]?.text ?? null
    const got  = normWord(top ?? '')
    const want = normWord(currentUnit.value)
    const minStrokes = isArabic.value ? 1 : want.length
    recognizedText.value = top
    passed = got !== '' && got === want && userStrokes.length >= minStrokes
  } else {
    // Web / native fallback: Google Handwriting Input via backend proxy.
    // Top candidate only — checking deeper candidates accepts words the model
    // didn't actually recognise (shows candidates[0] in green but matched on candidates[5]).
    const result = await googleRecognizeInk(userStrokes, props.lang, canvasCssWidth.value, CANVAS_HEIGHT)
    const candidates = result?.candidates ?? (result?.text ? [result.text] : [])
    const top  = candidates[0] ?? null
    recognizedText.value = top
    const got  = normWord(top ?? '')
    const want = normWord(currentUnit.value)
    const minStrokes = isArabic.value ? 1 : want.length
    passed = got !== '' && got === want && userStrokes.length >= minStrokes
  }

  checkResult.value = passed
  checking.value    = false
  if (passed) {
    speakWord(currentUnit.value)
    setScrollLeft(0)
    failCount.value = 0
    if (!isLast.value) setTimeout(() => { goNext(); scrollToCurrent() }, 600)
  } else {
    failCount.value++
  }
}

// ── HanziWriter ──────────────────────────────────────────────────────────────
const mode           = ref('write')
const hanziContainer = ref(null)
const quizActive     = ref(false)
const quizDone       = ref(false)
const charError      = ref(false)
let writer = null

const usesHanzi       = computed(() => isCJK.value    && mode.value === 'guided')
const usesArabicGuide = computed(() => isArabic.value && mode.value === 'guided')

function setMode(m) {
  mode.value = m
  checkResult.value = null; failCount.value = 0
  if (m === 'guided' && isCJK.value) nextTick(initWriter)
  else                               nextTick(setupCanvas)
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
      speakWord(currentUnit.value)
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
  else                 nextTick(() => { setupCanvas(); scrollToCurrent() })
})

watch([() => props.lang, () => props.story], () => {
  unitIdx.value = 0
  mode.value = 'write'; quizActive.value = false; quizDone.value = false
  charError.value = false; writer = null; checkResult.value = null; failCount.value = 0
  if (isCJK.value) nextTick(initWriter)
  else             setupCanvas()
  ensureMLKitModel()
  nextTick(initHandwritingRecognizer)
})
</script>

<style scoped>
/* Canvas scroll strip — tall hit area, chunky thumb easy to drag on touch */
.canvas-scroll-strip::-webkit-scrollbar { height: 20px; }
.canvas-scroll-strip::-webkit-scrollbar-track {
  background: rgba(140,122,102,0.1);
  border-radius: 10px;
  margin: 0 8px;
}
.canvas-scroll-strip::-webkit-scrollbar-thumb {
  background: rgba(140,122,102,0.55);
  border-radius: 10px;
  border: 4px solid transparent;
  background-clip: content-box;
}
.canvas-scroll-strip::-webkit-scrollbar-thumb:active {
  background: rgba(140,122,102,0.8);
  background-clip: content-box;
}
.canvas-scroll-strip {
  scrollbar-width: auto;
  scrollbar-color: rgba(140,122,102,0.55) rgba(140,122,102,0.1);
}

.hanzi-container {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  background: #fefce8;
  overflow: hidden;
}
</style>
