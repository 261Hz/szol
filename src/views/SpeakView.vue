<!-- SpeakView.vue: pronunciation practice. -->
<!-- The user listens to each sentence, then speaks it. Their speech is recorded and scored. -->
<template>
  <!-- Outer container stacks items vertically with gaps. -->
  <div class="flex flex-col gap-6">

    <!-- Shown when no story is loaded. -->
    <div v-if="!story" class="text-gray-500 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Shown when the browser doesn't support speech recognition. -->
    <!-- SpeechRecognition is only available in Chrome and Edge (not Firefox or Safari). -->
    <!-- v-else-if = checked only when the v-if above is false. -->
    <div v-else-if="!hasRecognition" class="text-center py-16 flex flex-col gap-3">
      <div class="text-4xl">🎤</div>
      <div class="text-gray-300 text-sm font-medium">Speech recognition is not supported in this browser.</div>
      <div class="text-gray-500 text-xs">Try Chrome or Microsoft Edge.</div>
    </div>

    <!-- Main speak practice interface. -->
    <!-- v-else = shown when all previous v-if/v-else-if conditions were false. -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header: story title + sentence position counter. -->
      <div class="flex items-center justify-between">
        <div>
          <!-- Story title with RTL text direction for Arabic/Hebrew. -->
          <div class="font-semibold text-lg" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-500">{{ LANGS[lang]?.name }}</div>
        </div>
        <!-- Shows "3 / 10" meaning sentence 3 out of 10. currentIdx is 0-based, so add 1 for display. -->
        <div class="text-xs text-gray-500 font-medium">{{ currentIdx + 1 }} / {{ sentences.length }}</div>
      </div>

      <!-- Progress bar: width grows as the user advances through sentences. -->
      <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
        <!-- The inner div's width is a percentage: (sentences done / total) * 100. -->
        <!-- :style sets CSS styles dynamically. { width: '30%' } = 30% wide. -->
        <!-- "transition-all duration-300" = animates the width change smoothly over 300ms. -->
        <div
          class="h-full bg-green-600 transition-all duration-300"
          :style="{ width: ((currentIdx + 1) / sentences.length * 100) + '%' }"
        />
      </div>

      <!-- Target sentence display. -->
      <!-- Each word is individually colored after scoring: green = correct, red = wrong. -->
      <div
        ref="sentenceEl"
        class="text-xl leading-relaxed p-4 rounded-xl bg-gray-900 border border-gray-700 break-words"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right' : ''"
      >
        <!-- Loop through each word in the current sentence. -->
        <!-- "mr-1" = margin-right 0.25rem (space between words on LTR layouts). -->
        <!-- "transition-colors" = animate color changes smoothly. -->
        <span
          v-for="(word, i) in sentenceWords"
          :key="i"
          class="inline-block whitespace-nowrap mr-1 transition-colors"
          :class="scored
            ? (wordStatuses[i] === 'correct' ? 'text-green-400 font-medium' : 'text-red-500')
            : ''"
        >{{ word }}</span>
        <!-- scored is true after the user has spoken. Before that, no colors are applied. -->
      </div>

      <!-- Control buttons: Listen and Speak. -->
      <div class="flex gap-3">
        <!-- 🔊 Listen: plays the current sentence aloud using TTS. -->
        <button
          @click="speakSentence"
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 transition-all"
        >
          🔊 Listen
        </button>
        <!-- 🎤 Speak: starts recording when clicked, stops if clicked again. -->
        <!-- The button turns red with a pulse animation while recording is active. -->
        <button
          @click="recording ? stopRecording() : startRecording()"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            recording
              ? 'bg-red-500 text-white'
              : 'border border-gray-700 text-gray-300 hover:bg-gray-800'
          ]"
        >
          🎤 {{ recording ? 'Recording…' : 'Speak' }}
          <!-- … (ellipsis) indicates the action is in progress. -->
        </button>
      </div>

      <!-- Shows what the speech recognizer heard ("Heard: 'el gato es negro'"). -->
      <!-- v-if="transcript" = only shown after the user has spoken. -->
      <div v-if="transcript" class="text-sm text-gray-400 italic px-1">
        Heard: "{{ transcript }}"
      </div>

      <!-- Score panel: shows after speaking. Color is green if ≥80%, amber if lower. -->
      <!-- ≥ means "greater than or equal to". -->
      <div
        v-if="scored"
        class="flex items-center gap-4 p-4 rounded-xl border"
        :class="result.pct >= 80 ? 'border-green-800 bg-green-950' : 'border-amber-800 bg-amber-950'"
      >
        <!-- Large percentage number. -->
        <div
          class="text-4xl font-bold"
          :class="result.pct >= 80 ? 'text-green-400' : 'text-amber-400'"
        >{{ result.pct }}%</div>
        <!-- e.g. "4 / 6 words correct". result.correct and result.total come from scoreWords(). -->
        <div class="text-sm text-gray-400">{{ result.correct }} / {{ result.total }} words correct</div>
      </div>

      <!-- Navigation row: Back on the left, Next on the right. -->
      <div class="flex justify-between mt-2">
        <!-- Back button: only shown when not on the first sentence (currentIdx > 0). -->
        <button
          v-if="currentIdx > 0"
          @click="prev"
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-all"
        >← Back</button>
        <!-- Empty div keeps the Next button pushed to the right when Back is hidden. -->
        <div v-else />
        <!-- Next button: appears only after the user has spoken (scored or has a transcript). -->
        <!-- Shows "Done ✓" on the last sentence instead of "Next →". -->
        <button
          v-if="scored || transcript"
          @click="next"
          class="text-sm px-4 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-all"
        >{{ currentIdx < sentences.length - 1 ? 'Next →' : 'Done ✓' }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'
import { normalize, scoreWords } from '../utils/scoring.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'
import { saveProgress, getProgress } from '../utils/api.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
})

