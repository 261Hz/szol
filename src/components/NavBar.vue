<template>
  <nav class="flex items-center justify-between px-6 py-3 border-b border-gray-200">
    
    <!-- Brand -->
    <div class="text-xl font-semibold tracking-tight">
      Sz<span class="text-emerald-500">ó</span>l
    </div>

    <!-- Tabs -->
    <div class="flex gap-1">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        :class="[
          'px-4 py-1.5 rounded-md text-sm transition-all relative',
          active === tab.key
            ? 'bg-gray-100 text-gray-900 font-medium'
            : 'text-gray-500 hover:text-gray-900'
        ]"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'messages' && unreadMessages > 0"
          class="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] leading-none rounded-full w-3.5 h-3.5 flex items-center justify-center">
          {{ unreadMessages > 9 ? '9+' : unreadMessages }}
        </span>
      </button>
    </div>

    <!-- Language selector + user icon -->
    <div class="flex items-center gap-2">
      <select
        :value="lang"
        @change="$emit('lang', $event.target.value)"
        class="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
      >
        <option v-for="(l, code) in LANGS" :key="code" :value="code">
          {{ l.name }}
        </option>
      </select>

      <!-- Logged out: person icon opens auth modal -->
      <button v-if="!currentUser" @click="$emit('auth')"
        class="text-lg px-1.5 py-0.5 rounded-md text-gray-400 hover:text-gray-700 transition-all"
        title="Login / Register">👤</button>

      <!-- Logged in: username + logout -->
      <div v-else class="flex items-center gap-1.5">
        <span class="text-xs text-gray-600 max-w-24 truncate">{{ currentUser.username }}</span>
        <button @click="$emit('logout')"
          class="text-xs text-gray-300 hover:text-red-400 transition-all" title="Logout">✕</button>
      </div>
    </div>

  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  active:         String,
  lang:           String,
  currentUser:    Object,
  unreadMessages: { type: Number, default: 0 },
})

defineEmits(['tab', 'lang', 'auth', 'logout'])

const tabs = computed(() => [
  { key: 'read',     label: t(props.lang, 'read') },
  { key: 'retype',   label: t(props.lang, 'retype') },
  { key: 'speak',    label: t(props.lang, 'speak') },
  { key: 'vocab',    label: t(props.lang, 'vocab') },
  { key: 'library',  label: t(props.lang, 'library') },
  { key: 'messages', label: 'Voice' },
])
</script>