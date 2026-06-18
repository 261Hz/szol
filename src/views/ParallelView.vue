<template>
  <div class="flex flex-col gap-4">

    <!-- Language pair selector -->
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-gray-500">Read in</span>
      <select v-model="readLang" @change="reset" class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none">
        <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
      </select>
      <span class="text-xs text-gray-500">→ translate to</span>
      <select v-model="toLang" @change="reset" class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none">
        <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
      </select>
      <span v-if="sameLang" class="text-xs text-yellow-500">Pick two different languages.</span>
    </div>

    <!-- Picker -->
    <div v-if="!article" class="flex flex-col gap-4">

      <!-- Source tabs -->
      <div class="flex gap-1 border-b border-gray-800 pb-0">
        <button
          v-for="s in SOURCES"
          :key="s.key"
          @click="activeSource = s.key; searchResults = []; searchQuery = ''; loadError = ''"
          :class="['text-xs px-3 py-1.5 -mb-px border-b-2 transition-all',
            activeSource === s.key ? 'border-violet-500 text-violet-400' : 'border-transparent text-gray-500 hover:text-gray-300']"
        >{{ s.label }}</button>
      </div>

      <!-- Search bar -->
      <div class="flex gap-2">
        <input
          v-model="searchQuery"
          @keydown.enter="doSearch"
          :placeholder="activeSource === 'wiki'
            ? `Search Wikipedia in ${LANGS[readLang]?.name ?? readLang}…`
            : `Search Wikisource in ${LANGS[readLang]?.name ?? readLang}… (Alice, Kafka, Grimm…)`"
          class="flex-1 bg-slate-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-600 placeholder:text-gray-600 transition-all"
        />
        <button
          @click="doSearch"
          :disabled="searching || !searchQuery.trim() || sameLang"
          class="text-xs px-4 py-2 rounded-lg bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 transition-all"
        >{{ searching ? '…' : 'Search' }}</button>
      </div>

      <!-- Results -->
      <div v-if="searchResults.length" class="flex flex-col gap-2">
        <button
          v-for="r in searchResults"
          :key="r.id ?? r.title"
          @click="loadResult(r)"
          class="w-full text-left bg-slate-900 border border-gray-700 hover:border-violet-700 rounded-lg px-4 py-3 transition-all"
        >
          <div class="text-sm font-medium text-gray-100" :dir="isRTL(readLang) ? 'rtl' : 'ltr'">{{ r.title }}</div>
          <div v-if="r.description" class="text-xs text-gray-500 mt-0.5 truncate">{{ r.description }}</div>
        </button>
      </div>

      <div v-if="loadError" class="text-sm text-red-400 text-center py-2">{{ loadError }}</div>
      <div v-if="loading || searching" class="text-sm text-gray-500 text-center py-4">Loading…</div>

      <!-- Featured quick-starts (Aesop) -->
      <div v-if="!searchResults.length && !loading && !searching" class="flex flex-col gap-2">
        <div class="text-xs text-gray-600 uppercase tracking-wider">Featured</div>
        <button
          v-for="s in featuredStories"
          :key="s.id"
          @click="loadStaticStory(s)"
          :disabled="sameLang || !s.texts[readLang]"
          class="w-full text-left bg-slate-900 border border-gray-700 hover:border-violet-700 rounded-xl px-4 py-3 transition-all disabled:opacity-30"
        >
          <div class="text-sm font-medium text-gray-100">{{ s.titles[readLang] ?? s.titles.en }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ s.author }}</div>
        </button>
      </div>

    </div>

    <!-- Translation exercise -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-start gap-3">
        <button @click="reset" class="flex-shrink-0 text-gray-500 hover:text-white text-lg leading-none pt-0.5 transition-all">←</button>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <h2 class="font-semibold text-gray-100 text-base leading-snug" :dir="isRTL(readLang) ? 'rtl' : 'ltr'">{{ article.title }}</h2>
          <div class="text-xs text-gray-500">
            Paragraph {{ paraIdx + 1 }} / {{ article.paragraphs.length }}
            · <span class="text-violet-400">{{ LANGS[readLang]?.name }}</span>
            → <span class="text-emerald-400">{{ LANGS[toLang]?.name }}</span>
          </div>
        </div>
      </div>

      <!-- L2 source paragraph -->
      <div
        class="bg-slate-900 border border-violet-800/50 rounded-xl px-4 py-4 text-sm text-gray-100 leading-relaxed"
        :dir="isRTL(readLang) ? 'rtl' : 'ltr'"
      >{{ currentPara.l2 }}</div>

      <!-- Translation input -->
      <textarea
        v-model="userInput"
        rows="4"
        :placeholder="`Your ${LANGS[toLang]?.name ?? toLang} translation…`"
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

      <!-- Reference (gated) -->
      <div class="flex flex-col gap-2">
        <button
          v-if="userInput.trim() || checkResult"
          @click="showRef = !showRef"
          :class="['self-start text-xs px-3 py-1.5 rounded-md border transition-all',
            showRef ? 'border-amber-600 text-amber-400' : 'border-gray-700 text-gray-500 hover:border-amber-700 hover:text-amber-400']"
        >{{ showRef ? 'Hide reference' : 'Show reference' }}</button>

        <div v-if="showRef">
          <div
            v-if="currentPara.l1"
            class="bg-slate-900 border border-amber-800/40 rounded-xl px-4 py-4 text-sm text-amber-100/80 leading-relaxed"
            :dir="isRTL(toLang) ? 'rtl' : 'ltr'"
          >{{ currentPara.l1 }}</div>
          <div v-else class="text-xs text-gray-600 py-2">No reference available for this paragraph.</div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between items-center pt-1">
        <button
          @click="prevPara"
          :disabled="paraIdx === 0"
          class="text-xs px-4 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:border-violet-700 hover:text-violet-400 disabled:opacity-30 transition-all"
        >← Prev</button>
        <button
          @click="nextPara"
          :disabled="paraIdx >= article.paragraphs.length - 1"
          class="text-xs px-4 py-1.5 rounded-md bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 transition-all"
        >Next →</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LANGS } from '../data/stories.js'
