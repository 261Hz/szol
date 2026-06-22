<template>
  <div class="flex flex-col gap-10 pb-16">

    <!-- Current page -->
    <div class="journal-page">
      <textarea
        v-model="todayText"
        @blur="save"
        class="journal-textarea w-full"
        :placeholder="placeholder"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        rows="10"
      />
      <div class="journal-dates">
        <span class="date-today">{{ formatDate(today) }}</span>
        <span class="date-next">{{ formatDate(tomorrow) }}</span>
      </div>
    </div>

    <!-- Past entries -->
    <div v-if="pastEntries.length" class="flex flex-col gap-8">
      <div class="text-xs text-gray-300 uppercase tracking-widest text-center select-none">Earlier</div>
      <div
        v-for="entry in pastEntries"
        :key="entry.id"
        class="journal-page journal-page--past"
      >
        <div
          class="journal-body"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          :class="isRTL(lang) ? 'text-right' : ''"
        >{{ entry.text }}</div>
        <div class="journal-dates">
          <span class="date-today">{{ formatDate(entry.date) }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { isRTL } from '../utils/rtl.js'

const props = defineProps({ lang: String })

const STORAGE_KEY = 'szol_journal'
const today    = new Date().toISOString().split('T')[0]
const tomorrowDate = new Date()
tomorrowDate.setDate(tomorrowDate.getDate() + 1)
const tomorrow = tomorrowDate.toISOString().split('T')[0]

const allEntries = ref([])
const todayText  = ref('')

const PLACEHOLDERS = [
  'What did you notice today?',
  'A word that stayed with you.',
  'Something that surprised you in the language.',
  'Write freely.',
  'What did you read?',
]
const placeholder = PLACEHOLDERS[new Date().getDay() % PLACEHOLDERS.length]

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const pastEntries = computed(() =>
  allEntries.value
    .filter(e => e.date !== today && e.lang === props.lang)
    .sort((a, b) => b.date.localeCompare(a.date))
)

function save() {
  if (!todayText.value.trim()) return
  const idx = allEntries.value.findIndex(e => e.date === today && e.lang === props.lang)
  if (idx >= 0) {
    allEntries.value[idx].text = todayText.value.trim()
  } else {
    allEntries.value.push({ id: Date.now(), date: today, lang: props.lang, text: todayText.value.trim() })
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allEntries.value))
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) allEntries.value = JSON.parse(saved)
  const todayEntry = allEntries.value.find(e => e.date === today && e.lang === props.lang)
  if (todayEntry) todayText.value = todayEntry.text
})

watch(() => props.lang, () => {
  const entry = allEntries.value.find(e => e.date === today && e.lang === props.lang)
  todayText.value = entry?.text ?? ''
})
</script>

<style scoped>
.journal-page {
  position: relative;
  background: #faf7f2;
  border-left: 3px solid #e0d8cc;
  border-radius: 0 2px 2px 0;
  padding: 2rem 2.5rem 4rem 2.5rem;
  min-height: 320px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.04);
}

.journal-page--past {
  opacity: 0.55;
}

.journal-textarea {
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
  line-height: 1.8;
  color: #2a2118;
}

.journal-body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1rem;
  line-height: 1.8;
  color: #2a2118;
  white-space: pre-wrap;
}

.journal-dates {
  position: absolute;
  bottom: 1.25rem;
  right: 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
}

.date-today {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.75rem;
  font-style: italic;
  color: #a09070;
  letter-spacing: 0.02em;
}

.date-next {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.65rem;
  font-style: italic;
  color: #d4cfc8;
  letter-spacing: 0.02em;
}
</style>
