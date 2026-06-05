<template>
  <div class="min-h-screen bg-white flex flex-col items-center justify-center px-6 gap-10">

    <!-- Brand -->
    <div class="text-center">
      <div class="text-5xl font-semibold tracking-tight mb-2">
        Sz<span class="text-emerald-500">ó</span>l
      </div>
      <div class="text-gray-400 text-sm">Which language are you learning?</div>
    </div>

    <!-- Language grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-md">
      <button
        v-for="(cfg, code) in LANGS"
        :key="code"
        type="button"
        @click="$emit('pick', code)"
        class="flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-center"
      >
        <div class="text-2xl">{{ FLAGS[code] }}</div>
        <div class="text-sm font-medium text-gray-800 leading-tight">{{ cfg.name }}</div>
      </button>
    </div>

  </div>
</template>

<script setup>
import { LANGS } from '../data/stories.js'

defineEmits(['pick'])

const FLAGS = {
  en:  '🇬🇧',
  es:  '🇪🇸',
  fr:  '🇫🇷',
  de:  '🇩🇪',
  it:  '🇮🇹',
  ru:  '🇷🇺',
  he:  '🇮🇱',
  ar:  '🇸🇦',
  arz: '🇪🇬',
  ja:  '🇯🇵',
  zh:  '🇨🇳',
  hu:  '🇭🇺',
  el:  '🇬🇷',
}
</script>
