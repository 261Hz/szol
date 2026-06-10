<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div class="bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 w-full max-w-md mx-4 overflow-hidden">

      <!-- Brand header -->
      <div class="px-8 pt-8 pb-6 border-b border-gray-800 flex items-center justify-between">
        <div>
          <div class="text-xl font-bold tracking-tight text-gray-100">
            Sz<span class="text-green-400">ó</span>l
          </div>
          <div class="text-xs text-gray-500 mt-0.5">Language learning through real content</div>
        </div>
        <button @click="$emit('close')" class="text-gray-600 hover:text-gray-300 transition-all text-xl leading-none">✕</button>
      </div>

      <!-- Tab bar -->
      <div class="flex border-b border-gray-800">
        <button
          v-for="tab in ['Login', 'Register']"
          :key="tab"
          @click="switchTab(tab)"
          :class="[
            'flex-1 py-3 text-sm font-medium transition-all',
            activeTab === tab
              ? 'text-green-400 border-b-2 border-green-400 -mb-px'
              : 'text-gray-500 hover:text-gray-300'
          ]"
        >{{ tab }}</button>
      </div>

      <div class="px-8 py-6">

        <!-- ── Login form ── -->
        <form v-if="activeTab === 'Login'" @submit.prevent="doLogin" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-gray-400">Email</label>
            <input
              v-model="email" type="email" required autocomplete="email"
              placeholder="you@example.com"
              class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-green-600 transition-all"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-gray-400">Password</label>
            <div class="relative">
              <input
                v-model="password" :type="showPassword ? 'text' : 'password'"
                required autocomplete="current-password" placeholder="••••••••"
                class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-16 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-green-600 transition-all"
              />
              <button type="button" @click="showPassword = !showPassword" tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-all"
              >{{ showPassword ? 'Hide' : 'Show' }}</button>
            </div>
          </div>

          <div v-if="error" class="text-xs text-red-400 leading-snug bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">{{ error }}</div>
          <button v-if="showResend" type="button" :disabled="resending" @click="doResend"
            class="text-xs text-green-400 hover:text-green-300 underline text-left disabled:opacity-40 transition-all"
          >{{ resending ? 'Sending…' : 'Resend verification email' }}</button>
          <div v-if="resendSuccess" class="text-xs text-green-400">Verification email sent! Check your inbox.</div>

          <button type="submit" :disabled="loading"
            class="w-full py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-40 transition-all"
          >{{ loading ? 'Logging in…' : 'Log in' }}</button>

          <div class="text-center text-xs text-gray-600">
            No account?
            <button type="button" @click="switchTab('Register')" class="text-green-400 hover:text-green-300 transition-all">Create one</button>
          </div>
        </form>

        <!-- ── Register form ── -->
        <form v-else @submit.prevent="handleRegisterStep" class="flex flex-col gap-4">

          <!-- Step indicator -->
          <div class="flex items-center gap-2 mb-1">
            <div v-for="s in 2" :key="s"
              :class="['h-1 flex-1 rounded-full transition-all', s <= registerStep ? 'bg-green-500' : 'bg-gray-800']"
            />
            <span class="text-xs text-gray-600 ml-1">{{ registerStep }}/2</span>
          </div>

          <!-- Step 1: Credentials -->
          <template v-if="registerStep === 1">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">Username</label>
              <input v-model="username" type="text" required minlength="2" maxlength="40" autocomplete="username"
                placeholder="your_username"
                class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-green-600 transition-all"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">Email</label>
              <input v-model="email" type="email" required autocomplete="email"
                placeholder="you@example.com"
                class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-green-600 transition-all"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">Password</label>
              <div class="relative">
                <input v-model="password" :type="showPassword ? 'text' : 'password'"
                  required autocomplete="new-password" placeholder="Min 8 characters"
                  class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-16 text-sm text-gray-100 placeholder:text-gray-600 outline-none focus:border-green-600 transition-all"
                />
                <button type="button" @click="showPassword = !showPassword" tabindex="-1"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition-all"
                >{{ showPassword ? 'Hide' : 'Show' }}</button>
              </div>
              <!-- Strength bar -->
              <div v-if="password" class="flex gap-1 h-1 mt-0.5">
                <div v-for="i in 4" :key="i" class="flex-1 rounded-full transition-all"
                  :class="i <= passwordStrength ? strengthColor : 'bg-gray-800'" />
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">Confirm password</label>
              <div class="relative">
                <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'"
                  required autocomplete="new-password" placeholder="••••••••"
                  class="w-full bg-gray-900 rounded-lg px-3 py-2.5 pr-8 text-sm text-gray-100 placeholder:text-gray-600 outline-none transition-all"
                  :class="confirmPassword && confirmPassword !== password ? 'border border-red-700 focus:border-red-500' : 'border border-gray-700 focus:border-green-600'"
                />
                <span v-if="confirmPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  :class="confirmPassword === password ? 'text-green-400' : 'text-red-400'"
                >{{ confirmPassword === password ? '✓' : '✗' }}</span>
              </div>
            </div>
          </template>

          <!-- Step 2: Languages -->
          <template v-else>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">My native language</label>
              <select v-model="nativeLang" required
                class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-green-600 transition-all"
                :class="nativeLang ? 'text-gray-100' : 'text-gray-500'"
              >
                <option value="">Select language</option>
                <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">Language I'm learning</label>
              <select v-model="targetLang" required
                class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-green-600 transition-all"
                :class="targetLang ? 'text-gray-100' : 'text-gray-500'"
              >
                <option value="">Select language</option>
                <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-gray-400">{{ proficiencyPrompt }}</label>
              <select v-model="proficiency"
                class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-green-600 transition-all"
              >
                <option value="">Skip for now</option>
                <option v-for="lvl in proficiencyOptions" :key="lvl.value" :value="lvl.value">{{ lvl.label }}</option>
              </select>
            </div>

            <!-- Turnstile — explicit render target -->
            <div v-if="turnstileSiteKey" ref="turnstileEl" class="flex justify-center" />
          </template>

          <div v-if="error" class="text-xs text-red-400 leading-snug bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">{{ error }}</div>

          <div v-if="registered" class="text-xs text-green-400 leading-snug bg-green-950 border border-green-800 rounded-lg px-3 py-2">
            Account created! Check your inbox for a verification link before logging in.
          </div>

          <div v-if="!registered" class="flex gap-2">
            <button v-if="registerStep === 2" type="button" @click="registerStep = 1"
              class="px-4 py-2.5 rounded-lg border border-gray-700 text-gray-400 text-sm hover:border-gray-500 hover:text-gray-200 transition-all"
            >Back</button>
            <button type="submit" :disabled="loading || !canSubmitStep"
              class="flex-1 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-40 transition-all"
            >{{ loading ? '…' : registerStep === 1 ? 'Continue →' : 'Create account' }}</button>
          </div>

          <div class="text-center text-xs text-gray-600">
            Already have an account?
            <button type="button" @click="switchTab('Login')" class="text-green-400 hover:text-green-300 transition-all">Log in</button>
          </div>
        </form>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { login, register, getMe } from '../utils/api.js'
