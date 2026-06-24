<template>
  <div class="flex flex-col gap-4">

    <div v-if="!story" class="text-ink-muted text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <template v-else>

      <!-- ── Story text (flows like Retype) ───────────────────────────── -->
      <div class="rounded-2xl px-5 py-4" style="background:#fefce8; border:1px solid #e8dcc8;">
        <div class="font-serif leading-relaxed text-base" :dir="isRTL(lang) ? 'rtl' : 'ltr'" style="color:#2a241c;">

          <template v-if="isCJK">
            <span v-for="(ch, ci) in cjkChars" :key="ci" :style="cjkCharStyle(ci)">{{ ch }}</span>
          </template>

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
            <!-- CJK guided/freehand toggle -->
            <div v-if="isCJK" class="flex gap-0.5">
              <button @click="mode = 'guided'"
                class="text-xs px-2 py-0.5 rounded-full transition-all"
                :style="mode === 'guided' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
                guided
              </button>
              <button @click="mode = 'write'"
                class="text-xs px-2 py-0.5 rounded-full transition-all"
                :style="mode === 'write' ? 'background:#2a2018; color:#e8dcc4;' : 'color:rgba(26,26,46,0.38);'">
                write
              </button>
            </div>
            <button @click="toggleFullscreen"
              class="text-amber-700/50 hover:text-amber-800 text-lg transition-colors">
              {{ isFullscreen ? '⊠' : '⛶' }}
            </button>
          </div>
        </div>

        <!-- CJK guided (HanziWriter) -->
        <div v-if="isCJK && mode === 'guided'" class="flex flex-col items-center gap-3 pb-5 px-5">
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

        <!-- Text input (CJK write mode + all non-CJK) -->
        <div v-else class="flex flex-col gap-3 pb-5 px-5 pt-3">
          <input
            ref="inputEl"
            v-model="inputText"
            type="text"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
            :disabled="checkResult === true"
            @keydown.enter="runCheck"
            class="w-full rounded-xl px-4 py-3 text-2xl font-serif outline-none transition-all"
            style="background:#fefce8; border:1.5px solid rgba(140,122,102,0.4); color:#1a1a2e;"
            :style="inputBorderStyle"
            placeholder="…"
          />

          <!-- hint after 2 failed attempts -->
          <div v-if="failCount >= 2" class="text-center text-sm" style="color:rgba(140,122,102,0.6);">
            {{ currentUnit }}
          </div>

          <div class="flex gap-3 justify-center">
            <button @click="inputText = ''; inputEl?.focus()"
              class="px-4 py-2 text-sm rounded-lg border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-all">
              Clear
            </button>
            <button @click="runCheck" :disabled="!inputText.trim() || checkResult === true"
              class="px-4 py-2 text-sm rounded-lg bg-amber-700 text-amber-50 hover:bg-amber-600 disabled:opacity-50 transition-all">
              Check
            </button>
          </div>

          <div v-if="checkResult !== null" class="text-center text-2xl font-bold"
            :class="checkResult ? 'text-green-700' : 'text-red-600'">
            {{ checkResult ? '✓ Pass' : '✗ Fail' }}
          </div>
        </div>

      </div>

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

const props = defineProps({ story: Object, lang: String })

const isCJK = computed(() => ['zh', 'zh-TW', 'ja'].includes(props.lang))

// ── Handwriting font per script ─────────────────────────────────────────────────
const handwritingStyle = computed(() => {
  if (['zh', 'zh-TW'].includes(props.lang)) return { fontFamily: "'Zhi Mang Xing', cursive",     fontSize: '4rem' }
  if (props.lang === 'ja')                  return { fontFamily: "'Kaisei Tokumin', serif",       fontSize: '4rem' }
  if (['ar', 'arz'].includes(props.lang))   return { fontFamily: "'Amiri', serif",                fontSize: '3.5rem' }
  if (props.lang === 'he')                  return { fontFamily: "'Playpen Sans Hebrew', cursive", fontSize: '4rem' }
  return { fontFamily: "'Patrick Hand', cursive", fontSize: '4rem' }
})

// ── Sentences / words / CJK chars ───────────────────────────────────────────────
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

// ── Story text styling (Retype-like) ────────────────────────────────────────────
const DONE_STYLE    = 'color:#8c7a66;'
const CURRENT_STYLE = 'color:#2a241c; font-weight:600; border-bottom:2px solid #8b3a3a; padding-bottom:1px;'
const FUTURE_STYLE  = 'color:rgba(140,122,102,0.4);'

function cjkCharStyle(ci) {
  if (ci < unitIdx.value)   return DONE_STYLE
  if (ci === unitIdx.value)  return CURRENT_STYLE
  return FUTURE_STYLE
}

function wordStyle(si, wi) {
  const before = si < sentenceIdx.value || (si === sentenceIdx.value && wi < wordIdx.value)
  const isCurr = si === sentenceIdx.value && wi === wordIdx.value
  return before ? DONE_STYLE : isCurr ? CURRENT_STYLE : FUTURE_STYLE
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
  if (isCJK.value && mode.value === 'guided') nextTick(initWriter)
}

// ── Input state ──────────────────────────────────────────────────────────────────
const inputEl     = ref(null)
const inputText   = ref('')
const checkResult = ref(null)
const failCount   = ref(0)

// Highlight input border on focus (handled via CSS :focus-within alternative using inline style)
const inputBorderStyle = computed(() =>
  checkResult.value === true  ? 'border-color:#38a169;' :
  checkResult.value === false ? 'border-color:#8b3a3a;' : ''
)

function normText(s) {
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

function runCheck() {
  if (!inputText.value.trim() || checkResult.value === true) return
  const got    = normText(inputText.value)
  const target = normText(currentUnit.value)
  const maxErr = isCJK.value ? 0 : Math.max(1, Math.floor(target.length / 4))
  const passed = levenshtein(got, target) <= maxErr

  checkResult.value = passed
  if (passed) {
    failCount.value = 0
    if (!isLast.value) setTimeout(goNext, 800)
  } else {
    failCount.value++
  }
}

function resetInput() {
  inputText.value   = ''
  checkResult.value = null
  nextTick(() => inputEl.value?.focus())
}

// ── HanziWriter ──────────────────────────────────────────────────────────────────
const mode           = ref('guided')  // 'guided' | 'write'
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
      if (!isLast.value) setTimeout(goNext, 1000)
    }
  })
}

// ── Watchers & lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  nextTick(() => {
    if (isCJK.value) initWriter()
    else inputEl.value?.focus()
  })
})

onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

watch([unitIdx, wordIdx, sentenceIdx], () => {
  quizDone.value = false
  resetInput()
  if (isCJK.value && mode.value === 'guided') nextTick(initWriter)
})

watch(mode, () => {
  resetInput()
  if (mode.value === 'guided') nextTick(initWriter)
})

watch([() => props.lang, () => props.story], () => {
  sentenceIdx.value = 0; wordIdx.value = 0; unitIdx.value = 0
  mode.value = 'guided'; quizActive.value = false; quizDone.value = false
  charError.value = false; writer = null
  resetInput()
  if (isCJK.value) nextTick(initWriter)
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
