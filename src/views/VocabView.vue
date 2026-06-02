<template>
  <div class="flex flex-col gap-4">

    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-700">
        {{ t(lang, 'vocab') }}
      </div>
      <div class="text-xs text-gray-400">{{ words.length }} {{ t(lang, 'words') }}</div>
    </div>

    <div v-if="!words.length" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'tapWord') }}
    </div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="(word, i) in words"
        :key="i"
        class="border border-gray-200 rounded-lg p-4 flex flex-col gap-1"
      >
        <div class="flex items-start justify-between">
          <div class="text-xs text-emerald-600 font-medium">
            {{ LANGS[word.lang]?.name ?? word.lang }}
          </div>
          <button
            @click="$emit('remove', i)"
            class="text-xs text-gray-300 hover:text-red-400 transition-all"
          >
            ✕
          </button>
        </div>
        <div class="text-lg font-semibold text-gray-900">{{ word.word }}</div>
        <div v-if="word.sentence" class="text-sm text-gray-500 italic">{{ word.sentence }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { t } from '../utils/i18n.js'
import { LANGS } from '../data/stories.js'

defineProps({
  words: Array,
  lang: String,
})

defineEmits(['remove'])
</script>
