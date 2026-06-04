<!-- ReadView.vue: shows a story with clickable words. -->
<!-- Tapping a word speaks it aloud (TTS), shows the sentence it came from, and lets you save it. -->
<template>
  <!-- Outermost container stacks elements vertically with a gap between them. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is loaded yet (user hasn't picked one from the Library). -->
    <div v-if="!story" class="text-gray-500 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Main story view -- shown only when a story is loaded. -->
    <div v-else class="flex flex-col gap-4">

      <!-- Story header: title, language/author info, and action buttons. -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            {{ LANGS[lang]?.name }}
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
        </div>

        <div class="flex gap-2">
          <!-- Franco toggle: only shown for Egyptian Arabic stories that have franco text. -->
          <button
            v-if="story.franco && hasFranco(lang)"
            @click="francoOn = !francoOn"
            :class="[
              'text-xs px-3 py-1 rounded-full border transition-all',
              francoOn
                ? 'bg-orange-400 text-white border-orange-400'
                : 'border-gray-700 text-gray-400 hover:border-orange-300'
            ]"
          >Franco</button>
          <button
            @click="$emit('go', 'retype')"
            class="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all"
          >{{ t(lang, 'retype') }} →</button>
        </div>
      </div>

      <!-- Story text: displayed as clickable individual words. -->
      <div
        class="leading-loose text-base"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-lg' : ''"
      >
        <span v-for="(token, i) in tokens" :key="i">
          <span
            v-if="token.type === 'word'"
            @click="tap(token.text)"
            :class="[
              'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950',
              savedWords.has(normalize(token.text)) ? 'bg-green-900 text-green-300' : ''
            ]"
          >{{ token.text }}</span>
          <span v-else>{{ token.text }}</span>
        </span>
      </div>

      <!-- Franco transliteration line -->
      <div
        v-if="francoOn && story.franco"
        class="text-sm text-gray-500 border-t border-gray-800 pt-3 break-words"
        dir="ltr"
      >{{ story.franco }}</div>

      <!-- Word panel: appears below the story when a word has been tapped. -->
      <div
        v-if="tapped"
        class="border border-green-700 rounded-lg p-4 bg-green-950 flex flex-col gap-2"
      >
        <!-- Top row: the tapped word (large) + Save button. -->
        <div class="flex items-start justify-between">
          <div class="text-xl font-semibold" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ tapped.word }}</div>
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(tapped.word))"
            class="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all"
          >{{ savedWords.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}</button>
        </div>

        <!-- Context sentence -->
        <div
          v-if="tapped.sentence"
          class="text-sm text-gray-400 italic"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ tapped.sentence }}</div>

        <!-- No-voice warning -->
        <div v-if="!langHasVoice" class="text-xs text-amber-600 flex items-center gap-1">
          No {{ LANGS[lang]?.name }} voice installed.
          <a href="ms-settings:regionlanguage" class="underline hover:text-amber-800">Install in Windows Settings</a>
          or
          <button @click="$emit('go', 'settings')" class="underline hover:text-amber-800">pick a voice</button>.
        </div>

        <!-- Examples panel: Tatoeba / Wikipedia / Wikiquote tabs. -->
        <!-- :word="tapped.word"  = passes the currently tapped word as the search term. -->
        <!-- :savedWords          = the Set of saved words so already-saved ones highlight green. -->
        <!-- @tap                 = ExamplesPanel emits { word, sentence } when the user clicks -->
        <!--                        a word inside an example. We forward it to tap() so the word -->
        <!--                        gets spoken and the word panel updates to the clicked word. -->
        <!-- ({ word: w, sentence }) = destructuring rename: avoids shadowing the outer 'word'. -->
        <ExamplesPanel
          :word="tapped.word"
          :lang="lang"
          :savedWords="savedWords"
          @tap="({ word: w, sentence }) => tap(w, sentence)"
        />
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL, hasFranco } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
import { trackWord } from '../utils/api.js'
import ExamplesPanel from '../components/ExamplesPanel.vue'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  Object, // Set of normalized words for the active language
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['go', 'saveWord'])

const francoOn = ref(false)
const tapped   = ref(null)

const voices = useVoiceList()

const langHasVoice = computed(() => {
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  return voicesForLang(voices.value, bcp47).length > 0
})

const tokens = computed(() => {
  if (!props.story) return []
  return props.story.content.split(/(\s+)/).map(t => ({
    type: /^\s+$/.test(t) ? 'space' : 'word',
    text: t,
  }))
})

function tap(word, contextSentence) {
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return

  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt   = new SpeechSynthesisUtterance(clean)
  utt.lang    = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)

  if (props.currentUser) {
    trackWord(clean, props.lang, props.story?.title ?? '')
  }

  const sentence = contextSentence
    ?? props.story?.content.split(/(?<=[.!?؟।。！？])\s*/).find(s => s.includes(word))
    ?? ''

  tapped.value = { word: clean, sentence }
}

function saveWord() {
  if (!tapped.value) return
  emit('saveWord', {
    word:     tapped.value.word,
    lang:     props.lang,
    sentence: tapped.value.sentence,
    story:    props.story?.title ?? '',
  })
}
</script>
