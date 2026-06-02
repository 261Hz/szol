<template>
  <div class="flex flex-col gap-6">

    <!-- No story loaded -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'noStory') }}
    </div>

    <!-- Story -->
    <div v-else class="flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <div
            class="font-semibold text-lg"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ LANGS[lang]?.name }}
            <span v-if="story.author"> · {{ story.author }}</span>
            <span v-if="story.source"> · {{ story.source }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            v-if="story.franco && hasFranco(lang)"
            @click="francoOn = !francoOn"
            :class="[
              'text-xs px-3 py-1 rounded-full border transition-all',
              francoOn
                ? 'bg-orange-400 text-white border-orange-400'
                : 'border-gray-200 text-gray-500 hover:border-orange-300'
            ]"
          >
            Franco
          </button>
          <button
            @click="$emit('go', 'retype')"
            class="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
          >
            {{ t(lang, 'retype') }} →
          </button>
        </div>
      </div>

      <!-- Story text -->
      <div
        class="leading-loose text-base"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        :class="isRTL(lang) ? 'text-right text-lg' : ''"
      >
        <span v-for="(token, i) in tokens" :key="i">
          <span
            v-if="token.type === 'word'"
            @click="tap(token.text)"
            :class="[
              'cursor-pointer rounded px-0.5 transition-all hover:bg-emerald-50',
              savedWords.has(normalize(token.text)) ? 'bg-emerald-100 text-emerald-700' : ''
            ]"
          >{{ token.text }}</span>
          <span v-else>{{ token.text }}</span>
        </span>
      </div>

      <!-- Franco line -->
      <div
        v-if="francoOn && story.franco"
        class="text-sm text-gray-400 border-t border-gray-100 pt-3"
      >
        {{ story.franco }}
      </div>

      <!-- Word panel -->
      <div
        v-if="tapped"
        class="border border-emerald-300 rounded-lg p-4 bg-emerald-50 flex flex-col gap-2"
      >
        <div class="flex items-start justify-between">
          <div
            class="text-xl font-semibold"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >{{ tapped.word }}</div>
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(tapped.word))"
            class="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
          >
            {{ savedWords.has(normalize(tapped.word)) ? t(lang, 'saved') : t(lang, 'save') }}
          </button>
        </div>
        <div
          v-if="tapped.sentence"
          class="text-sm text-gray-500 italic"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ tapped.sentence }}</div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL, hasFranco } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { normalize } from '../utils/scoring.js'

const props = defineProps({
  story: Object,
  lang: String,
  savedWords: Object,
})

const emit = defineEmits(['go', 'saveWord'])

const francoOn = ref(false)
const tapped = ref(null)

const tokens = computed(() => {
  if (!props.story) return []
  return props.story.text.split(/(\s+)/).map(t => ({
    type: /^\s+$/.test(t) ? 'space' : 'word',
    text: t,
  }))
})

function tap(word) {
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return

  speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(clean)
  utt.lang = LANGS[props.lang]?.bcp47 ?? props.lang
  speechSynthesis.speak(utt)

  const sentences = props.story.text.split(/(?<=[.!?])\s+/)
  const sentence = sentences.find(s => s.includes(word)) ?? ''
  tapped.value = { word: clean, sentence }
}

function saveWord() {
  if (!tapped.value) return
  emit('saveWord', {
    word: tapped.value.word,
    lang: props.lang,
    sentence: tapped.value.sentence,
    story: props.story?.title ?? '',
  })
}
</script>