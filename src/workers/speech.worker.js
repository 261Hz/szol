import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache  = true

// Whisper language code overrides for app lang codes
const LANG = { 'zh-TW': 'zh', 'arz': 'ar' }

let pipe = null

self.onmessage = async ({ data }) => {
  const { id, msgType, audio, lang } = data
  try {
    if (!pipe) {
      pipe = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-small', {
        dtype: 'q8',
        progress_callback: info => self.postMessage({ id, type: 'progress', info }),
      })
    }
    if (msgType === 'load') {
      self.postMessage({ id, type: 'result', result: '' })
      return
    }
    const out = await pipe(audio, {
      language: LANG[lang] ?? lang,
      task: 'transcribe',
      chunk_length_s: 30,
    })
    self.postMessage({ id, type: 'result', result: out.text.trim() })
  } catch (e) {
    self.postMessage({ id, type: 'error', error: e.message })
  }
}
