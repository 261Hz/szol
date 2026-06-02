<!-- ReadView.vue: shows a story with clickable words. -->
<!-- Tapping a word speaks it aloud (TTS), shows the sentence it came from, and lets you save it. -->
<template>
  <!-- Outermost container stacks elements vertically with a gap between them. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is loaded yet (user hasn't picked one from the Library). -->
    <!-- v-if="!story" = show this if story is null/undefined (falsy). -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main story view -- shown only when a story is loaded. -->
    <!-- v-else = the alternative when v-if above is false. -->
    <div v-else class="flex flex-col gap-4">

      <!-- Story header: title, language/author info, and action buttons. -->
      <div class="flex items-center justify-between">
        <div>
          <!-- Story title, with RTL text direction for Arabic/Hebrew. -->
          <!-- :dir="isRTL(lang) ? 'rtl' : 'ltr'" = ternary: if RTL language, text flows right-to-left. -->
          <div
            class="font-semibold text-lg"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            {{ story.title }}
          </div>
          <!-- Subtitle: language name, and optional author/source separated by · dots. -->
          <!-- LANGS[lang]?.name = safely access the name property of the language config. -->
          <!-- ?. = optional chaining: returns undefined instead of crashing if LANGS[lang] is missing. -->
          <div class="text-xs text-gray-400 mt-0.5">
            {{ LANGS[lang]?.name }}
            <!-- v-if="story.author" = only show the author if it exists (not null/empty). -->
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
        </div>

        <!-- Action buttons in the top-right of the header. -->
        <div class="flex gap-2">
          <!-- Franco toggle: only shown for Egyptian Arabic (arz) stories that have franco text. -->
          <!-- v-if="story.franco && hasFranco(lang)" = show only if BOTH conditions are true. -->
          <!-- && is the "AND" operator: both sides must be true. -->
          <button
            v-if="story.franco && hasFranco(lang)"
            @click="francoOn = !francoOn"
            :class="[
              'text-xs px-3 py-1 rounded-full border transition-all',
              francoOn
                ? 'bg-orange-400 text-white border-orange-400'
                : 'border-gray-200 text-gray-500 hover:border-orange-300'
            ]"
          >
            Franco
          </button>
          <!-- "Retype →" button navigates to the Retype (typing practice) tab. -->
          <!-- $emit('go', 'retype') sends the 'go' event to App.vue with value 'retype'. -->
          <button
            @click="$emit('go', 'retype')"
            class="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
          >
            {{ t(lang, 'retype') }} →
          </button>
        </div>
      </div>

      <!-- Story text: displayed as clickable individual words. -->
      <!-- "leading-loose" = generous line height for readability. -->
      <!-- :class="isRTL(lang) ? 'text-right text-lg' : ''" = right-align and larger text for RTL. -->
      <div
        class="leading-loose text-base"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-lg' : ''"
      >
        <!-- v-for loops over tokens (each word or whitespace chunk in the story). -->
        <!-- :key="i" uses the index as a unique key. -->
        <span v-for="(token, i) in tokens" :key="i">
          <!-- Word token: clickable, styled green if already saved in vocab. -->
          <!-- v-if="token.type === 'word'" = only clickable non-space tokens. -->
          <!-- @click="tap(token.text)" = call tap() when the word is clicked. -->
          <span
            v-if="token.type === 'word'"
            @click="tap(token.text)"
            :class="[
              'cursor-pointer rounded px-0.5 transition-all hover:bg-emerald-50',
              savedWords.has(normalize(token.text)) ? 'bg-emerald-100 text-emerald-700' : ''
            ]"
          >{{ token.text }}</span>
          <!-- Space token: rendered as-is, not clickable. -->
          <span v-else>{{ token.text }}</span>
        </span>
      </div>

      <!-- Franco line: the Latin-alphabet transliteration of the Arabic text. -->
      <!-- Only shown when francoOn is true AND the story has franco text. -->
      <div
        v-if="francoOn && story.franco"
        class="text-sm text-gray-400 border-t border-gray-100 pt-3"
      >
        {{ story.franco }}
      </div>

      <!-- Word panel: appears below the story when a word has been tapped. -->
      <!-- v-if="tapped" = show only when tapped is not null. -->
      <div
        v-if="tapped"
        class="border border-emerald-300 rounded-lg p-4 bg-emerald-50 flex flex-col gap-2"
      >
        <!-- Top row: the tapped word (large) + Save button. -->
        <div class="flex items-start justify-between">
          <!-- The word itself, with RTL direction for Arabic/Hebrew. -->
          <div
            class="text-xl font-semibold"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >{{ tapped.word }}</div>
          <!-- Save button: disabled if this word is already in the vocab bank. -->
          <!-- :disabled="..." makes a button unclickable (grayed out) when the condition is true. -->
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(tapped.word))"
            class="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
          >
            <!-- Ternary: show "Saved" if already saved, otherwise show "Save". -->
            {{ savedWords.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}
          </button>
        </div>

        <!-- The sentence the word appeared in (for context). -->
        <!-- Shown in italic gray below the word. -->
        <div
          v-if="tapped.sentence"
          class="text-sm text-gray-500 italic"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ tapped.sentence }}</div>

        <!-- No-voice warning: shown when no TTS voice is installed for this language. -->
        <!-- langHasVoice is a computed boolean (true/false) defined in the script below. -->
        <div v-if="!langHasVoice" class="text-xs text-amber-600 flex items-center gap-1">
          No {{ LANGS[lang]?.name }} voice installed.
          <!-- ms-settings:regionlanguage is a Windows URI that opens the Language settings directly. -->
          <a href="ms-settings:regionlanguage" class="underline hover:text-amber-800">Install in Windows Settings</a>
          or
          <!-- Clicking "pick a voice" navigates to the Settings tab. -->
          <button @click="$emit('go', 'settings')" class="underline hover:text-amber-800">pick a voice</button>.
        </div>

        <!-- Tatoeba example sentences. -->
        <div class="mt-1 pt-2 border-t border-emerald-200">
          <!-- "See examples" button: shown when no fetch has been started yet. -->
          <!-- !examplesDone && !examplesLoading = neither done nor in-progress = not yet attempted. -->
          <button
            v-if="!examplesDone && !examplesLoading"
            @click="loadExamples"
            class="text-xs text-emerald-600 hover:text-emerald-700 underline transition-all"
          >See examples</button>

          <!-- Loading indicator while fetching. -->
          <div v-else-if="examplesLoading" class="text-xs text-gray-400">Loading…</div>

          <!-- Results: up to 4 Tatoeba sentences with clickable words. -->
          <div v-else-if="examplesResults.length" class="flex flex-col gap-2">
            <div
              v-for="ex in examplesResults"
              :key="ex.id"
              class="flex items-start gap-2"
            >
              <!-- Tokenized sentence: each word is clickable, same as story words. -->
              <!-- Clicking a word calls tap(word, sentence) so the word panel updates -->
              <!-- and uses this Tatoeba sentence as the context instead of the story text. -->
              <span
                class="text-sm text-gray-600 flex-1 leading-snug"
                :dir="isRTL(lang) ? 'rtl' : 'ltr'"
              >
                <span v-for="(tok, ti) in tokenize(ex.text)" :key="ti">
                  <!-- Clickable word token. -->
                  <span
                    v-if="tok.type === 'word'"
                    @click="tap(tok.text, ex.text)"
                    :class="[
                      'cursor-pointer rounded px-0.5 transition-all hover:bg-emerald-50',
                      savedWords.has(normalize(tok.text)) ? 'bg-emerald-100 text-emerald-700' : ''
                    ]"
                  >{{ tok.text }}</span>
                  <!-- Space token: not clickable. -->
                  <span v-else>{{ tok.text }}</span>
                </span>
              </span>
              <!-- 🔊 button: only shown when this sentence has an audio recording. -->
              <button
                v-if="ex.audios?.length"
                @click="playAudio(ex)"
                class="text-base leading-none flex-shrink-0 hover:opacity-70 transition-all"
                title="Play audio"
              >🔊</button>
            </div>
          </div>

          <!-- No results after a completed fetch. -->
          <div v-else-if="examplesDone" class="text-xs text-gray-400">No examples found.</div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
