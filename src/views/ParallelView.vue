<template>
  <div class="flex flex-col gap-4">

    <!-- Language pair selector -->
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-gray-500">Read in</span>
      <select v-model="readLang" @change="resetStory" class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none">
        <option v-for="code in availableReadLangs" :key="code" :value="code">{{ LANG_NAMES[code] ?? code }}</option>
      </select>
      <span class="text-xs text-gray-500">→ translate to</span>
      <select v-model="toLang" @change="resetStory" class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none">
        <option v-for="code in availableToLangs" :key="code" :value="code">{{ LANG_NAMES[code] ?? code }}</option>
      </select>
      <span v-if="sameLang" class="text-xs text-yellow-500">Pick two different languages.</span>
    </div>

    <!-- Story picker -->
    <div v-if="!story" class="flex flex-col gap-2">
      <div v-if="filteredStories.length === 0" class="text-sm text-gray-500 text-center py-6">
        No stories available for this language pair yet.
      </div>
      <button
        v-for="s in filteredStories"
        :key="s.id"
        @click="pickStory(s)"
        class="w-full text-left bg-slate-900 border border-gray-700 hover:border-violet-700 rounded-xl px-4 py-3 transition-all"
      >
        <div class="text-sm font-medium text-gray-100" :dir="isRTL(readLang) ? 'rtl' : 'ltr'">
          {{ s.titles[readLang] ?? s.titles.en }}
        </div>
        <div class="text-xs text-gray-500 mt-0.5">{{ s.author }} · {{ s.texts[readLang].length }} paragraphs</div>
      </button>
    </div>

    <!-- Translation exercise -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-start gap-3">
        <button @click="resetStory" class="flex-shrink-0 text-gray-500 hover:text-white text-lg leading-none pt-0.5 transition-all">←</button>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <h2 class="font-semibold text-gray-100 text-base leading-snug" :dir="isRTL(readLang) ? 'rtl' : 'ltr'">
            {{ story.titles[readLang] ?? story.titles.en }}
          </h2>
          <div class="text-xs text-gray-500">
            {{ story.author }}
            · Paragraph {{ paraIdx + 1 }} / {{ story.texts[readLang].length }}
            · <span class="text-violet-400">{{ LANG_NAMES[readLang] }}</span>
            → <span class="text-emerald-400">{{ LANG_NAMES[toLang] }}</span>
          </div>
        </div>
      </div>

      <!-- L2 source paragraph -->
      <div
        class="bg-slate-900 border border-violet-800/50 rounded-xl px-4 py-4 text-sm text-gray-100 leading-relaxed"
        :dir="isRTL(readLang) ? 'rtl' : 'ltr'"
      >{{ currentL2 }}</div>

      <!-- Translation input -->
      <textarea
        v-model="userInput"
        rows="4"
        :placeholder="`Your ${LANG_NAMES[toLang] ?? toLang} translation…`"
        :dir="isRTL(toLang) ? 'rtl' : 'ltr'"
        class="w-full bg-slate-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-600 resize-none placeholder:text-gray-600 transition-all"
      />

      <!-- Check + result -->
      <div class="flex flex-col gap-2">
        <button
          @click="checkMyTranslation"
          :disabled="!userInput.trim() || checking"
          class="self-start text-xs px-4 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >{{ checking ? 'Checking…' : 'Check translation' }}</button>

        <div v-if="checkResult" class="flex items-center gap-2 flex-wrap">
          <span
            :class="['text-sm font-bold px-2.5 py-0.5 rounded-full',
              checkResult.score >= 80 ? 'bg-emerald-900 text-emerald-300' :
              checkResult.score >= 55 ? 'bg-yellow-900 text-yellow-300' :
                                         'bg-red-900 text-red-300']"
          >{{ checkResult.score }}%</span>
          <span class="text-xs text-gray-400 leading-snug">{{ checkResult.feedback }}</span>
        </div>
      </div>

      <!-- Reference paragraph (gated) -->
      <div class="flex flex-col gap-2">
        <button
          v-if="userInput.trim() || checkResult"
          @click="showRef = !showRef"
          :class="['self-start text-xs px-3 py-1.5 rounded-md border transition-all',
            showRef ? 'border-amber-600 text-amber-400' : 'border-gray-700 text-gray-500 hover:border-amber-700 hover:text-amber-400']"
        >{{ showRef ? 'Hide reference' : 'Show reference' }}</button>

        <div v-if="showRef">
          <div
            v-if="currentL1"
            class="bg-slate-900 border border-amber-800/40 rounded-xl px-4 py-4 text-sm text-amber-100/80 leading-relaxed"
            :dir="isRTL(toLang) ? 'rtl' : 'ltr'"
          >{{ currentL1 }}</div>
          <div v-else class="text-xs text-gray-600 py-2">
            No {{ LANG_NAMES[toLang] }} version available for this paragraph.
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between items-center pt-1">
        <button
          @click="prevPara"
          :disabled="paraIdx === 0"
          class="text-xs px-4 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-violet-700 hover:text-violet-400 disabled:opacity-30 transition-all"
        >← Previous</button>
        <button
          @click="nextPara"
          :disabled="paraIdx >= story.texts[readLang].length - 1"
          class="text-xs px-4 py-1.5 rounded-md bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 transition-all"
        >Next →</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { PARALLEL_STORIES } from '../data/parallel-stories.js'
