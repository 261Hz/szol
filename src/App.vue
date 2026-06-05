<template>
  <div class="min-h-screen bg-white text-gray-900">

    <!-- Language picker: shown on first visit before a language is chosen -->
    <LangPickView v-if="!activeLang" @pick="pickLang" />

    <template v-else>
    <NavBar
      :active="activeTab"
      :lang="activeLang"
      :current-user="currentUser"
      @tab="activeTab = $event"
      @lang="changeLang"
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
        :current-user="currentUser"
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

      <SpeakView
        v-if="activeTab === 'speak'"
        :story="currentStory"
        :lang="activeLang"
        :vocab-bank="vocabBank"
        :saved-words="savedWordSet"
        :current-user="currentUser"
        @save-word="addToVocab"
      />

    </main>

    <AuthModal
      v-if="showAuth"
      @close="showAuth = false"
      @logged-in="handleLogin"
    />

    </template><!-- end v-else -->
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import NavBar    from './components/NavBar.vue'
import AuthModal from './components/AuthModal.vue'
import ReadView     from './views/ReadView.vue'
import RetypeView   from './views/RetypeView.vue'
import LibraryView  from './views/LibraryView.vue'
import VocabView    from './views/VocabView.vue'
import SpeakView    from './views/SpeakView.vue'
import LangPickView from './views/LangPickView.vue'
import { getMe, logout, onUnauthorized } from './utils/api.js'

const activeTab    = ref('library')
// Read saved language; null = first visit, show the picker
const activeLang   = ref(localStorage.getItem('szol_lang') || null)
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)
const vocabBank    = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))

watch(vocabBank, val => localStorage.setItem('szol_vocab', JSON.stringify(val)), { deep: true })

function pickLang(code) {
  activeLang.value = code
  localStorage.setItem('szol_lang', code)
}

// Navbar language dropdown — save choice and clear any mismatched story.
function changeLang(code) {
  localStorage.setItem('szol_lang', code)
  if (currentStory.value && currentStory.value.lang !== code) {
    currentStory.value = null
    activeTab.value    = 'library'
  }
  activeLang.value = code
}

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
