<!-- VocabView.vue: shows the user's saved vocabulary words. -->
<!-- Each word card shows the language, the word itself, and the sentence it came from. -->
<template>
  <!-- Outer container stacks items vertically with a gap between them. -->
  <div class="flex flex-col gap-4">

    <!-- Header row: "Vocabulary" label on the left, word count on the right. -->
    <div class="flex items-center justify-between">
      <!-- t(lang, 'vocab') looks up the translated word for "Vocabulary" in the active language. -->
      <div class="text-sm font-medium text-gray-700">
        {{ t(lang, 'vocab') }}
      </div>
      <!-- words.length = how many items are in the words array. -->
      <!-- t(lang, 'words') = translated word for "words" (e.g. "palabras" in Spanish). -->
      <div class="text-xs text-gray-400">{{ words.length }} {{ t(lang, 'words') }}</div>
    </div>

    <!-- Empty state: shown when no words have been saved yet. -->
    <!-- v-if="!words.length" = show only if the array is empty (length 0 = falsy). -->
    <div v-if="!words.length" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'tapWord') }}
    </div>

    <!-- Word list: shown when there are saved words. -->
    <!-- v-else = the opposite of v-if above -- shown when the condition is NOT met. -->
    <div v-else class="flex flex-col gap-3">
      <!-- v-for loops over the words array. "word" = each item, "i" = its index (position number, 0-based). -->
      <!-- :key="i" gives each card a unique identifier so Vue can track re-renders efficiently. -->
      <div
        v-for="(word, i) in words"
        :key="i"
        class="border border-gray-200 rounded-lg p-4 flex flex-col gap-1"
      >
        <!-- Top row: language tag + remove button. -->
        <div class="flex items-start justify-between">
          <!-- Show the full language name (e.g. "Ελληνικά") using LANGS lookup. -->
          <!-- ?? word.lang = if LANGS[word.lang] is undefined, fall back to the raw code (e.g. 'el'). -->
          <div class="text-xs text-emerald-600 font-medium">
            {{ LANGS[word.lang]?.name ?? word.lang }}
          </div>
          <!-- Remove button: clicking it emits the 'remove' event with this word's index. -->
          <!-- The parent (App.vue) receives the index and uses .splice() to delete it. -->
          <button
            @click="$emit('remove', i)"
            class="text-xs text-gray-300 hover:text-red-400 transition-all"
          >
            ✕
          </button>
        </div>

        <!-- The word itself, displayed large. -->
        <div class="text-lg font-semibold text-gray-900">{{ word.word }}</div>

        <!-- The sentence the word came from (shown only if it exists). -->
        <!-- v-if="word.sentence" = only render if the sentence is not empty/null. -->
        <div v-if="word.sentence" class="text-sm text-gray-500 italic">{{ word.sentence }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
// Import the translation helper function.
import { t } from '../utils/i18n.js'
// Import LANGS to get full language names from short codes.
import { LANGS } from '../data/stories.js'

// This component expects two props from its parent (App.vue):
// words: the full vocabBank array of saved word objects
// lang:  the active language code (for translating UI labels)
defineProps({
  words: Array,  // Array = expects a list of items
  lang:  String, // String = expects a text value
})

// This component can emit one event:
// 'remove' = sent with a word's index number when the user clicks ✕
defineEmits(['remove'])
</script>
