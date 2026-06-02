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
          'px-4 py-1.5 rounded-md text-sm transition-all',
          active === tab.key
            ? 'bg-gray-100 text-gray-900 font-medium'
            : 'text-gray-500 hover:text-gray-900'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Language selector -->
    <select
      :value="lang"
      @change="$emit('lang', $event.target.value)"
      class="text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
    >
      <option v-for="(l, code) in LANGS" :key="code" :value="code">
        {{ l.name }}
      </option>
    </select>

  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  active: String,
  lang: String,
})

defineEmits(['tab', 'lang'])

const tabs = computed(() => [
  { key: 'read',     label: t(props.lang, 'read') },
  { key: 'retype',   label: t(props.lang, 'retype') },
  { key: 'vocab',    label: t(props.lang, 'vocab') },
  { key: 'library',  label: t(props.lang, 'library') },
  { key: 'settings', label: '⚙' },
])
</script>