import { PARALLEL_STORIES } from '../data/parallel-stories.js'
import { checkTranslation } from '../utils/api.js'
import { isRTL } from '../utils/rtl.js'

const props = defineProps({ lang: String, currentUser: Object })

const SOURCES = [
  { key: 'books', label: 'Wikisource' },
  { key: 'wiki',  label: 'Wikipedia' },
]

const readLang     = ref(props.lang ?? 'fr')
const toLang       = ref('en')
const activeSource = ref('books')

watch(() => props.lang, l => { if (l && l !== readLang.value) { readLang.value = l; reset() } })

const sameLang = computed(() => readLang.value === toLang.value)

const featuredStories = computed(() => PARALLEL_STORIES.filter(s => s.texts[readLang.value]))

// ── Search ────────────────────────────────────────────────────────────────────

const searchQuery   = ref('')
const searchResults = ref([])
const searching     = ref(false)
const loadError     = ref('')
const loading       = ref(false)

async function doSearch() {
  if (!searchQuery.value.trim() || sameLang.value) return
  activeSource.value === 'books' ? await searchWikisource() : await searchWiki()
}

async function searchWikisource() {
  searching.value     = true
  searchResults.value = []
  loadError.value     = ''
  try {
    const url    = `https://${readLang.value}.wikisource.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery.value)}&limit=10&namespace=0&format=json&origin=*`
    const data   = await fetch(url).then(r => r.json())
    const titles = data[1] ?? []
    if (!titles.length) { loadError.value = 'No results.'; return }

    // Batch-check which results have a translation in toLang
    const llUrl  = `https://${readLang.value}.wikisource.org/w/api.php?action=query&prop=langlinks&lllang=${toLang.value}&titles=${titles.map(encodeURIComponent).join('|')}&format=json&origin=*`
    const llData = await fetch(llUrl).then(r => r.json())
    const withTx = new Set(
      Object.values(llData.query?.pages ?? {})
        .filter(p => p.langlinks?.length)
        .map(p => p.title)
    )

    searchResults.value = titles
      .filter(t => withTx.has(t))
      .map(title => ({ title }))

    if (!searchResults.value.length)
      loadError.value = `No results with a ${LANGS[toLang.value]?.name} translation on Wikisource.`
  } catch {
    loadError.value = 'Search failed.'
  } finally {
    searching.value = false
  }
}

async function searchWiki() {
  searching.value     = true
  searchResults.value = []
  loadError.value     = ''
  try {
    const url  = `https://${readLang.value}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery.value)}&limit=8&namespace=0&format=json&origin=*`
    const data = await fetch(url).then(r => r.json())
    searchResults.value = (data[1] ?? []).map((title, i) => ({
      title,
      description: data[2]?.[i] ?? '',
    }))
    if (!searchResults.value.length) loadError.value = 'No results.'
  } catch {
    loadError.value = 'Search failed.'
  } finally {
    searching.value = false
  }
}

// ── Article state ─────────────────────────────────────────────────────────────

const article     = ref(null)
const paraIdx     = ref(0)
const userInput   = ref('')
const checkResult = ref(null)
const checking    = ref(false)
const showRef     = ref(false)

const currentPara = computed(() => article.value?.paragraphs?.[paraIdx.value] ?? { l2: '', l1: null })

async function loadResult(r) {
  activeSource.value === 'books' ? await loadWikisourcePage(r) : await loadWikiArticle(r)
}

