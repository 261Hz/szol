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

// tap() is called when the user clicks a word.
// It speaks the word aloud and updates the "tapped" info panel below the story.
function tap(word) {
  // Remove non-letter characters (punctuation, numbers) from the word.
  // /[^\p{L}\p{M}]/gu: matches anything that's NOT a Unicode letter or combining mark.
  // .replace() replaces all matches with '' (empty string = deletion).
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return // if nothing is left after cleaning (e.g. a punctuation-only token), do nothing

  // Look up the BCP47 language code (e.g. 'el-GR') for TTS.
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang

  // Create a new speech utterance object (the "thing to say").
  const utt = new SpeechSynthesisUtterance(clean)
  utt.lang  = bcp47 // tell TTS which language to use for pronunciation

  // Pick the best available voice (respects user preference from Settings).
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice // only set voice if one was found; otherwise browser chooses

  speechSynthesis.cancel() // stop any currently playing speech
  speechSynthesis.resume() // fix for Chrome bug: cancel() can leave the engine in a "paused" state
  speechSynthesis.speak(utt) // start speaking the word

  // Find which sentence in the story contains this word (for context display).
  // /(?<=[.!?])\s+/ splits after sentence-ending punctuation followed by a space.
  // (?<=...) is a "lookbehind" -- match only if preceded by .!? but don't consume those characters.
  const sentences = props.story.text.split(/(?<=[.!?])\s+/)
  // .find() returns the first item where the condition is true.
  // ?? '' = use empty string if no sentence is found.
  const sentence = sentences.find(s => s.includes(word)) ?? ''

  // Update the tapped ref so the word panel appears below the story.
  tapped.value = { word: clean, sentence }
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
