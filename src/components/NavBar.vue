<template>
  <nav class="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white">

    <!-- Brand -->
    <div class="text-xl font-semibold tracking-tight shrink-0">
      Sz<span class="text-emerald-500">ó</span>l
    </div>

    <!-- Icon tabs -->
    <div class="flex items-center gap-0.5">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        :title="tab.label"
        class="relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors"
        :class="active === tab.key ? 'text-gray-900' : 'text-gray-300 hover:text-gray-600'"
      >
        <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path :d="ICONS[tab.key]" />
        </svg>
        <span
          class="text-[9px] leading-none tracking-wide transition-opacity duration-150"
          :class="active === tab.key ? 'opacity-60' : 'opacity-0'"
          style="min-width: 30px; text-align: center;"
        >{{ tab.label }}</span>
        <span
          v-if="tab.key === 'messages' && unreadMessages > 0"
          class="absolute top-0.5 right-0 bg-blue-500 text-white text-[7px] leading-none rounded-full w-3 h-3 flex items-center justify-center"
        >{{ unreadMessages > 9 ? '9' : unreadMessages }}</span>
      </button>
    </div>

    <!-- Right controls -->
    <div class="flex items-center gap-2 shrink-0">
      <select
        :value="lang"
        @change="$emit('lang', $event.target.value)"
        class="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700"
      >
        <option v-for="(l, code) in LANGS" :key="code" :value="code">
          {{ l.name }}
        </option>
      </select>

      <button
        v-if="!currentUser"
        @click="$emit('auth')"
        class="text-gray-400 hover:text-gray-700 transition-colors"
        title="Sign in"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>

      <div v-else class="flex items-center gap-1.5">
        <span class="text-xs text-gray-600 max-w-20 truncate">{{ currentUser.username }}</span>
        <button @click="$emit('logout')" class="text-gray-300 hover:text-red-400 transition-colors" title="Sign out">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { t } from '../utils/i18n.js'

const ICONS = {
  read:     'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  retype:   'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  speak:    'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  vocab:    'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
  library:  'M8 14v3m4-8v8m4-5v5M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  journal:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  messages: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
}

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
  { key: 'journal',  label: 'Journal' },
  { key: 'messages', label: 'Voice' },
])
</script>
