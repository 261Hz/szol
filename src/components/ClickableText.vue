<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <button
        v-if="tok.type === 'word'"
        type="button"
        @click="$emit('tap', { word: tok.text, sentence: text })"
        :class="[
          'inline whitespace-nowrap rounded px-0.5 transition-all hover:bg-emerald-50 active:bg-emerald-50 select-none bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit] leading-[inherit] cursor-pointer',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-emerald-100 text-emerald-700' : '',
        ]"
      >{{ tok.text }}</button>
      <span v-else>{{ tok.text }}</span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { isRTL } from '../utils/rtl.js'

const props = defineProps({
  text:       String,
  lang:       String,
  savedWords: Object, // Set<string> of already-saved normalized words
})

defineEmits(['tap'])

function normalize(word) {
  return word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
}

const CJK_LANGS = new Set(['ja', 'zh', 'cmn', 'yue', 'ko'])

const tokens = computed(() => {
  const text = props.text || ''
  if (CJK_LANGS.has(props.lang)) {
    // CJK has no spaces between words — each character is an independently
    // tappable unit so learners can look up individual kanji/hanzi
    return [...text].map(char => ({
      type: /\s/.test(char) ? 'space' : 'word',
      text: char,
    }))
  }
  return text.split(/(\s+)/).map(tok => ({
    type: /^\s+$/.test(tok) ? 'space' : 'word',
    text: tok,
  }))
})
</script>
