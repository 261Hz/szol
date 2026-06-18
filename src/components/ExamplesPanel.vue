<!-- ExamplesPanel.vue: a tabbed word-examples panel used inside ReadView and VocabView. -->
<!--                                                                                     -->
<!-- Shows example sentences / text from three sources via clickable tabs:               -->
<!--   • Tatoeba   — crowd-sourced example sentences, many with audio                   -->
<!--   • Wikipedia — opening paragraphs of articles about the word                      -->
<!--   • Wikiquote — notable quotes from people or works related to the word             -->
<!--                                                                                     -->
<!-- Props:                                                                               -->
<!--   word       (String) — the word to look up, already cleaned (no punctuation)      -->
<!--   lang       (String) — the active language code, e.g. 'es'                        -->
<!--   savedWords (Set)    — normalized words already in the vocab bank (for highlights) -->
<!--                                                                                     -->
<!-- Emits:                                                                               -->
<!--   'tap' { word, sentence } — user clicked a word in any example.                   -->
<!--     ReadView responds by speaking the word + updating the word panel.               -->
<!--     VocabView responds by saving the word to the vocab bank.                        -->
<template>
  <!-- Outer wrapper sits below the word/sentence in the parent component's card. -->
  <!-- "border-t border-green-800" = a thin green dividing line above the panel. -->
  <div class="mt-1 pt-2 border-t border-green-800">

    <!-- Source tab bar: Tatoeba | Wikipedia | Wikiquote -->
    <!-- v-for loops over the tabs array and renders one pill button per tab. -->
    <div class="flex gap-1 mb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="setTab(tab.id)"
        :class="[
          'text-xs px-2 py-0.5 rounded-full transition-all',
          activeTab === tab.id
            ? 'bg-green-700 text-white'       // active tab: filled green pill
            : 'text-gray-500 hover:text-green-400' // inactive: gray text, green on hover
        ]"
      >{{ tab.label }}</button>
    </div>

    <!-- ── CORPUS (LEIPZIG) TAB — auto-loads, no button needed ── -->
    <div v-if="activeTab === 'corpus'">
      <div v-if="corpus.loading" class="text-xs text-gray-500">Loading…</div>
      <div v-else-if="corpus.results.length" class="flex flex-col gap-2">
        <div v-for="(ex, i) in corpus.results" :key="i">
          <span
            class="text-sm text-gray-300 leading-snug"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, j) in tokenize(ex.sentence)" :key="j">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex.sentence })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
        </div>
      </div>
      <div v-else-if="corpus.done" class="text-xs text-gray-500">
        No corpus examples yet —
        <button @click="setTab('tatoeba')" class="underline hover:text-green-400 transition-all">try Tatoeba</button>
      </div>
    </div>

    <!-- ── DICT (WIKTIONARY) TAB ── -->
    <div v-else-if="activeTab === 'dict'">
      <button
        v-if="!dict.done && !dict.loading"
        @click="loadDict"
        class="text-xs text-green-300 hover:text-green-200 underline transition-all"
      >Look up in Wiktionary</button>
      <div v-else-if="dict.loading" class="text-xs text-gray-500">Loading…</div>
      <div v-else-if="dict.data" class="flex flex-col gap-3">
        <!-- Definitions -->
        <div v-if="dict.data.definitions.length" class="flex flex-col gap-1">
          <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">Definition</div>
          <div
            v-for="(def, i) in dict.data.definitions"
            :key="i"
            class="flex gap-1.5 text-sm text-gray-300 leading-snug"
          >
            <span class="text-gray-600 flex-shrink-0">{{ i + 1 }}.</span>
            <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
              <span v-for="(tok, j) in tokenize(def)" :key="j">
                <span
                  v-if="tok.type === 'word'"
                  @click="$emit('tap', { word: tok.text, sentence: def })"
                  :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                    savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '']"
                >{{ tok.text }}</span>
                <span v-else>{{ tok.text }}</span>
              </span>
            </span>
          </div>
        </div>
        <!-- Example sentences -->
        <div v-if="dict.data.examples.length" class="flex flex-col gap-1">
          <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">Examples</div>
          <p
            v-for="(ex, i) in dict.data.examples"
            :key="i"
            class="text-sm text-gray-300 italic leading-snug border-l-2 border-gray-700 pl-2 m-0"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, j) in tokenize(ex)" :key="j">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex })"
                :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                  normalize(tok.text) === normalize(props.word) ? 'text-yellow-300 font-semibold' : '']"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </p>
        </div>
      </div>
      <div v-else-if="dict.done" class="text-xs text-gray-500">Not found in Wiktionary.</div>
    </div>

    <!-- ── TATOEBA TAB ── -->
    <!-- v-if="activeTab === 'tatoeba'" = only rendered when this tab is selected. -->
    <div v-if="activeTab === 'tatoeba'">
      <!-- State machine: show one of four states depending on tatoeba.loading / .done / .results -->

      <!-- 1. Not yet fetched: show the "See examples" trigger button. -->
      <!-- !tatoeba.done && !tatoeba.loading = neither done nor in-progress = never attempted. -->
      <button
        v-if="!tatoeba.done && !tatoeba.loading"
        @click="loadTatoeba"
        class="text-xs text-green-300 hover:text-green-200 underline transition-all"
      >See examples</button>

      <!-- 2. Fetch in progress: show a spinner text. -->
      <div v-else-if="tatoeba.loading" class="text-xs text-gray-500">Loading…</div>

      <!-- 3. Results available: render each sentence with clickable words and optional audio. -->
      <div v-else-if="tatoeba.results.length" class="flex flex-col gap-2">
        <div v-for="ex in tatoeba.results" :key="ex.id" class="flex items-start gap-2">
          <!-- Tokenized sentence: each word is a clickable span. -->
          <!-- :dir sets text direction for RTL languages (Arabic, Hebrew). -->
          <span
            class="text-sm text-gray-300 flex-1 leading-snug"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <!-- tokenize() splits the sentence into word tokens and space tokens. -->
            <span v-for="(tok, i) in tokenize(ex.text)" :key="i">
              <!-- Word token: clickable. Emits 'tap' with the raw word text + full sentence. -->
              <!-- savedWords.has(normalize(tok.text)) = true if this word is already saved → green highlight. -->
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: ex.text })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                ]"
              >{{ tok.text }}</span>
              <!-- Space token: rendered as plain text, not clickable. -->
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>

          <!-- 🔊 audio button: only shown when Tatoeba has a recording for this sentence. -->
          <!-- ex.audios?.length = optional chaining: safely checks if the audios array is non-empty. -->
          <button
            v-if="ex.audios?.length"
            @click="playAudio(ex)"
            class="text-base leading-none flex-shrink-0 hover:opacity-70 transition-all"
            title="Play audio"
          >🔊</button>
        </div>
      </div>

      <!-- 4. Fetch completed but no results found. -->
      <div v-else-if="tatoeba.done" class="text-xs text-gray-500">No examples found.</div>
    </div>

    <!-- ── WIKIPEDIA TAB ── -->
    <!-- Same four-state pattern as Tatoeba but no audio button. -->
    <!-- Wikipedia results are { title, extract } objects (full opening paragraphs). -->
    <div v-else-if="activeTab === 'wikipedia'">
      <button
        v-if="!wiki.done && !wiki.loading"
        @click="loadWiki"
        class="text-xs text-green-300 hover:text-green-200 underline transition-all"
      >Search Wikipedia</button>
      <div v-else-if="wiki.loading" class="text-xs text-gray-500">Loading…</div>
      <div v-else-if="wiki.results.length" class="flex flex-col gap-3">
        <div v-for="r in wiki.results" :key="r.title" class="flex flex-col gap-0.5">
          <!-- Article title shown in small gray text above the extract. -->
          <div class="text-xs font-medium text-gray-400">{{ r.title }}</div>
          <!-- Full extract, tokenized and clickable just like Tatoeba sentences. -->
          <!-- Clicking any word emits 'tap' with the full article extract as context. -->
          <span
            class="text-sm text-gray-300 leading-snug"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, i) in tokenize(r.extract)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: r.extract })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
        </div>
      </div>
      <div v-else-if="wiki.done" class="text-xs text-gray-500">No Wikipedia results.</div>
    </div>

    <!-- ── WIKIQUOTE TAB ── -->
    <!-- Same pattern; "italic" class visually signals these are quotations. -->
    <div v-else-if="activeTab === 'wikiquote'">
      <button
        v-if="!wq.done && !wq.loading"
        @click="loadWikiquote"
        class="text-xs text-green-300 hover:text-green-200 underline transition-all"
      >Search Wikiquote</button>
      <div v-else-if="wq.loading" class="text-xs text-gray-500">Loading…</div>
      <div v-else-if="wq.results.length" class="flex flex-col gap-4">
        <div v-for="r in wq.results" :key="r.title" class="flex flex-col gap-1.5">
          <div class="text-xs font-medium text-gray-400">{{ r.title }}</div>
          <!-- Each quote line is rendered separately so they don't smush together. -->
          <p
            v-for="(line, li) in r.extract.split('\n')"
            :key="li"
            class="text-sm text-gray-300 italic leading-snug border-l-2 border-gray-700 pl-2 m-0"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, i) in tokenize(line)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: line })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </p>
        </div>
      </div>
      <div v-else-if="wq.done" class="text-xs text-gray-500">No Wikiquote results.</div>
    </div>

    <!-- ── VIDEO TAB ── -->
    <div v-else-if="activeTab === 'video'">
      <div v-if="video.loading" class="text-xs text-gray-500">Searching YouTube clips for "{{ props.word }}"…</div>
      <div v-else-if="video.results.length" class="flex flex-col gap-3">
        <div
          v-for="clip in video.results"
          :key="`${clip.video_id}-${clip.start_sec}`"
          class="flex flex-col gap-0.5"
        >
          <span
            class="text-sm text-gray-300 leading-snug"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <span v-for="(tok, i) in tokenize(clip.context)" :key="i">
              <span
                v-if="tok.type === 'word'"
                @click="$emit('tap', { word: tok.text, sentence: clip.context })"
                :class="[
                  'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
                  savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
                  normalize(tok.text) === normalize(props.word) ? 'text-yellow-300 font-semibold' : '',
                ]"
              >{{ tok.text }}</span>
              <span v-else>{{ tok.text }}</span>
            </span>
          </span>
          <button
            @click="$emit('openClip', clip)"
            class="text-xs text-blue-400 hover:text-blue-300 transition-all self-start"
          >▶ {{ formatTime(clip.start_sec) }} — watch in Listen tab</button>
        </div>
      </div>
      <div v-else-if="video.done" class="text-xs text-gray-500">No YouTube clips found for "{{ props.word }}".</div>
      <div v-else class="text-xs text-gray-400">
        <button @click="loadVideo()" class="underline hover:text-green-400">Load video clips</button>
        for "{{ props.word }}"
      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable. watch = run a function whenever a reactive value changes.
