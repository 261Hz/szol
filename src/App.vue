<!-- App.vue is the root component -- the outermost shell that holds everything else. -->
<template>
  <div class="min-h-screen">

    <!-- Loading splash. Also gates the whole site behind a Turnstile check --
         nothing past this screen renders until the visitor is verified, so
         this stays up (or shows the error state) regardless of appLoading
         once gateError is set. Fails closed: a failed/errored/timed-out
         check leaves the visitor stuck here, not waved through. -->
    <Transition name="splash">
      <div
        v-if="appLoading || gateError"
        class="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style="background:#e8dcc4;"
      >
        <div v-if="!gateError" class="flex flex-col items-center gap-4">
          <div class="text-4xl font-bold tracking-tight select-none" style="color:#1f1b17; font-family:'IM Fell English',serif;">
            Sz<span style="color:#8b3a3a">ó</span>l
          </div>
          <div class="flex gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full animate-bounce" style="background:#8b3a3a; animation-delay: 0ms" />
            <div class="w-1.5 h-1.5 rounded-full animate-bounce" style="background:#8b3a3a; animation-delay: 150ms" />
            <div class="w-1.5 h-1.5 rounded-full animate-bounce" style="background:#8b3a3a; animation-delay: 300ms" />
          </div>
          <!-- Turnstile mounts here. Managed/non-interactive by default --
               only shows a visible widget if Cloudflare decides this visitor
               needs an actual challenge. -->
          <div ref="turnstileEl" />
        </div>
        <div v-else class="flex flex-col items-center gap-3 px-6 text-center">
          <div class="text-2xl font-bold tracking-tight select-none" style="color:#1f1b17; font-family:'IM Fell English',serif;">
            Sz<span style="color:#8b3a3a">ó</span>l
          </div>
          <div class="text-sm" style="color:rgba(31,27,23,0.6); max-width:22rem;">Unable to verify your browser. Check your connection and try again.</div>
          <button
            @click="retryGate"
            class="text-sm px-4 py-1.5 transition-all"
            style="background:#2a2018; color:#e8dcc4; border-radius:2px;"
          >Retry</button>
        </div>
      </div>
    </Transition>

    <!-- Nothing below mounts until the Turnstile gate passes -- otherwise
         WelcomeView (and its data fetches, e.g. learner counts) renders into
         the DOM immediately regardless of the splash, just visually hidden
         under it. A scraper that ignores CSS/z-index would still see it. -->
    <template v-if="!appLoading && !gateError">

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

      <BrowseView
        v-if="activeTab === 'browse'"
        :lang="activeLang"
        :current-user="currentUser"
        :words="vocabBank"
        @load="loadStory"
        @stories-loaded="storyPool = $event"
        @go="activeTab = $event"
        @open-listen="openInListen"
      />

      <RetypeView
        v-if="activeTab === 'retype'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordsForLang"
        :current-user="currentUser"
        @save-word="addToVocab"
        @go="activeTab = $event"
      />

      <ContentView
        v-if="activeTab === 'read'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordsForLang"
        :current-user="currentUser"
        :story-pool="storyPool"
        :echoes-for="echoesFor"
        @go="activeTab = $event"
        @save-word="addToVocab"
        @switch-story="switchStory"
        @open-listen="openInListen"
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
        :saved-words="savedWordsForLang"
        @go="activeTab = $event"
        @save-word="addToVocab"
      />

      <LibraryView
        v-if="activeTab === 'saved' || activeTab === 'library'"
        :lang="activeLang"
        :current="currentStory"
        :words="vocabBank"
        :current-user="currentUser"
        @load="loadStory"
        @open-listen="openInListen"
        @save-word="addToVocab"
        @open-auth="showAuth = true"
        @stories-loaded="storyPool = $event"
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
        @open-auth="showAuth = true"
      />

      <SettingsView
        v-if="activeTab === 'settings'"
        :current-user="currentUser"
        :lang="activeLang"
        :install-prompt="installPrompt"
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

      <ParallelView
        v-if="activeTab === 'parallel'"
        :lang="activeLang"
        :current-user="currentUser"
      />

      <MessagesView
        v-if="activeTab === 'messages'"
        :current-user="currentUser"
        :lang="activeLang"
        @open-auth="showAuth = true"
      />

    </main>

    <AuthModal
      v-if="showAuth"
      :lang="activeLang ?? 'en'"
      @close="showAuth = false"
      @logged-in="handleLogin"
    />

    <LitClock v-if="activeLang === 'en'" />

    </template>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, nextTick, defineAsyncComponent } from 'vue'

const appLoading    = ref(true)
const gateError     = ref(false)
const turnstileEl   = ref(null)
const installPrompt = ref(null)

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  installPrompt.value = e
})
window.addEventListener('appinstalled', () => { installPrompt.value = null })

import NavBar      from './components/NavBar.vue'
import AuthModal   from './components/AuthModal.vue'
import LitClock    from './components/LitClock.vue'
import LibraryView from './views/LibraryView.vue'
import WelcomeView from './views/WelcomeView.vue'
import BrowseView  from './views/BrowseView.vue'

