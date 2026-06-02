// tatoeba.js: helpers for fetching example sentences from Tatoeba.org.
// Tatoeba is a free, open-source collection of sentences in many languages.
// API docs: https://tatoeba.org/eng/tools/api

// Maps the app's short language codes to Tatoeba's 3-letter ISO 639-3 codes.
const TATOEBA_LANG = {
  en:  'eng',
  es:  'spa',
  fr:  'fra',
  de:  'deu',
  it:  'ita',
  ru:  'rus',
  he:  'heb',
  ar:  'ara',
  arz: 'ara', // Egyptian Arabic uses the Modern Arabic Tatoeba corpus
  ja:  'jpn',
  zh:  'cmn', // Mandarin Chinese (cmn = standard Chinese)
  hu:  'hun',
  el:  'ell',
}

// fetchTatoeba() searches Tatoeba for example sentences containing the given word.
// Returns an array of sentence objects (up to 4), or [] on any error.
// word = the word to search for (e.g. 'hola')
// lang = the app's language code (e.g. 'es')
export async function fetchTatoeba(word, lang) {
  const code = TATOEBA_LANG[lang]
  if (!code) return [] // unsupported language -- return empty silently

  // native_lang restricts results to sentences originally written in this language
  // (not translations). This gives more natural example sentences.
  // /en/ prefix required -- without it Tatoeba returns a 301 redirect to /en/api_v0/...,
  // and cross-origin redirects drop the CORS headers, causing the fetch to fail.
  const url = `https://tatoeba.org/en/api_v0/search?query=${encodeURIComponent(word)}&from=${code}&native_lang=${code}&limit=4`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    // data.results is the array of sentence objects from Tatoeba.
    // ?? [] = use empty array if the key is missing.
    return data.results ?? []
  } catch {
    // Network error, CORS issue, etc. -- fail silently and return empty.
    return []
  }
}

// audioUrl() builds the direct MP3 link for a Tatoeba sentence.
// Returns null if the sentence has no audio recordings.
// sentence = a result object from the Tatoeba API, which includes an "audios" array.
export function audioUrl(sentence) {
  if (!sentence.audios?.length) return null
  // Tatoeba stores audio files at this URL pattern:
  // https://audio.tatoeba.org/sentences/{3-letter-lang-code}/{sentence-id}.mp3
  // sentence.lang = the 3-letter code returned by the API (e.g. 'spa', 'eng')
  // sentence.id   = the unique sentence number
  return `https://audio.tatoeba.org/sentences/${sentence.lang}/${sentence.id}.mp3`
}

// playAudio() creates a browser Audio object and plays the sentence's audio.
// Does nothing if the sentence has no audio.
export function playAudio(sentence) {
  const url = audioUrl(sentence)
  if (!url) return
  // new Audio(url) creates a temporary audio player object.
  // .play() starts playing immediately (returns a Promise but we don't need to await it here).
  new Audio(url).play()
}
