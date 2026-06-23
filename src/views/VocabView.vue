<template>
  <div class="flex flex-col gap-0">

    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm" style="color:rgba(31,27,23,0.55); font-family:'IM Fell English',serif; letter-spacing:0.04em;">{{ t(lang, 'vocab') }}</div>
      <div class="text-xs" style="color:rgba(31,27,23,0.3); font-style:italic;">{{ filtered.length }} {{ t(lang, 'words') }}</div>
    </div>

    <!-- Empty state -->
    <div v-if="!filtered.length" class="text-center py-12" style="color:rgba(31,27,23,0.3); font-style:italic; font-size:0.875rem; font-family:'EB Garamond',serif;">
      {{ t(lang, 'tapWord') }}
    </div>

    <!-- Word list -->
    <div v-else ref="vocabListEl" class="flex flex-col">
      <div
        v-for="({ word, originalIndex }) in filtered"
        :key="originalIndex"
        class="flex flex-col gap-1.5 py-4"
        style="border-bottom:1px solid rgba(31,27,23,0.08);"
      >
        <!-- Language tag + remove -->
        <div class="flex items-start justify-between">
          <div class="text-xs uppercase tracking-widest" style="color:rgba(31,27,23,0.3); letter-spacing:0.12em;">{{ LANGS[word.lang]?.name ?? word.lang }}</div>
          <button
            @click="emit('remove', originalIndex)"
            class="text-xs transition-all"
            style="color:rgba(31,27,23,0.22);"
            onmouseover="this.style.color='#8b3a3a'"
            onmouseout="this.style.color='rgba(31,27,23,0.22)'"
          >✕</button>
        </div>

        <!-- Word (large) -->
        <div class="text-xl" style="color:#1f1b17; font-family:'IM Fell English',serif; line-height:1.3;">
          <ClickableText
            :text="word.word"
            :lang="word.lang"
            :savedWords="savedWordsSet"
            @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
          />
        </div>

        <!-- Context sentence -->
        <div v-if="word.sentence" class="text-sm italic" style="color:rgba(31,27,23,0.5); line-height:1.55; font-family:'EB Garamond',serif;">
          <ClickableText
            :text="word.sentence"
            :lang="word.lang"
            :savedWords="savedWordsSet"
            @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
          />
        </div>

        <!-- Corpus frequency rank -->
        <div v-if="frequencyMap[word.word.toLowerCase()] != null" class="flex items-center gap-1.5 relative">
          <button
            class="text-xs hover:underline focus:outline-none transition-all"
            :style="rankColor(frequencyMap[word.word.toLowerCase()])"
            @click.stop="freqPopup = freqPopup === word.word ? null : word.word"
          >#{{ frequencyMap[word.word.toLowerCase()].toLocaleString() }}</button>
          <span class="text-xs" style="color:rgba(31,27,23,0.3); font-style:italic;">
            {{ frequencyMap[word.word.toLowerCase()] <= 500 ? 'very common' : frequencyMap[word.word.toLowerCase()] <= 2000 ? 'common' : 'less common' }}
          </span>
          <span
            v-if="wordLevel(word.word, word.lang)"
            :class="wordLevel(word.word, word.lang).cls"
            :title="wordLevel(word.word, word.lang).tip"
            class="text-xs font-semibold"
          >{{ wordLevel(word.word, word.lang).label }}</span>

          <!-- Frequency popup -->
          <div
            v-if="freqPopup === word.word"
            class="absolute bottom-full left-0 mb-2 z-10 w-64 p-3 shadow-lg text-xs flex flex-col gap-1.5"
            style="background:#ece4ca; border:1px solid rgba(31,27,23,0.12); border-radius:2px; color:rgba(31,27,23,0.65); font-family:'EB Garamond',serif;"
            @click.stop
          >
            <div style="color:#1f1b17; font-family:'IM Fell English',serif;">Corpus frequency rank</div>
            <div>This word ranks <span :style="rankColor(frequencyMap[word.word.toLowerCase()])">#{{ frequencyMap[word.word.toLowerCase()].toLocaleString() }}</span> — lower means more common.</div>
            <div style="color:rgba(31,27,23,0.38);">Data: <a href="https://wortschatz.uni-leipzig.de" target="_blank" class="underline">Leipzig Wortschatz</a></div>
            <button @click="freqPopup = null" class="self-end text-xs transition-opacity hover:opacity-50" style="color:rgba(31,27,23,0.4);">close ✕</button>
          </div>
        </div>

        <!-- Exposure stats (logged in) -->
        <div v-if="currentUser && userWordMap[word.word.toLowerCase()]" class="flex flex-col gap-0.5">
          <div class="text-xs flex items-center gap-1.5 flex-wrap" style="font-family:'EB Garamond',serif; font-style:italic;">
            <span :style="exposureColor(userWordMap[word.word.toLowerCase()].seen_count)">
              {{ exposureLabel(userWordMap[word.word.toLowerCase()].seen_count) }}
            </span>
            <span style="color:rgba(31,27,23,0.2);">·</span>
            <span style="color:rgba(31,27,23,0.45);">seen {{ userWordMap[word.word.toLowerCase()].seen_count }}×</span>
            <span style="color:rgba(31,27,23,0.2);">·</span>
            <span style="color:rgba(31,27,23,0.32);">{{ timeAgo(userWordMap[word.word.toLowerCase()].last_seen) }}</span>
          </div>
          <div
            v-if="userWordMap[word.word.toLowerCase()].stories?.length"
            class="text-xs truncate"
            style="color:rgba(31,27,23,0.28); font-style:italic;"
            :title="userWordMap[word.word.toLowerCase()].stories.join(', ')"
          >
            from {{ userWordMap[word.word.toLowerCase()].stories.slice(0, 2).join(', ') }}{{ userWordMap[word.word.toLowerCase()].stories.length > 2 ? ` +${userWordMap[word.word.toLowerCase()].stories.length - 2} more` : '' }}
          </div>
        </div>

        <!-- Login prompt -->
        <div v-else-if="!currentUser" class="text-xs" style="color:rgba(31,27,23,0.35); font-style:italic; font-family:'EB Garamond',serif;">
          <button @click="emit('openAuth')" class="underline transition-all" style="color:#8b3a3a;">Login</button>
          to track how often you see each word
        </div>

        <ExamplesPanel
          :word="word.word"
          :lang="word.lang"
          :savedWords="savedWordsSet"
          :currentUser="currentUser"
          @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
          @openAuth="emit('openAuth')"
          @openClip="clip => emit('openClip', clip)"
        />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { t }    from '../utils/i18n.js'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'