// ref creates a reactive variable. computed creates a value that auto-updates.
import { ref, computed } from 'vue'
// LANGS contains configuration for all 13 languages (names, BCP47 codes, etc.).
import { LANGS } from '../data/stories.js'
// isRTL checks if the language reads right-to-left. hasFranco checks for Egyptian Arabic.
import { isRTL, hasFranco } from '../utils/rtl.js'
// t() looks up translated UI text for a given language and key.
import { t } from '../utils/i18n.js'
// normalize() lowercases and strips punctuation for consistent comparisons.
import { normalize } from '../utils/scoring.js'
// useVoiceList = loads available TTS voices reactively.
// voicesForLang = filters voices by language.
// pickVoice = selects the best available voice for a language.
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
// fetchTatoeba = fetches example sentences from Tatoeba.org.
// playAudio    = plays the audio recording for a Tatoeba sentence.
import { fetchTatoeba, playAudio } from '../utils/tatoeba.js'

// defineProps() declares the data this component receives from App.vue.
// story: the current story object ({ title, text, lang, ... }) or null.
// lang: the active language code (e.g. 'es', 'el').
// savedWords: a Set of normalized word keys that the user has already saved.
const props = defineProps({
  story:      Object, // Object = any JavaScript object
  lang:       String,
  savedWords: Object, // Set is technically an Object type
})

// This component can send two events to App.vue:
// 'go'       = navigate to a tab (carries the tab name like 'retype' or 'settings')
// 'saveWord' = add a word to vocab (carries the word entry object)
const emit = defineEmits(['go', 'saveWord'])

// francoOn tracks whether the Franco (Latin transliteration) line is visible.
// Starts as false (hidden). ref(false) = reactive boolean.
const francoOn = ref(false)

// tapped holds the last word the user clicked: { word: 'string', sentence: 'string' } or null.
const tapped = ref(null)