import { checkTranslation } from '../utils/api.js'
import { isRTL } from '../utils/rtl.js'
import { LANGS } from '../data/stories.js'

const props = defineProps({ lang: String, currentUser: Object })

const LANG_NAMES = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.name]))

// All language codes that appear in at least one story
const allLangs = [...new Set(PARALLEL_STORIES.flatMap(s => s.langs))]

const readLang = ref(props.lang && allLangs.includes(props.lang) ? props.lang : 'fr')
const toLang   = ref('en')

watch(() => props.lang, l => {
  if (l && allLangs.includes(l) && l !== readLang.value) { readLang.value = l; resetStory() }
})

const sameLang = computed(() => readLang.value === toLang.value)

const availableReadLangs = computed(() => allLangs.filter(c => c !== toLang.value))
const availableToLangs   = computed(() => allLangs.filter(c => c !== readLang.value))

const filteredStories = computed(() =>
  sameLang.value ? [] : PARALLEL_STORIES.filter(s => s.langs.includes(readLang.value))
)

// ── Story / paragraph state ───────────────────────────────────────────────────

const story       = ref(null)
const paraIdx     = ref(0)
const userInput   = ref('')
const checkResult = ref(null)
const checking    = ref(false)
const showRef     = ref(false)

const currentL2 = computed(() => story.value?.texts[readLang.value]?.[paraIdx.value] ?? '')
const currentL1 = computed(() => {
  if (!story.value) return null
  const arr = story.value.texts[toLang.value]
  if (!arr?.length) return null
  // closest paragraph index — the two versions may have different counts
  const i = Math.min(paraIdx.value, arr.length - 1)
  return arr[i] ?? null
})

function pickStory(s) {
  story.value       = s
  paraIdx.value     = 0
  userInput.value   = ''
  checkResult.value = null
  showRef.value     = false
}

function resetStory() {
  story.value       = null
  paraIdx.value     = 0
  userInput.value   = ''
  checkResult.value = null
  showRef.value     = false
}

// ── Translation check ─────────────────────────────────────────────────────────

async function checkMyTranslation() {
  if (!currentL2.value || !userInput.value.trim() || checking.value) return
  checking.value    = true
  checkResult.value = null
  checkResult.value = await checkTranslation(
    currentL2.value,
    userInput.value.trim(),
    readLang.value,
    toLang.value,
  )
  checking.value = false
}

// ── Navigation ────────────────────────────────────────────────────────────────

function nextPara() {
  if (!story.value || paraIdx.value >= story.value.texts[readLang.value].length - 1) return
  paraIdx.value++
  userInput.value   = ''
  checkResult.value = null
  showRef.value     = false
}

function prevPara() {
  if (paraIdx.value === 0) return
  paraIdx.value--
  userInput.value   = ''
  checkResult.value = null
  showRef.value     = false
}
</script>
