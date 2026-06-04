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

        <!-- Word frequency row (shown only when logged in and data is available) -->
        <div
          v-if="currentUser && userWordMap[word.word.toLowerCase()]"
          class="text-xs text-green-400 flex gap-2"
        >
          <span>Seen {{ userWordMap[word.word.toLowerCase()].seen_count }}×</span>
          <span class="text-gray-600">·</span>
          <span>First {{ new Date(userWordMap[word.word.toLowerCase()].first_seen).toLocaleDateString() }}</span>
        </div>

        <!-- Subtle login prompt when logged out -->
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
          @tap="({ word: w, sentence }) => saveFromExample(w, sentence, word.lang)"
        />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { t }    from '../utils/i18n.js'
import { LANGS } from '../data/stories.js'
import ExamplesPanel  from '../components/ExamplesPanel.vue'
import ClickableText  from '../components/ClickableText.vue'
import { getUserWords } from '../utils/api.js'

const props = defineProps({
  words:       Array,  // full vocabBank array (all languages)
  lang:        String, // active language code — only words matching this are shown
  currentUser: Object, // null if logged out
})

const emit = defineEmits(['remove', 'saveWord', 'openAuth'])

// userWordMap = { normalizedWord: { seen_count, first_seen, last_seen } }
// Fetched from the backend when the user is logged in and lang changes.
const userWordMap = ref({})

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
