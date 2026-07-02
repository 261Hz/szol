import { ref, onUnmounted } from 'vue'
import { transcribeAudio, onWhisperProgress } from '../utils/localWhisper.js'

export function useWhisper() {
  // phase: 'idle' | 'fetching' | 'decoding' | 'model' | 'transcribing' | 'done' | 'error'
  const phase         = ref('idle')
  const modelPct      = ref(0)
  const transcribePct = ref(0)
  const errorMsg      = ref('')

  let modelFiles = { total: 0, done: 0 }

  const removeListener = onWhisperProgress((data) => {
    if (data.type === 'model_progress') {
      const { status, progress } = data.info
      if (status === 'initiate') { modelFiles.total++; phase.value = 'model' }
      if (status === 'progress') modelPct.value = Math.round(progress ?? 0)
      if (status === 'done') {
        modelFiles.done++
        if (modelFiles.done >= modelFiles.total) modelPct.value = 100
      }
    }
    if (data.type === 'chunk_done') {
      if (phase.value !== 'transcribing') phase.value = 'transcribing'
      const pct = data.totalChunks
        ? Math.round((data.chunksProcessed / data.totalChunks) * 100)
        : 0
      transcribePct.value = Math.min(99, pct)
    }
  })

  onUnmounted(removeListener)

  async function transcribe(audioUrl, lang) {
    phase.value         = 'idle'
    modelPct.value      = 0
    transcribePct.value = 0
    errorMsg.value      = ''
    modelFiles          = { total: 0, done: 0 }

    try {
      const segments = await transcribeAudio(audioUrl, lang, (p) => { phase.value = p })
      transcribePct.value = 100
      phase.value = 'done'
      return segments
    } catch (e) {
      errorMsg.value = e.message
      phase.value    = 'error'
      return null
    }
  }

  function reset() {
    phase.value = 'idle'
    errorMsg.value = ''
    modelPct.value = 0
    transcribePct.value = 0
  }

  return { phase, modelPct, transcribePct, errorMsg, transcribe, reset }
}
