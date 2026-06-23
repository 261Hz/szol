<!-- ReadView.vue: shows a story with clickable words. -->
<!-- Tapping a word speaks it aloud (TTS), shows the sentence it came from, and lets you save it. -->
<template>
  <!-- Outermost container stacks elements vertically with a gap between them. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is loaded yet (user hasn't picked one from the Library). -->
    <div v-if="!story" class="text-sm text-center py-12" style="color:rgba(31,27,23,0.35); font-style:italic; font-family:'EB Garamond',serif;">
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
          <div class="text-xs mt-0.5" style="color:rgba(31,27,23,0.4); font-family:'EB Garamond',serif;">
            {{ LANGS[lang]?.name }}
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
          <div v-if="knownInText > 0" class="text-xs mt-0.5" style="color:#3a7a3a;">
            {{ knownInText }} {{ knownInText === 1 ? 'word' : 'words' }} from your collection
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
                : 'border-[rgba(31,27,23,0.2)] text-[rgba(31,27,23,0.45)] hover:border-orange-400'
            ]"
          >Franco</button>
          <button
            @click="$emit('go', 'retype')"
            class="text-xs px-3 py-1.5 transition-all"
            style="background:#2a2018; color:#e8dcc4; border-radius:2px; font-family:'EB Garamond',serif;"
          >{{ t(lang, 'retype') }} →</button>
        </div>
      </div>

      <!-- Story text: displayed as clickable individual words. -->
      <div
        ref="storyEl"
        class="leading-loose text-base"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-lg' : ''"
      >
        <span v-for="(token, i) in tokens" :key="i">
          <span
            v-if="token.type === 'word'"
            @click="tap(token.text)"
            :class="[
              'cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]',
              savedWords.has(normalize(token.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : ''
            ]"
          >{{ token.text }}</span>
          <span v-else>{{ token.text }}</span>
        </span>
      </div>

      <!-- Franco transliteration line -->
      <div
        v-if="francoOn && story.franco"
        class="text-sm pt-3 break-words" style="color:rgba(31,27,23,0.4); border-top:1px solid rgba(31,27,23,0.1);"
        dir="ltr"
      >{{ story.franco }}</div>

      <!-- Word panel: appears below the story when a word has been tapped. -->
      <div
        v-if="tapped"
        class="p-4 flex flex-col gap-2" style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.12); border-radius:3px;"
      >
        <!-- Top row: the tapped word (large) + Save button. -->
        <div class="flex items-start justify-between">
          <div class="text-xl font-semibold" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ tapped.word }}</div>
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(tapped.word))"
            class="text-xs px-3 py-1.5 disabled:opacity-40 transition-all"
            style="background:#2a2018; color:#e8dcc4; border-radius:2px; font-family:'EB Garamond',serif;"
          >{{ savedWords.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}</button>
        </div>

        <!-- Frequency rank badge -->
        <div v-if="tapped.frequencyRank != null" class="flex items-center gap-1.5">
          <span
            class="text-xs font-medium"
            :style="tapped.frequencyRank <= 500 ? 'color:#3a7a3a;' : tapped.frequencyRank <= 2000 ? 'color:#a88a4a;' : 'color:rgba(31,27,23,0.4);'"
          >#{{ tapped.frequencyRank.toLocaleString() }}</span>
          <span class="text-xs" style="color:rgba(31,27,23,0.3);">
            {{ tapped.frequencyRank <= 500 ? 'very common word' : tapped.frequencyRank <= 2000 ? 'common word' : 'less common word' }}
          </span>
        </div>

        <!-- Context sentence -->
        <div
          v-if="tapped.sentence"
          class="text-sm italic" style="color:rgba(31,27,23,0.5); font-family:'EB Garamond',serif;"
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
          :currentUser="currentUser"
          @tap="({ word: w, sentence }) => tap(w, sentence)"
          @openAuth="$emit('openAuth')"
        />
      </div>

      <!-- Cross-link strip: related stories by collection overlap -->
      <div v-if="relatedStories.length" class="flex flex-col gap-2 pt-3" style="border-top:1px solid rgba(31,27,23,0.09);">
        <div class="text-xs uppercase tracking-widest" style="color:rgba(31,27,23,0.3); letter-spacing:0.14em; font-family:'EB Garamond',serif;">Also in your collection</div>
        <div class="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            v-for="s in relatedStories"
            :key="s.id"
            @click="$emit('switch-story', s)"
            class="flex-shrink-0 text-left p-2.5 transition-all"
            style="border:1px solid rgba(31,27,23,0.1); border-radius:2px; max-width:150px;"
            onmouseover="this.style.borderColor='rgba(31,27,23,0.28)'"
            onmouseout="this.style.borderColor='rgba(31,27,23,0.1)'"
          >
            <div class="text-xs font-medium leading-snug line-clamp-2" style="color:#1f1b17;" :dir="isRTL(s.lang) ? 'rtl' : 'ltr'">{{ s.title }}</div>
            <div class="text-[10px] mt-1" style="color:#3a7a3a;">{{ s.score }} known</div>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL, hasFranco } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
import { trackWord, getWordFrequency } from '../utils/api.js'
import ExamplesPanel from '../components/ExamplesPanel.vue'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  Object,   // Set of normalized words for the active language
  currentUser: Object,   // null if logged out
  storyPool:   { type: Array, default: () => [] },
  echoesFor:   { type: Function, default: null },
})

const emit = defineEmits(['go', 'saveWord', 'openAuth', 'switch-story'])

// Use echo index when available; fall back to ad-hoc overlap scan.
const relatedStories = computed(() => {
  if (!props.story) return []

  if (props.echoesFor) {
    const echoes = props.echoesFor(props.story)
    // Group by exposureId, pick the strongest match per story
    const byStory = {}
    for (const ev of echoes) {
      if (!byStory[ev.exposureId] || ev.triggers.length > byStory[ev.exposureId].score) {
        const s = props.storyPool.find(s => s.id === ev.exposureId)
        if (s) byStory[ev.exposureId] = { ...s, score: ev.triggers.length }
      }
    }
    return Object.values(byStory).sort((a, b) => b.score - a.score).slice(0, 5)
  }

  // fallback: inline scan when echo index not yet available
  if (!props.storyPool?.length || !props.savedWords?.size) return []
  return props.storyPool
    .filter(s => s.id !== props.story?.id && s.lang === props.lang)
    .map(s => {
      const text = s.content ?? s.text ?? ''
      const seen = new Set()
      for (const raw of text.split(/\s+/)) {
        const n = normalize(raw)
        if (n && props.savedWords.has(n)) seen.add(n)
      }
      return { ...s, score: seen.size }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
})

const knownInText = computed(() => {
  if (!props.story?.content || !props.savedWords?.size) return 0
  const seen = new Set()
  for (const raw of props.story.content.split(/\s+/)) {
    const n = normalize(raw)
    if (n && props.savedWords.has(n)) seen.add(n)
  }
  return seen.size
})

const francoOn = ref(false)
const tapped   = ref(null)
const storyEl  = ref(null)

function refreshRoots() {
  nextTick(() => applyRoots(storyEl.value, props.lang))
}
watch(() => props.story, refreshRoots)
watch(() => props.lang,  () => { clearRoots(); refreshRoots() })
watch(rootHighlightOn, v => v ? refreshRoots() : clearRoots())

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

  tapped.value = { word: clean, sentence, frequencyRank: null }
  getWordFrequency(clean, props.lang).then(data => {
    if (tapped.value?.word === clean) tapped.value.frequencyRank = data?.frequency_rank ?? null
  })
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
