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
            @click="lookup(token.text)"
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

      <!-- Lookup panel -->
      <div
        v-if="lookupResult"
        class="border border-emerald-300 rounded-lg p-4 bg-emerald-50 flex flex-col gap-2"
      >
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs text-emerald-600 font-medium">{{ lookupResult.pos }}</div>
            <div
              class="text-xl font-semibold"
              :dir="isRTL(lang) ? 'rtl' : 'ltr'"
            >{{ lookupResult.word }}</div>
          </div>
          <button
            @click="saveWord"
            :disabled="savedWords.has(normalize(lookupResult.word))"
            class="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
          >
            {{ savedWords.has(normalize(lookupResult.word)) ? t(lang, 'saved') : t(lang, 'save') }}
          </button>
        </div>
        <div class="text-sm text-gray-600">{{ lookupResult.def }}</div>
        <div v-if="lookupResult.ex" class="text-xs text-gray-400 italic">"{{ lookupResult.ex }}"</div>
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
import { lookupCached, cacheWord } from '../utils/supabase.js'
import { lookupWord } from '../utils/dictionary.js'

const props = defineProps({
  story: Object,
  lang: String,
  savedWords: Object,
})

const emit = defineEmits(['go', 'saveWord'])

const francoOn = ref(false)
const lookupResult = ref(null)

const tokens = computed(() => {
  if (!props.story) return []
  return props.story.text.split(/(\s+)/).map(t => ({
    type: /^\s+$/.test(t) ? 'space' : 'word',
    text: t,
  }))
})

async function lookup(word) {
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return

  const utt = new SpeechSynthesisUtterance(clean)
  utt.lang = LANGS[props.lang]?.bcp47 ?? props.lang
  speechSynthesis.speak(utt)

  lookupResult.value = { word: clean, pos: '', def: t(props.lang, 'lookingUp'), ex: '' }

  const cached = await lookupCached(clean, props.lang)
  if (cached) {
    lookupResult.value = {
      word: clean,
      pos: cached.pos || '',
      def: cached.definition || t(props.lang, 'noDefinition'),
      ex: cached.example || '',
    }
    return
  }

  const result = await lookupWord(clean, props.lang)
  if (result) {
    lookupResult.value = {
      word: clean,
      pos: result.pos,
      def: result.definition || t(props.lang, 'noDefinition'),
      ex: result.example,
    }
    await cacheWord({
      word: clean,
      lang: props.lang,
      pos: result.pos,
      definition: result.definition,
      example: result.example,
      source: result.source,
    })
  } else {
    lookupResult.value = {
      word: clean,
      pos: '',
      def: t(props.lang, 'notFound'),
      ex: '',
    }
  }
}

function saveWord() {
  if (!lookupResult.value) return
  emit('saveWord', {
    word: lookupResult.value.word,
    lang: props.lang,
    langName: LANGS[props.lang]?.name,
    rtl: isRTL(props.lang),
    pos: lookupResult.value.pos,
    def: lookupResult.value.def,
    ex: lookupResult.value.ex,
  })
}
</script>