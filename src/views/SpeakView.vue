<template>
  <div class="flex flex-col gap-6">

    <!-- No story -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- No speech recognition support -->
    <div v-else-if="!hasRecognition" class="text-center py-16 flex flex-col gap-3">
      <div class="text-4xl">🎤</div>
      <div class="text-gray-600 text-sm font-medium">Speech recognition is not supported in this browser.</div>
      <div class="text-gray-400 text-xs">Try Chrome or Microsoft Edge.</div>
    </div>

    <!-- Main -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-lg" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-400">{{ LANGS[lang]?.name }}</div>
        </div>
        <div class="text-xs text-gray-400 font-medium">{{ currentIdx + 1 }} / {{ sentences.length }}</div>
      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-emerald-400 transition-all duration-300"
          :style="{ width: ((currentIdx + 1) / sentences.length * 100) + '%' }"
        />
      </div>

      <!-- Target sentence -->
      <div
        class="text-xl leading-relaxed p-4 rounded-xl bg-gray-50 border border-gray-200"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
      >
        <span
          v-for="(word, i) in sentenceWords"
          :key="i"
          class="mr-1 transition-colors"
          :class="scored
            ? (wordStatuses[i] === 'correct' ? 'text-emerald-600 font-medium' : 'text-red-500')
            : ''"
        >{{ word }}</span>
      </div>

      <!-- Controls -->
      <div class="flex gap-3">
        <button
          @click="speakSentence"
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all"
        >
          🔊 Listen
        </button>
        <button
          @click="recording ? stopRecording() : startRecording()"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            recording
              ? 'bg-red-500 text-white'
              : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
          ]"
        >
          🎤 {{ recording ? 'Recording…' : 'Speak' }}
        </button>
      </div>

      <!-- Transcript -->
      <div v-if="transcript" class="text-sm text-gray-500 italic px-1">
        Heard: "{{ transcript }}"
      </div>

      <!-- Score -->
      <div
        v-if="scored"
        class="flex items-center gap-4 p-4 rounded-xl border"
        :class="result.pct >= 80 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'"
      >
        <div
          class="text-4xl font-bold"
          :class="result.pct >= 80 ? 'text-emerald-600' : 'text-amber-500'"
        >{{ result.pct }}%</div>
        <div class="text-sm text-gray-500">{{ result.correct }} / {{ result.total }} words correct</div>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-2">
        <button
          v-if="currentIdx > 0"
          @click="prev"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
        >← Back</button>
        <div v-else />
        <button
          v-if="scored || transcript"
          @click="next"
          class="text-sm px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
        >{{ currentIdx < sentences.length - 1 ? 'Next →' : 'Done ✓' }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize, scoreWords } from '../utils/scoring.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'

const props = defineProps({ story: Object, lang: String })

const voices = useVoiceList()
const hasRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

const currentIdx = ref(0)
const transcript = ref('')
const result = ref(null)
const scored = ref(false)
const recording = ref(false)
let recognition = null

const sentences = computed(() => {
  if (!props.story) return []
  return props.story.text
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
})

const sentenceWords = computed(() =>
  (sentences.value[currentIdx.value] ?? '').trim().split(/\s+/).filter(Boolean)
)

const wordStatuses = computed(() => {
  if (!scored.value || !transcript.value) return []
  const typedWords = transcript.value.trim().split(/\s+/)
  return sentenceWords.value.map((word, i) =>
    i < typedWords.length && normalize(typedWords[i]) === normalize(word) ? 'correct' : 'wrong'
  )
})

function speakSentence() {
  const sentence = sentences.value[currentIdx.value]
  if (!sentence) return
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang
  const utt = new SpeechSynthesisUtterance(sentence)
  utt.lang = bcp47
  const voice = pickVoice(voices.value, bcp47, props.lang)
  if (voice) utt.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.speak(utt)
}

function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SR()
  recognition.lang = LANGS[props.lang]?.bcp47 ?? props.lang
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  recognition.onresult = (e) => {
    transcript.value = e.results[0][0].transcript
    result.value = scoreWords(sentences.value[currentIdx.value] ?? '', transcript.value)
    scored.value = true
    recording.value = false
  }
  recognition.onerror = () => { recording.value = false }
  recognition.onend = () => { recording.value = false }

  recording.value = true
  recognition.start()
}

function stopRecording() {
  recognition?.stop()
  recording.value = false
}

function reset() {
  transcript.value = ''
  result.value = null
  scored.value = false
  recording.value = false
  speechSynthesis.cancel()
}

function next() {
  if (currentIdx.value < sentences.value.length - 1) {
    currentIdx.value++
    reset()
  }
}

function prev() {
  if (currentIdx.value > 0) {
    currentIdx.value--
    reset()
  }
}

onUnmounted(() => {
  recognition?.stop()
  speechSynthesis.cancel()
})
</script>
