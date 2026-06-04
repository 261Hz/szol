<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <button
        v-if="tok.type === 'word'"
        type="button"
        @click="$emit('tap', { word: tok.text, sentence: text })"
        :class="[
          'inline whitespace-nowrap rounded px-0.5 transition-all hover:bg-green-950 active:bg-green-950 select-none bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit] leading-[inherit] cursor-pointer',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
        ]"
      >{{ tok.text }}</button>
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
  savedWords: Object,
})

defineEmits(['tap'])

const tokens = computed(() =>
  (props.text || '').split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
)
</script>
