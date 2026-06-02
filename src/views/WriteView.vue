<template>
  <div class="flex flex-col gap-6">

    <!-- No story -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg">{{ story.title }}</div>
          <div class="text-xs text-gray-400">{{ LANGS[lang]?.name }}</div>
        </div>
        <div class="text-xs text-gray-400 font-medium">
          <span v-if="isCJK">{{ unitIdx + 1 }} / {{ cjkChars.length }}</span>
          <span v-else>S{{ sentenceIdx + 1 }}/{{ sentences.length }} · W{{ wordIdx + 1 }}/{{ wordsInSentence.length }}</span>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-emerald-400 transition-all duration-300"
          :style="{ width: progressPct + '%' }"
        />
      </div>

      <!-- CJK: Hanzi Writer -->
      <div v-if="isCJK" class="flex flex-col items-center gap-4">
        <div class="text-5xl font-light text-gray-300 select-none">{{ currentUnit }}</div>
        <div
          ref="hanziContainer"
          class="rounded-xl border border-gray-200 bg-gray-50"
          style="width:220px;height:220px"
        />
        <div v-if="charError" class="text-xs text-gray-400">
          Stroke data not available for this character.
        </div>
        <div v-if="quizDone" class="text-emerald-600 font-medium text-sm">✓ Complete!</div>
        <div class="flex gap-3">
          <button
            @click="animate"
            :disabled="!!charError"
            class="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
          >Animate</button>
          <button
            @click="startQuiz"
            :disabled="!!charError || quizActive"
            class="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
          >{{ quizActive ? 'Practising…' : 'Practice' }}</button>
        </div>
      </div>

      <!-- Canvas (script + Latin) -->
      <div v-else class="flex flex-col items-center gap-4">

        <!-- Latin notice -->
        <div
          v-if="isLatin"
          class="text-xs text-gray-400 text-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-100 w-full"
        >
          Handwriting practice is most useful for non-Latin scripts, but you can still trace here freely.
        </div>

        <!-- Target word -->
        <div
          class="text-4xl font-semibold text-center tracking-widest"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ currentUnit }}</div>

        <canvas
          ref="canvas"
          width="300" height="300"
          class="rounded-xl border-2 border-gray-200 bg-white touch-none cursor-crosshair"
          @mousedown="startDraw" @mousemove="moveDraw" @mouseup="stopDraw" @mouseleave="stopDraw"
          @touchstart.prevent="startDraw" @touchmove.prevent="moveDraw" @touchend="stopDraw"
        />

        <div class="flex gap-3">
          <button
            @click="clearCanvas"
            class="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
          >Clear</button>
          <template v-if="isScript">
            <button
              @click="report(true)"
              class="px-4 py-2 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
            >✓ Correct</button>
            <button
              @click="report(false)"
              class="px-4 py-2 text-sm rounded-lg bg-red-400 text-white hover:bg-red-500 transition-all"
            >✗ Wrong</button>
          </template>
        </div>

        <div
          v-if="selfReport !== null"
          class="text-sm font-medium"
          :class="selfReport ? 'text-emerald-600' : 'text-red-500'"
        >{{ selfReport ? 'Marked correct!' : 'Keep practising.' }}</div>

      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-2">
        <button
          @click="goPrev"
          :disabled="isFirst"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-all"
        >← Back</button>
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
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import HanziWriter from 'hanzi-writer'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'

const props = defineProps({ story: Object, lang: String })

const isCJK    = computed(() => ['zh', 'ja'].includes(props.lang))
const isScript = computed(() => ['ar', 'arz', 'he', 'el', 'ru'].includes(props.lang))
const isLatin  = computed(() => !isCJK.value && !isScript.value)

// --- Navigation state ---
const sentenceIdx = ref(0)
const wordIdx     = ref(0)
const unitIdx     = ref(0)

const sentences = computed(() => {
  if (!props.story) return []
  return props.story.text
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
})

