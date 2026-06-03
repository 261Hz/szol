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
        @load="loadStory"
        @save-word="addToVocab"
      />

      <VocabView
        v-if="activeTab === 'vocab'"
        :words="vocabBank"
        :lang="activeLang"
        :current-user="currentUser"
        @remove="vocabBank.splice($event, 1)"
        @save-word="addToVocab"
        @open-auth="showAuth = true"
      />

      <SettingsView v-if="activeTab === 'settings'" />

    </main>

    <!-- Auth modal: shown when showAuth is true -->
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

import { getMe, logout } from './utils/api.js'

const activeTab    = ref('library')
const activeLang   = ref('es')
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)

const vocabBank = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))

watch(vocabBank, (val) => {
  localStorage.setItem('szol_vocab', JSON.stringify(val))
}, { deep: true })

// Restore session on page load if a token is saved
onMounted(async () => {
  const user = await getMe()
  if (user) {
    currentUser.value = user
  } else {
    localStorage.removeItem('szol_token') // stale or invalid token
  }
})

// savedWordsForLang = Set of normalized saved words for the active language.
// Passed to RetypeView (and other views) to highlight already-known words.
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
  if (!vocabBank.value.some(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key)) {
    vocabBank.value.push(entry)
  }
}

function handleLogin(user) {
  currentUser.value = user
  showAuth.value    = false
}

function handleLogout() {
  logout()
  currentUser.value = null
}
</script>
