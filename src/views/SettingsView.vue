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

      <div v-if="cacheSize" class="flex items-center justify-between px-1">
        <span class="text-xs" style="color:rgba(31,27,23,0.4);">Downloaded: {{ cacheSize }}</span>
        <button
          @click="clearCache"
          :disabled="clearing"
          class="text-xs transition-all disabled:opacity-40"
          style="color:#8b3a3a;"
        >{{ clearing ? 'Clearing…' : 'Delete all model data' }}</button>
      </div>
    </div>

    <!-- ── Install app ── -->
    <div class="flex items-center justify-between gap-4 py-3 px-4" style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;">
      <div class="flex flex-col gap-0.5">
        <div class="text-sm" style="color:#1f1b17;">Install app</div>
        <!-- iOS: manual instruction -->
        <div v-if="isIOS" class="text-xs" style="color:rgba(31,27,23,0.55);">
          Tap <span style="font-family:monospace;">Share</span> in Safari, then "Add to Home Screen".
        </div>
        <div v-else class="text-xs" style="color:rgba(31,27,23,0.45);">Add Szól to your home screen for quick access.</div>
      </div>

      <!-- iOS: no button, instruction is enough -->
      <div v-if="!isIOS" class="flex flex-col items-end gap-1.5">
        <!-- PWA prompt (Android Chrome / desktop Chrome) -->
        <button
          v-if="installPrompt"
          @click="installApp"
          class="flex-shrink-0 text-sm px-4 py-1.5 transition-all"
          style="background:#8b3a3a; color:#e8dcc4; border-radius:2px;"
        >Install</button>
        <!-- APK download (Android only) -->
        <a
          v-if="isAndroid"
          href="https://github.com/261Hz/szol/releases/download/android-latest/szol-debug.apk"
          download
          class="flex-shrink-0 text-sm px-4 py-1.5 transition-all text-center"
          style="border:1px solid rgba(31,27,23,0.2); color:#1f1b17; border-radius:2px; text-decoration:none;"
        >Download APK</a>
      </div>
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
import { ref, computed, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { updateSettings, deleteAccount, logout } from '../utils/api.js'
import { t } from '../utils/i18n.js'
import { localModelsEnabled, setLocalModelsEnabled, clearModelCache, modelCacheBytes, fmtBytes } from '../utils/modelCache.js'

const props = defineProps({ currentUser: Object, lang: String, installPrompt: Object })
const emit  = defineEmits(['openAuth', 'userUpdated', 'logout'])

const ua       = navigator.userAgent
const isIOS    = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/.test(ua)

const openToMessages = ref(props.currentUser?.open_to_messages ?? false)
const settingsError  = ref('')
const confirmDelete  = ref(false)
const deleting       = ref(false)
const deleteError    = ref('')

const modelsEnabled = ref(localModelsEnabled())
const cacheSize     = ref('')
const clearing      = ref(false)

onMounted(async () => {
  const bytes = await modelCacheBytes()
  if (bytes > 0) cacheSize.value = fmtBytes(bytes)
})

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
  cacheSize.value = ''
  clearing.value  = false
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