// Tatoeba example-sentence state for the currently tapped word.
// examplesLoading = true while the fetch is in progress.
// examplesResults = array of sentence objects returned by Tatoeba (up to 4).
// examplesDone    = true after the first fetch attempt completes (success or empty).
const examplesLoading = ref(false)
const examplesResults = ref([])
const examplesDone    = ref(false)

// useVoiceList() is a composable -- it sets up voice loading and returns the reactive voices list.
const voices = useVoiceList()

// langHasVoice is true if there is at least one TTS voice available for the current language.
// ?? is "nullish coalescing": use props.lang as fallback if LANGS[props.lang] is undefined.
// .length > 0 means the filtered voice array is not empty.
const langHasVoice = computed(() => {
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang // e.g. 'el-GR' for Greek
  return voicesForLang(voices.value, bcp47).length > 0
})

// tokens splits the story text into an array of word and space chunks.
// This lets us render each word as a separate clickable element.
const tokens = computed(() => {
  if (!props.story) return [] // no story = no tokens
  // .split(/(\s+)/) splits on whitespace AND keeps the whitespace as a separate item.
  //   The ( ) around \s+ is a "capture group" -- it includes the matched whitespace in the result.
  //   Without capture group: 'a b'.split(/\s+/) = ['a', 'b']
  //   With capture group:    'a b'.split(/(\s+)/) = ['a', ' ', 'b']
  // .map() transforms each piece:
  //   t => ({ ... }) = arrow function that returns an object for each piece.
  //   /^\s+$/.test(t) = regex test: true if the string is ONLY whitespace.
  //   ^ = start of string, $ = end of string, \s+ = one or more whitespace characters.
  return props.story.text.split(/(\s+)/).map(t => ({
    type: /^\s+$/.test(t) ? 'space' : 'word', // classify as 'space' or 'word'
    text: t,                                   // the actual text content
  }))
})

// tokenize() splits any text string into an array of word and space tokens.
// Used for both the story text and Tatoeba example sentences so both are clickable.
// Example: "Hola, ¿cómo?" → [{type:'word', text:'Hola,'}, {type:'space', text:' '}, ...]
function tokenize(text) {
  // .split(/(\s+)/) splits on whitespace AND keeps the whitespace as a separate item (capture group).
  return text.split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word', // classify each piece
    text: tok,
  }))
}

// tap() handles word clicks from both the story text and Tatoeba example sentences.
// word           = the raw word text as it appears in the text (may include punctuation).
// contextSentence = optional. When clicking a Tatoeba word, pass the full example sentence.
//                   When clicking a story word, omit this and we search the story text instead.
function tap(word, contextSentence) {
  // Remove non-letter characters (punctuation, numbers) from the word.
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return // nothing left after cleaning (e.g. pure punctuation token)

  // Look up the BCP47 language code (e.g. 'el-GR') for TTS.
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang

  // Create and speak the utterance.
  const utt = new SpeechSynthesisUtterance(clean)
  utt.lang  = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel() // stop any currently playing speech
  speechSynthesis.resume() // fix Chrome paused-state bug
  speechSynthesis.speak(utt)

  // Determine which sentence to show as context below the word.
  // If contextSentence was passed (Tatoeba word), use it directly.
  // Otherwise search the story text for the sentence containing this word.
  // ?? '' = fall back to empty string if nothing is found.
  const sentence = contextSentence
    ?? props.story?.text.split(/(?<=[.!?])\s+/).find(s => s.includes(word))
    ?? ''

  // Update the tapped panel.
  tapped.value = { word: clean, sentence }

  // Reset Tatoeba examples so the panel shows "See examples" for the new word.
  examplesLoading.value = false
  examplesResults.value = []
  examplesDone.value    = false
}

// loadExamples() fetches Tatoeba sentences for the currently tapped word.
// "async" because fetchTatoeba() makes a network request that takes time.
async function loadExamples() {
  // Guard: do nothing if no word is tapped, if already loading, or if already done.
  // || = "or": any one of these being true is enough to bail out.
  if (!tapped.value || examplesLoading.value || examplesDone.value) return

  examplesLoading.value = true  // show the "Loading…" indicator in the template

  // await pauses here until fetchTatoeba() finishes and returns its result.
  // tapped.value.word = the clean word text (e.g. 'hola').
  // props.lang = the language code (e.g. 'es') -- tatoeba.js maps this to 'spa'.
  examplesResults.value = await fetchTatoeba(tapped.value.word, props.lang)

  examplesLoading.value = false // hide the spinner
  examplesDone.value    = true  // prevent future fetches; also triggers the "No examples found" fallback
}

// saveWord() is called when the user clicks the Save button in the word panel.
// It emits the 'saveWord' event with a vocab entry object.
function saveWord() {
  if (!tapped.value) return // nothing tapped = do nothing (safety check)
  emit('saveWord', {
    word:     tapped.value.word,        // the cleaned word (no punctuation)
    lang:     props.lang,               // the language code
    sentence: tapped.value.sentence,    // the context sentence
    story:    props.story?.title ?? '', // the story title, or empty string if missing
  })
}
</script>
