<!-- SettingsView.vue: voice settings and messaging preferences. -->
<template>
  <div class="flex flex-col gap-6">

    <!-- ── Messaging Settings ── -->
    <div class="flex flex-col gap-3">
      <div class="text-sm font-medium text-gray-200">Messaging</div>

      <div v-if="!currentUser" class="text-xs text-gray-500">
        <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">Log in</button>
        to manage messaging settings.
      </div>

      <template v-else>
        <!-- Open to messages toggle -->
        <div class="flex items-start justify-between gap-4 py-3 border border-gray-700 rounded-lg px-4">
          <div class="flex flex-col gap-0.5">
            <div class="text-sm text-gray-200">Open to voice messages</div>
            <div class="text-xs text-gray-500">
              Allow learners of <strong class="text-gray-300">{{ LANGS[currentUser.native_lang]?.name ?? currentUser.native_lang }}</strong>
              to send you short voice messages. You can turn this off at any time.
            </div>
          </div>
          <button
            @click="toggleMessages"
            :class="[
              'relative flex-shrink-0 w-11 h-6 rounded-full transition-all',
              openToMessages ? 'bg-green-600' : 'bg-gray-700'
            ]"
          >
            <span :class="['absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all', openToMessages ? 'translate-x-5' : '']" />
          </button>
        </div>

        <div v-if="settingsError" class="text-xs text-red-400">{{ settingsError }}</div>
      </template>
    </div>

    <!-- ── Voice Settings ── -->
    <div class="text-sm font-medium text-gray-200">Voice Settings</div>

    <!-- Loop through every language in LANGS and show a voice selector row for each. -->
    <div class="flex flex-col gap-4">
      <!-- v-for on an object: "langConfig" = the value (e.g. { name: 'Ελληνικά', bcp47: 'el-GR', ... }) -->
      <!--                     "code"       = the key   (e.g. 'el') -->
      <div
        v-for="(langConfig, code) in LANGS"
        :key="code"
        class="flex items-center justify-between gap-4 py-2 border-b border-gray-800 last:border-0"
      >
        <!-- Language name label on the left (e.g. "Ελληνικά", "Español"). -->
        <div class="text-sm text-gray-200 min-w-[90px]">{{ langConfig.name }}</div>

        <!-- No-voice warning: shown when zero voices are available for this language. -->
        <!-- voicesForLang(voices, langConfig.bcp47) returns the list of matching voices. -->
        <!-- .length is 0 means no voices found. !0 = true = show this message. -->
        <div v-if="!voicesForLang(voices, langConfig.bcp47).length" class="text-xs text-amber-600 flex items-center gap-1 flex-1">
          No voice installed.
          <!-- This link opens Windows language settings directly (ms-settings: is a Windows URL scheme). -->
          <a href="ms-settings:regionlanguage" class="underline hover:text-amber-800">Install →</a>
        </div>

        <!-- Voice dropdown: shown when at least one voice is available. -->
        <!-- v-else = shown only when v-if above is false (voices ARE available). -->
        <select
          v-else
          :value="prefs[code] || ''"
          @change="save(code, $event.target.value)"
          class="flex-1 text-sm border border-gray-700 rounded-md px-2 py-1 bg-gray-900 text-gray-200"
        >
          <!-- First option: "Auto-select" means no preference saved, use the default logic. -->
          <!-- value="" = empty string, which save() will interpret as "clear this preference". -->
          <option value="">Auto-select</option>
          <!-- One option for each available voice for this language. -->
          <!-- v.name = e.g. "Microsoft Stefanos Online (Greek)" or "Google ελληνικά". -->
          <option
            v-for="v in voicesForLang(voices, langConfig.bcp47)"
            :key="v.name"
            :value="v.name"
          >{{ v.name }}</option>
        </select>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { LANGS } from '../data/stories.js'
import { useVoiceList, voicesForLang, getVoicePrefs, setVoicePref } from '../utils/voices.js'
import { updateSettings } from '../utils/api.js'

const props = defineProps({ currentUser: Object })
const emit  = defineEmits(['openAuth', 'userUpdated'])

const voices = useVoiceList()
const prefs  = ref(getVoicePrefs())

const openToMessages = ref(props.currentUser?.open_to_messages ?? false)
const settingsError  = ref('')

async function toggleMessages() {
  const next = !openToMessages.value
  try {
    const updated = await updateSettings({ open_to_messages: next })
    openToMessages.value = updated.open_to_messages
    emit('userUpdated', updated)
    settingsError.value = ''
  } catch {
    settingsError.value = 'Could not save. Try again.'
  }
}

function save(langCode, voiceName) {
  setVoicePref(langCode, voiceName)
  prefs.value = getVoicePrefs()
}
</script>
