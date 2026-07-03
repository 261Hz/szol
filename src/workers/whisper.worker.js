import { pipeline, env, WhisperTextStreamer } from '@huggingface/transformers'

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

let transcriber = null

async function load() {
  if (transcriber) return

  let device = 'wasm'
  try {
    if (navigator?.gpu) {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter) device = 'webgpu'
    }
  } catch {}

  // whisper-small on WebGPU: better multilingual accuracy.
  //   fp16 encoder: ~170 MB download vs fp32's ~340 MB
  // whisper-base on WASM: fits memory budget; q4 kernels are unreliable on WASM → q8
  const model = device === 'webgpu'
    ? 'onnx-community/whisper-small'
    : 'onnx-community/whisper-base'

  const dtype = device === 'webgpu'
    ? { encoder_model: 'fp16', decoder_model_merged: 'q4' }
    : { encoder_model: 'fp32', decoder_model_merged: 'q8' }

  transcriber = await pipeline('automatic-speech-recognition', model, {
    dtype,
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
    // timeOffset: seconds to add to all returned timestamps (per-segment transcription)
    // chunksOffset: chunk count already processed by prior segments (cumulative progress)
    const { audio, samplingRate, lang, totalChunks, chunksOffset = 0, timeOffset = 0 } = data
    try {
      await load()

      const pcm         = new Float32Array(audio)
      const whisperLang = WHISPER_LANG[lang] ?? null
      let chunksProcessed = 0

      const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
        on_chunk_end: () => {
          chunksProcessed++
          self.postMessage({
            type: 'chunk_done',
            chunksProcessed: chunksOffset + chunksProcessed,
            totalChunks,
          })
        },
      })

      const result = await transcriber(
        pcm,
        {
          language:          whisperLang,
          task:              'transcribe',
          return_timestamps: true,
          chunk_length_s:    30,
          stride_length_s:   5,
          streamer,
        },
      )

      const segments = (result.chunks ?? [])
        .map(c => ({
          start: (c.timestamp[0] ?? 0) + timeOffset,
          end:   (c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 30) + timeOffset,
          text:  c.text.trim(),
        }))
        .filter(s => s.text)

      self.postMessage({ id, type: 'result', segments })
    } catch (e) {
      self.postMessage({ id, type: 'error', error: e.message })
    }
  }
}