import { LANGS } from '../data/stories.js'

const API_URL          = import.meta.env.VITE_API_URL              ?? 'https://szol.onrender.com'
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY   ?? ''
const authToken        = () => localStorage.getItem('szol_token')

const emit = defineEmits(['close', 'logged-in'])

const activeTab       = ref('Login')
const registerStep    = ref(1)
const email           = ref('')
const password        = ref('')
const confirmPassword = ref('')
const username        = ref('')
const nativeLang      = ref('')
const targetLang      = ref('')
const proficiency     = ref('')
const showPassword    = ref(false)
const error           = ref('')
const loading         = ref(false)
const registered      = ref(false)
const showResend      = ref(false)
const resending       = ref(false)
const resendSuccess   = ref(false)
const turnstileToken  = ref('')
const turnstileEl     = ref(null)
let   turnstileWidgetId = null

watch(targetLang, () => { proficiency.value = '' })

// ── Turnstile explicit render ─────────────────────────────────────────────────
// Auto-render won't work because the div mounts after Turnstile has already
// scanned the DOM. We call turnstile.render() explicitly after step 2 appears.

async function mountTurnstile() {
  if (!turnstileSiteKey) return
  await nextTick()
  if (!turnstileEl.value) return

  // Wait up to 2 s for the Turnstile script to load
  let waited = 0
  while (!window.turnstile && waited < 2000) {
    await new Promise(r => setTimeout(r, 100))
    waited += 100
  }
  if (!window.turnstile) return

  if (turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId)
    return
  }
  turnstileWidgetId = window.turnstile.render(turnstileEl.value, {
    sitekey:           turnstileSiteKey,
    callback:          (t) => { turnstileToken.value = t },
    'expired-callback': () => { turnstileToken.value = '' },
    theme:             'dark',
  })
}

