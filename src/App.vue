<template>
  <div class="min-h-screen bg-white text-gray-900">

    <NavBar
      :active="activeTab"
      :lang="activeLang"
      :current-user="currentUser"
      @tab="activeTab = $event"
      @lang="activeLang = $event"
      @auth="showAuth = true"
      @logout="handleLogout"
    />

    <main class="max-w-3xl mx-auto px-4 py-6">

      <ReadView
        v-if="activeTab === 'read'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordSet"
        :current-user="currentUser"
        @go="activeTab = $event"
        @save-word="addToVocab"
      />

      <RetypeView
        v-if="activeTab === 'retype'"
        :story="currentStory"
        :lang="activeLang"
      />

      <LibraryView
        v-if="activeTab === 'library'"
        :lang="activeLang"
        :current="currentStory"
        @load="loadStory"
      />

      <VocabView
        v-if="activeTab === 'vocab'"
        :words="vocabBank"
        :lang="activeLang"
        :current-user="currentUser"
        @remove="vocabBank.splice($event, 1)"
        @open-auth="showAuth = true"
      />

    </main>

    <AuthModal
      v-if="showAuth"
      @close="showAuth = false"
      @logged-in="handleLogin"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import NavBar    from './components/NavBar.vue'
import AuthModal from './components/AuthModal.vue'
import ReadView    from './views/ReadView.vue'
import RetypeView  from './views/RetypeView.vue'
import LibraryView from './views/LibraryView.vue'
import VocabView   from './views/VocabView.vue'
import { getMe, logout, onUnauthorized } from './utils/api.js'

const activeTab    = ref('library')
const activeLang   = ref('es')
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)
const vocabBank    = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))

watch(vocabBank, val => localStorage.setItem('szol_vocab', JSON.stringify(val)), { deep: true })

// Auto re-open login modal when any API call gets a 401
onUnauthorized(() => {
  currentUser.value = null
  showAuth.value    = true
})

// Restore session from stored token on page load
onMounted(async () => {
  const user = await getMe()
  if (user) currentUser.value = user
  else localStorage.removeItem('szol_token')
})

const savedWordSet = computed(() =>
  new Set(vocabBank.value.map(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')))
)

function loadStory(story) {
  currentStory.value = story
  activeLang.value   = story.lang
  activeTab.value    = 'read'
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
