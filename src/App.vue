<!-- App.vue is the root component -- the outermost shell that holds everything else. -->
<template>
  <div class="min-h-screen bg-gray-950 text-gray-50">

    <!-- Loading splash -->
    <Transition name="splash">
      <div
        v-if="appLoading"
        class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950"
      >
        <div class="flex flex-col items-center gap-4">
          <div class="text-4xl font-bold tracking-tight text-gray-100 select-none">
            Sz<span class="text-green-400">ó</span>l
          </div>
          <div class="flex gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style="animation-delay: 0ms" />
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style="animation-delay: 150ms" />
            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce" style="animation-delay: 300ms" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- First-visit onboarding: language picker + sign in / guest -->
    <WelcomeView
      v-if="!activeLang"
      @pick="enterAsGuest"
      @sign-in="enterAndOpenAuth"
    />

    <template v-else>
    <NavBar
      :active="activeTab"
      :lang="activeLang"
      :currentUser="currentUser"
      @tab="activeTab = $event"
      @lang="changeLang"
      @auth="showAuth = true"
      @logout="handleLogout"
    />

    <main class="max-w-3xl mx-auto px-3 py-4 sm:px-4 sm:py-6">

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
        @open-clip="clip => { activeClip = clip; activeTab = 'listen' }"
      />

      <ListenView
        v-if="activeTab === 'listen'"
        :story="currentStory"
        :lang="activeLang"
        :current-user="currentUser"
        :clip="activeClip"
        @close-clip="activeClip = null"
      />

      <SettingsView
        v-if="activeTab === 'settings'"
        :current-user="currentUser"
        :lang="activeLang"
        @open-auth="showAuth = true"
        @user-updated="currentUser = $event"
        @logout="handleLogout"
      />

      <JournalView
        v-if="activeTab === 'journal'"
        :lang="activeLang"
        :current-user="currentUser"
        @load="loadStory"
      />

      <MessagesView
        v-if="activeTab === 'messages'"
        :current-user="currentUser"
        :lang="activeLang"
        @open-auth="showAuth = true"
      />

      <TutorView
        v-if="activeTab === 'tutor'"
        :current-user="currentUser"
        :lang="activeLang"
        @open-auth="showAuth = true"
      />

    </main>

    <AuthModal
      v-if="showAuth"
      @close="showAuth = false"
      @logged-in="handleLogin"
    />

    </template>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, defineAsyncComponent } from 'vue'

const appLoading = ref(true)

import NavBar      from './components/NavBar.vue'
import AuthModal   from './components/AuthModal.vue'
import LibraryView from './views/LibraryView.vue'
import WelcomeView from './views/WelcomeView.vue'

const RetypeView   = defineAsyncComponent(() => import('./views/RetypeView.vue'))
const VocabView    = defineAsyncComponent(() => import('./views/VocabView.vue'))
const SpeakView    = defineAsyncComponent(() => import('./views/SpeakView.vue'))
const WriteView    = defineAsyncComponent(() => import('./views/WriteView.vue'))
const SettingsView  = defineAsyncComponent(() => import('./views/SettingsView.vue'))
const ListenView    = defineAsyncComponent(() => import('./views/ListenView.vue'))
const MessagesView  = defineAsyncComponent(() => import('./views/MessagesView.vue'))
const JournalView   = defineAsyncComponent(() => import('./views/JournalView.vue'))
const TutorView     = defineAsyncComponent(() => import('./views/TutorView.vue'))

import { LANGS } from './data/stories.js'
import { getMe, logout, onUnauthorized, getAccountVocab, saveVocabWord, removeVocabWord } from './utils/api.js'
import { updateSEO } from './utils/seo.js'

const activeTab    = ref('library')
// null = first visit → show WelcomeView; otherwise restore saved language
const activeLang   = ref(localStorage.getItem('szol_lang') || null)
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)
const activeClip   = ref(null)

const vocabBank = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))
watch(vocabBank, val => localStorage.setItem('szol_vocab', JSON.stringify(val)), { deep: true })

// Update <title>, <meta description>, html[lang], and OG tags whenever language changes
watch(activeLang, lang => { if (lang) updateSEO(lang) }, { immediate: true })

// ── Language helpers ──────────────────────────────────────────────────────────

function _setLang(code) {
  activeLang.value = code
  localStorage.setItem('szol_lang', code)
}

// WelcomeView: user picked a language and wants to continue as guest.
function enterAsGuest(lang) { _setLang(lang) }

// WelcomeView: user picked a language and wants to sign in.
function enterAndOpenAuth(lang) { _setLang(lang); showAuth.value = true }

// NavBar language dropdown: save choice and clear any story in the wrong language.
function changeLang(code) {
  if (currentStory.value && currentStory.value.lang !== code) {
    currentStory.value = null
    activeTab.value    = 'library'
  }
  _setLang(code)
  window.clarity?.('set', 'language', code)
  window.clarity?.('event', 'language_selected')
}

onUnauthorized(() => {
  currentUser.value = null
  showAuth.value    = true
})

onMounted(async () => {
  // Honor ?lang= query param (from hreflang links / shared URLs) — override stored lang
  const params = new URLSearchParams(window.location.search)
  const langParam = params.get('lang')
  if (langParam && LANGS[langParam]) {
    _setLang(langParam)
    params.delete('lang')
    const newSearch = params.toString()
    history.replaceState(null, '', newSearch ? `?${newSearch}` : window.location.pathname)
  }

  // Handle email verification redirect from the backend
  if (params.get('email_verified')) {
    showAuth.value = true
    setTimeout(() => { window.__emailVerifiedToast = 'Email verified! You can now log in.' }, 50)
    history.replaceState(null, '', window.location.pathname)
  }
  if (params.get('email_verify_error') === 'expired') {
    showAuth.value = true
    setTimeout(() => { window.__emailVerifiedToast = 'That verification link has expired. Log in and request a new one.' }, 50)
    history.replaceState(null, '', window.location.pathname)
  }

  const user = await getMe()
  if (user) {
    currentUser.value = user
    await syncVocabOnLogin()
  } else {
    localStorage.removeItem('szol_token')
  }

  appLoading.value = false
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
    const w   = local.word.trim()
    if (serverKeys.has(key)) continue
    if (w.length < 2 || w.length > 40) continue          // skip single chars and sentences
    if (w.includes(' ') && w.length > 20) continue       // skip long phrases
    saveVocabWord(local)
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
  window.clarity?.('identify', user.id)
  window.clarity?.('set', 'proficiency', user.proficiency ?? '')
  await syncVocabOnLogin()
}

function handleLogout() {
  logout()
  currentUser.value = null
  // Keep local vocab in localStorage; server copy is preserved for next login
}
</script>

<style>
.splash-leave-active { transition: opacity 0.4s ease; }
.splash-leave-to    { opacity: 0; }
</style>
