<!-- VocabView.vue: shows the user's saved vocabulary words for the active language. -->
<template>
  <div class="flex flex-col gap-4">

    <!-- Header: "Vocabulary" label + count -->
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-200">{{ t(lang, 'vocab') }}</div>
      <div class="text-xs text-gray-500">{{ filtered.length }} {{ t(lang, 'words') }}</div>
    </div>

    <!-- Empty state -->
    <div v-if="!filtered.length" class="text-gray-500 text-sm text-center py-12">
      {{ t(lang, 'tapWord') }}
    </div>

    <!-- Word card list -->
    <div v-else class="flex flex-col gap-3">
      <div
        v-for="({ word, originalIndex }) in filtered"
        :key="originalIndex"
        class="border border-gray-700 rounded-lg p-4 flex flex-col gap-1"
      >
        <!-- Top row: language tag + remove button -->
        <div class="flex items-start justify-between">
          <div class="text-xs text-green-400 font-medium">{{ LANGS[word.lang]?.name ?? word.lang }}</div>
          <button @click="emit('remove', originalIndex)" class="text-xs text-gray-600 hover:text-red-400 transition-all">✕</button>
        </div>

        <!-- Word (large) — clickable to save related words from context -->
        <div class="text-lg font-semibold text-gray-50">
          <ClickableText
            :text="word.word"
            :lang="word.lang"
            :savedWords="savedWordsSet"
            @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
          />
        </div>

        <!-- Context sentence — every word clickable to add to vocab -->
        <div v-if="word.sentence" class="text-sm text-gray-400 italic">
          <ClickableText
            :text="word.sentence"
            :lang="word.lang"
            :savedWords="savedWordsSet"
            @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
          />
        </div>

        <!-- Corpus frequency rank — always visible, no login needed -->
        <div v-if="frequencyMap[word.word.toLowerCase()] != null" class="flex items-center gap-1.5 relative">
          <button
            :class="rankColor(frequencyMap[word.word.toLowerCase()])"
            class="text-xs font-medium hover:underline focus:outline-none"
            @click.stop="freqPopup = freqPopup === word.word ? null : word.word"
          >#{{ frequencyMap[word.word.toLowerCase()].toLocaleString() }}</button>
          <span class="text-xs text-gray-600">
            {{ frequencyMap[word.word.toLowerCase()] <= 500 ? 'very common' : frequencyMap[word.word.toLowerCase()] <= 2000 ? 'common' : 'less common' }}
          </span>
          <!-- Frequency source popup -->
          <div
            v-if="freqPopup === word.word"
            class="absolute bottom-full left-0 mb-2 z-10 w-64 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs text-gray-300 flex flex-col gap-1.5"
            @click.stop
          >
            <div class="font-semibold text-gray-100">Corpus frequency rank</div>
            <div>This word ranks <span :class="rankColor(frequencyMap[word.word.toLowerCase()])" class="font-medium">#{{ frequencyMap[word.word.toLowerCase()].toLocaleString() }}</span> by frequency — lower means more common.</div>
            <div class="text-gray-500">Data: <a href="https://wortschatz.uni-leipzig.de" target="_blank" class="underline hover:text-gray-300">Leipzig Wortschatz</a> news &amp; web corpora.</div>
            <button @click="freqPopup = null" class="self-end text-gray-600 hover:text-gray-400 mt-0.5">close ✕</button>
          </div>
        </div>

        <!-- Personal seen count — only when logged in -->
        <div
          v-if="currentUser && userWordMap[word.word.toLowerCase()]"
          class="flex flex-col gap-0.5"
        >
          <div class="text-xs flex items-center gap-1.5 flex-wrap">
            <!-- Exposure level badge -->
            <span :class="exposureColor(userWordMap[word.word.toLowerCase()].seen_count)"
                  class="font-medium">
              {{ exposureLabel(userWordMap[word.word.toLowerCase()].seen_count) }}
            </span>
            <span class="text-gray-600">·</span>
            <!-- Seen count -->
            <span class="text-gray-400">seen {{ userWordMap[word.word.toLowerCase()].seen_count }}×</span>
            <span class="text-gray-600">·</span>
            <!-- Last seen relative time -->
            <span class="text-gray-500">{{ timeAgo(userWordMap[word.word.toLowerCase()].last_seen) }}</span>
          </div>
          <!-- Stories this word appeared in -->
          <div
            v-if="userWordMap[word.word.toLowerCase()].stories?.length"
            class="text-xs text-gray-600 truncate"
            :title="userWordMap[word.word.toLowerCase()].stories.join(', ')"
          >
            from {{ userWordMap[word.word.toLowerCase()].stories.slice(0, 2).join(', ') }}{{ userWordMap[word.word.toLowerCase()].stories.length > 2 ? ` +${userWordMap[word.word.toLowerCase()].stories.length - 2} more` : '' }}
          </div>
        </div>

        <!-- Login prompt when logged out -->
        <div v-else-if="!currentUser" class="text-xs text-gray-500">
          <button @click="emit('openAuth')" class="underline hover:text-green-400 transition-all">Login</button>
          to track how often you see each word
        </div>

        <!-- Examples panel: Tatoeba / Wikipedia / Wikiquote tabs. -->
        <!-- :word="word.word"    = the vocab word is the search term for all three sources. -->
        <!-- :lang="word.lang"    = use the word's own language, not the active UI language    -->
        <!--                        (they're always the same here since VocabView filters by lang, -->
        <!--                        but being explicit avoids confusion if that ever changes).   -->
        <!-- :savedWords          = Set of normalized words already saved for this language,    -->
        <!--                        so clicking a word in examples that's already saved         -->
        <!--                        highlights it green instead of saving it again.             -->
        <!-- @tap                 = in VocabView, clicking a word in examples SAVES it to vocab -->
        <!--                        (vs ReadView where clicking SPEAKS the word instead).       -->
        <!-- ({ word: w, sentence }) = destructuring with rename to avoid shadowing the v-for 'word'. -->
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { t }    from '../utils/i18n.js'
import { LANGS } from '../data/stories.js'
import ExamplesPanel  from '../components/ExamplesPanel.vue'
import ClickableText  from '../components/ClickableText.vue'
import { getUserWords, getWordFrequency } from '../utils/api.js'

