<template>
  <div class="mt-1 pt-2" style="border-top:1px solid rgba(31,27,23,0.1);">

    <!-- Source tab bar -->
    <div class="flex gap-1 mb-2 flex-wrap">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="setTab(tab.id)"
        class="text-xs px-2 py-0.5 rounded-full transition-all"
        :style="activeTab === tab.id
          ? 'background:#2a2018; color:#e8dcc4;'
          : 'color:rgba(31,27,23,0.38);'"
      >{{ tab.label }}</button>
    </div>

    <!-- ── CORPUS (LEIPZIG) TAB ── -->
    <div v-if="activeTab === 'corpus'">
      <div v-if="corpus.loading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Loading…</div>
      <div v-else-if="corpus.results.length" class="flex flex-col gap-2">
        <div v-for="(ex, i) in corpus.results" :key="i">
          <span class="text-sm leading-snug" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            <span v-for="(tok, j) in tokenize(ex.sentence)" :key="j">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex.sentence })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
        </div>
      </div>
      <div v-else-if="corpus.done" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">
        No corpus examples yet —
        <button @click="setTab('tatoeba')" class="underline transition-all" style="color:#8b3a3a;">try Tatoeba</button>
      </div>
    </div>

    <!-- ── DICT (WIKTIONARY) TAB ── -->
    <div v-else-if="activeTab === 'dict'">
      <div v-if="dict.loading || localDefLoading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Loading…</div>

      <!-- Model download progress -->
      <div v-if="localDefDownloading" class="flex flex-col gap-1 my-1">
        <div class="flex items-center justify-between text-xs" style="color:rgba(31,27,23,0.4);">
          <span class="truncate max-w-[70%]">{{ localDefLabel || 'Loading language model…' }}</span>
          <span>{{ localDefPct }}%</span>
        </div>
        <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(31,27,23,0.1);">
          <div class="h-full rounded-full transition-all duration-300" style="background:#8b3a3a;" :style="{ width: localDefPct + '%' }" />
        </div>
      </div>
      <div v-else-if="dict.data" class="flex flex-col gap-3">
        <div v-if="dict.data.definitions.length" class="flex flex-col gap-1">
          <div class="text-xs uppercase tracking-wide" style="color:rgba(31,27,23,0.4); letter-spacing:0.1em;">Definition</div>
          <div
            v-for="(def, i) in dict.data.definitions"
            :key="i"
            class="flex gap-1.5 text-sm leading-snug"
          >
            <span class="flex-shrink-0" style="color:rgba(31,27,23,0.3);">{{ i + 1 }}.</span>
            <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
              <span v-for="(tok, j) in tokenize(def)" :key="j">
                <span
                  v-if="tok.type === 'word'"
                  @click="$emit('tap', { word: tok.text, sentence: def })"
                  :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                    savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '']"
                >{{ tok.text }}</span>
                <span v-else>{{ tok.text }}</span>
              </span>
            </span>
          </div>
        </div>
        <div v-if="dict.data.examples.length" class="flex flex-col gap-1">
          <div class="text-xs uppercase tracking-wide" style="color:rgba(31,27,23,0.4); letter-spacing:0.1em;">Examples</div>
          <p
            v-for="(ex, i) in dict.data.examples"
            :key="i"
            class="text-sm italic leading-snug pl-2 m-0"
            style="border-left:2px solid rgba(31,27,23,0.1);"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, j) in tokenize(ex)" :key="j">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex })"
                :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                  normalize(tok.text) === normalize(props.word) ? 'text-[#a88a4a] font-semibold' : '']"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </p>
        </div>
      </div>
      <div v-else-if="localDef" class="text-sm leading-snug" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ localDef }}</div>
      <div v-else-if="dict.done && !localDefLoading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Not found.</div>
    </div>

    <!-- ── TATOEBA TAB ── -->
    <div v-if="activeTab === 'tatoeba'">
      <button
        v-if="!tatoeba.done && !tatoeba.loading"
        @click="loadTatoeba"
        class="text-xs underline transition-all"
        style="color:#8b3a3a;"
      >See examples</button>
      <div v-else-if="tatoeba.loading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Loading…</div>
      <div v-else-if="tatoeba.results.length" class="flex flex-col gap-2">
        <div v-for="ex in tatoeba.results" :key="ex.id" class="flex items-start gap-2">
          <span class="text-sm flex-1 leading-snug" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            <span v-for="(tok, i) in tokenize(ex.text)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex.text })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
          <button
            v-if="ex.audios?.length"
            @click="playAudio(ex)"
            class="text-base leading-none flex-shrink-0 hover:opacity-70 transition-all"
            title="Play audio"
          >🔊</button>
        </div>
      </div>
      <div v-else-if="tatoeba.done" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">No examples found.</div>
    </div>

    <!-- ── WIKIPEDIA TAB ── -->
    <div v-else-if="activeTab === 'wikipedia'">
      <button
        v-if="!wiki.done && !wiki.loading"
        @click="loadWiki"
        class="text-xs underline transition-all"
        style="color:#8b3a3a;"
      >Search Wikipedia</button>
      <div v-else-if="wiki.loading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Loading…</div>
      <div v-else-if="wiki.results.length" class="flex flex-col gap-3">
        <div v-for="r in wiki.results" :key="r.title" class="flex flex-col gap-0.5">
          <div class="text-xs" style="color:rgba(31,27,23,0.45); font-style:italic;">{{ r.title }}</div>
          <span class="text-sm leading-snug" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            <span v-for="(tok, i) in tokenize(r.extract)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: r.extract })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
        </div>
      </div>
      <div v-else-if="wiki.done" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">No Wikipedia results.</div>
    </div>

    <!-- ── WIKIQUOTE TAB ── -->
    <div v-else-if="activeTab === 'wikiquote'">
      <button
        v-if="!wq.done && !wq.loading"
        @click="loadWikiquote"
        class="text-xs underline transition-all"
        style="color:#8b3a3a;"
      >Search Wikiquote</button>
      <div v-else-if="wq.loading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Loading…</div>
      <div v-else-if="wq.results.length" class="flex flex-col gap-4">
        <div v-for="r in wq.results" :key="r.title" class="flex flex-col gap-1.5">
          <div class="text-xs" style="color:rgba(31,27,23,0.45); font-style:italic;">{{ r.title }}</div>
          <p
            v-for="(line, li) in r.extract.split('\n')"
            :key="li"
            class="text-sm italic leading-snug pl-2 m-0"
            style="border-left:2px solid rgba(31,27,23,0.1);"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, i) in tokenize(line)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: line })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </p>
        </div>
      </div>
      <div v-else-if="wq.done" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">No Wikiquote results.</div>
    </div>

    <!-- ── VIDEO TAB ── -->
    <div v-else-if="activeTab === 'video'">
      <div v-if="video.loading" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">Searching clips for "{{ props.word }}"…</div>
      <div v-else-if="video.results.length" class="flex flex-col gap-3">
        <div
          v-for="clip in video.results"
          :key="`${clip.video_id}-${clip.start_sec}`"
          class="flex flex-col gap-0.5"
        >
          <span class="text-sm leading-snug" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            <span v-for="(tok, i) in tokenize(clip.context)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: clip.context })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
                  normalize(tok.text) === normalize(props.word) ? 'text-[#a88a4a] font-semibold' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
          <div class="flex items-center gap-3">
            <button
              @click="$emit('openClip', clip)"
              class="text-xs underline transition-all"
              style="color:#8b3a3a;"
            >▶ {{ formatTime(clip.start_sec) }} — watch in Listen tab</button>
            <button
              v-if="reportKey !== clipKey(clip)"
              @click="reportKey = clipKey(clip); reportNote = ''; reportCategory = ''; reportSent = false"
              class="text-xs transition-all"
              style="color:rgba(31,27,23,0.28);"
              onmouseover="this.style.color='#8b3a3a'"
              onmouseout="this.style.color='rgba(31,27,23,0.28)'"
              title="Report a transcript error"
            >⚑ report</button>
            <span v-if="reportSent && reportKey === clipKey(clip)" class="text-xs" style="color:#3a7a3a;">Reported ✓</span>
          </div>
          <!-- Inline report form -->
          <div v-if="reportKey === clipKey(clip) && !reportSent" class="flex flex-col gap-1 mt-0.5">
            <div class="flex items-center gap-1.5">
              <select
                v-model="reportCategory"
                class="text-xs px-2 py-0.5 flex-1 outline-none"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17;"
              >
                <option value="">Select problem…</option>
                <option value="wrong-language">Wrong language (not {{ langLabel }})</option>
                <option value="wrong-word">Wrong word / phrase detected</option>
                <option value="timing-off">Subtitles timing doesn't match</option>
                <option value="subtitles-mismatch">Subtitles don't match audio</option>
                <option value="inaccurate">Subtitles inaccurate</option>
                <option value="bad-audio">Poor sound quality</option>
                <option value="bug">Bug — describe below</option>
                <option value="rights">Infringes my rights</option>
              </select>
              <button @click="submitReport(clip)" :disabled="!reportCategory" class="text-xs transition-all disabled:opacity-30" style="color:#8b3a3a;">Send</button>
              <button @click="reportKey = null" class="text-xs transition-opacity hover:opacity-50" style="color:rgba(31,27,23,0.35);">✕</button>
            </div>
            <input
              v-model="reportNote"
              type="text"
              placeholder="Details (optional)"
              class="text-xs px-2 py-0.5 outline-none"
              style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17;"
              @keydown.enter="reportCategory && submitReport(clip)"
              @keydown.escape="reportKey = null"
            />
          </div>
        </div>
      </div>
      <div v-else-if="video.done" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic;">No clips found for "{{ props.word }}".</div>
      <div v-else class="text-xs" style="color:rgba(31,27,23,0.38);">
        <button @click="loadVideo()" class="underline transition-all" style="color:#8b3a3a;">Load video clips</button>
        for "{{ props.word }}"
      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable. watch = run a function whenever a reactive value changes.
