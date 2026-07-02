import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache  = true

// Multilingual base — never use .en suffix for a language-learning app
const MODEL = 'onnx-community/whisper-base'

// Map app lang codes → Whisper language names (ISO 639-1 also accepted by v4)
const WHISPER_LANG = {
  en: 'english',    es: 'spanish',    fr: 'french',      de: 'german',
  it: 'italian',    pt: 'portuguese', ru: 'russian',     ja: 'japanese',
  zh: 'chinese',    'zh-TW': 'chinese', ar: 'arabic',   he: 'hebrew',
  ko: 'korean',     nl: 'dutch',      pl: 'polish',      sv: 'swedish',
  tr: 'turkish',    hu: 'hungarian',  el: 'greek',       cs: 'czech',
  ro: 'romanian',   uk: 'ukrainian',  fi: 'finnish',     da: 'danish',
  id: 'indonesian', hi: 'hindi',      bg: 'bulgarian',
}

let transcriber = null

async function load() {
  if (transcriber) return

  // Try WebGPU (several-x faster on a decent GPU), fall back to WASM
  let device = 'wasm'
  try {
    if (navigator?.gpu) {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) device = 'webgpu'
    }
  } catch {}

  transcriber = await pipeline('automatic-speech-recognition', MODEL, {
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    device,
    progress_callback: (info) => self.postMessage({ type: 'model_progress', info }),
  })
}

self.onmessage = async ({ data }) => {
  const { id, type } = data

  if (type === 'load') {
    try {
      await load()
      self.postMessage({ id, type: 'ready' })
    } catch (e) {
      self.postMessage({ id, type: 'error', error: e.message })
    }
    return
  }

  if (type === 'transcribe') {
    const { audio, samplingRate, lang, totalChunks } = data
    try {
      await load()

      const pcm          = new Float32Array(audio)
      const whisperLang  = WHISPER_LANG[lang] ?? null
      let chunksProcessed = 0

      const result = await transcriber(
        { array: pcm, sampling_rate: samplingRate },
        {
          language:          whisperLang,
          task:              'transcribe',
          return_timestamps: true,
          chunk_length_s:    30,
          stride_length_s:   5,
          // fires once per processed chunk (not per token) in long-form mode
          callback_function: () => {
            chunksProcessed++
            self.postMessage({ type: 'chunk_done', chunksProcessed, totalChunks })
          },
        },
      )

      const segments = (result.chunks ?? [])
        .map(c => ({
          start: c.timestamp[0] ?? 0,
          end:   c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 30,
          text:  c.text.trim(),
        }))
        .filter(s => s.text)

      self.postMessage({ id, type: 'result', segments })
    } catch (e) {
      self.postMessage({ id, type: 'error', error: e.message })
    }
  }
}