const props = defineProps({
  words:       Array,  // full vocabBank array (all languages)
  lang:        String, // active language code — only words matching this are shown
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['remove', 'saveWord', 'openAuth', 'openClip'])

// freqPopup holds the word whose frequency popup is currently open, or null.
const freqPopup = ref(null)
onMounted(() => document.addEventListener('click', () => { freqPopup.value = null }))
onUnmounted(() => document.removeEventListener('click', () => { freqPopup.value = null }))

// userWordMap = { normalizedWord: { seen_count, first_seen, frequency_rank, ... } }
// Fetched from the backend when the user is logged in and lang changes.
const userWordMap = ref({})

// frequencyMap = { word.toLowerCase(): rank } — public corpus data, no login required.
const frequencyMap = ref({})

watch(
  [() => props.currentUser, () => props.lang],
  async ([user, lang]) => {
    if (!user) { userWordMap.value = {}; return }
    const list = await getUserWords(lang)
    userWordMap.value = Object.fromEntries(
      list.map(w => [w.word.toLowerCase(), w])
    )
  },
  { immediate: true }
)

// Fetch corpus frequency rank for every word in the active language whenever words or lang changes.
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

// filtered = words matching the active language, each paired with its index in the full vocabBank.
// Pairing with the original index is essential: when the user removes a word, we must emit
// the position in the FULL array so App.vue splices the right element. If we emitted a
// filtered index instead, the wrong word would be deleted.
const filtered = computed(() =>
  props.words
    .map((word, originalIndex) => ({ word, originalIndex }))
    .filter(({ word }) => word.lang === props.lang)
)

// savedWordsSet = a Set of normalized word strings for the active language.
// Passed to ExamplesPanel as the 'savedWords' prop so examples can highlight
// already-saved words green. Recomputes automatically when props.words changes.
// Normalization: lowercase + strip non-letter characters (same as normalize() in scoring.js).
const savedWordsSet = computed(() =>
  new Set(
    props.words
      .filter(w => w.lang === props.lang)
      .map(w => w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, ''))
  )
)

// timeAgo converts a datetime string into a human-readable relative string.
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

// exposureLabel returns a learning-stage label based on how many times a word has been seen.
function exposureLabel(count) {
  if (count >= 10) return 'Strong'
  if (count >=  5) return 'Familiar'
  if (count >=  2) return 'Learning'
  return 'New'
}

// exposureColor returns a Tailwind text color matching the exposure level.
function exposureColor(count) {
  if (count >= 10) return 'text-green-400'
  if (count >=  5) return 'text-yellow-400'
  if (count >=  2) return 'text-blue-400'
  return 'text-gray-400'
}

// rankColor returns a Tailwind text color class based on how common the word is.
// Lower rank = more common = more important to know.
function rankColor(rank) {
  if (rank <= 500)  return 'text-green-400'
  if (rank <= 2000) return 'text-yellow-400'
  return 'text-gray-400'
}

// rankLabel returns a human-readable description shown as a tooltip on the rank badge.
function rankLabel(rank) {
  if (rank <= 500)  return `Top 500 — very common word (rank #${rank})`
  if (rank <= 2000) return `Rank #${rank} — fairly common word`
  return `Rank #${rank} — less common word`
}

// saveFromExample() is called when the user clicks a word in ExamplesPanel ('tap' event).
// It cleans the word, checks for duplicates, then emits 'saveWord' so App.vue can add it.
// wordText = the raw word text from the example (may include punctuation like commas).
// sentence = the full example sentence (used as context in the new vocab card).
// lang     = the word's language (always matches props.lang here, but passed explicitly for clarity).
function saveFromExample(wordText, sentence, lang) {
  // Strip punctuation from the clicked word (same regex as tap() in ReadView).
  // \p{L} = any Unicode letter. \p{M} = combining marks (diacritics like accents).
  const clean = wordText.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return // was pure punctuation — nothing to save

  // Normalize for duplicate checking: lowercase + remove punctuation.
  // We compare against the full vocabBank (not just the filtered view) to prevent
  // saving the same word twice even if it appears in examples for two different vocab cards.
  const key = clean.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  const alreadySaved = props.words.some(
    w => w.lang === lang && w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key
  )
  if (alreadySaved) return // already in vocab — ExamplesPanel will show it green instead

  // story: '' = this word came from an example, not from a story being read.
  emit('saveWord', { word: clean, lang, sentence, story: '' })
}
</script>
