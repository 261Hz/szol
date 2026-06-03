<template>
  <div class="flex flex-col gap-4">

    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-700">{{ t(lang, 'vocab') }}</div>
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
          <div>
            <div class="text-xs text-emerald-600 font-medium">
              {{ word.langName }}{{ word.pos ? ' · ' + word.pos : '' }}
            </div>
            <div class="text-lg font-semibold text-gray-900" :dir="word.rtl ? 'rtl' : 'ltr'">
              {{ word.word }}
            </div>
          </div>
          <button @click="$emit('remove', i)" class="text-xs text-gray-300 hover:text-red-400 transition-all">✕</button>
        </div>

        <div v-if="word.def" class="text-sm text-gray-600">{{ word.def }}</div>
        <div v-if="word.ex" class="text-xs text-gray-400 italic">"{{ word.ex }}"</div>
        <div v-if="word.note" class="text-xs text-gray-500 mt-1 border-t border-gray-100 pt-1">{{ word.note }}</div>

        <!-- Word frequency row — shown when logged in and data is available -->
        <div v-if="currentUser && wordMap[word.word?.toLowerCase()]"
          class="text-xs text-emerald-600 flex gap-2 mt-0.5">
          <span>Seen {{ wordMap[word.word.toLowerCase()].seen_count }}×</span>
          <span class="text-gray-300">·</span>
          <span>First {{ new Date(wordMap[word.word.toLowerCase()].first_seen).toLocaleDateString() }}</span>
        </div>

        <!-- Login prompt — shown when logged out -->
        <div v-else-if="!currentUser" class="text-xs text-gray-400 mt-0.5">
          <button @click="$emit('open-auth')" class="underline hover:text-emerald-500 transition-all">Login</button>
          to track how often you see each word
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { t } from '../utils/i18n.js'
import { getUserWords } from '../utils/api.js'

const props = defineProps({
  words:       Array,
  lang:        String,
  currentUser: Object,
})

defineEmits(['remove', 'open-auth'])

// wordMap = { wordLower: UserWordResponse } fetched when logged in + lang changes
const wordMap = ref({})

watch(
  [() => props.currentUser, () => props.lang],
  async ([user, lang]) => {
    if (!user) { wordMap.value = {}; return }
    const list = await getUserWords(lang)
    wordMap.value = Object.fromEntries(list.map(w => [w.word.toLowerCase(), w]))
  },
  { immediate: true }
)
</script>
