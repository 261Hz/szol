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
    // timeOffset: seconds already transcribed before this 20 MB segment
    // totalSecs:  full episode duration (for progress %)
    const { audio, samplingRate, lang, totalSecs, timeOffset = 0 } = data
    try {
      await load()

      const pcm         = new Float32Array(audio)
      const whisperLang = WHISPER_LANG[lang] ?? null
      let maxTime = 0  // highest timestamp seen so far in this segment

      const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
        callback_function: () => {},  // silence the default stdout-write per token
        on_chunk_end: (time) => {
          // time is seconds within this segment; add timeOffset for episode position
          maxTime = Math.max(maxTime, time ?? 0)
          self.postMessage({ type: 'chunk_done', seconds: timeOffset + maxTime, totalSecs })
        },
      })

      const result = await transcriber(
        pcm,
        {
          language:             whisperLang,
          task:                 'transcribe',
          return_timestamps:    true,
          chunk_length_s:       30,
          stride_length_s:      5,
          repetition_penalty:   1.15,
          no_repeat_ngram_size: 3,
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