watch([activeTab, registerStep], ([tab, step]) => {
  if (tab === 'Register' && step === 2) mountTurnstile()
})

// ── Language / proficiency options ────────────────────────────────────────────
const CEFR = [
  { value: 'A1', label: 'A1 — Beginner' }, { value: 'A2', label: 'A2 — Elementary' },
  { value: 'B1', label: 'B1 — Intermediate' }, { value: 'B2', label: 'B2 — Upper intermediate' },
  { value: 'C1', label: 'C1 — Advanced' }, { value: 'C2', label: 'C2 — Mastery' },
]
const JLPT = [
  { value: 'N5', label: 'N5 — Beginner' }, { value: 'N4', label: 'N4 — Elementary' },
  { value: 'N3', label: 'N3 — Intermediate' }, { value: 'N2', label: 'N2 — Upper intermediate' },
  { value: 'N1', label: 'N1 — Advanced' },
]
const HSK = [
  { value: 'HSK1', label: 'HSK 1 — Beginner' }, { value: 'HSK2', label: 'HSK 2 — Elementary' },
  { value: 'HSK3', label: 'HSK 3 — Intermediate' }, { value: 'HSK4', label: 'HSK 4 — Upper intermediate' },
  { value: 'HSK5', label: 'HSK 5 — Advanced' }, { value: 'HSK6', label: 'HSK 6 — Mastery' },
]

const proficiencyOptions = computed(() => {
  if (targetLang.value === 'ja') return JLPT
  if (targetLang.value === 'zh') return HSK
  return CEFR
})

const proficiencyPrompt = computed(() => {
  if (!targetLang.value) return 'Your current level (optional)'
  if (targetLang.value === 'ja') return 'JLPT level (optional)'
  if (targetLang.value === 'zh') return 'HSK level (optional)'
  return `CEFR level in ${LANGS[targetLang.value]?.name ?? ''} (optional)`
})

// ── Validation ────────────────────────────────────────────────────────────────
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

const canSubmitStep = computed(() => {
  if (registerStep.value === 1)
    return username.value.length >= 2 && email.value && password.value.length >= 8 && password.value === confirmPassword.value
  return !!nativeLang.value && !!targetLang.value
})

function switchTab(tab) {
  activeTab.value       = tab
  registerStep.value    = 1
  error.value           = ''
  password.value        = ''
  confirmPassword.value = ''
  showPassword.value    = false
  registered.value      = false
  showResend.value      = false
  resendSuccess.value   = false
  turnstileWidgetId     = null
}

// ── Error formatting ──────────────────────────────────────────────────────────
function formatError(detail) {
  if (!detail) return 'Something went wrong.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(' · ')
  return String(detail)
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  error.value         = ''
  showResend.value    = false
  resendSuccess.value = false
  loading.value       = true
  try {
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    const msg = formatError(e.detail ?? e.message)
    error.value = msg
    if (msg.toLowerCase().includes('verify your email')) showResend.value = true
  } finally {
    loading.value = false
  }
}

// ── Register (2-step) ─────────────────────────────────────────────────────────
function handleRegisterStep() {
  if (registerStep.value === 1) {
    if (password.value.length < 8)                    { error.value = 'Password must be at least 8 characters.'; return }
    if (password.value !== confirmPassword.value)      { error.value = 'Passwords do not match.'; return }
    error.value = ''
    registerStep.value = 2
  } else {
    doRegister()
  }
}

async function doRegister() {
  error.value   = ''
  loading.value = true
  try {
    await register(username.value, email.value, password.value, proficiency.value || null, targetLang.value, nativeLang.value, turnstileToken.value || null)
    registered.value = true
  } catch (e) {
    error.value = formatError(e.detail ?? e.message)
  } finally {
    loading.value = false
  }
}

// ── Resend verification ───────────────────────────────────────────────────────
async function doResend() {
  resending.value     = true
  resendSuccess.value = false
  try {
    await fetch(`${API_URL}/users/resend-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken()}` },
    })
    resendSuccess.value = true
    showResend.value    = false
  } finally {
    resending.value = false
  }
}
</script>
