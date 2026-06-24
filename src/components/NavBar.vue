<template>
  <nav class="sticky top-0 z-40" style="background: rgba(212,199,164,0.97); border-bottom: 1px solid rgba(31,27,23,0.12); backdrop-filter: blur(2px);">

    <!-- Top row: brand + language selector + controls -->
    <div class="flex items-center justify-between px-4 py-2">

      <div class="relative flex-shrink-0">
        <button
          @click="tapLogo"
          class="select-none hover:opacity-70 transition-opacity"
          style="color:#1f1b17; font-family:'IM Fell English',serif; font-size:1.35rem;"
        >Sz<span style="color:#b45a5a">ó</span>l</button>
        <Transition name="tooltip">
          <div
            v-if="showTooltip"
            class="absolute top-full left-0 mt-1.5 z-50 px-4 py-3 shadow-xl min-w-[180px]"
            style="background:#d4c7a4; border:1px solid rgba(31,27,23,0.12); border-radius:2px;"
          >
            <div class="flex items-baseline gap-2 mb-1">
              <span class="text-base font-semibold" style="color:#1f1b17; font-family:'IM Fell English',serif;">Szól</span>
              <span class="text-xs font-mono" style="color:rgba(31,27,23,0.35);">[soːl]</span>
            </div>
            <div class="text-xs mb-2" style="color:rgba(31,27,23,0.65);">{{ tooltipInfo.label }}</div>
            <div class="text-xs mb-1" style="color:rgba(31,27,23,0.35);">{{ tooltipInfo.intro }}</div>
            <ul class="space-y-0.5">
              <li
                v-for="m in tooltipInfo.meanings"
                :key="m"
                class="text-sm flex items-center gap-1.5"
                style="color:#1f1b17;"
              ><span style="color:#b45a5a;">•</span>{{ m }}</li>
            </ul>
          </div>
        </Transition>
      </div>

      <div class="flex items-center gap-2">
        <select
          :value="lang"
          aria-label="Language"
          @change="$emit('lang', $event.target.value)"
          class="text-sm bg-transparent border-0 border-b px-1 py-0.5 max-w-28"
          style="border-color:rgba(31,27,23,0.18); color:rgba(31,27,23,0.6); font-family:'EB Garamond',serif;"
        >
          <option v-for="(l, code) in LANGS" :key="code" :value="code" style="background:#d4c7a4;">{{ l.name }}</option>
        </select>

        <button
          @click="$emit('tab', 'settings')"
          class="p-1.5 transition-all"
          :style="active === 'settings' ? 'color:#1f1b17;' : 'color:rgba(31,27,23,0.4);'"
          title="Settings"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div v-if="!currentUser">
          <button @click="$emit('auth')"
            class="p-1.5 transition-all"
            style="color:rgba(31,27,23,0.45);"
            title="Login / Register">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
        <div v-else class="flex items-center gap-1.5">
          <span class="text-xs max-w-20 truncate hidden sm:inline" style="color:rgba(31,27,23,0.5);">{{ currentUser.username }}</span>
          <button @click="$emit('logout')"
            class="text-xs transition-all" style="color:rgba(31,27,23,0.35);" title="Logout" aria-label="Logout"
            onmouseover="this.style.color='#8b3a3a'" onmouseout="this.style.color='rgba(31,27,23,0.35)'"
          >✕</button>
        </div>
      </div>
    </div>

    <!-- Tab strip: icon + label on active tab -->
    <div class="flex overflow-x-auto px-4 pb-1.5 gap-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        class="relative flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1 transition-all"
        :style="active === tab.key ? 'color:#1f1b17;' : 'color:rgba(31,27,23,0.3);'"
        :title="tab.label"
      >
        <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path :d="ICONS[tab.key] ?? ICONS.library" />
        </svg>
        <span
          class="text-[9px] leading-none tracking-wide transition-opacity duration-150"
          :style="active === tab.key ? 'opacity:0.85;' : 'opacity:0.28;'"
          style="min-width: 28px; text-align: center;"
        >{{ tab.label }}</span>
        <div
          v-if="active === tab.key"
          class="absolute bottom-0 left-1/2 -translate-x-1/2 h-[1.5px] w-4 transition-all"
          style="background:#b45a5a;"
        ></div>
      </button>
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
  browse: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  read:   'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  vocab:  'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
}

const tabs = computed(() => [
  { key: 'browse', label: t(props.lang, 'browse') },
  { key: 'read',   label: t(props.lang, 'read') },
  { key: 'vocab',  label: t(props.lang, 'vocab') },
])
</script>

<style scoped>
.tooltip-enter-active, .tooltip-leave-active { transition: opacity 0.15s, transform 0.15s; }
.tooltip-enter-from, .tooltip-leave-to       { opacity: 0; transform: translateY(-4px); }
</style>
