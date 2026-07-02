// Singleton Whisper worker + main-thread audio decode/resample.
// Audio fetching and AudioContext work happen here (not in the worker).

let worker = null
let seq    = 1
const pending   = new Map()
const listeners = new Set()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/whisper.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const { id, type } = data
    if (type === 'model_progress' || type === 'chunk_done') {
      listeners.forEach(fn => fn(data))
      return
    }
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (type === 'result') p.resolve(data.segments)
    else if (type === 'ready')  p.resolve(true)
    else p.reject(new Error(data.error || 'Whisper worker error'))
  }
  worker.onerror = (e) => {
    pending.forEach(p => p.reject(new Error(e.message || 'Whisper worker crashed')))
    pending.clear()
    worker = null
  }
  return worker
}

export function onWhisperProgress(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Decode any browser-supported audio format to 16 kHz mono Float32.
// AudioContext / OfflineAudioContext are main-thread only — keep this here.
async function decodeAudioTo16k(arrayBuffer) {
  const audioCtx    = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const inputRate   = audioBuffer.sampleRate
  const channels    = audioBuffer.numberOfChannels
  audioCtx.close()

  // Downmix to mono
  const mono = new Float32Array(audioBuffer.length)
  for (let i = 0; i < audioBuffer.length; i++) {
    let s = 0
    for (let c = 0; c < channels; c++) s += audioBuffer.getChannelData(c)[i]
    mono[i] = s / channels
  }

  if (inputRate === 16000) return { pcm: mono, samplingRate: 16000 }

  // Resample to 16 kHz via OfflineAudioContext (browser-native quality)
  const targetRate  = 16000
  const offlineCtx  = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetRate), targetRate)
  const monoBuf     = new AudioBuffer({ length: mono.length, sampleRate: inputRate, numberOfChannels: 1 })
  monoBuf.copyToChannel(mono, 0)
  const src = offlineCtx.createBufferSource()
  src.buffer = monoBuf
  src.connect(offlineCtx.destination)
  src.start(0)
  const rendered = await offlineCtx.startRendering()
  return { pcm: rendered.getChannelData(0), samplingRate: 16000 }
}

// Main entry point. onPhase('fetching'|'decoding'|'transcribing') lets callers
// show granular status without polling.
export async function transcribeAudio(audioUrl, lang, onPhase) {
  // 1 — fetch
  onPhase?.('fetching')
  let arrayBuffer
  try {
    const r = await fetch(audioUrl)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    arrayBuffer = await r.arrayBuffer()
  } catch (e) {
    const isCors = e instanceof TypeError && e.message.toLowerCase().includes('fetch')
    throw new Error(isCors
      ? 'CORS: this feed blocks direct audio access. Download the episode and paste a local transcript instead.'
      : `Could not load audio: ${e.message}`)
  }

  // 2 — decode + resample (main thread)
  onPhase?.('decoding')
  const { pcm, samplingRate } = await decodeAudioTo16k(arrayBuffer)

  // Estimate chunks: each chunk covers (chunk_length_s - stride_length_s) = 25 s of new audio
  const durationSec  = pcm.length / samplingRate
  const totalChunks  = Math.ceil(durationSec / 25)

  // 3 — transfer to worker and transcribe
  onPhase?.('transcribing')
  const buf = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage(
      { id, type: 'transcribe', audio: buf, samplingRate, lang, totalChunks },
      [buf],
    )
  })
}

export function preloadWhisper() {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'load' })
  })
}