import { ref, watch, computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { normalize } from '../utils/scoring.js'
import { fetchTatoeba, playAudio } from '../utils/tatoeba.js'
import { searchWikipedia } from '../utils/wikipedia.js'
import { searchWikiquote } from '../utils/wikiquote.js'
import { searchWiktionary } from '../utils/wiktionary.js'
import { getWordExamples, getVocabClips } from '../utils/api.js'
import { explain, onExplainerProgress } from '../utils/localExplainer.js'

// Props received from the parent (ReadView or VocabView).
// word       = the cleaned word to look up (no punctuation, e.g. "hola" not "hola,").
// lang       = active language code, e.g. 'es' for Spanish.
// savedWords = a Set of normalize()'d words already in the vocab bank for this language.
//              Used to highlight saved words green across all three example sources.
const props = defineProps({
  word:        String,
  lang:        String,
  savedWords:  Object, // Set<string>
  currentUser: Object, // null if logged out
})

defineEmits(['tap', 'openAuth', 'openClip'])

const langLabel = computed(() => LANGS[props.lang]?.name ?? props.lang ?? 'this language')

const tabs = [
  { id: 'dict',      label: 'Dict' },
  { id: 'corpus',    label: 'Examples' },
  { id: 'tatoeba',   label: 'Tatoeba' },
  { id: 'wikipedia', label: 'Wikipedia' },
  { id: 'wikiquote', label: 'Wikiquote' },
  { id: 'video',     label: 'Video' },
]

const activeTab = ref('dict')

// Each source has its own state object with three fields:
//   loading = true while the network request is in flight (shows "Loading…")
//   results = the array returned by the fetch (empty until done)
//   done    = true after the first fetch completes, prevents re-fetching on tab switch
const corpus  = ref({ loading: false, results: [], done: false })
const dict    = ref({ loading: false, data: null,  done: false })
const tatoeba = ref({ loading: false, results: [], done: false })
const wiki    = ref({ loading: false, results: [], done: false })
const wq      = ref({ loading: false, results: [], done: false })
const video   = ref({ loading: false, results: [], done: false })

const localDef         = ref('')
const localDefLoading  = ref(false)
const localDefPct      = ref(0)
const localDefLabel    = ref('')
const localDefDownloading = ref(false)

let pendingFiles = 0, doneFiles = 0
const removeProgress = onExplainerProgress((info) => {
  if (info.status === 'initiate') {
    pendingFiles++
    localDefDownloading.value = true
  } else if (info.status === 'progress') {
    localDefDownloading.value = true
    localDefPct.value   = Math.round(info.progress ?? 0)
    localDefLabel.value = info.file ?? ''
  } else if (info.status === 'done') {
    doneFiles++
    if (doneFiles >= pendingFiles) {
      localDefPct.value = 100
      localDefLabel.value = ''
      setTimeout(() => { localDefDownloading.value = false; doneFiles = 0; pendingFiles = 0 }, 600)
    }
  }
})

watch(() => props.word, () => {
  corpus.value    = { loading: false, results: [], done: false }
  dict.value      = { loading: false, data: null,  done: false }
  tatoeba.value   = { loading: false, results: [], done: false }
  wiki.value      = { loading: false, results: [], done: false }
  wq.value        = { loading: false, results: [], done: false }
  video.value     = { loading: false, results: [], done: false }
  localDef.value  = ''
  activeTab.value = 'dict'
  loadDict()
  loadCorpus()
}, { immediate: true })

function setTab(tab) {
  activeTab.value = tab
  if (tab === 'video') loadVideo()
}

// tokenize() splits a sentence string into an array of word and space tokens.
// This makes every word independently clickable in the template.
// Example: "Hola, mundo" → [{type:'word', text:'Hola,'}, {type:'space', text:' '}, {type:'word', text:'mundo'}]
// The capture group in /(\s+)/ keeps the whitespace chunks in the output array.
function tokenize(text) {
  if (!text) return []
  return text.split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word', // pure whitespace = space token
    text: tok,
  }))
}

