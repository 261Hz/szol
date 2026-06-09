<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    @click.self="$emit('close')"
  >
    <div class="bg-gray-900 rounded-xl shadow-xl border border-gray-700 w-full max-w-sm mx-4 p-6 flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="font-semibold text-gray-100">
          Sz<span class="text-green-400">ó</span>l account
        </div>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1">
        <button
          v-for="tab in ['Login', 'Register']"
          :key="tab"
          @click="switchTab(tab)"
          :class="[
            'px-3 py-1 text-sm rounded-md transition-all',
            activeTab === tab ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-gray-100'
          ]"
        >{{ tab }}</button>
      </div>

      <!-- ── Login form ── -->
      <form v-if="activeTab === 'Login'" @submit.prevent="doLogin" class="flex flex-col gap-3">
        <input
          id="login-email"
          name="email"
          v-model="email"
          type="email"
          placeholder="Email"
          required
          autocomplete="email"
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 transition-all"
        />
        <!-- Password with show/hide toggle -->
        <div class="relative">
          <input
            id="login-password"
            name="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password"
            required
            autocomplete="current-password"
            class="w-full border border-gray-700 rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-green-600 transition-all"
          />
          <button
            type="button"
            @click="showPassword = !showPassword"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
            tabindex="-1"
          >{{ showPassword ? 'Hide' : 'Show' }}</button>
        </div>

        <div v-if="error" class="text-xs text-red-500 leading-snug">{{ error }}</div>
        <button
          type="submit"
          :disabled="loading"
          class="px-4 py-2 rounded-md bg-green-700 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-all"
        >{{ loading ? 'Logging in…' : 'Login' }}</button>
      </form>

      <!-- ── Register form ── -->
      <form v-else @submit.prevent="doRegister" class="flex flex-col gap-3">
        <input
          id="reg-username"
          name="username"
          v-model="username"
          type="text"
          placeholder="Username"
          required
          minlength="2"
          maxlength="40"
          autocomplete="username"
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 transition-all"
        />
        <input
          id="reg-email"
          name="email"
          v-model="email"
          type="email"
          placeholder="Email"
          required
          autocomplete="email"
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 transition-all"
        />
        <!-- Password with show/hide and strength hint -->
        <div class="relative">
          <input
            id="reg-password"
            name="password"
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Password (min 8 characters)"
            required
            autocomplete="new-password"
            class="w-full border border-gray-700 rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-green-600 transition-all"
          />
          <button
            type="button"
            @click="showPassword = !showPassword"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
            tabindex="-1"
          >{{ showPassword ? 'Hide' : 'Show' }}</button>
        </div>
        <!-- Password strength bar -->
        <div v-if="password" class="flex gap-1 h-1">
          <div
            v-for="i in 4"
            :key="i"
            class="flex-1 rounded-full transition-all"
            :class="i <= passwordStrength ? strengthColor : 'bg-gray-800'"
          />
        </div>
        <!-- Confirm password -->
        <div class="relative">
          <input
            id="reg-confirm"
            name="confirm-password"
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Confirm password"
            required
            autocomplete="new-password"
            class="w-full border border-gray-700 rounded-md px-3 py-2 pr-10 text-sm outline-none transition-all"
            :class="confirmPassword && confirmPassword !== password ? 'border-red-300 focus:border-red-400' : 'border-gray-700 focus:border-green-600'"
          />
          <span
            v-if="confirmPassword"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
            :class="confirmPassword === password ? 'text-green-400' : 'text-red-400'"
          >{{ confirmPassword === password ? '✓' : '✗' }}</span>
        </div>
        <!-- Native language (required) -->
        <select
          id="reg-native-lang"
          name="native-lang"
          v-model="nativeLang"
          required
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 focus:border-green-600 transition-all"
          :class="nativeLang ? 'text-gray-100' : 'text-gray-400'"
        >
          <option value="">My native language *</option>
          <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
        </select>

        <!-- Language you're learning (required) -->
        <select
          id="reg-target-lang"
          name="target-lang"
          v-model="targetLang"
          required
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 focus:border-green-600 transition-all"
          :class="targetLang ? 'text-gray-100' : 'text-gray-400'"
        >
          <option value="">Language I'm learning *</option>
          <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
        </select>

        <!-- Proficiency level (optional) -->
        <select
          id="reg-proficiency"
          name="proficiency"
          v-model="proficiency"
          class="border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 focus:border-green-600 text-gray-400 transition-all"
        >
          <option value="">{{ proficiencyPrompt }}</option>
          <option v-for="lvl in proficiencyOptions" :key="lvl.value" :value="lvl.value">{{ lvl.label }}</option>
        </select>

        <div v-if="error" class="text-xs text-red-500 leading-snug">{{ error }}</div>
        <button
          type="submit"
          :disabled="loading || !canSubmitRegister"
          class="px-4 py-2 rounded-md bg-green-700 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-all"
        >{{ loading ? 'Creating account…' : 'Create Account' }}</button>
      </form>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { login, register, getMe } from '../utils/api.js'