const wordsInSentence = computed(() =>
  (sentences.value[sentenceIdx.value] ?? '').trim().split(/\s+/).filter(Boolean)
)

const cjkChars = computed(() => {
  if (!props.story || !isCJK.value) return []
  return [...props.story.text].filter(c => /\p{L}/u.test(c))
})

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

const progressPct = computed(() => {
  if (isCJK.value) {
    return cjkChars.value.length ? ((unitIdx.value + 1) / cjkChars.value.length) * 100 : 0
  }
  const total = sentences.value.reduce(
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0
  )
  const done = sentences.value.slice(0, sentenceIdx.value).reduce(
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0
  ) + wordIdx.value
  return total ? ((done + 1) / total) * 100 : 0
})

function goNext() {
  if (isCJK.value) {
    if (unitIdx.value < cjkChars.value.length - 1) unitIdx.value++
  } else {
    if (wordIdx.value < wordsInSentence.value.length - 1) {
      wordIdx.value++
    } else if (sentenceIdx.value < sentences.value.length - 1) {
      sentenceIdx.value++
      wordIdx.value = 0
    }
  }
}

function goPrev() {
  if (isCJK.value) {
    if (unitIdx.value > 0) unitIdx.value--
  } else {
    if (wordIdx.value > 0) {
      wordIdx.value--
    } else if (sentenceIdx.value > 0) {
      sentenceIdx.value--
      wordIdx.value = wordsInSentence.value.length - 1
    }
  }
}

// --- Hanzi Writer ---
const hanziContainer = ref(null)
const quizActive = ref(false)
const quizDone   = ref(false)
const charError  = ref(false)
let writer = null

function initWriter() {
  if (!hanziContainer.value || !currentUnit.value) return
  hanziContainer.value.innerHTML = ''
  quizActive.value = false
  quizDone.value   = false
  charError.value  = false
  writer = null
  try {
    writer = HanziWriter.create(hanziContainer.value, currentUnit.value, {
      width: 210,
      height: 210,
      padding: 10,
      showOutline: true,
      strokeColor: '#1a1a1a',
      outlineColor: '#d1d5db',
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 300,
      onLoadCharDataError: () => { charError.value = true },
    })
  } catch {
    charError.value = true
  }
}

function animate() { writer?.animateCharacter() }

function startQuiz() {
  if (!writer || quizActive.value) return
  quizActive.value = true
  quizDone.value   = false
  writer.quiz({
    onComplete: () => {
      quizActive.value = false
      quizDone.value   = true
    },
  })
}

// --- Canvas drawing ---
const canvas     = ref(null)
const selfReport = ref(null)
let ctx     = null
let drawing = false

function setupCanvas() {
  if (!canvas.value) return
  ctx = canvas.value.getContext('2d')
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth   = 4
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'
  clearCanvas()
}

function getPos(e) {
  const rect = canvas.value.getBoundingClientRect()
  const src  = e.touches ? e.touches[0] : e
  return {
    x: (src.clientX - rect.left) * (canvas.value.width  / rect.width),
    y: (src.clientY - rect.top)  * (canvas.value.height / rect.height),
  }
}

function startDraw(e) {
  drawing = true
  const p = getPos(e)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function moveDraw(e) {
  if (!drawing) return
  const p = getPos(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function stopDraw() { drawing = false }

function clearCanvas() {
  ctx?.clearRect(0, 0, canvas.value?.width ?? 300, canvas.value?.height ?? 300)
}

function report(correct) { selfReport.value = correct }

// --- Lifecycle & watchers ---
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
  selfReport.value = null
  await nextTick()
  clearCanvas()
})

watch([() => props.lang, () => props.story], async () => {
  sentenceIdx.value = 0
  wordIdx.value     = 0
  unitIdx.value     = 0
  selfReport.value  = null
  quizActive.value  = false
  quizDone.value    = false
  charError.value   = false
  writer = null
  await nextTick()
  if (isCJK.value) initWriter()
  else setupCanvas()
})
</script>