import { ref, watch } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { normalize } from '../utils/scoring.js'
import { fetchTatoeba, playAudio } from '../utils/tatoeba.js'
import { searchWikipedia } from '../utils/wikipedia.js'
import { searchWikiquote } from '../utils/wikiquote.js'
import { searchWiktionary } from '../utils/wiktionary.js'
import { getWordExamples, getVocabClips } from '../utils/api.js'

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

const tabs = [
  { id: 'corpus',    label: 'Examples' },
  { id: 'dict',      label: 'Dict' },
  { id: 'tatoeba',   label: 'Tatoeba' },
  { id: 'wikipedia', label: 'Wikipedia' },
  { id: 'wikiquote', label: 'Wikiquote' },
  { id: 'video',     label: 'Video' },
]

const activeTab = ref('corpus')

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

watch(() => props.word, () => {
  corpus.value    = { loading: false, results: [], done: false }
  dict.value      = { loading: false, data: null,  done: false }
  tatoeba.value   = { loading: false, results: [], done: false }
  wiki.value      = { loading: false, results: [], done: false }
  wq.value        = { loading: false, results: [], done: false }
  video.value     = { loading: false, results: [], done: false }
  activeTab.value = 'corpus'
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

// formatTime converts seconds to MM:SS for the YouTube deeplink label.
function formatTime(sec) {
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}
</script>