import { LANGS } from '../data/stories.js'

const emit = defineEmits(['close', 'logged-in'])

const activeTab       = ref('Login')
const email           = ref('')
const password        = ref('')
const confirmPassword = ref('')
const username        = ref('')
const nativeLang      = ref('')   // their native language
const targetLang      = ref('')   // language they're learning
const proficiency     = ref('')
const showPassword    = ref(false)
const error           = ref('')
const loading         = ref(false)

// Reset proficiency when language changes so stale values don't linger
watch(targetLang, () => { proficiency.value = '' })

// Proficiency scales by language learning system
const CEFR = [
  { value: 'A1', label: 'A1 — Beginner' },
  { value: 'A2', label: 'A2 — Elementary' },
  { value: 'B1', label: 'B1 — Intermediate' },
  { value: 'B2', label: 'B2 — Upper intermediate' },
  { value: 'C1', label: 'C1 — Advanced' },
  { value: 'C2', label: 'C2 — Mastery' },
]
const JLPT = [
  { value: 'N5', label: 'N5 — Beginner' },
  { value: 'N4', label: 'N4 — Elementary' },
  { value: 'N3', label: 'N3 — Intermediate' },
  { value: 'N2', label: 'N2 — Upper intermediate' },
  { value: 'N1', label: 'N1 — Advanced' },
]
const HSK = [
  { value: 'HSK1', label: 'HSK 1 — Beginner' },
  { value: 'HSK2', label: 'HSK 2 — Elementary' },
  { value: 'HSK3', label: 'HSK 3 — Intermediate' },
  { value: 'HSK4', label: 'HSK 4 — Upper intermediate' },
  { value: 'HSK5', label: 'HSK 5 — Advanced' },
  { value: 'HSK6', label: 'HSK 6 — Mastery' },
]

const proficiencyOptions = computed(() => {
  if (targetLang.value === 'ja') return JLPT
  if (targetLang.value === 'zh') return HSK
  return CEFR
})

const proficiencyPrompt = computed(() => {
  if (!targetLang.value) return 'Proficiency level (optional)'
  if (targetLang.value === 'ja') return 'JLPT level (optional)'
  if (targetLang.value === 'zh') return 'HSK level (optional)'
  return `CEFR level in ${LANGS[targetLang.value]?.name ?? ''} (optional)`
})

function switchTab(tab) {
  activeTab.value = tab
  error.value = ''
  password.value = ''
  confirmPassword.value = ''
  showPassword.value = false
}

// ── Password strength (0-4) ───────────────────────────────────────────────────
const passwordStrength = computed(() => {
  const p = password.value
  if (!p) return 0
  let score = 0
  if (p.length >= 8)  score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) score++
  return Math.max(score, p.length >= 8 ? 1 : 0)
})

const strengthColor = computed(() => {
  if (passwordStrength.value <= 1) return 'bg-red-400'
  if (passwordStrength.value === 2) return 'bg-orange-400'
  if (passwordStrength.value === 3) return 'bg-yellow-400'
  return 'bg-green-600'
})

const canSubmitRegister = computed(() =>
  password.value.length >= 8 &&
  password.value === confirmPassword.value &&
  !!nativeLang.value &&
  !!targetLang.value
)

// ── Error formatting ──────────────────────────────────────────────────────────
// FastAPI validation errors come back as an array of objects.
// This collapses them into a readable sentence.
function formatError(detail) {
  if (!detail) return 'Something went wrong.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(' · ')
  }
  return String(detail)
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  error.value   = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = formatError(e.detail ?? e.message)
  } finally {
    loading.value = false
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
async function doRegister() {
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match.'
    return
  }
  error.value   = ''
  loading.value = true
  try {
    await register(username.value, email.value, password.value, proficiency.value || null, targetLang.value, nativeLang.value)
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = formatError(e.detail ?? e.message)
  } finally {
    loading.value = false
  }
}
</script>
