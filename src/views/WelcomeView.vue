<template>
  <div class="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 gap-8">

    <!-- Brand -->
    <div class="text-5xl font-bold tracking-tight text-gray-50">
      Sz<span class="text-violet-400">ó</span>l
    </div>

    <!-- Language grid — sorted by in-app learner count descending -->
    <div class="w-full max-w-sm grid grid-cols-2 sm:grid-cols-3 gap-2">
      <button
        v-for="[code, cfg] in sortedLangs"
        :key="code"
        type="button"
        @click="selected = code"
        :class="[
          'flex flex-col items-center gap-1 px-3 py-3 rounded-xl border transition-all text-center',
          selected === code
            ? 'border-violet-500 bg-violet-950 text-violet-200'
            : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200',
        ]"
      >
        <div class="text-2xl leading-none">{{ FLAGS[code] }}</div>
        <div class="text-xs font-medium leading-tight">{{ cfg.name }}</div>
        <div v-if="learnerCounts[code]" class="text-[10px] leading-none opacity-50">
          {{ fmtCount(learnerCounts[code]) }} learners
        </div>
      </button>
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
      <div v-else class="py-3" />

      <button
        v-if="selected"
        type="button"
        @click="$emit('sign-in', selected)"
        class="text-sm text-green-500 hover:text-green-300 transition-all"
        :dir="ui.rtl ? 'rtl' : 'ltr'"
      >{{ ui.signIn }}</button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { fetchLearnerCounts } from '../utils/api.js'

defineEmits(['pick', 'sign-in'])

const selected = ref(null)
const learnerCounts = ref({})

onMounted(async () => {
  learnerCounts.value = await fetchLearnerCounts()
})

const sortedLangs = computed(() =>
  Object.entries(LANGS).sort(
    (a, b) => (learnerCounts.value[b[0]] ?? 0) - (learnerCounts.value[a[0]] ?? 0)
  )
)

function fmtCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

const FLAGS = {
  en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪',
  it: '🇮🇹', ru: '🇷🇺', he: '🇮🇱', ar: '🇸🇦',
  arz: '🇪🇬', ja: '🇯🇵', zh: '🇨🇳', hu: '🇭🇺', el: '🇬🇷',
}

const UI = {
  en:  { start: 'Get started →',   signIn: 'Sign in / Create account',          rtl: false },
  es:  { start: 'Comenzar →',      signIn: 'Iniciar sesión / Crear cuenta',      rtl: false },
  fr:  { start: 'Commencer →',     signIn: 'Se connecter / Créer un compte',     rtl: false },
  de:  { start: 'Loslegen →',      signIn: 'Anmelden / Konto erstellen',         rtl: false },
  it:  { start: 'Inizia →',        signIn: 'Accedi / Crea account',              rtl: false },
  ru:  { start: 'Начать →',        signIn: 'Войти / Создать аккаунт',            rtl: false },
  he:  { start: '← התחל',         signIn: 'התחבר / צור חשבון',                  rtl: true  },
  ar:  { start: '← ابدأ',          signIn: 'تسجيل الدخول / إنشاء حساب',          rtl: true  },
  arz: { start: '← ابدأ',          signIn: 'دخول / عمل حساب',                    rtl: true  },
  ja:  { start: 'はじめる →',      signIn: 'ログイン / アカウント作成',           rtl: false },
  zh:  { start: '开始 →',          signIn: '登录 / 创建账户',                     rtl: false },
  hu:  { start: 'Kezdjük →',       signIn: 'Bejelentkezés / Fiók létrehozása',   rtl: false },
  el:  { start: 'Ξεκίνα →',       signIn: 'Σύνδεση / Δημιουργία λογαριασμού',  rtl: false },
}

const ui = computed(() => UI[selected.value] ?? UI.en)
</script>
