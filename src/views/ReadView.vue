<template>
  <div class="flex flex-col gap-6">

    <div v-if="!story" class="text-sm text-center py-12" style="color:rgba(31,27,23,0.35); font-style:italic; font-family:'EB Garamond',serif;">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else class="flex flex-col gap-4">

      <!-- Story header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title.replace(/_/g, ' ') }}
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

        <div class="flex items-center gap-2">
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

      <!-- Root mode switcher — Hebrew and Arabic only -->
      <div v-if="lang === 'ar' || lang === 'he'" class="flex gap-0.5 -mt-2">
        <button
          v-for="m in ROOT_MODES"
          :key="m.key"
          @click="rootMode = m.key"
          class="text-xs px-2 py-0.5 rounded-full transition-all"
          :style="rootMode === m.key
            ? 'background:#2a2018; color:#e8dcc4;'
            : 'color:rgba(31,27,23,0.38);'"
        >{{ m.label }}</button>
      </div>

      <!-- Story text -->
      <div
        ref="storyEl"
        class="leading-loose text-base"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-lg' : ''"
      >
        <template v-for="(token, i) in tokens" :key="i">
          <!-- Ruby annotation in Roots or Manuscript mode -->
          <ruby
            v-if="token.type === 'word' && rootMode !== 'off' && wordRootMap[token.clean]"
            class="szol-root cursor-pointer rounded px-0.5 transition-all"
            :class="savedWords.has(normalize(token.text)) ? 'bg-[rgba(139,58,58,0.13)]' : 'hover:bg-[rgba(31,27,23,0.07)]'"
            :style="rootMode === 'manuscript' ? 'color:#2c4a82;' : ''"
            @click="tap(token.text)"
          >{{ token.text }}<rt>{{ wordRootMap[token.clean] }}</rt></ruby>
          <!-- Plain word when no root found or mode is off -->
          <span
            v-else-if="token.type === 'word'"
            @click="tap(token.text)"
            :class="['cursor-pointer rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)]', savedWords.has(normalize(token.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '']"
          >{{ token.text }}</span>
          <span v-else>{{ token.text }}</span>
        </template>
      </div>

      <!-- Franco transliteration -->
      <div
        v-if="francoOn && story.franco"
        class="text-sm pt-3 break-words"
        style="color:rgba(31,27,23,0.4); border-top:1px solid rgba(31,27,23,0.1);"
        dir="ltr"
      >{{ story.franco }}</div>

      <!-- Word panel -->
      <div
        v-if="tapped"
        class="p-4 flex flex-col gap-2"
        style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.12); border-radius:3px;"
      >
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xl font-semibold" :dir="isRTL(lang) ? 'rtl' : 'ltr'">{{ tapped.word }}</div>
            <!-- Root family (shown when we know the root) -->
            <div v-if="tapped.root" class="text-xs mt-0.5 flex items-center gap-1.5" style="font-family:'EB Garamond',serif;">
              <span style="color:#8b3a3a; font-style:italic;">√ {{ tapped.root }}</span>
              <span v-if="tapped.rootFamily.length > 1" style="color:rgba(31,27,23,0.3);">·</span>
              <span v-for="(w, wi) in tapped.rootFamily.slice(0, 4)" :key="wi"
                class="text-xs cursor-pointer hover:underline transition-all"
                style="color:rgba(31,27,23,0.5);"
                @click="tap(w)"
              >{{ w }}</span>
            </div>
          </div>
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(tapped.word))"
            class="text-xs px-3 py-1.5 disabled:opacity-40 transition-all flex-shrink-0"
            style="background:#2a2018; color:#e8dcc4; border-radius:2px; font-family:'EB Garamond',serif;"
          >{{ savedWords.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}</button>
        </div>

        <div v-if="tapped.frequencyRank != null" class="flex items-center gap-1.5">
          <span
            class="text-xs font-medium"
            :style="tapped.frequencyRank <= 500 ? 'color:#3a7a3a;' : tapped.frequencyRank <= 2000 ? 'color:#a88a4a;' : 'color:rgba(31,27,23,0.4);'"
          >#{{ tapped.frequencyRank.toLocaleString() }}</span>
          <span class="text-xs" style="color:rgba(31,27,23,0.3);">
            {{ tapped.frequencyRank <= 500 ? 'very common' : tapped.frequencyRank <= 2000 ? 'common' : 'less common' }}
          </span>
        </div>

        <div
          v-if="tapped.sentence"
          class="text-sm italic"
          style="color:rgba(31,27,23,0.5); font-family:'EB Garamond',serif;"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ tapped.sentence }}</div>

        <div v-if="!langHasVoice" class="text-xs text-amber-600 flex items-center gap-1">
          No {{ LANGS[lang]?.name }} voice installed.
          <a href="ms-settings:regionlanguage" class="underline hover:text-amber-800">Install in Windows Settings</a>
          or
          <button @click="$emit('go', 'settings')" class="underline hover:text-amber-800">pick a voice</button>.
        </div>

        <ExamplesPanel
          :word="tapped.word"
          :lang="lang"
          :savedWords="savedWords"
          :currentUser="currentUser"
          @tap="({ word: w, sentence }) => tap(w, sentence)"
          @openAuth="$emit('openAuth')"
        />
      </div>

      <!-- Related stories -->
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
            <div class="text-xs font-medium leading-snug line-clamp-2" style="color:#1f1b17;" :dir="isRTL(s.lang) ? 'rtl' : 'ltr'">{{ s.title.replace(/_/g, ' ') }}</div>
            <div class="text-[10px] mt-1" style="color:#3a7a3a;">{{ s.score }} known</div>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL, hasFranco } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'
