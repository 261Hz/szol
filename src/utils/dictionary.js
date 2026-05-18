function clean(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function isUseful(result) {
  if (!result?.definition) return false
  const bad = ['ISO 639', 'language code', 'alternative spelling', 'initialism', 'abbreviation']
  return !bad.some(x => result.definition.toLowerCase().includes(x.toLowerCase()))
}

async function fromMoedict(word) {
  const r = await fetch(`https://www.moedict.tw/api/${encodeURIComponent(word)}`)
  if (!r.ok) throw new Error()
  const d = await r.json()
  const defs = d.heteronyms?.[0]?.definitions
  if (!defs?.length) throw new Error()
  const entry = defs[0]
  return {
    word,
    pos: entry.type || '',
    definition: entry.def?.replace(/`/g, '') || '',
    example: entry.quote?.[0] || '',
    source: 'moedict',
  }
}

async function fromFreeDictionary(word) {
  const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
  if (!r.ok) throw new Error()
  const data = await r.json()
  const meaning = data[0]?.meanings?.[0]
  const def = meaning?.definitions?.[0]
  if (!def) throw new Error()
  return {
    word,
    pos: meaning?.partOfSpeech || '',
    definition: def.definition || '',
    example: def.example || '',
    source: 'freedictionary',
  }
}

async function fromWiktionary(word, lang) {
  const wikiLang = lang === 'arz' ? 'ar' : lang
  const r = await fetch(`https://${wikiLang}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
  if (!r.ok) throw new Error()
  const d = await r.json()
  const entries = d[wikiLang] || Object.values(d)[0] || []
  if (!entries.length) throw new Error()
  const entry = entries[0]
  const def = entry.definitions?.[0]
  return {
    word,
    pos: entry.partOfSpeech || '',
    definition: def?.definition?.replace(/<[^>]+>/g, '') || '',
    example: def?.examples?.[0]?.replace(/<[^>]+>/g, '') || '',
    source: `wiktionary-${wikiLang}`,
  }
}

async function fromRAE(word) {
  try {
    const r = await fetch(`https://rae-api.com/api/words/${encodeURIComponent(word)}`)
    if (!r.ok) return null
    const d = await r.json()
    if (!d.ok || !d.data?.meanings?.length) return null
    const meaning = d.data.meanings.find(m => m.senses?.length) ?? d.data.meanings[0]
    const sense = meaning.senses?.find(s => s.description) ?? meaning.senses?.[0]
    if (!sense?.description) return null
    return {
      word: d.data.word ?? word,
      pos: sense.category ?? '',
      definition: clean(sense.description),
      example: clean(sense.examples?.[0] ?? ''),
      source: 'rae',
    }
  } catch { return null }
}

export async function lookupWord(word, lang) {
  const chain = []

  if (lang === 'zh') {
    chain.push(() => fromMoedict(word))
    chain.push(() => fromWiktionary(word, 'zh'))
  } else if (lang === 'en') {
    chain.push(() => fromFreeDictionary(word))
    chain.push(() => fromWiktionary(word, 'en'))
  } else if (lang === 'es') {
    chain.push(() => fromRAE(word))
    chain.push(() => fromWiktionary(word, 'es'))
    chain.push(() => fromWiktionary(word, 'en'))
  } else {
    chain.push(() => fromWiktionary(word, lang))
    chain.push(() => fromWiktionary(word, 'en'))
  }

  for (const provider of chain) {
    try {
      const result = await provider()
      if (isUseful(result)) return result
    } catch {
      // try next provider
    }
  }

  return null
}
