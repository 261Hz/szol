<template>
  <div class="flex flex-col gap-6">

    <!-- No story -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <div v-else class="flex flex-col gap-4">

      <!-- Story display -->
      <div
        class="border border-gray-200 rounded-lg p-4 leading-loose text-sm text-gray-600 select-none"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-base' : ''"
      >
        {{ story.text }}
      </div>

      <!-- Character by character for script languages -->
      <div v-if="isScript(lang)" class="flex flex-col gap-3">
        <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {{ isRTL(lang) ? 'اكتب كل حرف' : 'Type character by character' }}
        </div>
        <div
          class="font-mono text-xl leading-loose p-3 bg-gray-50 rounded-lg border border-gray-200 min-h-12"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >
          <span
            v-for="(char, i) in storyChars"
            :key="i"
            :class="{
              'text-emerald-500': i < charPos,
              'border-b-2 border-emerald-400': i === charPos,
              'text-gray-300': i > charPos,
            }"
          >{{ char }}</span>
        </div>
        <textarea
          v-model="scriptInput"
          @input="onScriptType"
          rows="3"
          :placeholder="isRTL(lang) ? '...اكتب هنا' : 'Type here...'"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-base outline-none focus:border-emerald-400 resize-none"
        />
      </div>

      <!-- Word by word for latin scripts -->
      <div v-else class="flex flex-col gap-3">
        <div class="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {{ t(lang, 'retype') }}
        </div>
        <textarea
          v-model="wordInput"
          @input="onWordType"
          rows="5"
          :placeholder="t(lang, 'typeHere')"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none font-mono"
        />
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
        <button
          v-if="!isScript(lang)"
          @click="check"
          class="text-sm px-4 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
        >
          {{ t(lang, 'check') }}
        </button>
      </div>

      <!-- Feedback -->
      <div
        v-if="feedback"
        :class="[
          'text-sm px-4 py-3 rounded-lg border',
          feedback.type === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'
        ]"
      >
        {{ feedback.msg }}
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { isRTL, isScript } from '../utils/rtl.js'
import { scoreWords, scoreChars } from '../utils/scoring.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  story: Object,
  lang: String,
})

const wordInput = ref('')
const scriptInput = ref('')
const pct = ref(0)
const feedback = ref(null)
const charPos = ref(0)

const storyChars = computed(() => props.story ? [...props.story.text] : [])

const barColor = computed(() => {
  if (pct.value >= 90) return '#10b981'
  if (pct.value >= 60) return '#f59e0b'
  return '#ef4444'
})

watch(() => props.story, () => {
  wordInput.value = ''
  scriptInput.value = ''
  pct.value = 0
  feedback.value = null
  charPos.value = 0
})

function onWordType() {
  if (!props.story) return
  const result = scoreWords(props.story.text, wordInput.value)
  pct.value = result.pct
  feedback.value = null
}

function onScriptType() {
  if (!props.story) return
  const result = scoreChars(props.story.text, scriptInput.value)
  pct.value = result.pct
  charPos.value = result.pos
  if (result.pos === result.total) {
    feedback.value = { type: 'ok', msg: '✓ Perfect!' }
  }
}

function check() {
  if (!props.story || !wordInput.value.trim()) return
  const result = scoreWords(props.story.text, wordInput.value)
  if (result.pct === 100) {
    feedback.value = { type: 'ok', msg: '✓ Perfect — every word matched.' }
    return
  }
  const top = result.errors.slice(0, 3).map(e =>
    e.typed ? `"${e.typed}" → "${e.expected}"` : `missing "${e.expected}"`
  ).join(', ')
  feedback.value = {
    type: 'err',
    msg: `${result.pct}% accurate (${result.correct}/${result.total} words). ${top}${result.errors.length > 3 ? ` …and ${result.errors.length - 3} more.` : '.'}`
  }
}
</script>