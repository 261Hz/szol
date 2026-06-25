// NOTE: This file is not currently used anywhere in the app -- it was built but then
// the app switched to using TTS (text-to-speech) for word lookup instead of definitions.
// It is kept here in case dictionary lookups are added back later.

// clean() removes HTML tags and extra spaces from a string.
// Some dictionary APIs return text wrapped in HTML like <b>word</b> -- this strips that out.
function clean(str) {
  let out = str
  let prev
  do { prev = out; out = out.replace(/<[^<>]*>/g, '') } while (out !== prev)
  return out.replace(/\s+/g, ' ').trim()
}

// isUseful() checks whether a dictionary result is worth showing to the user.
// It filters out useless results like "ISO 639 code" or "abbreviation".
function isUseful(result) {
  // ?. is "optional chaining" -- if result is null/undefined, this returns undefined instead of crashing.
  if (!result?.definition) return false // if there's no definition at all, it's not useful
  // List of phrases that indicate a useless dictionary entry.
  const bad = ['ISO 639', 'language code', 'alternative spelling', 'initialism', 'abbreviation']
  // .some() returns true if AT LEAST ONE item in the array passes the test.
  // Here: returns true if any "bad" phrase appears in the definition.
  // .toLowerCase() on both sides makes the check case-insensitive.
  return !bad.some(x => result.definition.toLowerCase().includes(x.toLowerCase()))
  // The ! (NOT operator) flips the result: "not useful if any bad phrase found" = "useful if none found"
}

