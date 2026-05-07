<template>
  <div class="flex flex-col gap-6">

    <!-- Filters -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex gap-2">
        <button
          v-for="lvl in levels"
          :key="lvl"
          @click="activeLevel = lvl"
          :class="[
            'px-3 py-1 rounded-full text-xs border transition-all',
            activeLevel === lvl
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'border-gray-200 text-gray-500 hover:border-emerald-400'
          ]"
        >
          {{ lvl === 'all' ? t(lang, 'library') : lvl }}
        </button>
      </div>
      <div class="text-xs text-gray-400">{{ filtered.length }} {{ t(lang, 'library') }}</div>
    </div>

    <!-- Story list -->
    <div class="flex flex-col gap-2">
      <div
        v-for="story in filtered"
        :key="story.id"
        @click="$emit('load', story)"
        :class="[
          'p-3 rounded-lg border cursor-pointer transition-all',
          current?.id === story.id
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-gray-200 hover:border-emerald-300'
        ]"
      >
        <div
          class="font-medium text-sm"
          :class="{ 'text-right': isRTL(story.lang) }"
          :dir="isRTL(story.lang) ? 'rtl' : 'ltr'"
        >
          {{ story.title }}
        </div>
        <div class="flex gap-2 mt-1 flex-wrap">
          <span class="text-xs text-gray-400">{{ LANGS[story.lang]?.name }}</span>
          <span class="text-xs text-gray-400">·</span>
          <span class="text-xs text-gray-400">{{ story.level }}</span>
          <span class="text-xs text-gray-400">·</span>
          <span class="text-xs text-gray-400">{{ story.text.split(/\s+/).length }} words</span>
          <span v-if="story.curated" class="text-xs text-emerald-500">curated</span>
          <span v-if="story.community" class="text-xs text-blue-400">community</span>
          <span v-if="story.franco" class="text-xs text-orange-400">franco</span>
        </div>
      </div>
    </div>

    <!-- Add your own -->
    <div class="border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Add a story
      </div>
      <input
        v-model="customTitle"
        type="text"
        placeholder="Title..."
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />
      <textarea
        v-model="customText"
        rows="4"
        placeholder="Paste story text here..."
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
      />
      <input
        v-if="lang === 'arz'"
        v-model="customFranco"
        type="text"
        placeholder="Franco transliteration (optional)..."
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />
      <div class="flex items-center justify-between">
        <select
          v-model="customLevel"
          class="text-sm border border-gray-200 rounded-md px-2 py-1"
        >
          <option>A1</option>
          <option>A2</option>
          <option>B1</option>
          <option>B2</option>
        </select>
        <div class="flex gap-2">
          <button
            @click="addLocal"
            class="text-sm px-4 py-1.5 rounded-md border border-gray-200 hover:border-emerald-400 transition-all"
          >
            Save locally
          </button>
          <button
            @click="shareGlobal"
            class="text-sm px-4 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
          >
            Share with community
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { STORIES, LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'

const props = defineProps({
  lang: String,
  current: Object,
})

defineEmits(['load'])

const levels = ['all', 'A1', 'A2', 'B1', 'B2']
const activeLevel = ref('all')
const localStories = ref([])

const customTitle = ref('')
const customText = ref('')
const customFranco = ref('')
const customLevel = ref('B1')

const filtered = computed(() => {
  const all = [...STORIES, ...localStories.value]
  return all.filter(s =>
    s.lang === props.lang &&
    (activeLevel.value === 'all' || s.level === activeLevel.value)
  )
})

function addLocal() {
  if (!customTitle.value.trim() || !customText.value.trim()) return
  localStories.value.push({
    id: 'l' + Date.now(),
    title: customTitle.value.trim(),
    text: customText.value.trim(),
    franco: customFranco.value.trim() || null,
    level: customLevel.value,
    lang: props.lang,
    local: true,
  })
  customTitle.value = ''
  customText.value = ''
  customFranco.value = ''
}

function shareGlobal() {
  // Supabase integration coming next
  alert('Community sharing coming soon!')
}
</script>