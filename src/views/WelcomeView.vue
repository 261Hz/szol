<template>
  <div class="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 gap-8">

    <!-- Brand -->
    <div class="text-center">
      <div class="text-5xl font-bold tracking-tight text-gray-50 mb-2">
        Sz<span class="text-violet-400">ó</span>l
      </div>

      <!-- Tagline in every supported language — scrolls so anyone can read it -->
      <div class="overflow-hidden w-64 mx-auto mt-1">
        <div class="flex whitespace-nowrap text-gray-600 text-xs" style="animation: marquee 22s linear infinite">
          <span v-for="(t, i) in taglines" :key="i" class="mr-6">{{ t }}</span>
          <!-- duplicate for seamless loop -->
          <span v-for="(t, i) in taglines" :key="'b'+i" class="mr-6">{{ t }}</span>
        </div>
      </div>
    </div>

    <!-- "I'm learning" in every language — shown before selection -->
    <div v-if="!selected" class="text-center leading-relaxed">
      <div
        v-for="(row, i) in headerRows"
        :key="i"
        class="text-gray-500 text-xs"
      >{{ row }}</div>
    </div>

    <!-- After selection: header in the chosen language -->
    <div v-else class="text-center">
      <div class="text-gray-300 text-sm font-medium">{{ ui.header }}</div>
    </div>

    <!-- Language grid -->
    <div class="w-full max-w-sm">
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="(cfg, code) in LANGS"
          :key="code"
          type="button"
          @click="selected = code"
          :class="[
            'flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border transition-all text-center',
            selected === code
              ? 'border-violet-500 bg-violet-950 text-violet-200'
              : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200',
          ]"
        >
          <div class="text-2xl leading-none">{{ FLAGS[code] }}</div>
          <div class="text-xs font-medium leading-tight">{{ cfg.name }}</div>
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="w-full max-w-sm flex flex-col items-center gap-3">
      <button
        v-if="selected"
        type="button"
        @click="$emit('pick', selected)"
        class="w-full py-3 rounded-xl bg-green-700 text-white font-semibold text-sm hover:bg-green-600 transition-all"
        :dir="ui.rtl ? 'rtl' : 'ltr'"
      >{{ ui.start }}</button>

      <div v-else class="text-xs text-gray-700 py-3 text-center leading-relaxed">
        <span v-for="(h, i) in pickHints" :key="i" class="block">{{ h }}</span>
      </div>

      <button
        type="button"
        @click="$emit('sign-in', selected)"
        :disabled="!selected"
        class="text-sm transition-all disabled:opacity-20"
        :class="selected ? 'text-green-500 hover:text-green-300' : 'text-gray-700'"
        :dir="ui.rtl ? 'rtl' : 'ltr'"
      >{{ selected ? ui.signIn : '' }}</button>
    </div>

  </div>
</template>

<style scoped>
@keyframes marquee {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
</style>

<script setup>
import { ref, computed } from 'vue'
import { LANGS } from '../data/stories.js'

defineEmits(['pick', 'sign-in'])

const selected = ref(null)

const FLAGS = {
  en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  it: '🇮🇹', ru: '🇷🇺', he: '🇮🇱', ar: '🇸🇦',
  arz: '🇪🇬', ja: '🇯🇵', zh: '🇨🇳', hu: '🇭🇺', el: '🇬🇷',
}

// App tagline in every language — scrolls in the marquee
const taglines = [
  'Learn languages through reading',
  'Aprende idiomas leyendo',
  'Apprends les langues en lisant',
  'Sprachen durch Lesen lernen',
  'Impara le lingue leggendo',
  'Учи языки через чтение',
  'למד שפות דרך קריאה',
  'تعلم اللغات من خلال القراءة',
  '読んで語学を学ぼう',
  '通过阅读学语言',
  'Tanulj nyelveket olvasással',
  'Μάθε γλώσσες μέσω ανάγνωσης',
]

// "I'm learning" in every supported language — shown before a language is chosen
const HEADER_LINES = [
  'I\'m learning · Estoy aprendiendo · J\'apprends',
  'Ich lerne · Sto imparando · Я учу',
  'אני לומד · أنا أتعلم · بتعلم',
  '勉強しています · 我在学 · Tanulom · Μαθαίνω',
]

const headerRows = HEADER_LINES

// A few languages as hints for the "pick" prompt
const pickHints = [
  '↑ Select a language  ·  اختر لغة',
  '言語を選ぶ  ·  Choisissez une langue',
]

// Per-language UI strings shown after selection
const UI = {
  en:  { header: 'I\'m learning English',          start: 'Get started →',        signIn: 'Sign in / Create account',           rtl: false },
  es:  { header: 'Estoy aprendiendo español',       start: 'Comenzar →',           signIn: 'Iniciar sesión / Crear cuenta',       rtl: false },
  fr:  { header: 'J\'apprends le français',         start: 'Commencer →',          signIn: 'Se connecter / Créer un compte',      rtl: false },
  de:  { header: 'Ich lerne Deutsch',               start: 'Loslegen →',           signIn: 'Anmelden / Konto erstellen',          rtl: false },
  it:  { header: 'Sto imparando l\'italiano',       start: 'Inizia →',             signIn: 'Accedi / Crea account',               rtl: false },
  ru:  { header: 'Я учу русский язык',              start: 'Начать →',             signIn: 'Войти / Создать аккаунт',             rtl: false },
  he:  { header: 'אני לומד עברית',                  start: '← התחל',              signIn: 'התחבר / צור חשבון',                   rtl: true  },
  ar:  { header: 'أنا أتعلم العربية',               start: '← ابدأ',              signIn: 'تسجيل الدخول / إنشاء حساب',           rtl: true  },
  arz: { header: 'أنا بتعلم مصري',                  start: '← ابدأ',              signIn: 'دخول / عمل حساب',                     rtl: true  },
  ja:  { header: '日本語を勉強しています',           start: 'はじめる →',           signIn: 'ログイン / アカウント作成',            rtl: false },
  zh:  { header: '我在学中文',                       start: '开始 →',               signIn: '登录 / 创建账户',                     rtl: false },
  hu:  { header: 'Magyar nyelvet tanulok',           start: 'Kezdjük →',            signIn: 'Bejelentkezés / Fiók létrehozása',    rtl: false },
  el:  { header: 'Μαθαίνω ελληνικά',               start: 'Ξεκίνα →',             signIn: 'Σύνδεση / Δημιουργία λογαριασμού',   rtl: false },
}

const ui = computed(() => selected.value ? UI[selected.value] : UI.en)
</script>
