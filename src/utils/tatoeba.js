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
  // Look up the 3-letter Tatoeba code for this language (e.g. 'es' → 'spa').
  const code = TATOEBA_LANG[lang]
  if (!code) return [] // unsupported language -- return empty silently

  // Call our own proxy endpoint instead of Tatoeba directly.
  // A relative URL (/api/tatoeba) works in both environments:
  //   local dev  → Vite proxies it to tatoeba.org (see vite.config.js server.proxy)
  //   production → Vercel routes it to api/tatoeba.js (serverless function)
  // This avoids the CORS error: Tatoeba blocks browser requests but not server-to-server ones.
  //
  // native_lang=code restricts results to sentences originally written in this language
  // (not machine translations), giving more natural example sentences.
  const url = `/api/tatoeba?query=${encodeURIComponent(word)}&from=${code}&native_lang=${code}&limit=4`
  try {
    const res = await fetch(url)  // res = the HTTP response object
    if (!res.ok) return []        // non-200 status (e.g. 500 from our proxy) -- return empty
    const data = await res.json() // parse the response body as JSON
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
