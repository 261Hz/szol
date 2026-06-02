import { ref, onMounted, onUnmounted } from 'vue'

const PREFS_KEY = 'szol_voice_prefs'

export function useVoiceList() {
  const voices = ref([])

  function load() {
    voices.value = speechSynthesis.getVoices()
  }

  onMounted(() => {
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
  })

  onUnmounted(() => {
    speechSynthesis.removeEventListener('voiceschanged', load)
  })

  return voices
}

export function voicesForLang(voices, bcp47) {
  const base = bcp47.split('-')[0].toLowerCase()
  return voices.filter(v => v.lang.toLowerCase().startsWith(base))
}

export function pickVoice(voices, bcp47, langCode) {
  const matches = voicesForLang(voices, bcp47)
  if (!matches.length) return null

  const prefs = getVoicePrefs()
  const prefName = prefs[langCode]
  if (prefName) {
    const saved = matches.find(v => v.name === prefName)
    if (saved) return saved
  }

  return matches.find(v => v.name.includes('Microsoft')) ?? matches[0]
}

export function getVoicePrefs() {
  return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
}

export function setVoicePref(langCode, voiceName) {
  const prefs = getVoicePrefs()
  if (voiceName) prefs[langCode] = voiceName
  else delete prefs[langCode]
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}
