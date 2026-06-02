// This file manages the browser's text-to-speech (TTS) voices.
// It provides a Vue composable (a reusable setup function) for loading voices,
// and helper functions for picking the best voice and saving user preferences.

// Import Vue utilities:
// ref       = creates a reactive variable (Vue watches it and re-renders when it changes)
// onMounted = runs code after a component appears on the screen
// onUnmounted = runs code when a component is removed from the screen
import { ref, onMounted, onUnmounted } from 'vue'

// The localStorage key where voice preferences are saved.
// localStorage is like a mini-database in the browser -- it survives page refreshes.
const PREFS_KEY = 'szol_voice_prefs'

// useVoiceList() is a "composable" -- a function you call inside a Vue component's <script setup>
// to get reactive state and have it automatically managed.
// It returns a "voices" ref that stays up-to-date as the browser loads TTS voices.
export function useVoiceList() {
  // ref([]) creates a reactive variable starting as an empty array [].
  // .value is how you read or write a ref's contents (e.g. voices.value).
  const voices = ref([])

  // load() fetches the current list of available TTS voices from the browser.
  // speechSynthesis is the browser's built-in text-to-speech engine.
  // .getVoices() returns an array of SpeechSynthesisVoice objects.
  function load() {
    voices.value = speechSynthesis.getVoices()
  }

  // onMounted runs once after this component is added to the page (DOM = Document Object Model, the visible page).
  onMounted(() => {
    load() // load voices immediately on mount (might return empty on first call in Chrome)
    // 'voiceschanged' fires when the browser finishes loading all available voices asynchronously.
    // addEventListener adds a listener so load() is called again once they're ready.
    speechSynthesis.addEventListener('voiceschanged', load)
  })

  // onUnmounted runs when the component is removed. Clean up the listener to avoid memory leaks.
  // A "memory leak" = code that keeps running after you're done with it, wasting resources.
  onUnmounted(() => {
    speechSynthesis.removeEventListener('voiceschanged', load)
  })

  // Return the voices ref so the component using this composable can access voice list.
  return voices
}

// voicesForLang() filters the voice list to only those that speak a given language.
// "voices" is an array of SpeechSynthesisVoice objects.
// "bcp47" is a language tag like 'es-ES' (Spanish, Spain) or 'el-GR' (Greek, Greece).
//   BCP 47 = Best Current Practice 47, the standard for language codes.
export function voicesForLang(voices, bcp47) {
  // .split('-')[0] takes the first part of the language tag: 'es-ES' → 'es', 'el-GR' → 'el'.
  // .toLowerCase() makes comparison case-insensitive.
  const base = bcp47.split('-')[0].toLowerCase()
  // .filter() returns a new array containing only items where the callback returns true.
  // Here: keep only voices whose .lang property starts with the base language code.
  // v.lang.toLowerCase().startsWith(base) = e.g. 'es-es'.startsWith('es') = true
  return voices.filter(v => v.lang.toLowerCase().startsWith(base))
}

// pickVoice() chooses the best available TTS voice for a given language.
// It respects the user's saved preference (from Settings), then prefers Microsoft voices,
// then falls back to the first available voice.
// "bcp47" = language code like 'es-ES'. "langCode" = short code like 'es'.
export function pickVoice(voices, bcp47, langCode) {
  // Get all voices for this language.
  const matches = voicesForLang(voices, bcp47)
  // If there are no voices at all for this language, return null (nothing).
  if (!matches.length) return null

  // Look up any saved preference for this language.
  const prefs    = getVoicePrefs()   // e.g. { es: 'Google español', el: 'Microsoft Stefanos' }
  const prefName = prefs[langCode]   // e.g. 'Microsoft Stefanos' for 'el'

  // If there's a saved preference, try to find that exact voice by name.
  if (prefName) {
    // .find() returns the first item where the callback is true, or undefined if none.
    const saved = matches.find(v => v.name === prefName)
    if (saved) return saved // found the preferred voice -- use it
  }

  // No saved preference (or the saved voice is gone). Use a smart default:
  // 1. Prefer any Microsoft voice (higher quality, uses Windows TTS engine)
  // ?? is the "nullish coalescing" operator: if the left side is null/undefined, use the right side.
  // 2. Fall back to the first voice in the list.
  return matches.find(v => v.name.includes('Microsoft')) ?? matches[0]
}

// getVoicePrefs() reads the saved voice preferences from localStorage.
// Returns an object like: { es: 'Google español', el: 'Microsoft Stefanos Online' }
export function getVoicePrefs() {
  // localStorage.getItem() reads a value by key name, returns null if it doesn't exist.
  // JSON.parse() converts a JSON string back into a JavaScript object.
  // '{}' is a JSON empty object -- used as the default if nothing is saved yet.
  return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
}

// setVoicePref() saves the user's chosen voice for one language to localStorage.
// "langCode" = e.g. 'es'. "voiceName" = e.g. 'Microsoft Pablo Online'.
export function setVoicePref(langCode, voiceName) {
  const prefs = getVoicePrefs() // read existing prefs so we don't overwrite other languages
  if (voiceName) {
    prefs[langCode] = voiceName // set the preference for this language
  } else {
    delete prefs[langCode] // if voiceName is empty/null, remove the preference (reset to default)
  }
  // JSON.stringify() converts a JavaScript object into a JSON string for storage.
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}
