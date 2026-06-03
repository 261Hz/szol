<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <span
        v-if="tok.type === 'word'"
        @click="$emit('tap', { word: tok.text, sentence: text })"
        :class="[
          'cursor-pointer rounded px-0.5 transition-all hover:bg-emerald-50',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-emerald-100 text-emerald-700' : '',
        ]"
      >{{ tok.text }}</span>
      <span v-else>{{ tok.text }}</span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { normalize } from '../utils/scoring.js'

const props = defineProps({
  text:       String,
  lang:       String,
  savedWords: Object, // Set<string> of normalized already-saved words
})

defineEmits(['tap'])

const tokens = computed(() =>
  (props.text || '').split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
)
</script>
