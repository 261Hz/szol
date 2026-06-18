<template>
  <nav class="border-b border-gray-800 bg-gray-950 sticky top-0 z-40">

    <!-- Top row: brand + language selector + controls -->
    <div class="flex items-center justify-between px-4 py-2.5">

      <div class="relative flex-shrink-0">
        <button
          @click="tapLogo"
          class="text-xl font-semibold tracking-tight select-none hover:opacity-75 transition-opacity"
        >Sz<span class="text-violet-400">ó</span>l</button>
        <Transition name="tooltip">
          <div
            v-if="showTooltip"
            class="absolute top-full left-0 mt-1.5 z-50 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-lg min-w-max"
          >
            <div class="text-xs text-gray-400 font-mono">[soːl]</div>
            <div class="text-sm text-gray-200">{{ tooltipMeaning }}</div>
            <div class="text-xs text-gray-500 mt-0.5">Hungarian · szól</div>
          </div>
        </Transition>
      </div>

      <div class="flex items-center gap-2">
        <select
          :value="lang"
          aria-label="Language"
          @change="$emit('lang', $event.target.value)"
          class="text-sm border border-gray-700 rounded-md px-2 py-1 bg-gray-900 text-gray-200 max-w-28"
        >
          <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
        </select>

        <button
          @click="$emit('tab', 'settings')"
          :class="['text-lg px-1.5 py-0.5 rounded-md transition-all', active === 'settings' ? 'text-gray-50' : 'text-gray-500 hover:text-gray-200']"
          title="Settings"
        >⚙</button>

        <div v-if="!currentUser">
          <button @click="$emit('auth')"
            class="text-lg px-1.5 py-0.5 rounded-md text-gray-500 hover:text-gray-200 transition-all"
            title="Login / Register">👤</button>
        </div>
        <div v-else class="flex items-center gap-1.5">
          <span class="text-xs text-gray-300 max-w-20 truncate hidden sm:inline">{{ currentUser.username }}</span>
          <button @click="$emit('logout')"
            class="text-xs text-gray-400 hover:text-red-400 transition-all" title="Logout" aria-label="Logout">✕</button>
        </div>
      </div>
    </div>

    <!-- Tab strip: scrolls horizontally on narrow screens -->
    <div class="flex overflow-x-auto px-3 pb-2 gap-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        :class="[
          'flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-sm transition-all',
          active === tab.key
            ? 'bg-violet-900 text-violet-100 font-medium'
            : 'text-gray-400 hover:text-white'
        ]"
      >{{ tab.label }}</button>
    </div>

  </nav>
</template>

<script setup>
import { computed, ref } from 'vue'
import { LANGS } from '../data/stories.js'
import { t }     from '../utils/i18n.js'
import { useVoiceList, pickVoice } from '../utils/voices.js'

const props = defineProps({
  active:      String,
  lang:        String,
  currentUser: Object,
})

defineEmits(['tab', 'lang', 'auth', 'logout'])

const voices      = useVoiceList()
const showTooltip = ref(false)
let   tooltipTimer = null

// "szól" means "speaks / says / sounds" in Hungarian
const SZOL_MEANING = {
  en: 'speaks · says · sounds',
  de: 'spricht · sagt · tönt',
  fr: 'parle · dit · sonne',
  es: 'habla · dice · suena',
  it: 'parla · dice · suona',
  pt: 'fala · diz · soa',
  ru: 'говорит · звучит',
  ja: '話す・言う',
  zh: '说话・发声',
  ar: 'يتكلم · يقول',
  ko: '말하다 · 소리나다',
  nl: 'spreekt · zegt · klinkt',
  pl: 'mówi · brzmi',
  sv: 'talar · säger · låter',
  he: 'מדבר · אומר',
  el: 'μιλά · λέει',
  hu: 'szól · mond · hangzik',
}

const tooltipMeaning = computed(() =>
  SZOL_MEANING[props.lang] ?? SZOL_MEANING.en
)

function tapLogo() {
  // Speak with Hungarian voice (the word is Hungarian); fall back to target-lang voice
  const huVoice  = pickVoice(voices.value, 'hu-HU', 'hu')
  const fallback = pickVoice(voices.value, LANGS[props.lang]?.bcp47 ?? props.lang, props.lang)
  const utt      = new SpeechSynthesisUtterance('szól')
  utt.lang       = 'hu-HU'
  if (huVoice)   utt.voice = huVoice
  else if (fallback) { utt.voice = fallback; utt.lang = LANGS[props.lang]?.bcp47 ?? props.lang }
  speechSynthesis.cancel()
  speechSynthesis.resume()
  speechSynthesis.speak(utt)

  // Show tooltip for 3 seconds
  showTooltip.value = true
  clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => { showTooltip.value = false }, 3000)
}

const tabs = computed(() => {
  const base = [
    { key: 'retype',   label: t(props.lang, 'retype') },
    { key: 'listen',   label: t(props.lang, 'listen') },
    { key: 'speak',    label: t(props.lang, 'speak') },
    { key: 'write',    label: t(props.lang, 'write') },
    { key: 'vocab',    label: t(props.lang, 'vocab') },
    { key: 'parallel', label: 'Parallel' },
    { key: 'library',  label: t(props.lang, 'library') },
    { key: 'journal',  label: t(props.lang, 'journal') },
    { key: 'messages', label: '🎙 Voice' },
  ]
  return base
})
</script>

<style scoped>
.tooltip-enter-active, .tooltip-leave-active { transition: opacity 0.15s, transform 0.15s; }
.tooltip-enter-from, .tooltip-leave-to       { opacity: 0; transform: translateY(-4px); }
</style>