import { LANGS } from '../data/stories.js'
import ExamplesPanel  from '../components/ExamplesPanel.vue'
import ClickableText  from '../components/ClickableText.vue'
import { getUserWords, getWordFrequency } from '../utils/api.js'
import { getWordLevel as wordLevel } from '../data/levels.js'

const props = defineProps({
  words:       Array,
  lang:        String,
  currentUser: Object,
})

const emit = defineEmits(['remove', 'saveWord', 'openAuth', 'openClip'])

const vocabListEl = ref(null)
watch([() => props.words, () => props.lang, rootHighlightOn], ([, , on]) => {
  nextTick(() => on ? applyRoots(vocabListEl.value, props.lang) : clearRoots())
})

const freqPopup = ref(null)
onMounted(() => document.addEventListener('click', () => { freqPopup.value = null }))
onUnmounted(() => document.removeEventListener('click', () => { freqPopup.value = null }))

const userWordMap  = ref({})
const frequencyMap = ref({})

watch(
  [() => props.currentUser, () => props.lang],
  async ([user, lang]) => {
    if (!user) { userWordMap.value = {}; return }
    const list = await getUserWords(lang)
    userWordMap.value = Object.fromEntries(list.map(w => [w.word.toLowerCase(), w]))
  },
  { immediate: true }
)

watch(
  [() => props.words, () => props.lang],
  async ([words, lang]) => {
    const langWords = words.filter(w => w.lang === lang)
    if (!langWords.length) { frequencyMap.value = {}; return }
    const results = await Promise.all(langWords.map(w => getWordFrequency(w.word, lang)))
    const map = {}
    results.forEach((r, i) => { if (r?.frequency_rank != null) map[langWords[i].word.toLowerCase()] = r.frequency_rank })
    frequencyMap.value = map
  },
  { immediate: true }
)

const filtered = computed(() =>
  props.words
    .map((word, originalIndex) => ({ word, originalIndex }))
    .filter(({ word }) => word.lang === props.lang)
)

const savedWordsSet = computed(() =>
  new Set(
    props.words
      .filter(w => w.lang === props.lang)
      .map(w => w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, ''))
  )
)

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)
  if (mins  <  2)  return 'just now'
  if (hours <  1)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  <  2)  return 'yesterday'
  if (days  <  7)  return `${days} days ago`
  if (weeks <  5)  return `${weeks} week${weeks > 1 ? 's' : ''} ago`
  return new Date(dateStr).toLocaleDateString()
}

function exposureLabel(count) {
  if (count >= 10) return 'Strong'
  if (count >=  5) return 'Familiar'
  if (count >=  2) return 'Learning'
  return 'New'
}

function exposureColor(count) {
  if (count >= 10) return 'color:#3a7a3a;'
  if (count >=  5) return 'color:#a88a4a;'
  if (count >=  2) return 'color:rgba(31,27,23,0.6);'
  return 'color:rgba(31,27,23,0.38);'
}

function rankColor(rank) {
  if (rank <= 500)  return 'color:#3a7a3a;'
  if (rank <= 2000) return 'color:#a88a4a;'
  return 'color:rgba(31,27,23,0.45);'
}

function saveFromExample(wordText, sentence, lang) {
  const clean = wordText.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return
  const key = clean.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  const alreadySaved = props.words.some(
    w => w.lang === lang && w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key
  )
  if (alreadySaved) return
  emit('saveWord', { word: clean, lang, sentence, story: '' })
}
</script>