async function loadCorpus() {
  if (!props.word || corpus.value.loading || corpus.value.done) return
  corpus.value.loading = true
  corpus.value.results = await getWordExamples(props.word, props.lang)
  corpus.value.loading = false
  corpus.value.done    = true
}

async function loadDict() {
  if (!props.word || dict.value.loading || dict.value.done) return
  dict.value.loading = true
  dict.value.data    = await searchWiktionary(props.word, props.lang)
  dict.value.loading = false
  dict.value.done    = true
  if (!dict.value.data && props.lang !== 'en') {
    localDefLoading.value = true
    try { localDef.value = await explain(props.word, props.lang) } catch {}
    localDefLoading.value = false
  }
}

// loadTatoeba() fetches example sentences for the current word from Tatoeba.
// Guard conditions prevent duplicate fetches: bail if already loading or already done.
async function loadTatoeba() {
  if (!props.word || tatoeba.value.loading || tatoeba.value.done) return
  tatoeba.value.loading = true
  tatoeba.value.results = await fetchTatoeba(props.word, props.lang) // returns [] on error
  tatoeba.value.loading = false
  tatoeba.value.done    = true // even if results is empty, mark done to show "No examples found"
}

// loadWiki() fetches Wikipedia article summaries for the current word.
async function loadWiki() {
  if (!props.word || wiki.value.loading || wiki.value.done) return
  wiki.value.loading = true
  wiki.value.results = await searchWikipedia(props.word, props.lang)
  wiki.value.loading = false
  wiki.value.done    = true
}