import { useVoiceList, voicesForLang, pickVoice } from '../utils/voices.js'
import { trackWord, getWordFrequency } from '../utils/api.js'
import ExamplesPanel from '../components/ExamplesPanel.vue'
import { rootMode, preFetchRoots } from '../utils/rootHighlight.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  savedWords:  Object,
  currentUser: Object,
  storyPool:   { type: Array, default: () => [] },
  echoesFor:   { type: Function, default: null },
})

const emit = defineEmits(['go', 'saveWord', 'openAuth', 'switch-story'])

const ROOT_MODES = [
  { key: 'off',        label: 'Text' },
  { key: 'roots',      label: 'Roots' },
  { key: 'manuscript', label: 'Manuscript' },
]

// ── Root annotation ───────────────────────────────────────────────────────────

const wordRootMap = ref({})   // { cleanWord: rootString }

watch(
  [() => props.story, () => props.lang, rootMode],
  async ([story, lang, mode]) => {
    if (mode === 'off' || !story || !['ar', 'he'].includes(lang)) {
      wordRootMap.value = {}
      return
    }
    const words = [...new Set(
      story.content.split(/\s+/)
        .map(w => w.replace(/[^\p{L}\p{M}]/gu, ''))
        .filter(Boolean)
    )]
    wordRootMap.value = await preFetchRoots(words, lang)
  },
  { immediate: true }
)

// Build reverse map: root → words in this story (for the root family display)
const rootFamilyMap = computed(() => {
  const map = {}  // root → [words]
  for (const [word, root] of Object.entries(wordRootMap.value)) {
    if (!map[root]) map[root] = []
    if (!map[root].includes(word)) map[root].push(word)
  }
  return map
})

// ── Related stories ───────────────────────────────────────────────────────────

const relatedStories = computed(() => {
  if (!props.story) return []
  if (props.echoesFor) {
    const echoes  = props.echoesFor(props.story)
    const byStory = {}
    for (const ev of echoes) {
      if (!byStory[ev.exposureId] || ev.triggers.length > byStory[ev.exposureId].score) {
        const s = props.storyPool.find(s => s.id === ev.exposureId)
        if (s) byStory[ev.exposureId] = { ...s, score: ev.triggers.length }
      }
    }
    return Object.values(byStory).sort((a, b) => b.score - a.score).slice(0, 5)
  }
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

// ── Story rendering ───────────────────────────────────────────────────────────

const francoOn = ref(false)
const tapped   = ref(null)
const storyEl  = ref(null)

const voices = useVoiceList()

const langHasVoice = computed(() => {
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  return voicesForLang(voices.value, bcp47).length > 0
})

const tokens = computed(() => {
  if (!props.story) return []
  return props.story.content.split(/(\s+)/).map(raw => ({
    type:  /^\s+$/.test(raw) ? 'space' : 'word',
    text:  raw,
    clean: raw.replace(/[^\p{L}\p{M}]/gu, ''),  // punctuation-stripped, for root lookup
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

  if (props.currentUser) trackWord(clean, props.lang, props.story?.title ?? '')

  const sentence = contextSentence
    ?? props.story?.content.split(/(?<=[.!?؟।。！？])\s*/).find(s => s.includes(word))
    ?? ''

  const root       = wordRootMap.value[clean] ?? null
  const rootFamily = root ? (rootFamilyMap.value[root] ?? []) : []

  tapped.value = { word: clean, sentence, frequencyRank: null, root, rootFamily }
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
