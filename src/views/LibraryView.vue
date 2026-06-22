<template>
  <div class="flex flex-col gap-6">

    <!-- Story list -->
    <div v-if="loading" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'loading') }}
    </div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="story in filtered"
        :key="story.id"
        @click="$emit('load', story)"
        :class="[
          'p-4 rounded-xl border-l-4 border border-gray-100 cursor-pointer transition-all shadow-sm hover:shadow-md',
          current?.id === story.id
            ? 'bg-emerald-50 border-emerald-100'
            : 'bg-white hover:border-gray-200'
        ]"
        :style="{ borderLeftColor: LANG_COLORS[story.lang] ?? '#10b981' }"
      >
        <div class="flex items-start justify-between gap-2">
          <div
            class="font-semibold text-sm text-gray-900 leading-snug"
            :class="{ 'text-right': isRTL(story.lang) }"
            :dir="isRTL(story.lang) ? 'rtl' : 'ltr'"
          >
            {{ story.title }}
          </div>
          <span class="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full whitespace-nowrap">
            {{ story.text.split(/\s+/).length }} {{ t(lang, 'words') }}
          </span>
        </div>
        <div class="flex gap-1.5 mt-2 flex-wrap items-center">
          <span v-if="story.author" class="text-xs text-gray-400">{{ story.author }}</span>
          <span v-if="story.sequence_order" class="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">{{ t(lang, 'curated') }}</span>
          <span v-if="story.community" class="text-xs bg-blue-100 text-blue-500 px-2 py-0.5 rounded-full">{{ t(lang, 'community') }}</span>
          <span v-if="story.local" class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{{ t(lang, 'local') }}</span>
          <span v-if="story.franco" class="text-xs bg-orange-100 text-orange-500 px-2 py-0.5 rounded-full">franco</span>
          <span v-if="story.feed" class="text-xs bg-violet-100 text-violet-500 px-2 py-0.5 rounded-full">{{ story.source_name }}</span>
          <a
            v-if="story.feed && story.source_url"
            :href="story.source_url"
            target="_blank"
            rel="noopener noreferrer"
            @click.stop
            class="text-xs text-gray-300 hover:text-gray-500 underline"
          >↗</a>
        </div>
      </div>
    </div>

    <!-- Add your own -->
    <div class="border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {{ t(lang, 'addStory') }}
      </div>
      <input
        v-model="customTitle"
        type="text"
        :placeholder="t(lang, 'titleHere')"
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />
      <textarea
        v-model="customText"
        rows="4"
        :placeholder="t(lang, 'pasteStory')"
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
      />
      <input
        v-if="lang === 'arz'"
        v-model="customFranco"
        type="text"
        placeholder="Franco transliteration (optional)..."
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />

      <!-- Share form -->
      <div v-if="showShareForm" class="flex flex-col gap-2 border-t border-gray-100 pt-3">
        <div class="text-xs text-gray-500">{{ t(lang, 'shareRequired') }}</div>
        <input
          v-model="customAuthor"
          type="text"
          :placeholder="t(lang, 'authorHere')"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        <input
          v-model="customSource"
          type="text"
          :placeholder="t(lang, 'sourceHere')"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          @click="addLocal"
          class="text-sm px-4 py-1.5 rounded-md border border-gray-200 hover:border-emerald-400 transition-all"
        >
          {{ t(lang, 'saveLocal') }}
        </button>
        <button
          @click="shareGlobal"
          :disabled="submitting"
          class="text-sm px-4 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >
          {{ submitting ? t(lang, 'sharing') : t(lang, 'shareGlobal') }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'

const LANG_COLORS = {
  en:  '#3b82f6',
  es:  '#ef4444',
  fr:  '#6366f1',
  de:  '#71717a',
  it:  '#22c55e',
  ru:  '#dc2626',
  he:  '#3b82f6',
  ar:  '#16a34a',
  arz: '#0d9488',
  ja:  '#ef4444',
  zh:  '#dc2626',
  hu:  '#f59e0b',
  el:  '#8b5cf6',
}
import { isRTL } from '../utils/rtl.js'
import { t } from '../utils/i18n.js'
import { fetchCommunityStories, submitStory, fetchCuratedStories } from '../utils/supabase.js'
import { fetchFeed } from '../utils/api.js'

const props = defineProps({
  lang: String,
  current: Object,
})

defineEmits(['load'])

const loading = ref(true)
const curatedStories = ref([])
const localStories = ref([])
const communityStories = ref([])
const feedStories = ref([])
const customTitle = ref('')
const customText = ref('')
const customFranco = ref('')
const customAuthor = ref('')
const customSource = ref('')
const showShareForm = ref(false)
const submitting = ref(false)

onMounted(async () => {
  const saved = localStorage.getItem('szol_local_stories')
  if (saved) localStories.value = JSON.parse(saved)
  const [curated, community, feed] = await Promise.all([
    fetchCuratedStories(),
    fetchCommunityStories(),
    fetchFeed(props.lang),
  ])
  curatedStories.value = curated
  communityStories.value = community
  feedStories.value = feed.map(s => ({ ...s, feed: true, source: s.source_name }))
  loading.value = false
})

const filtered = computed(() => {
  const all = [
    ...curatedStories.value,
    ...localStories.value,
    ...communityStories.value,
    ...feedStories.value,
  ]
  return all.filter(s => s.lang === props.lang)
})

function addLocal() {
  if (!customTitle.value.trim() || !customText.value.trim()) return
  const story = {
    id: 'l' + Date.now(),
    title: customTitle.value.trim(),
    text: customText.value.trim(),
    franco: customFranco.value.trim() || null,
    lang: props.lang,
    local: true,
  }
  localStories.value.push(story)
  localStorage.setItem('szol_local_stories', JSON.stringify(localStories.value))
  clearForm()
}

async function shareGlobal() {
  if (!customTitle.value.trim() || !customText.value.trim()) {
    alert('Please add a title and text first.')
    return
  }
  if (!customAuthor.value.trim()) {
    showShareForm.value = true
    return
  }
  submitting.value = true
  try {
    const story = await submitStory({
      title: customTitle.value.trim(),
      text: customText.value.trim(),
      franco: customFranco.value.trim() || null,
      lang: props.lang,
      author: customAuthor.value.trim() || 'Anonymous',
      source: customSource.value.trim() || 'Original',
      reviewed: false,
    })
    communityStories.value.unshift({ ...story, community: true })
    clearForm()
    showShareForm.value = false
    alert('Story shared with the community!')
  } catch (e) {
    alert('Error submitting story: ' + e.message)
  }
  submitting.value = false
}

function clearForm() {
  customTitle.value = ''
  customText.value = ''
  customFranco.value = ''
  customAuthor.value = ''
  customSource.value = ''
}
</script>