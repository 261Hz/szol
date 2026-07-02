import { ref, onUnmounted } from 'vue'
import { transcribeAudio, onWhisperProgress, cancelCurrentTranscription } from '../utils/localWhisper.js'

export function useWhisper() {
  const phase            = ref('idle')
  const modelPct         = ref(0)
  const transcribePct    = ref(0)
  const errorMsg         = ref('')
  const sizeWarning      = ref(0)     // estimated minutes for AAC warning (0 = none)
  const needsSizeConfirm = ref(false) // true while waiting for user to approve large fetch

  let modelFiles          = { total: 0, done: 0 }
  let _sizeConfirmResolve = null

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

  onUnmounted(() => { removeListener(); cancel() })

  // episodeDurationSecs: pass audioEl.duration (or itunes:duration) so the AAC memory
  // cap is accurate. Without it we estimate from file size ÷ 128 kbps, which
  // under-counts 64 kbps feeds by 2× and can let large episodes slip through.
  async function transcribe(audioUrl, lang, episodeDurationSecs) {
    // Abort any in-progress run before starting a new one.
    _sizeConfirmResolve?.(false)
    _sizeConfirmResolve = null
    needsSizeConfirm.value = false
    cancelCurrentTranscription()

    // Use 'fetching' immediately — skips the 'idle' flash that would briefly
    // re-show the Whisper button and allow a second concurrent click.
    phase.value         = 'fetching'
    modelPct.value      = 0
    transcribePct.value = 0
    errorMsg.value      = ''
    sizeWarning.value   = 0
    modelFiles          = { total: 0, done: 0 }

    try {
      const segments = await transcribeAudio(audioUrl, lang, async (p, extra) => {
        if (p === 'size_warning') {
          sizeWarning.value      = extra?.estimatedMins ?? 0
          needsSizeConfirm.value = true
          // Suspend here until the user confirms or cancels — the audio fetch has not
          // started yet, so returning false aborts cleanly without having downloaded anything.
          const proceed = await new Promise(resolve => { _sizeConfirmResolve = resolve })
          needsSizeConfirm.value = false
          if (!proceed) return false   // signals localWhisper to throw CANCELLED
          return
        }
        phase.value = p
      }, episodeDurationSecs)

      transcribePct.value = 100
      phase.value = 'done'
      return segments
    } catch (e) {
      if (e.message === 'CANCELLED') {
        phase.value = 'idle'
        return null
      }
      errorMsg.value = e.message
      phase.value    = 'error'
      return null
    }
  }

  // User clicked "Continue" on the large-episode warning
  function confirmLargeEpisode() {
    _sizeConfirmResolve?.(true)
    _sizeConfirmResolve = null
  }

  // User clicked "Cancel" on the large-episode warning
  function rejectLargeEpisode() {
    _sizeConfirmResolve?.(false)
    _sizeConfirmResolve = null
  }

  function cancel() {
    // Resolve any suspended size confirmation so the promise chain unblocks
    _sizeConfirmResolve?.(false)
    _sizeConfirmResolve = null
    needsSizeConfirm.value = false
    cancelCurrentTranscription()
    phase.value         = 'idle'
    errorMsg.value      = ''
    modelPct.value      = 0
    transcribePct.value = 0
    sizeWarning.value   = 0
  }

  function reset() { cancel() }

  return {
    phase, modelPct, transcribePct, errorMsg,
    sizeWarning, needsSizeConfirm,
    transcribe, reset, cancel,
    confirmLargeEpisode, rejectLargeEpisode,
  }
}
