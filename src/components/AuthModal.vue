<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div
      class="w-full max-w-md mx-4 overflow-hidden"
      style="background:#ece4ca; border:1px solid rgba(31,27,23,0.15); border-radius:3px; box-shadow:0 8px 40px rgba(31,27,23,0.18);"
    >

      <!-- Brand header -->
      <div class="px-8 pt-8 pb-6 flex items-center justify-between" style="border-bottom:1px solid rgba(31,27,23,0.1);">
        <div>
          <div class="text-xl tracking-tight select-none" style="color:#1f1b17; font-family:'IM Fell English',serif;">
            Sz<span style="color:#8b3a3a">ó</span>l
          </div>
          <div class="text-xs mt-0.5" style="color:rgba(31,27,23,0.4); font-style:italic; font-family:'EB Garamond',serif;">
            {{ t(lang, 'appTagline') }}
          </div>
        </div>
        <button @click="$emit('close')" class="text-xl leading-none transition-opacity hover:opacity-40" style="color:rgba(31,27,23,0.35);">✕</button>
      </div>

      <!-- Tab bar -->
      <div class="flex" style="border-bottom:1px solid rgba(31,27,23,0.1);">
        <button
          v-for="tab in ['Login', 'Register']"
          :key="tab"
          @click="switchTab(tab)"
          class="flex-1 py-3 text-sm transition-all"
          :style="activeTab === tab
            ? 'color:#1f1b17; border-bottom:2px solid #8b3a3a; margin-bottom:-1px; font-family:\'IM Fell English\',serif;'
            : 'color:rgba(31,27,23,0.38);'"
        >{{ tab === 'Login' ? t(lang, 'loginTab') : t(lang, 'registerTab') }}</button>
      </div>

      <div class="px-8 py-6">

        <!-- ── Login form ── -->
        <form v-if="activeTab === 'Login'" @submit.prevent="doLogin" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'emailLabel') }}</label>
            <input
              v-model="email" type="email" required autocomplete="email"
              placeholder="you@example.com"
              class="w-full px-3 py-2.5 text-sm outline-none transition-all"
              style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'passwordLabel') }}</label>
            <div class="relative">
              <input
                v-model="password" :type="showPassword ? 'text' : 'password'"
                required autocomplete="current-password" placeholder="••••••••"
                class="w-full px-3 py-2.5 pr-16 text-sm outline-none transition-all"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
              />
              <button type="button" @click="showPassword = !showPassword" tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-opacity hover:opacity-60"
                style="color:rgba(31,27,23,0.4);"
              >{{ showPassword ? t(lang, 'hidePassword') : t(lang, 'show') }}</button>
            </div>
          </div>

          <div v-if="error" class="text-xs leading-snug px-3 py-2"
            style="color:#8b3a3a; background:rgba(139,58,58,0.07); border:1px solid rgba(139,58,58,0.2); border-radius:2px;">
            {{ error }}
          </div>
          <button v-if="showResend" type="button" :disabled="resending" @click="doResend"
            class="text-xs underline text-left disabled:opacity-40 transition-all"
            style="color:#8b3a3a;"
          >{{ resending ? t(lang, 'sendingEmail') : t(lang, 'resendVerification') }}</button>
          <div v-if="resendSuccess" class="text-xs" style="color:#3a7a3a;">{{ t(lang, 'verificationSent') }}</div>

          <button type="submit" :disabled="loading"
            class="w-full py-2.5 text-sm transition-all disabled:opacity-40"
            style="background:#2a2018; color:#e8dcc4; border-radius:2px; font-family:'IM Fell English',serif; letter-spacing:0.03em;"
          >{{ loading ? t(lang, 'loggingIn') : t(lang, 'logIn') }}</button>

          <div class="text-center text-xs" style="color:rgba(31,27,23,0.4);">
            {{ t(lang, 'noAccount') }}
            <button type="button" @click="switchTab('Register')" class="underline transition-all" style="color:#8b3a3a;">{{ t(lang, 'createOne') }}</button>
          </div>
        </form>

        <!-- ── Register form ── -->
        <form v-else @submit.prevent="handleRegisterStep" class="flex flex-col gap-4">

          <!-- Step indicator -->
          <div class="flex items-center gap-2 mb-1">
            <div v-for="s in 2" :key="s"
              class="h-0.5 flex-1 rounded-full transition-all"
              :style="s <= registerStep ? 'background:#8b3a3a;' : 'background:rgba(31,27,23,0.12);'"
            />
            <span class="text-xs ml-1" style="color:rgba(31,27,23,0.35);">{{ registerStep }}/2</span>
          </div>

          <!-- Step 1: Credentials -->
          <template v-if="registerStep === 1">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'usernameLabel') }}</label>
              <div class="relative">
                <input v-model="username" type="text" required minlength="2" maxlength="40" autocomplete="username"
                  placeholder="your_username"
                  class="w-full px-3 py-2.5 pr-8 text-sm outline-none transition-all"
                  :style="[
                    'background:rgba(31,27,23,0.04); border-radius:2px; color:#1f1b17; font-family:\'EB Garamond\',serif;',
                    usernameAvailable === false ? 'border:1px solid #8b3a3a;'
                    : usernameAvailable === true  ? 'border:1px solid #3a7a3a;'
                    : 'border:1px solid rgba(31,27,23,0.15);'
                  ].join('')"
                />
                <span v-if="checkingUsername"          class="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style="color:rgba(31,27,23,0.35);">…</span>
                <span v-else-if="usernameAvailable === true"  class="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style="color:#3a7a3a;">✓</span>
                <span v-else-if="usernameAvailable === false" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style="color:#8b3a3a;">✗</span>
              </div>
              <p v-if="usernameAvailable === false" class="text-xs" style="color:#8b3a3a;">{{ t(lang, 'usernameTaken') }}</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'emailLabel') }}</label>
              <input v-model="email" type="email" required autocomplete="email"
                placeholder="you@example.com"
                class="w-full px-3 py-2.5 text-sm outline-none transition-all"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'passwordLabel') }}</label>
              <div class="relative">
                <input v-model="password" :type="showPassword ? 'text' : 'password'"
                  required autocomplete="new-password" placeholder="••••••••"
                  class="w-full px-3 py-2.5 pr-16 text-sm outline-none transition-all"
                  style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
                />
                <button type="button" @click="showPassword = !showPassword" tabindex="-1"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-opacity hover:opacity-60"
                  style="color:rgba(31,27,23,0.4);"
                >{{ showPassword ? t(lang, 'hidePassword') : t(lang, 'show') }}</button>
              </div>
              <!-- Strength bar -->
              <div v-if="password" class="flex gap-1 h-0.5 mt-0.5">
                <div v-for="i in 4" :key="i" class="flex-1 rounded-full transition-all"
                  :style="i <= passwordStrength ? strengthColor : 'background:rgba(31,27,23,0.1);'"
                />
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'confirmPassword') }}</label>
              <div class="relative">
                <input v-model="confirmPassword" :type="showPassword ? 'text' : 'password'"
                  required autocomplete="new-password" placeholder="••••••••"
                  class="w-full px-3 py-2.5 pr-8 text-sm outline-none transition-all"
                  :style="confirmPassword && confirmPassword !== password
                    ? 'background:rgba(31,27,23,0.04); border:1px solid #8b3a3a; border-radius:2px; color:#1f1b17; font-family:\'EB Garamond\',serif;'
                    : 'background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:\'EB Garamond\',serif;'"
                />
                <span v-if="confirmPassword" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  :style="confirmPassword === password ? 'color:#3a7a3a;' : 'color:#8b3a3a;'"
                >{{ confirmPassword === password ? '✓' : '✗' }}</span>
              </div>
            </div>
          </template>

          <!-- Step 2: Languages -->
          <template v-else>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'nativeLangLabel') }}</label>
              <select v-model="nativeLang" required
                class="w-full px-3 py-2.5 text-sm outline-none transition-all"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
              >
                <option value="" style="background:#ece4ca; color:#1f1b17;">{{ t(lang, 'selectLang') }}</option>
                <option v-for="(l, code) in LANGS" :key="code" :value="code" style="background:#ece4ca; color:#1f1b17;">{{ l.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'targetLangLabel') }}</label>
              <select v-model="targetLang" required
                class="w-full px-3 py-2.5 text-sm outline-none transition-all"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
              >
                <option value="" style="background:#ece4ca; color:#1f1b17;">{{ t(lang, 'selectLang') }}</option>
                <option v-for="(l, code) in LANGS" :key="code" :value="code" style="background:#ece4ca; color:#1f1b17;">{{ l.name }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs tracking-wide uppercase" style="color:rgba(31,27,23,0.45);">{{ proficiencyPrompt }}</label>
              <select v-model="proficiency"
                class="w-full px-3 py-2.5 text-sm outline-none transition-all"
                style="background:rgba(31,27,23,0.04); border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:#1f1b17; font-family:'EB Garamond',serif;"
              >
                <option value="" style="background:#ece4ca; color:#1f1b17;">{{ t(lang, 'skipForNow') }}</option>
                <option v-for="lvl in proficiencyOptions" :key="lvl.value" :value="lvl.value" style="background:#ece4ca; color:#1f1b17;">{{ lvl.label }}</option>
              </select>
            </div>

            <!-- Turnstile -->
            <div v-if="turnstileSiteKey" ref="turnstileEl" class="flex justify-center" />
          </template>

          <div v-if="error" class="text-xs leading-snug px-3 py-2"
            style="color:#8b3a3a; background:rgba(139,58,58,0.07); border:1px solid rgba(139,58,58,0.2); border-radius:2px;">
            {{ error }}
          </div>

          <div class="flex gap-2">
            <button v-if="registerStep === 2" type="button" @click="registerStep = 1"
              class="px-4 py-2.5 text-sm transition-all"
              style="border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:rgba(31,27,23,0.5); font-family:'EB Garamond',serif;"
            >{{ t(lang, 'back') }}</button>
            <button type="submit" :disabled="loading || !canSubmitStep"
              class="flex-1 py-2.5 text-sm transition-all disabled:opacity-40"
              style="background:#2a2018; color:#e8dcc4; border-radius:2px; font-family:'IM Fell English',serif; letter-spacing:0.03em;"
            >{{ loading ? '…' : registerStep === 1 ? t(lang, 'continueBtn') : t(lang, 'createAccount') }}</button>
          </div>

          <div class="text-center text-xs" style="color:rgba(31,27,23,0.4);">
            {{ t(lang, 'alreadyAccount') }}
            <button type="button" @click="switchTab('Login')" class="underline transition-all" style="color:#8b3a3a;">{{ t(lang, 'logIn') }}</button>
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
import { t } from '../utils/i18n.js'

const API_URL          = import.meta.env.VITE_API_URL              ?? 'https://szol.onrender.com'
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY   ?? ''
const authToken        = () => localStorage.getItem('szol_token')

const props = defineProps({ lang: { type: String, default: 'en' } })
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
const showResend        = ref(false)
const resending         = ref(false)
const resendSuccess     = ref(false)
const turnstileToken    = ref('')
const turnstileEl       = ref(null)
let   turnstileWidgetId = null

const usernameAvailable  = ref(null)   // null=unchecked, true=free, false=taken
const checkingUsername   = ref(false)
let   usernameDebounce   = null

watch(targetLang, () => { proficiency.value = '' })

watch(username, (val) => {
  usernameAvailable.value = null
  clearTimeout(usernameDebounce)
  if (val.length < 2) return
  checkingUsername.value = true
  usernameDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API_URL}/users/check-username?username=${encodeURIComponent(val)}`)
      const data = await res.json()
      usernameAvailable.value = data.available
    } finally {
      checkingUsername.value = false
    }
  }, 500)
})

// ── Turnstile explicit render ─────────────────────────────────────────────────
async function mountTurnstile() {
  if (!turnstileSiteKey) return
  await nextTick()
  if (!turnstileEl.value) return

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
    theme:             'light',
  })
}

watch([activeTab, registerStep], ([tab, step]) => {
  if (tab === 'Register' && step === 2) mountTurnstile()
})

// ── Language / proficiency options ────────────────────────────────────────────
const proficiencyOptions = computed(() => {
  const lang = props.lang
  const CEFR = [
    { value: 'A1', label: `A1 — ${t(lang, 'beginner')}` }, { value: 'A2', label: `A2 — ${t(lang, 'elementary')}` },
    { value: 'B1', label: `B1 — ${t(lang, 'intermediate')}` }, { value: 'B2', label: `B2 — ${t(lang, 'upperIntermediate')}` },
    { value: 'C1', label: `C1 — ${t(lang, 'advanced')}` }, { value: 'C2', label: `C2 — ${t(lang, 'mastery')}` },
  ]
  const JLPT = [
    { value: 'N5', label: `N5 — ${t(lang, 'beginner')}` }, { value: 'N4', label: `N4 — ${t(lang, 'elementary')}` },
    { value: 'N3', label: `N3 — ${t(lang, 'intermediate')}` }, { value: 'N2', label: `N2 — ${t(lang, 'upperIntermediate')}` },
    { value: 'N1', label: `N1 — ${t(lang, 'advanced')}` },
  ]
  const HSK = [
    { value: 'HSK1', label: `HSK 1 — ${t(lang, 'beginner')}` }, { value: 'HSK2', label: `HSK 2 — ${t(lang, 'elementary')}` },
    { value: 'HSK3', label: `HSK 3 — ${t(lang, 'intermediate')}` }, { value: 'HSK4', label: `HSK 4 — ${t(lang, 'upperIntermediate')}` },
    { value: 'HSK5', label: `HSK 5 — ${t(lang, 'advanced')}` }, { value: 'HSK6', label: `HSK 6 — ${t(lang, 'mastery')}` },
  ]
  if (targetLang.value === 'ja') return JLPT
  if (targetLang.value === 'zh') return HSK
  return CEFR
})

const proficiencyPrompt = computed(() => {
  const lang = props.lang
  if (!targetLang.value) return t(lang, 'levelOptional')
  if (targetLang.value === 'ja') return t(lang, 'jlptLevel')
  if (targetLang.value === 'zh') return t(lang, 'hskLevel')
  return `${t(lang, 'cefrLevel')} ${LANGS[targetLang.value]?.name ?? ''} ${t(lang, 'optional')}`
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
  if (passwordStrength.value <= 1) return 'background:#8b3a3a;'
  if (passwordStrength.value === 2) return 'background:#a86a2a;'
  if (passwordStrength.value === 3) return 'background:#a88a4a;'
  return 'background:#3a7a3a;'
})

const canSubmitStep = computed(() => {
  if (registerStep.value === 1)
    return username.value.length >= 2 &&
           usernameAvailable.value !== false &&
           email.value &&
           password.value.length >= 8 &&
           password.value === confirmPassword.value
  return !!nativeLang.value && !!targetLang.value
})

function switchTab(tab) {
  activeTab.value       = tab
  registerStep.value    = 1
  error.value           = ''
  password.value        = ''
  confirmPassword.value = ''
  showPassword.value    = false
  showResend.value      = false
  resendSuccess.value   = false
  usernameAvailable.value = null
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
    if (password.value.length < 8)                    { error.value = t(props.lang, 'passwordTooShort'); return }
    if (password.value !== confirmPassword.value)      { error.value = t(props.lang, 'passwordMismatch'); return }
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
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
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
