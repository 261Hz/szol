<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-6 gap-8">

    <!-- Brand -->
    <div class="flex flex-col items-center gap-1.5">
      <div class="text-5xl font-bold tracking-tight select-none" style="color:#2a241c; font-family:'IM Fell English',serif;">
        Sz<span style="color:#8b3a3a">ó</span>l
      </div>
      <div class="text-[11px] tracking-[0.2em] uppercase" style="color:#8c7a66;">a language archive</div>
    </div>

    <!-- Paper map surface -->
    <div class="map-paper w-full max-w-lg">
      <div class="map-paper-label">Choose a language</div>
      <div class="map-regions">
        <div v-for="region in REGIONS" :key="region.name" class="map-region">
          <div class="map-region-name">{{ region.name }}</div>
          <div class="map-region-langs">
            <button
              v-for="code in region.langs.filter(c => LANGS[c])"
              :key="code"
              type="button"
              @click="selected = code"
              class="map-lang"
              :class="{ 'map-lang--active': selected === code }"
              :dir="LANGS[code]?.rtl ? 'rtl' : 'ltr'"
            >{{ LANGS[code].name }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CTA buttons -->
    <div class="flex flex-col items-center gap-3 min-h-16">
      <Transition name="rise">
        <button
          v-if="selected"
          type="button"
          @click="$emit('pick', selected)"
          class="px-8 py-2.5 text-sm font-medium transition-all"
          style="background:#8b3a3a; color:#f3e7d3; border-radius:2px;"
          onmouseover="this.style.background='#7a2e2e'" onmouseout="this.style.background='#8b3a3a'"
          :dir="ui.rtl ? 'rtl' : 'ltr'"
        >{{ ui.start }}</button>
      </Transition>
      <Transition name="rise">
        <button
          v-if="selected"
          type="button"
          @click="$emit('sign-in', selected)"
          class="text-sm transition-all"
          style="color:#8c7a66;"
          :dir="ui.rtl ? 'rtl' : 'ltr'"
        >{{ ui.signIn }}</button>
      </Transition>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { LANGS } from '../data/stories.js'

defineEmits(['pick', 'sign-in'])

const selected = ref(null)

const REGIONS = [
  { name: 'Western Europe', langs: ['en', 'fr', 'de', 'es', 'it', 'el'] },
  { name: 'Central & East', langs: ['hu', 'ru'] },
  { name: 'Middle East',    langs: ['ar', 'arz', 'he'] },
  { name: 'East Asia',      langs: ['ja', 'zh'] },
]

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

<style scoped>
.map-paper {
  background: #ede0c8;
  border-radius: 2px;
  padding: 2rem 2.5rem;
  box-shadow: 0 6px 32px rgba(42,36,28,0.18), 0 2px 8px rgba(42,36,28,0.10);
  position: relative;
  overflow: hidden;
}

.map-paper::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px);
  background-size: 30px 30px;
  pointer-events: none;
}

.map-paper-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #a08060;
  margin-bottom: 1.5rem;
  position: relative;
}

.map-regions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.75rem 2.5rem;
  position: relative;
}

.map-region-name {
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: #b09060;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.map-region-langs {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.map-lang {
  text-align: left;
  font-size: 0.875rem;
  color: #4a3c28;
  padding: 0.2rem 0.5rem;
  border-left: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  line-height: 1.4;
}

.map-lang:hover {
  color: #1a0c00;
  border-left-color: #c8a050;
}

.map-lang--active {
  color: #1a0c00;
  font-weight: 600;
  border-left-color: #8b6914;
}

.rise-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.rise-leave-active { transition: opacity 0.15s ease; }
.rise-enter-from   { opacity: 0; transform: translateY(5px); }
.rise-leave-to     { opacity: 0; }
</style>
