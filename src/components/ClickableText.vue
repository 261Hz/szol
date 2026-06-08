<template>
  <span :dir="isRTL(lang) ? 'rtl' : 'ltr'">
    <span v-for="(tok, i) in tokens" :key="i">
      <button
        v-if="tok.type === 'word'"
        type="button"
        @click="handleClick(tok.text)"
        @touchstart.passive="handleTouchStart($event, tok.text)"
        @touchend.passive="handleTouchEnd"
        @touchmove.passive="handleTouchMove"
        :class="[
          'inline whitespace-nowrap rounded px-0.5 transition-all hover:bg-green-950 active:bg-green-950 select-none bg-transparent border-0 p-0 m-0 font-[inherit] text-[inherit] leading-[inherit] cursor-pointer',
          savedWords && savedWords.has(normalize(tok.text)) ? 'bg-green-900 text-green-300' : '',
        ]"
      >{{ tok.text }}</button>
      <span v-else>{{ tok.text }}</span>
    </span>
  </span>

  <!-- Long-press popup (mobile) — rendered outside component via teleport -->
  <teleport to="body">
    <div
      v-if="popup"
      :style="{ position: 'fixed', top: popup.y + 'px', left: popup.x + 'px', zIndex: 9999 }"
      class="bg-gray-800 border border-emerald-700 rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 text-sm"
      @click.stop
    >
      <span class="text-gray-200 font-medium">{{ popup.word }}</span>
      <button
        @click="confirmAdd"
        class="text-xs px-2 py-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-600 transition-all"
      >+ vocab</button>
      <button @click="popup = null" class="text-gray-500 hover:text-white text-xs ml-0.5 transition-all">✕</button>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
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