// fromMoedict() looks up a Chinese word in MOEDict (Ministry of Education Dictionary, Taiwan).
// "async" means the function is asynchronous -- it pauses at "await" until data arrives.
async function fromMoedict(word) {
  // fetch() makes an HTTP GET request to a URL. encodeURIComponent() encodes special characters
  // so they're safe in a URL (e.g. spaces become %20).
  const r = await fetch(`https://www.moedict.tw/api/${encodeURIComponent(word)}`)
  // .ok is true if the HTTP response was successful (status 200-299). If not, throw an error.
  if (!r.ok) throw new Error()
  // .json() parses the response body as JSON. "await" waits for this to finish.
  const d = await r.json()
  // ?. (optional chaining): safely navigate nested properties. If any part is null, return undefined.
  // [0] gets the first item in an array.
  const defs = d.heteronyms?.[0]?.definitions
  // If there are no definitions, throw an error to signal "not found".
  if (!defs?.length) throw new Error()
  const entry = defs[0] // take the first definition
  // Return a standardized result object. || '' means "use empty string if the value is null/undefined".
  return {
    word,                                       // the word that was looked up
    pos:        entry.type || '',               // part of speech (noun, verb, etc.)
    definition: entry.def?.replace(/`/g, '') || '', // definition text, with backticks removed
    example:    entry.quote?.[0] || '',         // example sentence (first quote if available)
    source:     'moedict',                      // which dictionary provided this
  }
}

// fromFreeDictionary() looks up an English word using the Free Dictionary API.
async function fromFreeDictionary(word) {
  const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
  if (!r.ok) throw new Error()
  const data = await r.json()
  // data[0] is the first entry. .meanings is the list of meanings (noun senses, verb senses, etc.).
  const meanings = data[0]?.meanings
  if (!meanings?.length) throw new Error()

  // Try to find a specific part of speech in order of preference: adjective → verb → noun.
  // This gives more interesting definitions than always taking the first one.
  const preferred = ['adjective', 'verb', 'noun']
  let meaning = null // "let" because we'll reassign it inside the loop
  for (const pos of preferred) {
    // for...of loops over each item in an array. Here "pos" is 'adjective', then 'verb', then 'noun'.
    meaning = meanings.find(m => m.partOfSpeech === pos)
    if (meaning) break // found a preferred part of speech -- stop searching
  }
  if (!meaning) meaning = meanings[0] // no preferred match, just use the first meaning

  // Prefer a definition that comes with an example sentence. ?? falls back to the first definition.
  const def = meaning.definitions.find(d => d.example) ?? meaning.definitions[0]
  if (!def) throw new Error()

  return {
    word,
    pos:        meaning.partOfSpeech,
    definition: def.definition,
    example:    def.example || '',
    source:     'freedictionary',
  }
}

// fromWiktionary() looks up a word on Wiktionary (the free multilingual dictionary).
// "lang" tells it which language's Wiktionary to use ('es' = Spanish Wiktionary, 'zh' = Chinese, etc.).
async function fromWiktionary(word, lang) {
  // Egyptian Arabic (arz) doesn't have its own Wiktionary, so use Arabic (ar) instead.
  const wikiLang = lang === 'arz' ? 'ar' : lang
  // Build the URL using template literals (backtick strings with ${} placeholders).
  const r = await fetch(`https://${wikiLang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
  if (!r.ok) throw new Error()
  const d = await r.json()
  // The response is keyed by language code. Try the expected key, then fall back to whatever's there.
  // Object.values(d)[0] gets the first value in the object regardless of key.
  const entries = d[wikiLang] || Object.values(d)[0] || []
  if (!entries.length) throw new Error()
  const entry = entries[0]           // first entry
  const def   = entry.definitions?.[0] // first definition within that entry
  return {
    word,
    pos:        entry.partOfSpeech || '',
    // Remove HTML tags from the definition and example text.
    definition: def?.definition ? clean(def.definition) : '' || '',
    example:    def?.examples?.[0] ? clean(def.examples[0]) : '' || '',
    source:     `wiktionary-${wikiLang}`, // e.g. 'wiktionary-es' for Spanish Wiktionary
  }
}

// fromRAE() looks up a Spanish word in RAE (Real Academia Española -- Spain's official dictionary authority).
async function fromRAE(word) {
  try {
    // This is an unofficial community API -- not the official RAE website.
    const r = await fetch(`https://rae-api.com/api/words/${encodeURIComponent(word)}`)
    if (!r.ok) return null // return null (not throw) because this is a soft failure
    const d = await r.json()
    // .ok is a field in the API response (not the HTTP status). Check if the API found a result.
    if (!d.ok || !d.data?.meanings?.length) return null
    // Find a meaning that has senses (actual definition content). ?? falls back to first meaning.
    const meaning = d.data.meanings.find(m => m.senses?.length) ?? d.data.meanings[0]
    // Find a sense with a description. ?. safely accesses nested properties.
    const sense   = meaning.senses?.find(s => s.description) ?? meaning.senses?.[0]
    if (!sense?.description) return null
    return {
      word:       d.data.word ?? word,          // use the dictionary's canonical spelling, or the input
      pos:        sense.category ?? '',         // e.g. "m." (masculine noun in Spanish)
      definition: clean(sense.description),     // strip HTML from definition
      example:    clean(sense.examples?.[0] ?? ''), // first example sentence, or empty string
      source:     'rae',
    }
  } catch { return null } // if anything goes wrong, silently return null
}

// lookupWord() is the main public function -- it tries multiple dictionaries in order
// and returns the first good result, or null if nothing worked.
export async function lookupWord(word, lang) {
  // chain is a list of functions to try in order.
  // Each item is an "arrow function" () => that calls one of the lookup functions above.
  // We use functions here (not direct calls) so we can try them one at a time lazily.
  const chain = []

  if (lang === 'zh-TW') {
    // Traditional Chinese: MOEDict (Taiwan Ministry of Education) first, then Wiktionary.
    chain.push(() => fromMoedict(word))
    chain.push(() => fromWiktionary(word, 'zh'))
  } else if (lang === 'zh') {
    // Simplified Chinese: Chinese Wiktionary.
    chain.push(() => fromWiktionary(word, 'zh'))
  } else if (lang === 'en') {
    // For English: Free Dictionary API first, then English Wiktionary.
    chain.push(() => fromFreeDictionary(word))
    chain.push(() => fromWiktionary(word, 'en'))
  } else if (lang === 'es') {
    // For Spanish: RAE first, then Spanish Wiktionary, then English Wiktionary as last resort.
    chain.push(() => fromRAE(word))
    chain.push(() => fromWiktionary(word, 'es'))
    chain.push(() => fromWiktionary(word, 'en'))
  } else {
    // For all other languages: try their native Wiktionary, then English Wiktionary as fallback.
    chain.push(() => fromWiktionary(word, lang))
    chain.push(() => fromWiktionary(word, 'en'))
  }

  // Loop through each provider function in the chain and try it.
  for (const provider of chain) {
    try {
      // Call the provider function. await waits for the network request to finish.
      const result = await provider()
      // If the result is useful (not a junk entry), return it immediately.
      if (isUseful(result)) return result
    } catch {
      // This provider failed (network error, word not found, etc.). Try the next one.
    }
  }

  // All providers failed or returned junk. Return null to signal "no definition found".
  return null
}