// loadWikiquote() fetches Wikiquote page summaries for the current word.
async function loadWikiquote() {
  if (!props.word || wq.value.loading || wq.value.done) return
  wq.value.loading = true
  wq.value.results = await searchWikiquote(props.word, props.lang)
  wq.value.loading = false
  wq.value.done    = true
}

async function loadVideo() {
  console.log('[video] word=', JSON.stringify(props.word), 'lang=', props.lang, 'loading=', video.value.loading, 'done=', video.value.done)
  if (!props.word || video.value.loading || video.value.done) return
  video.value.loading = true
  try {
    video.value.results = await getVocabClips(props.word, props.lang)
  } catch (e) {
    console.error('[video] error:', e)
    video.value.results = []
  }
  video.value.loading = false
  video.value.done    = true
}

function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

// ── Clip reporting ─────────────────────────────────────────────────────────────
const reportKey      = ref(null)  // clipKey of the clip whose report form is open
const reportNote     = ref('')
const reportCategory = ref('')
const reportSent     = ref(false)

function clipKey(clip) {
  return `${clip.video_id}:${clip.start_sec}`
}

async function submitReport(clip) {
  await fetch('/api/report-clip', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      video_id:  clip.video_id,
      start_sec: clip.start_sec,
      word:      props.word,
      lang:      props.lang,
      category:  reportCategory.value,
      note:      reportNote.value.trim(),
    }),
  }).catch(() => {})
  reportSent.value = true
  setTimeout(() => { if (reportKey.value === clipKey(clip)) reportKey.value = null }, 2000)
}
</script>
