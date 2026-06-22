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
          :class="['p-1.5 rounded-md transition-all', active === 'settings' ? 'text-gray-50' : 'text-gray-500 hover:text-gray-200']"
          title="Settings"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div v-if="!currentUser">
          <button @click="$emit('auth')"
            class="p-1.5 rounded-md text-gray-500 hover:text-gray-200 transition-all"
            title="Login / Register">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
        <div v-else class="flex items-center gap-1.5">
          <span class="text-xs text-gray-300 max-w-20 truncate hidden sm:inline">{{ currentUser.username }}</span>
          <button @click="$emit('logout')"
            class="text-xs text-gray-400 hover:text-red-400 transition-all" title="Logout" aria-label="Logout">✕</button>
        </div>
      </div>
    </div>

    <!-- Tab strip: icon + label on active tab -->
    <div class="flex overflow-x-auto px-3 pb-2 gap-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        :class="[
          'relative flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all',
          active === tab.key ? 'text-violet-300' : 'text-gray-600 hover:text-gray-400'
        ]"
        :title="tab.label"
      >
        <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path :d="ICONS[tab.key] ?? ICONS.library" />
        </svg>
        <span
          class="text-[9px] leading-none tracking-wide transition-opacity duration-150"
          :class="active === tab.key ? 'opacity-50' : 'opacity-0'"
          style="min-width: 28px; text-align: center;"
        >{{ tab.label }}</span>
      </button>
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

const ICONS = {
  read:     'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  retype:   'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  listen:   'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  speak:    'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  write:    'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  vocab:    'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
  parallel: 'M4 6h7M4 10h7M4 14h7M4 18h7M15 6h5M15 10h5M15 14h5M15 18h5',
  library:  'M8 14v3m4-8v8m4-5v5M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  journal:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  messages: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
}

const tabs = computed(() => {
  const base = [
    { key: 'read',     label: t(props.lang, 'read') },
    { key: 'retype',   label: t(props.lang, 'retype') },
    { key: 'listen',   label: t(props.lang, 'listen') },
    { key: 'speak',    label: t(props.lang, 'speak') },
    { key: 'write',    label: t(props.lang, 'write') },
    { key: 'vocab',    label: t(props.lang, 'vocab') },
    { key: 'parallel', label: 'Parallel' },
    { key: 'library',  label: t(props.lang, 'library') },
    { key: 'journal',  label: t(props.lang, 'journal') },
    { key: 'messages', label: 'Voice' },
  ]
  return base
})
</script>

<style scoped>
.tooltip-enter-active, .tooltip-leave-active { transition: opacity 0.15s, transform 0.15s; }
.tooltip-enter-from, .tooltip-leave-to       { opacity: 0; transform: translateY(-4px); }
</style>
