<!-- VocabView.vue: shows the user's saved vocabulary words for the active language. -->
<template>
  <div class="flex flex-col gap-4">

    <!-- Header: "Vocabulary" label + count of words shown for this language. -->
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-700">{{ t(lang, 'vocab') }}</div>
      <div class="text-xs text-gray-400">{{ filtered.length }} {{ t(lang, 'words') }}</div>
    </div>

    <!-- Empty state: shown when no words are saved for the current language. -->
    <div v-if="!filtered.length" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'tapWord') }}
    </div>

    <!-- Word card list. -->
    <div v-else class="flex flex-col gap-3">
      <!-- Loop over filtered words. Each item is { word, originalIndex }. -->
      <!-- originalIndex is the position in the full vocabBank array (needed for correct deletion). -->
      <div
        v-for="({ word, originalIndex }) in filtered"
        :key="originalIndex"
        class="border border-gray-200 rounded-lg p-4 flex flex-col gap-1"
      >
        <!-- Top row: language tag + remove button. -->
        <div class="flex items-start justify-between">
          <div class="text-xs text-emerald-600 font-medium">
            {{ LANGS[word.lang]?.name ?? word.lang }}
          </div>
          <!-- Emit the ORIGINAL index so App.vue splices the right word from vocabBank. -->
          <button
            @click="emit('remove', originalIndex)"
            class="text-xs text-gray-300 hover:text-red-400 transition-all"
          >✕</button>
        </div>

        <!-- Word (large). -->
        <div class="text-lg font-semibold text-gray-900">{{ word.word }}</div>

        <!-- Context sentence (if saved). -->
        <div v-if="word.sentence" class="text-sm text-gray-500 italic">{{ word.sentence }}</div>

        <!-- Tatoeba examples section. -->
        <div class="mt-1">
          <!-- "See examples" button: only shown before the first fetch attempt. -->
          <button
            v-if="!exState(word)"
            @click="loadExamples(word)"
            class="text-xs text-emerald-600 hover:text-emerald-700 underline transition-all"
          >See examples</button>

          <!-- Loading spinner. -->
          <div v-else-if="exState(word).loading" class="text-xs text-gray-400">
            Loading…
          </div>

          <!-- Results: up to 4 sentences with clickable words. -->
          <div v-else-if="exState(word).results.length" class="flex flex-col gap-1.5 mt-1">
            <div
              v-for="ex in exState(word).results"
              :key="ex.id"
              class="flex items-start gap-2"
            >
              <!-- Tokenized sentence: each word is clickable to save it to vocab. -->
              <!-- Clicking calls saveFromExample(wordText, sentence, lang). -->
              <!-- Already-saved words are highlighted green and not re-added. -->
              <span
                class="text-sm text-gray-600 flex-1"
                :dir="isRTL(word.lang) ? 'rtl' : 'ltr'"
              >
                <span v-for="(tok, ti) in tokenize(ex.text)" :key="ti">
                  <!-- Clickable word token. -->
                  <span
                    v-if="tok.type === 'word'"
                    @click="saveFromExample(tok.text, ex.text, word.lang)"
                    :class="[
                      'rounded px-0.5 transition-all',
                      isSaved(tok.text, word.lang)
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : 'cursor-pointer hover:bg-emerald-50'
                    ]"
                  >{{ tok.text }}</span>
                  <!-- Space token: not clickable. -->
                  <span v-else>{{ tok.text }}</span>
                </span>
              </span>
              <!-- Audio button: only shown when the sentence has a recording. -->
              <button
                v-if="ex.audios?.length"
                @click="playAudio(ex)"
                class="text-base leading-none flex-shrink-0 hover:opacity-70 transition-all"
                title="Play audio"
              >🔊</button>
            </div>
          </div>

          <!-- No examples found (shown after a completed fetch with empty results). -->
          <div v-else-if="exState(word).done" class="text-xs text-gray-400">
            No examples found.
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable that Vue watches for changes.
// computed = a value that auto-recalculates when its dependencies change.
import { ref, computed } from 'vue'
// t() looks up translated UI strings for the active language.
import { t }    from '../utils/i18n.js'
// LANGS = configuration for all supported languages (names, BCP47 codes, etc.).
import { LANGS } from '../data/stories.js'
// isRTL = returns true for right-to-left languages (Arabic, Hebrew).
import { isRTL } from '../utils/rtl.js'
// fetchTatoeba = downloads example sentences from Tatoeba.org for a word.
// playAudio    = plays a Tatoeba sentence's audio recording in the browser.
import { fetchTatoeba, playAudio } from '../utils/tatoeba.js'

