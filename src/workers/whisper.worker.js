import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache  = true

const WHISPER_LANG = {
  en: 'english',    es: 'spanish',    fr: 'french',      de: 'german',
  it: 'italian',    pt: 'portuguese', ru: 'russian',     ja: 'japanese',
  zh: 'chinese',    'zh-TW': 'chinese', ar: 'arabic',   he: 'hebrew',
  ko: 'korean',     nl: 'dutch',      pl: 'polish',      sv: 'swedish',
  tr: 'turkish',    hu: 'hungarian',  el: 'greek',       cs: 'czech',
  ro: 'romanian',   uk: 'ukrainian',  fi: 'finnish',     da: 'danish',
  id: 'indonesian', hi: 'hindi',      bg: 'bulgarian',
}

let transcriber     = null
let cancelRequested = false

async function load() {
  if (transcriber) return

  let device = 'wasm'
  try {
    if (navigator?.gpu) {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) device = 'webgpu'
    }
  } catch {}

  // whisper-small on WebGPU: meaningfully better multilingual WER (~240 MB)
  // whisper-base on WASM: fits comfortably, q4 kernels are unreliable on WASM so use q8
  const model = device === 'webgpu'
    ? 'onnx-community/whisper-small'
    : 'onnx-community/whisper-base'

  const dtype = {
    encoder_model:        'fp32',
    decoder_model_merged: device === 'webgpu' ? 'q4' : 'q8',
  }

  transcriber = await pipeline('automatic-speech-recognition', model, {
    dtype,
    device,
    progress_callback: (info) => self.postMessage({ type: 'model_progress', info }),
  })
}

self.onmessage = async ({ data }) => {
  const { id, type } = data

  if (type === 'cancel') {
    cancelRequested = true
    return
  }

  if (type === 'load') {
    cancelRequested = false
    try {
      await load()
      self.postMessage({ id, type: 'ready' })
    } catch (e) {
      self.postMessage({ id, type: 'error', error: e.message })
    }
    return
  }

  if (type === 'transcribe') {
    cancelRequested = false
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
          // chunk_callback fires once per 30-s audio window — correct for progress %
          // callback_function fires per decode token — wrong for progress, causes spam
          chunk_callback: () => {
            chunksProcessed++
            self.postMessage({ type: 'chunk_done', chunksProcessed, totalChunks })
            if (cancelRequested) throw new Error('CANCELLED')
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
