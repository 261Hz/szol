<template>
  <div class="space-y-6">

    <!-- ── Today's entries banner ───────────────────────────────────────────── -->
    <section v-if="todayItems.length" class="space-y-3">
      <h2 class="text-xs font-semibold uppercase tracking-widest text-violet-400">
        {{ t(lang, 'todayEntries') }}
      </h2>
      <div
        v-for="item in todayItems"
        :key="`today-${item.document.id}`"
        class="rounded-xl border border-violet-700/60 bg-violet-950/30 p-4 cursor-pointer hover:bg-violet-950/50 transition-colors"
        @click="openChapter(item.document, { id: item.collection_id, title: item.collection_title, author: item.collection_author, adapter: item.adapter, adapter_config: item.adapter_config })"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="text-[10px] uppercase tracking-widest text-violet-400 font-semibold">
            {{ item.collection_title }}
          </span>
          <span
            v-if="item.document.document_type"
            class="text-[10px] px-1.5 py-0.5 rounded bg-violet-800/50 text-violet-300"
          >{{ item.document.document_type }}</span>
        </div>
        <p class="text-sm font-medium text-gray-100">{{ item.document.title ?? formatDate(item.document.calendar_month, item.document.calendar_day) }}</p>
        <p v-if="item.document.voice" class="text-xs text-gray-400 mt-0.5">— {{ item.document.voice }}</p>
      </div>
    </section>

    <!-- ── Loading state ────────────────────────────────────────────────────── -->
    <div v-if="loading" class="text-sm text-gray-400">{{ t(lang, 'loading') }}</div>

    <!-- ── Empty state ──────────────────────────────────────────────────────── -->
    <div v-else-if="!collections.length" class="text-sm text-gray-400">
      {{ t(lang, 'noJournals') }}
    </div>

    <!-- ── Collection list ──────────────────────────────────────────────────── -->
    <div v-else class="space-y-3">
      <div
        v-for="col in collections"
        :key="col.id"
        class="rounded-xl border border-gray-800 bg-gray-900"
      >
        <!-- Collection header -->
        <button
          class="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-800/50 transition-colors rounded-xl"
          @click="toggleCollection(col.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-gray-100">{{ col.title }}</span>
              <span v-if="col.today_count > 0"
                class="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-600 text-white font-semibold">
                {{ t(lang, 'todayEntries') }}
              </span>
            </div>
            <p v-if="col.author" class="text-xs text-gray-400 mt-0.5">{{ col.author }}</p>
            <p v-if="col.description" class="text-xs text-gray-500 mt-1 line-clamp-2">{{ col.description }}</p>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0 text-right">
            <span class="text-xs text-gray-400">
              {{ col.available_documents }}/{{ col.total_documents }} {{ t(lang, 'chapters') }}
            </span>
            <span class="text-gray-500 text-sm">{{ expandedId === col.id ? '▲' : '▼' }}</span>
          </div>
        </button>

        <!-- Expanded: document list -->
        <div v-if="expandedId === col.id" class="border-t border-gray-800">
          <div v-if="loadingDetail" class="p-4 text-sm text-gray-400">{{ t(lang, 'loading') }}</div>
          <div v-else-if="activeCollection">
            <button
              v-for="ch in activeCollection.documents"
              :key="ch.id"
              class="w-full text-left px-4 py-3 border-b border-gray-800 last:border-0 flex items-center gap-3 transition-colors"
              :class="ch.available
                ? 'hover:bg-gray-800/50 cursor-pointer'
                : 'opacity-40 cursor-default'"
              :disabled="!ch.available"
              @click="ch.available && openChapter(ch, activeCollection)"
            >
              <!-- Date or chapter number pill -->
              <div class="flex-shrink-0 w-12 text-center">
                <template v-if="ch.calendar_month">
                  <span class="block text-[10px] font-semibold text-gray-400 uppercase">
                    {{ MONTH_ABBR[ch.calendar_month - 1] }}
                  </span>
                  <span class="block text-lg font-bold leading-none" :class="ch.available ? 'text-gray-100' : 'text-gray-600'">
                    {{ ch.calendar_day }}
                  </span>
                </template>
                <span v-else class="text-xs text-gray-500">#{{ ch.doc_number }}</span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-sm font-medium" :class="ch.available ? 'text-gray-100' : 'text-gray-500'">
                    {{ ch.title ?? (ch.voice ? `${ch.voice}` : `Entry ${ch.doc_number}`) }}
                  </span>
                  <span
                    v-if="ch.document_type && ch.document_type !== 'journal'"
                    class="text-[10px] px-1 py-0.5 rounded bg-gray-800 text-gray-400"
                  >{{ ch.document_type }}</span>
                </div>
                <p v-if="ch.voice && ch.title" class="text-xs text-gray-500 mt-0.5">{{ ch.voice }}</p>
              </div>

              <!-- Lock icon for future entries -->
              <span v-if="!ch.available" class="text-gray-600 text-sm">🔒</span>
              <span v-else class="text-gray-600 text-xs">›</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Chapter reader overlay ────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div
        v-if="activeChapter"
        class="fixed inset-0 z-50 flex flex-col bg-gray-950 overflow-y-auto"
      >
        <!-- Reader top bar -->
        <div class="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 flex items-center gap-3 px-4 py-3">
          <button
            @click="activeChapter = null"
            class="text-gray-400 hover:text-white transition-colors text-sm"
          >← {{ t(lang, 'cancel') }}</button>
          <div class="flex-1 min-w-0">
            <p class="text-xs text-gray-500 truncate">{{ activeSeries?.title }}</p>
          </div>
          <button
            @click="practiceChapter"
            class="text-xs px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white font-medium transition-colors"
          >{{ t(lang, 'practiceTyping') }}</button>
        </div>

        <!-- Reader content -->
        <div class="max-w-2xl mx-auto w-full px-5 py-8 space-y-4">
          <!-- Metadata -->
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span
                v-if="activeChapter.document_type"
                class="text-[10px] uppercase tracking-widest text-violet-400 font-semibold"
              >{{ activeChapter.document_type }}</span>
              <span v-if="activeChapter.calendar_month" class="text-[10px] text-gray-500">
                {{ formatDate(activeChapter.calendar_month, activeChapter.calendar_day) }}
              </span>
            </div>
            <h1 v-if="activeChapter.title" class="text-xl font-bold text-gray-100 leading-snug">
              {{ activeChapter.title }}
            </h1>
            <p v-if="activeChapter.voice" class="text-sm text-gray-400 italic">
              — {{ activeChapter.voice }}
            </p>
          </div>

          <!-- Body text -->
          <div v-if="loadingContent" class="text-sm text-gray-400">{{ t(lang, 'loading') }}</div>
          <div v-else class="prose-journal">
            <p
              v-for="(para, i) in paragraphs"
              :key="i"
              class="text-gray-200 leading-relaxed text-base"
              :class="i > 0 ? 'mt-4' : ''"
            >{{ para }}</p>
          </div>

          <!-- Bottom CTA -->
          <div class="pt-6 border-t border-gray-800 flex gap-3">
            <button
              @click="practiceChapter"
              class="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm font-medium transition-colors"
            >{{ t(lang, 'practiceTyping') }}</button>
            <button
              @click="activeChapter = null"
              class="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 text-sm transition-colors"
            >{{ t(lang, 'cancel') }}</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { t } from '../utils/i18n.js'
