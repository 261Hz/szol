<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    @click.self="$emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="font-semibold text-gray-800">
          Sz<span class="text-emerald-500">ó</span>l account
        </div>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1">
        <button
          v-for="tab in ['Login', 'Register']"
          :key="tab"
          @click="switchTab(tab)"
          :class="[
            'px-3 py-1 text-sm rounded-md transition-all',
            activeTab === tab ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:text-gray-800'
          ]"
        >{{ tab }}</button>
      </div>

      <!-- ── Login ── -->
      <form v-if="activeTab === 'Login'" @submit.prevent="doLogin" class="flex flex-col gap-3">
        <input
          v-model="email" type="email" placeholder="Email"
          required autocomplete="email"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <div class="relative">
          <input
            v-model="password" :type="showPw ? 'text' : 'password'" placeholder="Password"
            required autocomplete="current-password"
            class="w-full border border-gray-200 rounded-md px-3 py-2 pr-14 text-sm outline-none focus:border-emerald-400 transition-all"
          />
          <button type="button" @click="showPw = !showPw" tabindex="-1"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
            {{ showPw ? 'Hide' : 'Show' }}
          </button>
        </div>
        <div v-if="error" class="text-xs leading-snug" :class="isNetwork ? 'text-amber-600' : 'text-red-500'">
          {{ error }}
          <button v-if="isNetwork" type="button" @click="doLogin" class="underline ml-1">Try again</button>
        </div>
        <button type="submit" :disabled="loading"
          class="py-2 rounded-md bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-40 transition-all">
          {{ loading ? 'Logging in…' : 'Login' }}
        </button>
      </form>

      <!-- ── Register ── -->
      <form v-else @submit.prevent="doRegister" class="flex flex-col gap-3">
        <input
          v-model="username" type="text" placeholder="Username"
          required minlength="2" maxlength="40" autocomplete="username"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <input
          v-model="email" type="email" placeholder="Email"
          required autocomplete="email"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />

        <!-- Password + show/hide -->
        <div class="relative">
          <input
            v-model="password" :type="showPw ? 'text' : 'password'"
            placeholder="Password (min 8 characters)"
            required autocomplete="new-password"
            class="w-full border border-gray-200 rounded-md px-3 py-2 pr-14 text-sm outline-none focus:border-emerald-400 transition-all"
          />
          <button type="button" @click="showPw = !showPw" tabindex="-1"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
            {{ showPw ? 'Hide' : 'Show' }}
          </button>
        </div>

        <!-- Strength bar -->
        <div v-if="password" class="flex gap-1 h-1">
          <div v-for="i in 4" :key="i" class="flex-1 rounded-full transition-all"
            :class="i <= strength ? strengthColor : 'bg-gray-100'" />
        </div>

        <!-- Confirm password -->
        <div class="relative">
          <input
            v-model="confirm" :type="showPw ? 'text' : 'password'"
            placeholder="Confirm password"
            required autocomplete="new-password"
            class="w-full border border-gray-200 rounded-md px-3 py-2 pr-8 text-sm outline-none transition-all"
            :class="confirm && confirm !== password ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400'"
          />
          <span v-if="confirm" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            :class="confirm === password ? 'text-emerald-500' : 'text-red-400'">
            {{ confirm === password ? '✓' : '✗' }}
          </span>
        </div>

        <select v-model="proficiency"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 text-gray-500 transition-all">
          <option value="">Proficiency level (optional)</option>
          <option v-for="lvl in ['A1','A2','B1','B2','C1','C2']" :key="lvl" :value="lvl">{{ lvl }}</option>
        </select>

        <div v-if="error" class="text-xs leading-snug" :class="isNetwork ? 'text-amber-600' : 'text-red-500'">
          {{ error }}
          <button v-if="isNetwork" type="button" @click="doRegister" class="underline ml-1">Try again</button>
        </div>
        <button type="submit" :disabled="loading || !canSubmit"
          class="py-2 rounded-md bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-40 transition-all">
          {{ loading ? 'Creating account…' : 'Create Account' }}
        </button>
      </form>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { login, register, getMe } from '../utils/api.js'

const emit = defineEmits(['close', 'logged-in'])

const activeTab   = ref('Login')
const email       = ref('')
const password    = ref('')
const confirm     = ref('')
const username    = ref('')
const proficiency = ref('')
const showPw      = ref(false)
const error       = ref('')
const isNetwork   = ref(false)
const loading     = ref(false)

function switchTab(tab) {
  activeTab.value = tab
  error.value = ''
  isNetwork.value = false
  password.value = ''
  confirm.value = ''
  showPw.value = false
}

// Password strength (1-4)
const strength = computed(() => {
  const p = password.value
  if (!p || p.length < 8) return p.length ? 1 : 0
  let s = 1
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) s++
  return s
})

const strengthColor = computed(() => {
  const c = ['', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400']
  return c[strength.value] || 'bg-red-400'
})

const canSubmit = computed(() =>
  password.value.length >= 8 && password.value === confirm.value
)

function formatErr(e) {
  isNetwork.value = !!e.network
  return e.message || 'Something went wrong.'
}

async function doLogin() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loading.value = false
  }
}

async function doRegister() {
  if (password.value.length < 8)          { error.value = 'Password must be at least 8 characters.'; return }
  if (password.value !== confirm.value)   { error.value = 'Passwords do not match.'; return }
  error.value = ''
  loading.value = true
  try {
    await register(username.value, email.value, password.value, proficiency.value || null)
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loading.value = false
  }
}
</script>
