<template>
  <div class="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 gap-10">

    <!-- Brand -->
    <div class="text-center">
      <div class="text-5xl font-bold tracking-tight text-gray-50 mb-2">
        Sz<span class="text-violet-400">ó</span>l
      </div>
      <div class="text-gray-500 text-sm">Learn languages through reading and practice</div>
    </div>

    <!-- Language grid -->
    <div class="w-full max-w-sm">
      <div class="text-xs text-gray-600 uppercase tracking-widest mb-4 text-center">
        I'm learning
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="(cfg, code) in LANGS"
          :key="code"
          type="button"
          @click="selected = code"
          :class="[
            'flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border transition-all text-center',
            selected === code
              ? 'border-violet-500 bg-violet-950 text-violet-200'
              : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200',
          ]"
        >
          <div class="text-2xl leading-none">{{ FLAGS[code] }}</div>
          <div class="text-xs font-medium leading-tight">{{ cfg.name }}</div>
        </button>
      </div>
    </div>

    <!-- Actions — shown once a language is selected -->
    <div class="w-full max-w-sm flex flex-col items-center gap-3">
      <button
        v-if="selected"
        type="button"
        @click="$emit('pick', selected)"
        class="w-full py-3 rounded-xl bg-green-700 text-white font-medium text-sm hover:bg-green-600 transition-all"
      >
        Get started →
      </button>
      <div v-else class="text-xs text-gray-700 py-3">← Pick a language to continue</div>

      <button
        type="button"
        @click="$emit('sign-in', selected)"
        :disabled="!selected"
        class="text-sm text-green-500 hover:text-gray-300 disabled:opacity-30 transition-all"
      >
        Sign in / Create account
      </button>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { LANGS } from '../data/stories.js'

defineEmits(['pick', 'sign-in'])

const selected = ref(null)

const FLAGS = {
  en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  it: '🇮🇹', ru: '🇷🇺', he: '🇮🇱', ar: '🇸🇦',
  arz: '🇪🇬', ja: '🇯🇵', zh: '🇨🇳', hu: '🇭🇺', el: '🇬🇷',
}
</script>