const ContentView  = defineAsyncComponent(() => import('./views/ContentView.vue'))
const RetypeView   = defineAsyncComponent(() => import('./views/RetypeView.vue'))
const VocabView    = defineAsyncComponent(() => import('./views/VocabView.vue'))
const SpeakView    = defineAsyncComponent(() => import('./views/SpeakView.vue'))
const WriteView    = defineAsyncComponent(() => import('./views/WriteView.vue'))
const SettingsView  = defineAsyncComponent(() => import('./views/SettingsView.vue'))
const ListenView    = defineAsyncComponent(() => import('./views/ListenView.vue'))
const MessagesView  = defineAsyncComponent(() => import('./views/MessagesView.vue'))
const JournalView    = defineAsyncComponent(() => import('./views/JournalView.vue'))
const ParallelView   = defineAsyncComponent(() => import('./views/ParallelView.vue'))

import { LANGS } from './data/stories.js'
import { getMe, logout, onUnauthorized, getAccountVocab, saveVocabWord, removeVocabWord, requestWordClip, verifyTurnstile } from './utils/api.js'
import { updateSEO } from './utils/seo.js'
import { useEchoIndex } from './composables/useEchoIndex.js'

const activeTab    = ref('browse')
// null = first visit → show WelcomeView; otherwise restore saved language
const activeLang   = ref(localStorage.getItem('szol_lang') || null)
const currentStory = ref(null)
const currentUser  = ref(null)
const showAuth     = ref(false)
const activeClip   = ref(null)
const storyPool    = ref([])

const vocabBank = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))
watch(vocabBank, val => localStorage.setItem('szol_vocab', JSON.stringify(val)), { deep: true })

const { index: echoIndex, exposures, echoesFor } = useEchoIndex(storyPool, vocabBank, activeLang)

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
    activeTab.value    = 'browse'
  }
  _setLang(code)
}

onUnauthorized(() => {
  currentUser.value = null
  showAuth.value    = true
})

// ── Site-entry Turnstile gate ─────────────────────────────────────────────────
// Blocks the whole app behind a bot check before any content renders, rather
// than only checking at registration -- see the discussion that led here.
// Fails closed: any failure/error/timeout leaves gateError set and the
// splash's error state up, never appLoading = false.

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
let turnstileWidgetId    = null

async function waitForTurnstileScript(timeoutMs = 8000) {
  const start = Date.now()
  while (!window.turnstile) {
    if (Date.now() - start > timeoutMs) throw new Error('Turnstile script did not load')
    await new Promise(r => setTimeout(r, 100))
  }
}

function getTurnstileToken(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg) } }
    const timer  = setTimeout(() => finish(reject, new Error('Turnstile timed out')), timeoutMs)

    waitForTurnstileScript()
      .then(() => {
        if (!turnstileEl.value) { finish(reject, new Error('No Turnstile mount point')); return }
        const opts = {
          sitekey:            TURNSTILE_SITE_KEY,
          appearance:         'interaction-only', // invisible unless Cloudflare needs to challenge this visitor
          callback:           (token) => finish(resolve, token),
          'error-callback':   ()      => finish(reject, new Error('Turnstile error')),
          'expired-callback': ()      => finish(reject, new Error('Turnstile expired')),
        }
        turnstileWidgetId = window.turnstile.render(turnstileEl.value, opts)
      })
      .catch(err => finish(reject, err))
  })
}

async function runGate() {
  if (!TURNSTILE_SITE_KEY) { gateError.value = true; return false }
  try {
    const token = await getTurnstileToken()
    await verifyTurnstile(token)
    return true
  } catch {
    gateError.value = true
    return false
  }
}

async function retryGate() {
  gateError.value       = false
  turnstileWidgetId     = null // the old widget's DOM node was torn down when the error view showed
  appLoading.value      = true
  await nextTick() // let the splash's normal (non-error) subtree remount before rendering into it
  const ok = await runGate()
  if (ok) appLoading.value = false
}

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

  // Gate, minimum splash duration ("just for looks" -- keep the logo visible
  // a beat instead of it vanishing the instant these resolve), and the
  // existing session check all run in parallel.
  const [gateOk] = await Promise.all([
    runGate(),
    new Promise(r => setTimeout(r, 300)),
    (async () => {
      const user = await getMe()
      if (user) {
        currentUser.value = user
        await syncVocabOnLogin()
      } else {
        localStorage.removeItem('szol_token')
      }
    })(),
  ])

  if (gateOk) appLoading.value = false
  // else: gateError is already set by runGate(); the splash's error/retry
  // state stays up and appLoading is left true.
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
  activeTab.value    = 'read'
}

function switchStory(story) {
  currentStory.value = story
  activeLang.value   = story.lang
}

function openInListen(story) {
  currentStory.value = story
  activeLang.value   = story.lang
  activeTab.value    = 'listen'
}

function addToVocab(entry) {
  const key = entry.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  if (vocabBank.value.some(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key)) return
  vocabBank.value.push(entry)
  if (currentUser.value) saveVocabWord(entry)
  requestWordClip(entry.word, entry.lang)
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

<style>
.splash-leave-active { transition: opacity 0.4s ease; }
.splash-leave-to    { opacity: 0; }
</style>
