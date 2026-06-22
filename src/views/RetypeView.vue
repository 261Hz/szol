<template>
  <!-- No story -->
  <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
    {{ t(lang, 'noStory') }}
  </div>

  <!-- Immersive stage -->
  <div
    v-else
    class="fixed inset-0 z-50 flex flex-col select-none"
    style="background: #111118;"
    @click="focusInput"
  >
    <!-- Top bar -->
    <div class="flex items-center justify-between px-8 py-5 shrink-0">
      <button
        @click.stop="$emit('exit')"
        class="text-sm transition-colors"
        style="color: #55556a;"
        @mouseenter="e => e.target.style.color = '#9999b0'"
        @mouseleave="e => e.target.style.color = '#55556a'"
      >← back</button>
      <div
        class="text-xs tracking-widest uppercase truncate max-w-xs text-center"
        style="color: #3a3a4e;"
      >{{ story.title }}</div>
      <div class="text-sm font-mono tabular-nums" :style="{ color: pctColor }">{{ pct }}%</div>
    </div>

    <!-- Text area -->
    <div class="flex-1 overflow-y-auto px-8 py-6 flex justify-center">
      <div
        class="retype-text max-w-2xl w-full leading-loose"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
        style="font-size: 1.2rem; font-family: 'Courier New', Courier, monospace;"
      >
        <template v-for="(char, i) in allChars" :key="i">
          <span v-if="i === typedLen && !complete" class="retype-cursor" aria-hidden="true"></span>
          <span :class="charClass(i)">{{ char }}</span>
        </template>
        <span v-if="typedLen >= allChars.length && !complete" class="retype-cursor" aria-hidden="true"></span>
      </div>
    </div>

    <!-- Hidden textarea to capture input -->
    <textarea
      ref="hiddenInput"
      v-model="rawInput"
      class="fixed"
      style="top:50%;left:50%;width:1px;height:1px;opacity:0.01;resize:none;font-size:16px;transform:translate(-50%,-50%);border:none;outline:none;padding:0;"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      :dir="isRTL(lang) ? 'rtl' : 'ltr'"
      @keydown.esc.prevent="$emit('exit')"
    />

    <!-- Progress bar -->
    <div class="h-px shrink-0" style="background: #1a1a26;">
      <div
        class="h-full transition-all duration-300"
        :style="{ width: pct + '%', background: pctColor }"
      />
    </div>

    <!-- Completion overlay -->
    <Transition name="retype-fade">
      <div
        v-if="complete"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style="background: rgba(17,17,24,0.97);"
        @click.stop
      >
        <div class="text-5xl font-mono" :style="{ color: pctColor }">{{ pct }}%</div>
        <div class="text-sm mt-1" style="color: #55556a;">
          {{ pct === 100 ? 'Perfect.' : `${correctCount} of ${allChars.length} characters correct.` }}
        </div>
        <button
          @click="$emit('exit')"
          class="mt-8 text-sm px-6 py-2.5 rounded border transition-all"
          style="border-color: #2a2a38; color: #77778a;"
          @mouseenter="e => { e.target.style.borderColor='#44445a'; e.target.style.color='#aaaabd' }"
          @mouseleave="e => { e.target.style.borderColor='#2a2a38'; e.target.style.color='#77778a' }"
        >back to reading</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { saveProgress, getProgress } from '../utils/api.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

defineEmits(['exit'])

const rawInput   = ref('')
const hiddenInput = ref(null)
const prevPct    = ref(null)

const allChars = computed(() => props.story ? [...props.story.text] : [])
const typedLen = computed(() => rawInput.value.length)

const correctCount = computed(() => {
  let c = 0
  const chars = allChars.value
  const typed = rawInput.value
  const len = Math.min(typed.length, chars.length)
  for (let i = 0; i < len; i++) {
    if (typed[i] === chars[i]) c++
  }
  return c
})

const pct = computed(() => {
  if (!allChars.value.length) return 0
  return Math.round((correctCount.value / allChars.value.length) * 100)
})

const complete = computed(() =>
  allChars.value.length > 0 && rawInput.value.length >= allChars.value.length
)

const pctColor = computed(() => {
  if (pct.value >= 90) return '#10b981'
  if (pct.value >= 60) return '#c9a87c'
  return '#ef4444'
})

function charClass(i) {
  if (i >= rawInput.value.length) return 'char-upcoming'
  return rawInput.value[i] === allChars.value[i] ? 'char-correct' : 'char-wrong'
}

function focusInput() {
  hiddenInput.value?.focus()
}

function _saveProgress(pctValue) {
  if (!props.currentUser || !props.story?.id) return
  saveProgress(props.story.id, props.story.title ?? '', props.lang, 'retype', pctValue)
}

watch(complete, val => {
  if (val) _saveProgress(pct.value)
})

watch(() => props.story, async story => {
  rawInput.value = ''
  prevPct.value  = null
  if (props.currentUser && story?.id) {
    const saved = await getProgress(story.id, 'retype')
    if (saved?.sentence_index > 0) prevPct.value = saved.sentence_index
  }
  await nextTick()
  focusInput()
})

onMounted(focusInput)
</script>

<style scoped>
.char-correct  { color: #d4c9b4; }
.char-wrong    { color: #ef4444; background: rgba(239,68,68,0.12); border-radius: 2px; }
.char-upcoming { color: #2e2e3e; }

.retype-cursor {
  display: inline-block;
  width: 0;
  border-left: 2px solid #c9a87c;
  height: 1.15em;
  vertical-align: text-bottom;
  margin-right: -1px;
  animation: cur-blink 1s step-end infinite;
}

@keyframes cur-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.retype-fade-enter-active { transition: opacity 0.6s ease; }
.retype-fade-enter-from   { opacity: 0; }
</style>
