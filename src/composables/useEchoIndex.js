import { ref, computed, watch } from 'vue'
import { parseExposure } from '../utils/exposure.js'
import { createVocabBank, buildEchoIndex, queryEchoes } from '../utils/echo.js'

/**
 * useEchoIndex — maintains a live EchoIndex derived from the current story pool
 * and vocab bank. Rebuilds whenever either changes.
 *
 * Returns:
 *   index        — the raw { byChunk, byTag } lookup tables
 *   exposures    — parsed Exposure[] (stable structural spines)
 *   echoesFor(story) — EchoEvent[] relevant to a given story, sorted by overlap
 */
export function useEchoIndex(storyPool, vocabBank, lang) {
  const index     = ref({ byChunk: {}, byTag: {} })
  const exposures = ref([])

  function rebuild() {
    const pool = storyPool.value ?? []
    const bank = vocabBank.value ?? []
    const l    = lang.value

    if (!pool.length) return

    const parsed = pool
      .filter(s => s.lang === l)
      .map(parseExposure)

    const vb = createVocabBank(bank, l)

    // tag each chunk before indexing
    for (const exp of parsed) {
      for (const line of exp.lines) {
        for (const chunk of line.chunks) {
          chunk.tags = vb.getTags(chunk.text)
        }
      }
    }

    exposures.value = parsed
    index.value     = buildEchoIndex(parsed, vb)
  }

  watch([storyPool, vocabBank, lang], rebuild, { deep: false, immediate: true })

  function echoesFor(story) {
    if (!story) return []
    const exp = exposures.value.find(e => e.id === story.id)
    if (!exp) return []
    return queryEchoes(exp, index.value)
  }

  return { index, exposures, echoesFor }
}
