<!-- App.vue is the root component -- the outermost shell that holds everything else. -->
<template>
  <div class="min-h-screen bg-white text-gray-900">

    <NavBar
      :active="activeTab"
      :lang="activeLang"
      :currentUser="currentUser"
      @tab="activeTab = $event"
      @lang="activeLang = $event"
      @auth="showAuth = true"
      @logout="handleLogout"
    />

    <main class="max-w-3xl mx-auto px-4 py-6">

      <RetypeView
        v-if="activeTab === 'retype'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordsForLang"
        :current-user="currentUser"
        @save-word="addToVocab"
      />

      <SpeakView
        v-if="activeTab === 'speak'"
        :story="currentStory"
        :lang="activeLang"
        :current-user="currentUser"
      />

      <WriteView
        v-if="activeTab === 'write'"
        :story="currentStory"
        :lang="activeLang"
      />

      <LibraryView
        v-if="activeTab === 'library'"
        :lang="activeLang"
        :current="currentStory"
        :words="vocabBank"
        :current-user="currentUser"
        @load="loadStory"
        @save-word="addToVocab"
        @open-auth="showAuth = true"
      />

      <VocabView
        v-if="activeTab === 'vocab'"
        :words="vocabBank"
        :lang="activeLang"
        :current-user="currentUser"
        @remove="removeFromVocab"
        @save-word="addToVocab"
        @open-auth="showAuth = true"
      />

      <SettingsView v-if="activeTab === 'settings'" />

    </main>

    <AuthModal
      v-if="showAuth"
      @close="showAuth = false"
      @logged-in="handleLogin"
    />

  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'

import NavBar      from './components/NavBar.vue'
import AuthModal   from './components/AuthModal.vue'
import RetypeView  from './views/RetypeView.vue'
import LibraryView from './views/LibraryView.vue'
import VocabView   from './views/VocabView.vue'
import SpeakView   from './views/SpeakView.vue'
import WriteView   from './views/WriteView.vue'
import SettingsView from './views/SettingsView.vue'

import { LANGS } from './data/stories.js'
import { getMe, logout, onUnauthorized, getAccountVocab, saveVocabWord, removeVocabWord } from './utils/api.js'

const activeTab    = ref('library')
const activeLang   = ref('es')
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)

const vocabBank = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))
watch(vocabBank, val => localStorage.setItem('szol_vocab', JSON.stringify(val)), { deep: true })

onUnauthorized(() => {
  currentUser.value = null
  showAuth.value    = true
})

onMounted(async () => {
  const user = await getMe()
  if (user) {
    currentUser.value = user
    await syncVocabOnLogin()
  } else {
    localStorage.removeItem('szol_token')
  }
})

// Convert a server UserVocabResponse → local vocabBank entry format
function serverEntryToLocal(v) {
  const lang = LANGS[v.lang]
  return {
    word:     v.word,
    lang:     v.lang,
    langName: lang?.name ?? v.lang,
    rtl:      lang?.rtl  ?? false,
    pos:      v.pos        || '',
    def:      v.definition || '',
    ex:       v.example    || '',
  }
}

// On login: fetch server vocab, push up any local-only entries, then use server as source of truth
async function syncVocabOnLogin() {
  const serverEntries = await getAccountVocab()
  const serverKeys    = new Set(serverEntries.map(v => `${v.word.toLowerCase()}::${v.lang}`))

  // Push local words that aren't on the server yet (first-time login with existing local vocab)
  for (const local of vocabBank.value) {
    const key = `${local.word.toLowerCase()}::${local.lang}`
    if (!serverKeys.has(key)) saveVocabWord(local)
  }

  // Merge: server entries first, then any local entries the server doesn't have yet
  const localOnly = vocabBank.value.filter(
    v => !serverKeys.has(`${v.word.toLowerCase()}::${v.lang}`)
  )
  vocabBank.value = [...serverEntries.map(serverEntryToLocal), ...localOnly]
}

const savedWordsForLang = computed(() =>
  new Set(
    vocabBank.value
      .filter(w => w.lang === activeLang.value)
      .map(w => w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, ''))
  )
)

function loadStory(story) {
  currentStory.value = story
  activeLang.value   = story.lang
  activeTab.value    = 'retype'
}

function addToVocab(entry) {
  const key = entry.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  if (vocabBank.value.some(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key)) return
  vocabBank.value.push(entry)
  if (currentUser.value) saveVocabWord(entry)
}

function removeFromVocab(index) {
  const entry = vocabBank.value[index]
  vocabBank.value.splice(index, 1)
  if (currentUser.value && entry) removeVocabWord(entry.word, entry.lang)
}

async function handleLogin(user) {
  currentUser.value = user
  showAuth.value    = false
  await syncVocabOnLogin()
}

function handleLogout() {
  logout()
  currentUser.value = null
  // Keep local vocab in localStorage; server copy is preserved for next login
}
</script>
