<template>
  <!-- Backdrop: clicking outside the card closes the modal. -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    @click.self="$emit('close')"
  >
    <!-- Modal card -->
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
          @click="activeTab = tab; error = ''"
          :class="[
            'px-3 py-1 text-sm rounded-md transition-all',
            activeTab === tab
              ? 'bg-emerald-500 text-white'
              : 'text-gray-500 hover:text-gray-800'
          ]"
        >{{ tab }}</button>
      </div>

      <!-- ── Login form ── -->
      <form v-if="activeTab === 'Login'" @submit.prevent="doLogin" class="flex flex-col gap-3">
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          required
          autocomplete="email"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          required
          autocomplete="current-password"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <div v-if="error" class="text-xs text-red-500">{{ error }}</div>
        <button
          type="submit"
          :disabled="loading"
          class="px-4 py-2 rounded-md bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >{{ loading ? 'Logging in…' : 'Login' }}</button>
      </form>

      <!-- ── Register form ── -->
      <form v-else @submit.prevent="doRegister" class="flex flex-col gap-3">
        <input
          v-model="username"
          type="text"
          placeholder="Username"
          required
          autocomplete="username"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          required
          autocomplete="email"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          required
          autocomplete="new-password"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
        />
        <select
          v-model="proficiency"
          class="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 text-gray-500 transition-all"
        >
          <option value="">Proficiency level (optional)</option>
          <option v-for="lvl in ['A1','A2','B1','B2','C1','C2']" :key="lvl" :value="lvl">{{ lvl }}</option>
        </select>
        <div v-if="error" class="text-xs text-red-500">{{ error }}</div>
        <button
          type="submit"
          :disabled="loading"
          class="px-4 py-2 rounded-md bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >{{ loading ? 'Creating account…' : 'Create Account' }}</button>
      </form>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { login, register, getMe } from '../utils/api.js'

const emit = defineEmits(['close', 'logged-in'])

const activeTab  = ref('Login')
const email      = ref('')
const password   = ref('')
const username   = ref('')
const proficiency = ref('')
const error      = ref('')
const loading    = ref(false)

async function doLogin() {
  error.value   = ''
  loading.value = true
  try {
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function doRegister() {
  error.value   = ''
  loading.value = true
  try {
    await register(username.value, email.value, password.value, proficiency.value || null, null)
    // auto-login after registration
    await login(email.value, password.value)
    const user = await getMe()
    emit('logged-in', user)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>
