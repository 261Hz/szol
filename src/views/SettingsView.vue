<template>
  <div class="flex flex-col gap-6">

    <div class="text-sm font-medium text-gray-700">Voice Settings</div>

    <div class="flex flex-col gap-4">
      <div
        v-for="(langConfig, code) in LANGS"
        :key="code"
        class="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0"
      >
        <div class="text-sm text-gray-700 min-w-[90px]">{{ langConfig.name }}</div>

        <div v-if="!voicesForLang(voices, langConfig.bcp47).length" class="text-xs text-amber-600 flex items-center gap-1 flex-1">
          No voice installed.
          <a href="ms-settings:regionlanguage" class="underline hover:text-amber-800">Install →</a>
        </div>

        <select
          v-else
          :value="prefs[code] || ''"
          @change="save(code, $event.target.value)"
          class="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1 bg-white"
        >
          <option value="">Auto-select</option>
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

const voices = useVoiceList()
const prefs = ref(getVoicePrefs())

function save(langCode, voiceName) {
  setVoicePref(langCode, voiceName)
  prefs.value = getVoicePrefs()
}
</script>
