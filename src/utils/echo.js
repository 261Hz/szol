import { normalize } from './scoring.js'

/**
 * createVocabBank — wraps the existing vocabBank array in the interface
 * the Echo Engine expects: getTags(text) → known words that appear in text.
 *
 * Tags are normalized word forms that exist in the user's saved vocabulary.
 * getLemma is identity for now — a real lemmatizer can replace it later
 * without changing any call sites.
 */
export function createVocabBank(vocabEntries, lang) {
  const known = new Set(
    vocabEntries
      .filter(v => v.lang === lang)
      .map(v => normalize(v.word))
      .filter(Boolean)
  )

  return {
    getTags(text) {
      return [...new Set(
        text.split(/\s+/)
          .map(normalize)
          .filter(w => w && known.has(w))
      )]
    },
    getLemma(text) {
      return text.split(/\s+/).map(normalize).filter(Boolean)
    },
  }
}

/**
 * buildEchoIndex — walks all exposures and builds two lookup tables:
 *
 *   byChunk  — chunkId → EchoEvent[]
 *              answers: "where else does this exact chunk appear?"
 *
 *   byTag    — normalizedWord → EchoEvent[]
 *              answers: "which chunks contain this known word?"
 *
 * This index is the stable spine the Echo Trigger System queries.
 */
export function buildEchoIndex(exposures, vocabBank) {
  const byChunk = {}   // Record<chunkId, EchoEvent[]>
  const byTag   = {}   // Record<normalizedWord, EchoEvent[]>

  for (const exp of exposures) {
    for (const line of exp.lines) {
      for (let i = 0; i < line.chunks.length; i++) {
        const chunk   = line.chunks[i]
        const chunkId = `${exp.id}:${line.id}:${i}`
        const tags    = vocabBank.getTags(chunk.text)

        const event = {
          exposureId:  exp.id,
          lineId:      line.id,
          chunkIndex:  i,
          chunkId,
          lastSeenAt:  null,      // updated when user actually encounters this
          strength:    0,         // 0 = unseen, increments on each encounter
          triggers:    tags,
          text:        chunk.text,
          language:    exp.language,
        }

        if (!byChunk[chunkId]) byChunk[chunkId] = []
        byChunk[chunkId].push(event)

        for (const tag of tags) {
          if (!byTag[tag]) byTag[tag] = []
          byTag[tag].push(event)
        }
      }
    }
  }

  return { byChunk, byTag }
}

/**
 * queryEchoes — given an exposure and the index, returns all EchoEvents
 * whose tags overlap with any tag found in the exposure's chunks.
 * Excludes the exposure itself. Sorted by overlap count (most relevant first).
 *
 * This is what powers the "you saw this before" margin layer.
 */
export function queryEchoes(exposure, index) {
  const ownTags = new Set(
    exposure.lines.flatMap(l => l.chunks.flatMap(c => c.tags))
  )
  if (!ownTags.size) return []

  const seen    = new Set()
  const results = []

  for (const tag of ownTags) {
    const events = index.byTag[tag] ?? []
    for (const ev of events) {
      if (ev.exposureId === exposure.id) continue
      if (seen.has(ev.chunkId)) continue
      seen.add(ev.chunkId)
      results.push({ ...ev, matchedTag: tag })
    }
  }

  // most overlap first
  results.sort((a, b) => {
    const scoreB = b.triggers.filter(t => ownTags.has(t)).length
    const scoreA = a.triggers.filter(t => ownTags.has(t)).length
    return scoreB - scoreA
  })

  return results
}