import { fetchCollections, fetchCollection, fetchTodayDocuments } from '../utils/api.js'
import { fetchDocumentContent } from '../utils/series/index.js'

const props = defineProps({
  lang:        { type: String, required: true },
  currentUser: { type: Object, default: null },
})

const emit = defineEmits(['load'])

// ── Data ──────────────────────────────────────────────────────────────────────

const collections      = ref([])
const todayItems       = ref([])
const loading          = ref(true)
const expandedId       = ref(null)
const activeCollection = ref(null)
const loadingDetail    = ref(false)

const activeChapter        = ref(null)
const activeSeries         = ref(null)
const activeChapterContent = ref('')
const loadingContent       = ref(false)

// ── Month abbrev (indices 0–11) ───────────────────────────────────────────────

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Computed ──────────────────────────────────────────────────────────────────

const paragraphs = computed(() =>
  activeChapterContent.value.split(/\n+/).map(p => p.trim()).filter(Boolean)
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(month, day) {
  if (!month) return ''
  const d = new Date(2000, month - 1, day)
  return d.toLocaleDateString('en', { month: 'long', day: 'numeric' })
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function load(lang) {
  loading.value          = true
  expandedId.value       = null
  activeCollection.value = null
  try {
    const [list, today] = await Promise.all([
      fetchCollections(lang),
      fetchTodayDocuments(lang),
    ])
    collections.value = list
    todayItems.value  = today
  } catch {
    collections.value = []
    todayItems.value  = []
  } finally {
    loading.value = false
  }
}

onMounted(() => load(props.lang))
watch(() => props.lang, lang => load(lang))

// ── Series expand ─────────────────────────────────────────────────────────────

async function toggleCollection(id) {
  if (expandedId.value === id) {
    expandedId.value       = null
    activeCollection.value = null
    return
  }
  expandedId.value       = id
  activeCollection.value = null
  loadingDetail.value    = true
  activeCollection.value = await fetchCollection(id)
  loadingDetail.value    = false
}

// ── Chapter reader ─────────────────────────────────────────────────────────────

async function openChapter(document, collection) {
  activeChapter.value        = document
  activeSeries.value         = collection
  activeChapterContent.value = ''
  loadingContent.value       = true

  try {
    const text = await fetchDocumentContent(collection, document)
    activeChapterContent.value = text ?? '(Content unavailable)'
  } catch {
    activeChapterContent.value = '(Content unavailable)'
  } finally {
    loadingContent.value = false
  }
}

function practiceChapter() {
  if (!activeChapter.value || !activeChapterContent.value) return
  const doc = activeChapter.value
  const col = activeSeries.value
  emit('load', {
    id:      `journal-${doc.id}`,
    title:   doc.title ?? `${col?.title} — Document ${doc.doc_number}`,
    content: activeChapterContent.value,
    lang:    props.lang,
    author:  doc.voice ?? col?.author ?? '',
    source:  col?.title ?? '',
  })
  activeChapter.value = null
}
</script>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
