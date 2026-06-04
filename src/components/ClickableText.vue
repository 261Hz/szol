<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <span
        v-if="tok.type === 'word'"
        @touchstart.passive="onTouchStart"
        @touchend="(e) => onTouchEnd(e, tok.text)"
        @click="$emit('tap', { word: tok.text, sentence: text })"
        :class="[
          'cursor-pointer rounded px-0.5 transition-all hover:bg-green-950 active:bg-green-950',
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

let touchStartX = 0
let touchStartY = 0

function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e, word) {
  const dx = Math.abs(e.changedTouches[0].clientX - touchStartX)
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY)
  if (dx < 10 && dy < 10) {
    // It's a tap, not a scroll — fire immediately and suppress the synthetic click.
    e.preventDefault()
    emit('tap', { word, sentence: props.text })
  }
}
</script>
