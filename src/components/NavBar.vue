<template>
  <nav class="border-b border-gray-200 bg-white sticky top-0 z-40">

    <!-- Top row: brand + language selector + controls -->
    <div class="flex items-center justify-between px-4 py-2.5">

      <div class="text-xl font-semibold tracking-tight flex-shrink-0">
        Sz<span class="text-emerald-500">ó</span>l
      </div>

      <div class="flex items-center gap-2">
        <select
          :value="lang"
          @change="$emit('lang', $event.target.value)"
          class="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white max-w-28"
        >
          <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
        </select>

        <button
          @click="$emit('tab', 'settings')"
          :class="['text-lg px-1.5 py-0.5 rounded-md transition-all', active === 'settings' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700']"
          title="Settings"
        >⚙</button>

        <div v-if="!currentUser">
          <button @click="$emit('auth')"
            class="text-lg px-1.5 py-0.5 rounded-md text-gray-400 hover:text-gray-700 transition-all"
            title="Login / Register">👤</button>
        </div>
        <div v-else class="flex items-center gap-1.5">
          <span class="text-xs text-gray-600 max-w-20 truncate hidden sm:inline">{{ currentUser.username }}</span>
          <button @click="$emit('logout')"
            class="text-xs text-gray-300 hover:text-red-400 transition-all" title="Logout">✕</button>
        </div>
      </div>
    </div>

    <!-- Tab strip: scrolls horizontally on narrow screens -->
    <div class="flex overflow-x-auto px-3 pb-2 gap-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="$emit('tab', tab.key)"
        :class="[
          'flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-sm transition-all',
          active === tab.key
            ? 'bg-gray-100 text-gray-900 font-medium'
            : 'text-gray-500 hover:text-gray-900'
        ]"
      >{{ tab.label }}</button>
    </div>

  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { t }     from '../utils/i18n.js'

const props = defineProps({
  active:      String,
  lang:        String,
  currentUser: Object,
})

defineEmits(['tab', 'lang', 'auth', 'logout'])

const tabs = computed(() => [
  { key: 'retype',  label: t(props.lang, 'retype') },
  { key: 'speak',   label: t(props.lang, 'speak') },
  { key: 'write',   label: t(props.lang, 'write') },
  { key: 'chat',    label: '💬 Tutor' },
  { key: 'vocab',   label: t(props.lang, 'vocab') },
  { key: 'library', label: t(props.lang, 'library') },
])
</script>
