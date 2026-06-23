<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <button
        v-if="tok.type === 'word' && !tok.numWord"
        type="button"
        @click="handleClick(tok.text)"
        @touchstart.passive="handleTouchStart($event, tok.text)"
        @touchend.passive="handleTouchEnd"
        @touchmove.passive="handleTouchMove"
        :class="[
          'inline whitespace-nowrap rounded px-0.5 transition-all hover:bg-[rgba(31,27,23,0.07)] active:bg-[rgba(31,27,23,0.07)] select-none bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit] leading-[inherit] cursor-pointer',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-[rgba(139,58,58,0.13)] text-[#8b3a3a]' : '',
        ]"
      >{{ tok.text }}</button>
      <ruby v-else-if="tok.type === 'word' && tok.numWord" class="szol-num">{{ tok.text }}<rt>{{ tok.numWord }}</rt></ruby>
      <span v-else>{{ tok.text }}</span>
    </span>
  </span>

  <!-- Long-press popup (mobile) — rendered outside component via teleport -->
  <teleport to="body">
    <div
      v-if="popup"
      :style="{ position: 'fixed', top: popup.y + 'px', left: popup.x + 'px', zIndex: 9999 }"
      class="px-3 py-2 flex items-center gap-2 text-sm"
      style="background:#ece4ca; border:1px solid rgba(31,27,23,0.15); border-radius:2px; box-shadow:0 4px 16px rgba(31,27,23,0.14);"
      @click.stop
    >
      <span class="font-medium" style="color:#1f1b17; font-family:'EB Garamond',serif;">{{ popup.word }}</span>
      <button
        @click="confirmAdd"
        class="text-xs px-2 py-0.5 transition-all"
        style="background:#2a2018; color:#e8dcc4; border-radius:2px;"
      >+ vocab</button>
      <button @click="popup = null" class="text-xs ml-0.5 transition-opacity hover:opacity-50" style="color:rgba(31,27,23,0.4);">✕</button>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { normalize } from '../utils/scoring.js'
import { numToWords } from '../utils/numWords.js'

const props = defineProps({
  text:       String,
  lang:       String,
  savedWords: Object,
})

const emit = defineEmits(['tap'])

const CJK_LANGS = new Set(['ja', 'zh', 'cmn', 'yue', 'ko'])

const tokens = computed(() => {
  const text = props.text || ''
  if (CJK_LANGS.has(props.lang)) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter(props.lang, { granularity: 'word' })
      return [...seg.segment(text)].map(s => ({
        type: s.isWordLike ? 'word' : 'space',
        text: s.segment,
        numWord: null,
      }))
    }
    // Fallback for older browsers: character-by-character
    return [...text].map(char => ({
      type: /\s/.test(char) ? 'space' : 'word',
      text: char,
      numWord: null,
    }))
  }
  return text.split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return { type: 'space', text: tok, numWord: null }
    const numWord = /^\d+$/.test(tok) ? numToWords(parseInt(tok, 10), props.lang) : null
    return { type: 'word', text: tok, numWord }
  })
})

// ── Desktop: direct click ─────────────────────────────────────────────────────

function handleClick(word) {
  // On touch devices the click fires after touchend — skip it, long press handles saving
  if (isTouchDevice()) return
  emit('tap', { word, sentence: props.text })
}

// ── Mobile: long press ────────────────────────────────────────────────────────

const popup = ref(null)   // { word, x, y } or null
let pressTimer = null
let touchMoved = false

function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches
}

function handleTouchStart(e, word) {
  touchMoved = false
  pressTimer = setTimeout(() => {
    if (touchMoved) return
    const r = e.target.getBoundingClientRect()
    // Position popup below the word, clamped to viewport edges
    const x = Math.min(r.left, window.innerWidth - 160)
    const y = Math.min(r.bottom + 8, window.innerHeight - 60)
    popup.value = { word, x: Math.max(8, x), y }
  }, 500)
}

function handleTouchEnd() {
  clearTimeout(pressTimer)
  pressTimer = null
}

function handleTouchMove() {
  touchMoved = true
  clearTimeout(pressTimer)
  pressTimer = null
}

function confirmAdd() {
  if (popup.value) {
    emit('tap', { word: popup.value.word, sentence: props.text })
    popup.value = null
  }
}
</script>
