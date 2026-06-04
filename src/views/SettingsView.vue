<!-- SettingsView.vue: lets the user pick a preferred TTS voice for each language. -->
<!-- Opened by clicking the ⚙ gear button in the NavBar. -->
<template>
  <!-- Outer container stacks content vertically. -->
  <div class="flex flex-col gap-6">

    <!-- Page header. -->
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
// ref creates a reactive variable (changes cause Vue to re-render the template).
import { ref } from 'vue'
// Import the language configuration object.
import { LANGS } from '../data/stories.js'
// Import voice-related utilities:
// useVoiceList = composable that loads available browser TTS voices
// voicesForLang = filters voices by language code
// getVoicePrefs = reads saved preferences from localStorage
// setVoicePref  = saves a preference to localStorage
import { useVoiceList, voicesForLang, getVoicePrefs, setVoicePref } from '../utils/voices.js'

// Load the list of available voices. This updates automatically once the browser finishes
// loading voices (via the 'voiceschanged' event handled inside useVoiceList).
const voices = useVoiceList()

// prefs holds the current voice preferences object, e.g. { es: 'Google español', el: 'Microsoft Stefanos' }.
// getVoicePrefs() reads this from localStorage on startup.
const prefs = ref(getVoicePrefs())

// save() is called when the user picks a voice from a dropdown.
// langCode = the language being configured (e.g. 'el')
// voiceName = the name of the chosen voice (e.g. 'Microsoft Stefanos Online (Greek)')
function save(langCode, voiceName) {
  setVoicePref(langCode, voiceName) // write the preference to localStorage
  prefs.value = getVoicePrefs()     // re-read from localStorage so the UI reflects the change
}
</script>