async function loadWikisourcePage(result) {
  loading.value   = true
  loadError.value = ''
  article.value   = null
  try {
    // Fetch L2 text + langlink to L1 in one call
    const url  = `https://${readLang.value}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(result.title)}&prop=text|langlinks&lllang=${toLang.value}&disableeditsection=1&format=json&origin=*`
    const data = await fetch(url).then(r => r.json())
    if (data.error) { loadError.value = data.error.info ?? 'Page not found.'; return }

    const l2Paras = parseWikisourceHTML(data.parse?.text?.['*'] ?? '')
    if (!l2Paras.length) { loadError.value = 'No readable text found. Try a chapter page.'; return }

    // Fetch L1 translation in parallel if langlink exists
    const l1Title = data.parse?.langlinks?.find(l => l.lang === toLang.value)?.['*'] ?? null
    let l1Paras = []
    if (l1Title) {
      const l1Url  = `https://${toLang.value}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(l1Title)}&prop=text&disableeditsection=1&format=json&origin=*`
      const l1Data = await fetch(l1Url).then(r => r.json()).catch(() => null)
      if (l1Data?.parse) l1Paras = parseWikisourceHTML(l1Data.parse.text?.['*'] ?? '')
    }

    article.value = {
      title:      data.parse.title,
      paragraphs: l2Paras.map((l2, i) => ({ l2, l1: l1Paras[i] ?? null })),
    }
    resetExercise()
  } catch {
    loadError.value = 'Could not load page.'
  } finally {
    loading.value = false
  }
}

function parseWikisourceHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Remove noise: references, TOC, navigation, categories, edit links
  doc.querySelectorAll(
    '.reference, .reflist, .toc, .noprint, .ws-noexport, ' +
    '.mw-editsection, sup, .mw-headline, table, .poem'
  ).forEach(el => el.remove())

  return [...doc.querySelectorAll('.mw-parser-output p')]
    .map(p => p.textContent.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 80)
}

async function loadWikiArticle(result) {
  loading.value   = true
  loadError.value = ''
  article.value   = null
  try {
    const l2Url  = `https://${readLang.value}.wikipedia.org/w/api.php?action=query&prop=extracts|langlinks&exintro=true&explaintext=true&lllang=${toLang.value}&titles=${encodeURIComponent(result.title)}&format=json&origin=*`
    const l2Data = await fetch(l2Url).then(r => r.json())
    const page   = Object.values(l2Data.query?.pages ?? {})[0]
    if (!page || page.missing !== undefined) { loadError.value = 'Article not found.'; return }

    const l2Paras = toParas((page.extract ?? '').trim())
    if (!l2Paras.length) { loadError.value = 'Article has no readable content.'; return }

    let l1Paras = []
    const l1Title = page.langlinks?.[0]?.title ?? null
    if (l1Title) {
      const l1Url  = `https://${toLang.value}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=true&explaintext=true&titles=${encodeURIComponent(l1Title)}&format=json&origin=*`
      const l1Data = await fetch(l1Url).then(r => r.json())
      const l1Page = Object.values(l1Data.query?.pages ?? {})[0]
      l1Paras = toParas((l1Page?.extract ?? '').trim())
    }

    article.value = {
      title:      result.title,
      paragraphs: l2Paras.map((l2, i) => ({ l2, l1: l1Paras[i] ?? null })),
    }
    resetExercise()
  } catch {
    loadError.value = 'Could not load article.'
  } finally {
    loading.value = false
  }
}

function loadStaticStory(s) {
  const l2Paras = s.texts[readLang.value] ?? []
  const l1Paras = s.texts[toLang.value]  ?? []
  article.value = {
    title:      s.titles[readLang.value] ?? s.titles.en,
    paragraphs: l2Paras.map((l2, i) => ({
      l2,
      l1: l1Paras[Math.min(i, l1Paras.length - 1)] ?? null,
    })),
  }
  resetExercise()
}

function toParas(txt) {
  return txt.split(/\n+/).map(p => p.trim()).filter(p => p.length > 60)
}

// ── Translation check ─────────────────────────────────────────────────────────

async function checkMyTranslation() {
  if (!currentPara.value.l2 || !userInput.value.trim() || checking.value) return
  checking.value    = true
  checkResult.value = null
  checkResult.value = await checkTranslation(
    currentPara.value.l2,
    userInput.value.trim(),
    readLang.value,
    toLang.value,
  )
  checking.value = false
}

// ── Navigation ────────────────────────────────────────────────────────────────

function nextPara() {
  if (!article.value || paraIdx.value >= article.value.paragraphs.length - 1) return
  paraIdx.value++
  resetExercise()
}

function prevPara() {
  if (paraIdx.value > 0) { paraIdx.value--; resetExercise() }
}

function resetExercise() {
  paraIdx.value     = 0
  userInput.value   = ''
  checkResult.value = null
  showRef.value     = false
}

function reset() {
  article.value       = null
  searchResults.value = []
  searchQuery.value   = ''
  loadError.value     = ''
  resetExercise()
}
</script>