const props = defineProps({
  words: Array,  // full vocabBank array from App.vue (all languages combined)
  lang:  String, // active language code — only words matching this are shown (e.g. 'es')
})
// This component sends two events to App.vue:
// 'remove'    = emitted with the word's ORIGINAL index in vocabBank when the user clicks ✕
// 'save-word' = emitted with a new vocab entry object when the user clicks a Tatoeba word
const emit = defineEmits(['remove', 'saveWord'])

// filtered: only words matching the active language, each paired with its original array index.
// Pairing with the original index is essential because @remove must emit the position in the
// full vocabBank array -- if we emit a filtered index instead, the wrong word gets deleted.
const filtered = computed(() =>
  props.words
    .map((word, originalIndex) => ({ word, originalIndex }))
    .filter(({ word }) => word.lang === props.lang)
)

// examplesState stores the fetch result for each word, keyed by "word-lang" string.
// Each entry is: { loading: bool, results: [], done: bool }
// "done" = true after the first fetch completes (whether it found results or not).
const examplesState = ref({})

// exKey() builds a stable string key for a word entry.
function exKey(word) {
  return `${word.word}-${word.lang}`
}

// exState() returns the current examples state for a word, or null if not yet requested.
function exState(word) {
  return examplesState.value[exKey(word)] ?? null
}

// tokenize() splits a sentence into word and space tokens for clickable rendering.
// Returns an array like [{type:'word', text:'Hola'}, {type:'space', text:' '}, ...].
function tokenize(text) {
  // Split on whitespace while keeping the whitespace as its own token (capture group).
  return text.split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
}

// isSaved() checks whether a word is already in the vocab bank for a given language.
// Used to highlight already-saved words in Tatoeba examples.
// wordText = raw word text (may include punctuation). lang = language code (e.g. 'es').
function isSaved(wordText, lang) {
  // Normalize both sides for fair comparison (strip punctuation, lowercase).
  const key = wordText.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  if (!key) return false // empty after cleaning = not a real word
  return props.words.some(
    // Check both the language AND the normalized word text to avoid cross-language false matches.
    w => w.lang === lang && w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key
  )
}

// saveFromExample() emits a 'saveWord' event when the user clicks a word in a Tatoeba sentence.
// App.vue receives this and calls addToVocab() -- the same function used by ReadView.
// wordText = the clicked word text. sentence = the full Tatoeba sentence (used as context). lang = language code.
function saveFromExample(wordText, sentence, lang) {
  const clean = wordText.replace(/[^\p{L}\p{M}]/gu, '') // strip punctuation
  if (!clean || isSaved(clean, lang)) return // already saved or empty -- do nothing
  emit('saveWord', {
    word:     clean,
    lang:     lang,
    sentence: sentence, // the full Tatoeba sentence becomes the context in the vocab card
    story:    '',       // no story title -- this came from Tatoeba, not a loaded story
  })
}

// loadExamples() triggers a Tatoeba fetch for the given word.
// Caches results so clicking won't re-fetch.
async function loadExamples(word) {
  const key = exKey(word)
  if (examplesState.value[key]) return // already fetched or loading -- do nothing

  // Set loading state immediately so the spinner appears.
  examplesState.value[key] = { loading: true, results: [], done: false }

  const results = await fetchTatoeba(word.word, word.lang)

  // Replace with final state. Vue's reactivity system detects property assignment on ref objects.
  examplesState.value[key] = { loading: false, results, done: true }
}
</script>
