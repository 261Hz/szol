import { ref } from 'vue'

// Whisper language codes
const LANG_MAP = {
  ar: 'arabic',  he: 'hebrew',   en: 'english',  de: 'german',
  fr: 'french',  es: 'spanish',  it: 'italian',  pt: 'portuguese',
  ru: 'russian', zh: 'chinese',  'zh-TW': 'chinese', ja: 'japanese', ko: 'korean',
  nl: 'dutch',   pl: 'polish',   sv: 'swedish',  tr: 'turkish',
  el: 'greek',   hu: 'hungarian',
}

// Singleton — pipeline loads once, survives navigation
let _pipelinePromise = null

export function useTranscribe() {
  const stage = ref('idle')   // idle | loading | transcribing | done | error
  const pct   = ref(0)        // 0–100
  const error = ref(null)

  async function transcribe(audioUrl, lang) {
    stage.value = 'loading'
    pct.value   = 0
    error.value = null

    try {
      const { pipeline } = await import('@huggingface/transformers')

      if (!_pipelinePromise) {
        _pipelinePromise = pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-small',
          {
            // q4 decoder keeps the download to ~80 MB while the encoder stays fp32 for accuracy
            dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
            progress_callback(p) {
              if (p.status === 'downloading') {
                const loaded = p.loaded ?? 0
                const total  = p.total  ?? 1
                pct.value = Math.min(28, Math.round((loaded / total) * 28))
              } else if (p.status === 'loaded') {
                pct.value = 30
              }
            },
          }
        )
      }

      const transcriber = await _pipelinePromise
      stage.value = 'transcribing'
      pct.value   = 30

      const result = await transcriber(audioUrl, {
        language:         LANG_MAP[lang] ?? null,
        task:             'transcribe',
        return_timestamps: true,
        chunk_length_s:   30,
        stride_length_s:  5,
        callback_function(chunks) {
          // Advance progress bar as chunks arrive (30–95%)
          if (!Array.isArray(chunks) || !chunks.length) return
          const last = chunks[chunks.length - 1]
          const end  = last?.timestamp?.[1]
          if (end) pct.value = Math.min(95, 30 + Math.round(end * 0.5))
        },
      })

      stage.value = 'done'
      pct.value   = 100

      // Convert HF chunks → ListenView segments [{start, end, text}]
      const chunks = result.chunks ?? []
      if (chunks.length) {
        return chunks
          .map(c => ({
            start: c.timestamp?.[0] ?? 0,
            end:   c.timestamp?.[1] ?? 0,
            text:  c.text?.trim() ?? '',
          }))
          .filter(s => s.text)
      }

      // Fallback: single segment (no timestamps)
      const text = result.text?.trim() ?? ''
      return text ? [{ start: 0, end: 0, text }] : null

    } catch (e) {
      stage.value = 'error'
      error.value = e.message ?? String(e)
      _pipelinePromise = null   // allow retry on next call
      return null
    }
  }

  function reset() {
    stage.value = 'idle'
    pct.value   = 0
    error.value = null
  }

  return { transcribe, reset, stage, pct, error }
}
