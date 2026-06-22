<template>
  <div class="min-h-screen bg-white text-gray-900">

    <!-- Language picker: shown on first visit before a language is chosen -->
    <LangPickView v-if="!activeLang" @pick="pickLang" />

    <template v-else>
    <div
      class="sticky top-0 z-40 bg-white transition-all duration-500"
      :class="navScrollHidden ? 'opacity-0 -translate-y-1 pointer-events-none' : ''"
    >
      <NavBar
        :active="activeTab"
        :lang="activeLang"
        :current-user="currentUser"
        :unread-messages="unreadMessages"
        @tab="activeTab = $event"
        @lang="changeLang"
        @auth="showAuth = true"
        @logout="handleLogout"
      />
    </div>

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
        @exit="activeTab = 'read'"
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

      <VoiceView
        v-if="activeTab === 'messages'"
        :current-user="currentUser"
        @open-auth="showAuth = true"
        @unread-count="unreadMessages = $event"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import NavBar    from './components/NavBar.vue'
import AuthModal from './components/AuthModal.vue'
import ReadView     from './views/ReadView.vue'
import RetypeView   from './views/RetypeView.vue'
import LibraryView  from './views/LibraryView.vue'
import VocabView    from './views/VocabView.vue'
import SpeakView    from './views/SpeakView.vue'
import LangPickView from './views/LangPickView.vue'
import VoiceView    from './views/VoiceView.vue'
import { getMe, logout, onUnauthorized } from './utils/api.js'

const navScrollHidden = ref(false)
let _lastScrollY = 0

function _onScroll() {
  if (activeTab.value !== 'read') { navScrollHidden.value = false; return }
  const y = window.scrollY
  if (y < 60)              navScrollHidden.value = false
  else if (y > _lastScrollY + 8) navScrollHidden.value = true
  else if (y < _lastScrollY - 8) navScrollHidden.value = false
  _lastScrollY = y
}

function _onMouseNearTop(e) {
  if (e.clientY < 64) navScrollHidden.value = false
}

const activeTab      = ref('library')
const unreadMessages = ref(0)
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
  window.addEventListener('scroll',    _onScroll,      { passive: true })
  window.addEventListener('mousemove', _onMouseNearTop, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll',    _onScroll)
  window.removeEventListener('mousemove', _onMouseNearTop)
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
