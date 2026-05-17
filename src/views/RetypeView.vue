<template>
  <div class="flex flex-col gap-6">

    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else class="flex flex-col gap-4">

      <!-- Franco/Pinyin toggle -->
      <div v-if="hasFranco" class="flex gap-2 text-sm">
        <button
          @click="mode = 'native'"
          :class="mode === 'native' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ nativeLabel }}</button>
        <button
          @click="mode = 'franco'"
          :class="mode === 'franco' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'"
          class="px-3 py-1 rounded-full transition-all"
        >{{ francoLabel }}</button>
      </div>

      <!-- Overlay text -->
      <div
        class="leading-loose text-base select-none cursor-text outline-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        tabindex="0"
        @keydown="onKey"
        @focus="focused = true"
        @blur="focused = false"
        ref="overlayEl"
      >
        <template v-for="(word, wi) in words" :key="wi">
          <span
            v-for="(c, ci) in word"
            :key="ci"
            :class="charClass(wi, ci)"
          >{{ c.char }}</span>
          <!-- space between words -->
          <span v-if="wi < words.length - 1" :class="spaceClass(wi)">&nbsp;</span>
        </template>
      </div>

      <!-- Hidden input to capture mobile keyboard -->
      <input
        class="opacity-0 h-0 absolute"
        ref="hiddenInput"
        @keydown="onKey"
        v-model="inputBuffer"
      />

      <!-- Click to focus hint -->
      <div v-if="!focused" class="text-xs text-gray-400 text-center">
        {{ t(lang, 'clickToType') ?? 'Click text to start typing' }}
      </div>

      <!-- Progress bar -->
      <div class="flex items-center gap-3">
        <div class="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-200"
            :style="{ width: pct + '%', background: barColor }"
          />
        </div>
        <div class="text-xs text-gray-400 min-w-8 text-right">{{ pct }}%</div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  story: Object,
  lang: String,
})

// ── Mode (native vs franco/pinyin) ───────────────────────────────────────────
const mode = ref('native')

const hasFranco = computed(() =>
  ['ar', 'arz', 'zh'].includes(props.lang)
)

const nativeLabel = computed(() => {
  if (props.lang === 'zh') return '中文'
  if (['ar', 'arz'].includes(props.lang)) return 'عربي'
  return 'Native'
})

const francoLabel = computed(() => {
  if (props.lang === 'zh') return 'Pinyin'
  return 'Franco'
})

const activeText = computed(() => {
  if (mode.value === 'franco' && props.story?.franco) return props.story.franco
  return props.story?.text ?? ''
})

// ── Build word/char structure ─────────────────────────────────────────────────
function buildWords(text) {
  // "/\s+/" used for whitespace issue
  return text.split(/\s+/).map(word =>
    word.split('').map(char => ({ char, state: 'untouched' }))
  )
}

const words = ref([])
const currentWordIndex = ref(0)
const currentCharIndex = ref(0)
const inputBuffer = ref('')
const focused = ref(false)
const overlayEl = ref(null)
const hiddenInput = ref(null)

// Reset when story or mode changes
watch([() => props.story, mode, activeText], () => {
  words.value = buildWords(activeText.value)
  currentWordIndex.value = 0
  currentCharIndex.value = 0
  inputBuffer.value = ''
// https://vuejs.org/guide/essentials/watchers.html#eager-watchers
}, { immediate : true 
})

// ── Keydown handler ───────────────────────────────────────────────────────────
function onKey(e) {
  if (!words.value.length) return

  const wi = currentWordIndex.value
  const ci = currentCharIndex.value
  const word = words.value[wi]

  // Ignore modifier keys
  if (e.key.length > 1 && e.key !== 'Backspace') return

  if (e.key === 'Backspace') {
    e.preventDefault()
    if (ci > 0) {
      words.value[wi][ci - 1].state = 'untouched'
      currentCharIndex.value--
    }
    return
  }

  e.preventDefault()

  const expected = word[ci].char
  const typed = e.key

  // Compare (loose: ignore diacritics for non-script langs)
  const match = typed === expected

  words.value[wi][ci].state = match ? 'correct' : 'wrong'
  currentCharIndex.value++

  // End of word
  if (currentCharIndex.value === word.length) {
    const hasError = word.some(c => c.state === 'wrong')
    if (hasError) {
      // Reset word and push back
      words.value[wi].forEach(c => c.state = 'untouched')
      currentCharIndex.value = 0
    } else {
      // Advance to next word
      if (wi < words.value.length - 1) {
        currentWordIndex.value++
        currentCharIndex.value = 0
      }
    }
  }
}

// ── Styling ───────────────────────────────────────────────────────────────────
function charClass(wi, ci) {
  const state = words.value[wi]?.[ci]?.state
  const isCurrent = wi === currentWordIndex.value && ci === currentCharIndex.value
  return {
    'text-red-500': state === 'wrong',
    'text-gray-800': state === 'correct' || state === 'untouched',
    'border-b-2 border-gray-800': isCurrent,
  }
}

function spaceClass(wi) {
  // Space after completed correct word
  const word = words.value[wi]
  const done = word.every(c => c.state === 'correct')
  return done ? 'text-gray-800' : 'text-gray-300'
}

// ── Progress ──────────────────────────────────────────────────────────────────
const pct = computed(() => {
  const total = words.value.length
  if (!total) return 0
  return Math.round((currentWordIndex.value / total) * 100)
})

const barColor = computed(() => {
  if (pct.value >= 90) return '#10b981'
  if (pct.value >= 60) return '#f59e0b'
  return '#ef4444'
})
</script>