const sentenceEl = ref(null)

watch([() => props.story, () => props.lang, rootHighlightOn], ([, , on]) => {
  nextTick(() => on ? applyRoots(sentenceEl.value, props.lang) : clearRoots())
})

// Load available TTS voices reactively (updates when browser finishes loading them).
const voices = useVoiceList()

// Check if the browser supports SpeechRecognition.
// window is the global browser object. || tries the webkit-prefixed version (older Chrome).
// !! (double-bang) converts any value to a boolean: !!undefined = false, !!(something) = true.
const hasRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

// currentIdx tracks which sentence the user is on (0 = first sentence).
const currentIdx = ref(0)
// transcript holds what the speech recognizer heard (e.g. "el gato negro").
const transcript = ref('')
// result holds the scoring object from scoreWords(): { correct, total, pct, errors }.
const result = ref(null)
// scored is true once the user has spoken and been graded.
const scored = ref(false)
// recording is true while the microphone is actively listening.
const recording = ref(false)
let recognition = null

// Restore saved progress when the story or user changes.
watch([() => props.story, () => props.currentUser], async ([story, user]) => {
  currentIdx.value = 0
  reset()
  if (user && story?.id) {
    const saved = await getProgress(story.id, 'speak')
    if (saved && saved.sentence_index > 0) {
      currentIdx.value = Math.min(saved.sentence_index, sentences.value.length - 1)
      reset()
    }
  }
})

// sentences splits the story text into individual sentences.
// computed() re-runs whenever props.story changes.
const sentences = computed(() => {
  if (!props.story) return [] // no story = empty list
  return props.story.content
    // Split after sentence-ending punctuation: . ! ? ؟ (Arabic) । (Hindi) 。！？ (CJK).
    // (?<=[.!?؟।。！？]) = lookbehind: only split AFTER these characters.
    // \s+ = one or more whitespace characters.
    .split(/(?<=[.!?؟।。！？])\s+/)
    .map(s => s.trim())   // remove leading/trailing spaces from each sentence
    .filter(Boolean)      // remove any empty strings (Boolean('') = false, so they're filtered out)
})

// splitUnits() splits text into comparable units for the current language.
// For CJK (Chinese, Japanese): each individual character is a unit, because there are no
//   spaces between words -- splitting by whitespace gives just one giant "word".
// For all other languages: split by whitespace into words.
function splitUnits(text) {
  if (['zh', 'ja'].includes(props.lang)) {
    // [...text] spreads the string into characters. filter keeps only letters (not punctuation/spaces).
    return [...text].filter(c => /\p{L}/u.test(c))
  }
  return text.trim().split(/\s+/).filter(Boolean)
}

