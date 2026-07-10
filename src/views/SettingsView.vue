<template>
  <div class="flex flex-col gap-6">

    <!-- ── Messaging Settings ── -->
    <div class="flex flex-col gap-3">
      <div class="text-sm" style="color:rgba(31,27,23,0.55); font-family:'IM Fell English',serif; letter-spacing:0.04em;">{{ t(lang, 'messaging') }}</div>

      <div v-if="!currentUser" class="text-xs" style="color:rgba(31,27,23,0.4); font-style:italic;">
        <button @click="$emit('openAuth')" class="underline transition-all" style="color:#8b3a3a;">
          {{ t(lang, 'loginToManageMsg') }}
        </button>
      </div>

      <template v-else>
        <!-- Open to messages toggle -->
        <div class="flex items-start justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
          <div class="flex flex-col gap-0.5">
            <div class="text-sm" style="color:#1f1b17;">{{ t(lang, 'openToVoice') }}</div>
            <div class="text-xs" style="color:rgba(31,27,23,0.45);" v-html="voiceDescHtml" />
          </div>
          <button
            @click="toggleMessages"
            class="relative flex-shrink-0 w-11 h-6 rounded-full transition-all"
            :style="openToMessages ? 'background:#8b3a3a;' : 'background:rgba(31,27,23,0.18);'"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
              :class="openToMessages ? 'translate-x-5' : ''"
            />
          </button>
        </div>

        <div v-if="settingsError" class="text-xs" style="color:#8b3a3a;">{{ settingsError }}</div>
      </template>
    </div>

    <!-- ── On-device models ── -->
    <div class="flex flex-col gap-3">
      <div class="text-sm" style="color:rgba(31,27,23,0.55); font-family:'IM Fell English',serif; letter-spacing:0.04em;">On-device models</div>

      <div class="flex items-start justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
        <div class="flex flex-col gap-0.5">
          <div class="text-sm" style="color:#1f1b17;">Offline definitions</div>
          <div class="text-xs" style="color:rgba(31,27,23,0.45);">Download a language model once for monolingual definitions when offline. Arabic &amp; Hebrew use a larger model (~900 MB); other languages ~300 MB.</div>
        </div>
        <button
          @click="toggleModels"
          class="relative flex-shrink-0 w-11 h-6 rounded-full transition-all"
          :style="modelsEnabled ? 'background:#8b3a3a;' : 'background:rgba(31,27,23,0.18);'"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
            :class="modelsEnabled ? 'translate-x-5' : ''"
          />
        </button>
      </div>

      <!-- Download button / progress (only when toggle is on) -->
      <div v-if="modelsEnabled" class="flex flex-col gap-1.5 px-1">
        <div v-if="modelDownloading" class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs" style="color:rgba(31,27,23,0.4);">
            <span>Downloading definition model…</span>
            <span>{{ modelDownloadPct }}%</span>
          </div>
          <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(31,27,23,0.1);">
            <div class="h-full rounded-full transition-all duration-300" style="background:#8b3a3a;" :style="{ width: modelDownloadPct + '%' }" />
          </div>
        </div>
        <template v-else-if="modelDownloadError">
          <div class="text-xs" style="color:#8b3a3a;">Download failed — check your connection or free up storage.</div>
          <button
            @click="downloadModel"
            class="self-start text-xs px-2.5 py-1 transition-all"
            style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.55);"
          >Retry</button>
        </template>
        <template v-else-if="cacheSize">
          <span class="text-xs" style="color:rgba(31,27,23,0.4);">Model cached ({{ cacheSize }}) — ready offline.</span>
        </template>
        <template v-else>
          <div class="text-xs" style="color:rgba(31,27,23,0.4);">Model not yet downloaded.</div>
          <button
            @click="downloadModel"
            class="self-start text-xs px-2.5 py-1 transition-all"
            style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.55);"
          >Download now</button>
        </template>
      </div>
      <div v-else-if="cacheSize" class="flex items-center justify-between px-1">
        <span class="text-xs" style="color:rgba(31,27,23,0.4);">Downloaded: {{ cacheSize }}</span>
      </div>

      <!-- Whisper ASR model row -->
      <div class="flex items-start justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
        <div class="flex flex-col gap-0.5">
          <div class="text-sm" style="color:#1f1b17;">Whisper transcription</div>
          <div class="text-xs" style="color:rgba(31,27,23,0.45);">Speech-to-text for podcast episodes without transcripts. Downloaded automatically on first use. ~74 MB (WASM) or ~170 MB (WebGPU, faster).</div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5 px-1">
        <div v-if="whisperDownloading" class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs" style="color:rgba(31,27,23,0.4);">
            <span>Downloading Whisper model… {{ whisperDownloadPct }}%</span>
            <button
              @click="cancelWhisperDownload"
              class="text-xs px-2 py-0.5 transition-all"
              style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.5);"
            >Cancel</button>
          </div>
          <div class="h-0.5 rounded-full overflow-hidden" style="background:rgba(31,27,23,0.1);">
            <div class="h-full rounded-full transition-all duration-300" style="background:#8b3a3a;" :style="{ width: whisperDownloadPct + '%' }" />
          </div>
        </div>
        <template v-else-if="whisperDownloadError">
          <div class="text-xs" style="color:#8b3a3a;">Download failed — check your connection or free up storage.</div>
          <button @click="downloadWhisper" class="self-start text-xs px-2.5 py-1 transition-all" style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.55);">Retry</button>
        </template>
        <template v-else-if="whisperSize">
          <span class="text-xs" style="color:rgba(31,27,23,0.4);">Cached ({{ whisperSize }}) — ready for transcription.</span>
        </template>
        <template v-else>
          <div class="text-xs" style="color:rgba(31,27,23,0.4);">Not yet downloaded — fetched automatically when first used.</div>
          <button @click="downloadWhisper" class="self-start text-xs px-2.5 py-1 transition-all" style="border:1px solid rgba(31,27,23,0.2); border-radius:2px; color:rgba(31,27,23,0.55);">Download in advance</button>
        </template>
      </div>

      <!-- Delete all: covers both translator and Whisper -->
      <div v-if="cacheSize || whisperSize" class="flex justify-end px-1">
        <button
          @click="clearCache"
          :disabled="clearing"
          class="text-xs transition-all disabled:opacity-40"
          style="color:#8b3a3a;"
        >{{ clearing ? 'Clearing…' : 'Delete all model data' }}</button>
      </div>
    </div>

    <!-- ── Install as web app (PWA) ── -->
    <div class="flex items-center justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
      <div class="flex flex-col gap-0.5">
        <div class="text-sm" style="color:#1f1b17;">Install app</div>
        <!-- iOS: manual instruction -->
        <div v-if="isIOS" class="text-xs" style="color:rgba(31,27,23,0.55);">
          Tap <span style="font-family:monospace;">Share</span> in Safari, then "Add to Home Screen".
        </div>
        <div v-else class="text-xs" style="color:rgba(31,27,23,0.45);">Adds Szól to your home screen. Quickest option — no download.</div>
      </div>

      <!-- iOS: no button, instruction is enough -->
      <button
        v-if="!isIOS && installPrompt"
        @click="installApp"
        class="flex-shrink-0 text-sm px-4 py-1.5 transition-all"
        style="background:#8b3a3a; color:#e8dcc4; border-radius:2px;"
      >Install</button>
    </div>

    <!-- ── Download native Android app (APK) ── -->
    <!-- Separate from the PWA install above -- both were shown together under
         one ambiguous "Install app" heading, which just looked like two
         buttons for the same thing. This is a different install method (a
         native Capacitor app, not a browser tab), so it gets its own row. -->
    <div v-if="isAndroid" class="flex items-center justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
      <div class="flex flex-col gap-0.5">
        <div class="text-sm" style="color:#1f1b17;">Android app (APK)</div>
        <div class="text-xs" style="color:rgba(31,27,23,0.45);">Native app with full offline handwriting recognition and device voices. Larger download.</div>
      </div>
      <!-- Fetches the APK as a blob and triggers the save from that, rather
           than a plain <a href> navigation -- a real navigation to
           /api/download-apk left some mobile browsers' tab actually sitting
           on that URL (even with the download attribute set), so refreshing
           the page re-triggered the download. fetch() never changes the
           page's location, so that can't happen. -->
      <button
        @click="downloadApk"
        :disabled="apkDownloading"
        class="flex-shrink-0 text-sm px-4 py-1.5 transition-all disabled:opacity-50"
        style="border:1px solid rgba(31,27,23,0.2); color:#1f1b17; border-radius:2px;"
      >{{ apkDownloading ? 'Downloading…' : 'Download APK' }}</button>
    </div>

    <!-- ── Danger Zone ── -->
    <div v-if="currentUser" class="flex flex-col gap-3 p-4" style="border:1px solid rgba(139,58,58,0.25); border-radius:3px;">
      <div class="text-sm" style="color:#8b3a3a; font-family:'IM Fell English',serif;">{{ t(lang, 'dangerZone') }}</div>
      <p class="text-xs" style="color:rgba(31,27,23,0.45);">{{ t(lang, 'deleteAccountDesc') }}</p>
      <button
        v-if="!confirmDelete"
        @click="confirmDelete = true"
        class="self-start text-sm px-4 py-1.5 transition-all"
        style="border:1px solid rgba(139,58,58,0.3); border-radius:2px; color:#8b3a3a;"
      >{{ t(lang, 'deleteAccount') }}</button>
      <div v-else class="flex flex-col gap-2">
        <p class="text-xs" style="color:#8b3a3a;">{{ t(lang, 'areYouSure') }}</p>
        <div class="flex gap-2">
          <button
            @click="doDelete"
            :disabled="deleting"
            class="text-sm px-4 py-1.5 transition-all disabled:opacity-40"
            style="background:#8b3a3a; color:#e8dcc4; border-radius:2px;"
          >{{ deleting ? t(lang, 'deleting') : t(lang, 'yesDelete') }}</button>
          <button
            @click="confirmDelete = false"
            class="text-sm px-4 py-1.5 transition-all"
            style="border:1px solid rgba(31,27,23,0.15); border-radius:2px; color:rgba(31,27,23,0.5);"
          >{{ t(lang, 'cancel') }}</button>
        </div>
        <div v-if="deleteError" class="text-xs" style="color:#8b3a3a;">{{ deleteError }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { updateSettings, deleteAccount, logout } from '../utils/api.js'
import { t } from '../utils/i18n.js'
import { localModelsEnabled, setLocalModelsEnabled, clearModelCache, translatorCacheBytes, whisperCacheBytes, fmtBytes } from '../utils/modelCache.js'
import { preload, onExplainerProgress } from '../utils/localExplainer.js'
import { preloadWhisper, onWhisperProgress, terminateWhisperWorker } from '../utils/localWhisper.js'

const props = defineProps({ currentUser: Object, lang: String, installPrompt: Object })
const emit  = defineEmits(['openAuth', 'userUpdated', 'logout'])

const ua       = navigator.userAgent
const isIOS    = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/.test(ua)

const apkDownloading = ref(false)

async function downloadApk() {
  if (apkDownloading.value) return
  apkDownloading.value = true
  try {
    const res  = await fetch('/api/download-apk')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'szol.apk'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    // network error -- button just re-enables, user can retry
  } finally {
    apkDownloading.value = false
  }
}

const openToMessages = ref(props.currentUser?.open_to_messages ?? false)
const settingsError  = ref('')
const confirmDelete  = ref(false)
const deleting       = ref(false)
const deleteError    = ref('')

const modelsEnabled       = ref(localModelsEnabled())
const cacheSize           = ref('')   // translator model size
const whisperSize         = ref('')   // whisper model size
const clearing            = ref(false)
const modelDownloading    = ref(false)
const modelDownloadPct    = ref(0)
const modelDownloadError  = ref(false)

const whisperDownloading  = ref(false)
const whisperDownloadPct  = ref(0)
const whisperDownloadError = ref(false)

async function refreshCacheSizes() {
  const [tBytes, wBytes] = await Promise.all([translatorCacheBytes(), whisperCacheBytes()])
  cacheSize.value   = tBytes > 0 ? fmtBytes(tBytes) : ''
  whisperSize.value = wBytes > 0 ? fmtBytes(wBytes) : ''
}

onMounted(refreshCacheSizes)

// Translator progress
let _pendingFiles = 0, _doneFiles = 0
const _removeProgress = onExplainerProgress((info) => {
  if (info.status === 'initiate') {
    _pendingFiles++
    modelDownloading.value = true
  } else if (info.status === 'progress') {
    modelDownloading.value = true
    modelDownloadPct.value = Math.round(info.progress ?? 0)
  } else if (info.status === 'done' || info.status === 'ready') {
    _doneFiles++
    if (_doneFiles >= _pendingFiles && _pendingFiles > 0) {
      modelDownloadPct.value = 100
      setTimeout(async () => {
        modelDownloading.value = false
        _pendingFiles = 0; _doneFiles = 0
        await refreshCacheSizes()
      }, 600)
    }
  }
})

// Whisper progress
let _wPending = 0, _wDone = 0
const _removeWhisperProgress = onWhisperProgress((data) => {
  if (data.type !== 'model_progress') return
  const { status, progress } = data.info
  if (status === 'initiate') { _wPending++; whisperDownloading.value = true }
  if (status === 'progress') { whisperDownloading.value = true; whisperDownloadPct.value = Math.round(progress ?? 0) }
  if (status === 'done' || status === 'ready') {
    _wDone++
    if (_wDone >= _wPending && _wPending > 0) {
      whisperDownloadPct.value = 100
      setTimeout(async () => {
        whisperDownloading.value = false
        _wPending = 0; _wDone = 0
        await refreshCacheSizes()
      }, 600)
    }
  }
})

onUnmounted(() => { _removeProgress(); _removeWhisperProgress() })

async function downloadModel() {
  modelDownloading.value   = true
  modelDownloadError.value = false
  modelDownloadPct.value   = 0
  _pendingFiles = 0; _doneFiles = 0
  try {
    await preload(props.lang)
    await refreshCacheSizes()
  } catch {
    modelDownloadError.value = true
  } finally {
    modelDownloading.value = false
  }
}

let _whisperCancelledByUser = false

async function downloadWhisper() {
  whisperDownloading.value   = true
  whisperDownloadError.value = false
  whisperDownloadPct.value   = 0
  _wPending = 0; _wDone = 0
  _whisperCancelledByUser = false
  try {
    await preloadWhisper()
    await refreshCacheSizes()
  } catch {
    if (!_whisperCancelledByUser) whisperDownloadError.value = true
  } finally {
    if (!_whisperCancelledByUser) whisperDownloading.value = false
    _whisperCancelledByUser = false
  }
}

function cancelWhisperDownload() {
  _whisperCancelledByUser    = true
  terminateWhisperWorker()
  whisperDownloading.value   = false
  whisperDownloadPct.value   = 0
  _wPending = 0; _wDone = 0
}

function toggleModels() {
  modelsEnabled.value = !modelsEnabled.value
  setLocalModelsEnabled(modelsEnabled.value)
}

async function installApp() {
  if (!props.installPrompt) return
  props.installPrompt.prompt()
  await props.installPrompt.userChoice
}

async function clearCache() {
  clearing.value = true
  await clearModelCache()
  cacheSize.value   = ''
  whisperSize.value = ''
  clearing.value    = false
}

const voiceDescHtml = computed(() => {
  const langName = LANGS[props.currentUser?.native_lang]?.name ?? props.currentUser?.native_lang ?? ''
  return t(props.lang, 'voiceDesc').replace(
    '[language]',
    `<strong style="color:rgba(31,27,23,0.7);">${langName}</strong>`
  )
})

async function toggleMessages() {
  const next = !openToMessages.value
  try {
    const updated = await updateSettings({ open_to_messages: next })
    openToMessages.value = updated.open_to_messages
    emit('userUpdated', updated)
    settingsError.value = ''
  } catch {
    settingsError.value = t(props.lang, 'errorTryAgain')
  }
}

async function doDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteAccount()
    logout()
    emit('logout')
  } catch {
    deleteError.value = t(props.lang, 'errorTryAgain')
    deleting.value = false
  }
}
</script>
