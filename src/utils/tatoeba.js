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
  zh:      'cmn', // Simplified Mandarin Chinese
  'zh-TW': 'cmn', // Traditional Mandarin Chinese (same corpus)
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
  const url = `/api/tatoeba?query=${encodeURIComponent(word)}&from=${code}&native_lang=${code}&limit=12`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const raw = data.results ?? []
    return scoreSentences(raw, word).slice(0, 5)
  } catch {
    return []
  }
}

// scoreSentences() filters and ranks Tatoeba results using GDEX-inspired criteria:
//   - Knock-outs: too short, too long, no finite structure, mostly non-letters
//   - Bonuses: has audio, optimal length, word appears prominently
// Returns results sorted best-first.
function scoreSentences(sentences, word) {
  const norm = word.toLowerCase()

  return sentences
    .map(s => {
      const text   = s.text ?? ''
      const words  = text.trim().split(/\s+/)
      const wcount = words.length

      // ── Knock-out criteria (score 0 = filtered out) ──────────────────────
      if (wcount < 4)  return null                        // too short to be useful
      if (wcount > 30) return null                        // too long to read comfortably
      if (!/\p{L}/u.test(text)) return null               // no letters at all
      if (/^[A-Z\s]+$/.test(text)) return null            // ALL CAPS (usually a title/header)
      const letterRatio = (text.match(/\p{L}/gu) ?? []).length / text.length
      if (letterRatio < 0.5) return null                  // mostly numbers/punctuation

      // ── Gradual scoring ───────────────────────────────────────────────────
      let score = 0.5

      // Prefer sentences with audio recordings (native pronunciation available)
      if (s.audios?.length) score += 0.2

      // Optimal length 8–18 words
      if (wcount >= 8 && wcount <= 18) score += 0.15
      else if (wcount >= 5 && wcount <= 25) score += 0.05

      // Word appears as a standalone token (not buried inside another word)
      const containsWord = words.some(w => w.toLowerCase().replace(/\p{P}/gu, '') === norm)
      if (containsWord) score += 0.1

      // Ends with proper sentence-final punctuation
      if (/[.!?。！？؟]$/.test(text.trim())) score += 0.05

      // Penalise sentences that are mostly a dialogue cue ("- Yes.", "— Okay!")
      if (/^[-—]/.test(text.trim()) && wcount < 6) score -= 0.3

      return { ...s, _score: score }
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
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