// sentenceWords is the list of displayable units in the current sentence.
// For CJK this is individual characters; for other languages it is words.
const sentenceWords = computed(() =>
  splitUnits(sentences.value[currentIdx.value] ?? '')
)

// wordStatuses maps each unit in the sentence to 'correct' or 'wrong' after scoring.
const wordStatuses = computed(() => {
  if (!scored.value || !transcript.value) return [] // only compute after speaking
  // Split the transcript the same way as the target sentence.
  const typedUnits = splitUnits(transcript.value)
  // Compare position by position. normalize() strips punctuation/case for fair comparison.
  return sentenceWords.value.map((unit, i) =>
    i < typedUnits.length && normalize(typedUnits[i]) === normalize(unit) ? 'correct' : 'wrong'
  )
})

// speakSentence() reads the current sentence aloud using TTS.
function speakSentence() {
  const sentence = sentences.value[currentIdx.value]
  if (!sentence) return // safety check: do nothing if no sentence
  const bcp47 = LANGS[props.lang]?.bcp47 ?? props.lang // get the language code for TTS
  const utt   = new SpeechSynthesisUtterance(sentence) // create the speech object
  utt.lang    = bcp47                                  // set the language
  const voice = pickVoice(voices.value, bcp47, props.lang) // find the best voice
  if (voice) utt.voice = voice                         // apply voice (if found)
  speechSynthesis.cancel()                             // stop anything already playing
  speechSynthesis.speak(utt)                           // start speaking
}

// startRecording() starts the microphone and listens for speech.
function startRecording() {
  // Get the SpeechRecognition constructor (using the standard or webkit-prefixed version).
  const SR   = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SR() // create a new recognition session

  // Set the language so the recognizer knows what language to expect.
  recognition.lang            = LANGS[props.lang]?.bcp47 ?? props.lang
  recognition.interimResults  = false // don't send partial results while speaking
  recognition.maxAlternatives = 1     // only return the single best transcription

  // onresult fires when the user stops speaking and recognition is complete.
  recognition.onresult = (e) => {
    // e.results[0][0].transcript = the text of the first result's first alternative.
    transcript.value = e.results[0][0].transcript
    // Score the spoken sentence against the target.
    result.value  = scoreWords(sentences.value[currentIdx.value] ?? '', transcript.value)
    scored.value  = true    // show the score panel
    recording.value = false // stop showing the recording indicator
  }
  // onerror fires if something goes wrong (microphone denied, network error, etc.).
  recognition.onerror = () => { recording.value = false }
  // onend fires when the recognition session ends (success or error).
  recognition.onend   = () => { recording.value = false }

  recording.value = true   // show the red "Recording…" state on the button
  recognition.start()      // begin listening
}

// stopRecording() manually stops listening before the user finishes speaking.
function stopRecording() {
  recognition?.stop() // ?. = optional chaining: only call .stop() if recognition is not null
  recording.value = false
}

// reset() clears all state so the user can try the next sentence fresh.
function reset() {
  transcript.value  = ''
  result.value      = null
  scored.value      = false
  recording.value   = false
  speechSynthesis.cancel() // stop any speech that's still playing
}

// next() advances to the next sentence, saves progress, and resets state.
function next() {
  if (currentIdx.value < sentences.value.length - 1) {
    currentIdx.value++
    if (props.currentUser && props.story?.id) {
      saveProgress(props.story.id, props.story.title ?? '', props.lang, 'speak', currentIdx.value)
    }
    reset()
  }
}

// prev() goes back to the previous sentence.
function prev() {
  if (currentIdx.value > 0) {
    currentIdx.value-- // decrement the index (move to previous sentence)
    reset()
  }
}

// onUnmounted runs when this view is removed from the screen.
// Clean up: stop the microphone and any ongoing speech to avoid resource leaks.
onUnmounted(() => {
  recognition?.stop()      // stop microphone if still running
  speechSynthesis.cancel() // stop TTS if still speaking
})
</script>
