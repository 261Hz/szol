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
            class="absolute top-full left-0 mt-1.5 z-50 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 shadow-xl min-w-[180px]"
          >
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-base font-semibold text-gray-100">Szól</span>
              <span class="text-xs text-gray-500 font-mono">[soːl]</span>
            </div>
            <div class="text-xs text-gray-400 mb-2">🇭🇺 {{ tooltipInfo.label }}</div>
            <div class="text-xs text-gray-500 mb-1">{{ tooltipInfo.intro }}</div>
            <ul class="space-y-0.5">
              <li
                v-for="m in tooltipInfo.meanings"
                :key="m"
                class="text-sm text-gray-200 flex items-center gap-1.5"
              ><span class="text-violet-400">•</span>{{ m }}</li>
            </ul>
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
          v-if="lang === 'he' || lang === 'ar'"
          @click="rootHighlightOn = !rootHighlightOn"
          :class="['text-xs px-2 py-1 rounded-full border transition-all',
            rootHighlightOn ? 'bg-emerald-900 border-emerald-600 text-emerald-300' : 'border-gray-700 text-gray-500 hover:border-gray-500']"
          title="Toggle root highlighting"
        >√ Root</button>

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
import { rootHighlightOn } from '../utils/rootHighlight.js'

const props = defineProps({
  active:      String,
  lang:        String,
  currentUser: Object,
})

defineEmits(['tab', 'lang', 'auth', 'logout'])

const voices      = useVoiceList()
const showTooltip = ref(false)
let   tooltipTimer = null

const SZOL_INFO = {
  en: { label: 'Hungarian verb.',        intro: 'Can mean:',           meanings: ['to speak', 'to say', 'to sound', 'to be about'] },
  de: { label: 'Ungarisches Verb.',      intro: 'Kann bedeuten:',      meanings: ['sprechen', 'sagen', 'klingen', 'handeln von'] },
  fr: { label: 'Verbe hongrois.',        intro: 'Peut signifier :',    meanings: ['parler', 'dire', 'résonner', 'parler de'] },
  es: { label: 'Verbo húngaro.',         intro: 'Puede significar:',   meanings: ['hablar', 'decir', 'sonar', 'tratar de'] },
  it: { label: 'Verbo ungherese.',       intro: 'Può significare:',    meanings: ['parlare', 'dire', 'suonare', 'riguardare'] },
  pt: { label: 'Verbo húngaro.',         intro: 'Pode significar:',    meanings: ['falar', 'dizer', 'soar', 'tratar de'] },
  ru: { label: 'Венгерский глагол.',     intro: 'Может означать:',     meanings: ['говорить', 'сказать', 'звучать', 'быть о чём-то'] },
  ja: { label: 'ハンガリー語の動詞。',    intro: '意味：',               meanings: ['話す', '言う', '響く', '〜について'] },
  zh: { label: '匈牙利语动词。',          intro: '含义：',               meanings: ['说话', '说', '发声', '关于'] },
  ar: { label: 'فعل هنغاري.',            intro: 'يمكن أن يعني:',       meanings: ['يتكلم', 'يقول', 'يصدر صوتًا', 'يدور حول'] },
  ko: { label: '헝가리어 동사.',          intro: '의미:',                meanings: ['말하다', '말하다', '소리나다', '~에 관하다'] },
  nl: { label: 'Hongaars werkwoord.',    intro: 'Kan betekenen:',      meanings: ['spreken', 'zeggen', 'klinken', 'gaan over'] },
  pl: { label: 'Węgierski czasownik.',   intro: 'Może oznaczać:',      meanings: ['mówić', 'powiedzieć', 'brzmieć', 'dotyczyć'] },
  sv: { label: 'Ungerskt verb.',         intro: 'Kan betyda:',         meanings: ['tala', 'säga', 'låta', 'handla om'] },
  he: { label: 'פועל הונגרי.',           intro: 'יכול לאמור:',         meanings: ['לדבר', 'לומר', 'להישמע', 'לעסוק ב'] },
  el: { label: 'Ουγγρικό ρήμα.',        intro: 'Μπορεί να σημαίνει:', meanings: ['μιλώ', 'λέω', 'ηχώ', 'αφορά'] },
  hu: { label: 'Magyar ige.',            intro: 'Jelentése:',          meanings: ['szól', 'mond', 'hangzik', 'szól vmiről'] },
}

const tooltipInfo = computed(() => SZOL_INFO[props.lang] ?? SZOL_INFO.en)

function tapLogo() {
  const huVoice = pickVoice(voices.value, 'hu-HU', 'hu')
  if (huVoice) {
    const utt = new SpeechSynthesisUtterance('szól')
    utt.lang  = 'hu-HU'
    utt.voice = huVoice
    speechSynthesis.cancel()
    speechSynthesis.resume()
    speechSynthesis.speak(utt)
  }

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
