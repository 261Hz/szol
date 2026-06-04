<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <span
        v-if="tok.type === 'word'"
        @pointerdown="onPointerDown"
        @pointerup="(e) => onPointerUp(e, tok.text)"
        :class="[
          'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950 active:bg-green-950 select-none',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
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
  savedWords: Object,
})

const emit = defineEmits(['tap'])

const tokens = computed(() =>
  (props.text || '').split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
)

let startX = 0
let startY = 0

function onPointerDown(e) {
  startX = e.clientX
  startY = e.clientY
}

function onPointerUp(e, word) {
  // Only emit on a genuine tap (< 10px movement). Scrolls move more.
  if (Math.abs(e.clientX - startX) < 10 && Math.abs(e.clientY - startY) < 10) {
    emit('tap', { word, sentence: props.text })
  }
}
</script>
