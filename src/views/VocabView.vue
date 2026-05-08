<template>
  <div class="flex flex-col gap-4">

    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-700">
        {{ t(lang, 'vocab') }}
      </div>
      <div class="text-xs text-gray-400">{{ words.length }} words</div>
    </div>

    <div v-if="!words.length" class="text-gray-400 text-sm text-center py-12">
      Tap any word in a story to look it up and save it here.
    </div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="(word, i) in words"
        :key="i"
        class="border border-gray-200 rounded-lg p-4 flex flex-col gap-1"
      >
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs text-emerald-600 font-medium">
              {{ word.langName }}{{ word.pos ? ' · ' + word.pos : '' }}
            </div>
            <div
              class="text-lg font-semibold text-gray-900"
              :dir="word.rtl ? 'rtl' : 'ltr'"
            >
              {{ word.word }}
            </div>
          </div>
          <button
            @click="$emit('remove', i)"
            class="text-xs text-gray-300 hover:text-red-400 transition-all"
          >
            ✕
          </button>
        </div>
        <div v-if="word.def" class="text-sm text-gray-600">{{ word.def }}</div>
        <div v-if="word.ex" class="text-xs text-gray-400 italic">"{{ word.ex }}"</div>
        <div v-if="word.note" class="text-xs text-gray-500 mt-1 border-t border-gray-100 pt-1">
          {{ word.note }}
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { t } from '../utils/i18n.js'

defineProps({
  words: Array,
  lang: String,
})

defineEmits(['remove'])
</script>