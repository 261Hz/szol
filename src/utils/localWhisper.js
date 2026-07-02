// Singleton Whisper worker + main-thread audio decode/resample.
// AudioContext / OfflineAudioContext are main-thread only — decode stays here.

let worker    = null
let seq       = 1
const pending   = new Map()
const listeners = new Set()
let _currentAbort = null

// 20 MB per range-request chunk: decode one slice at a time so peak RAM is
// ~3× a single chunk (~60 MB) rather than 3× the entire file (~3–4 GB for long episodes)
const RANGE_CHUNK = 20 * 1024 * 1024

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
    if (type === 'result')    p.resolve(data.segments)
    else if (type === 'ready') p.resolve(true)
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

// Decode any browser-supported audio to 16 kHz mono Float32.
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

  const targetRate = 16000
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetRate), targetRate)
  const monoBuf    = new AudioBuffer({ length: mono.length, sampleRate: inputRate, numberOfChannels: 1 })
  monoBuf.copyToChannel(mono, 0)
  const src = offlineCtx.createBufferSource()
  src.buffer = monoBuf
  src.connect(offlineCtx.destination)
  src.start(0)
  const rendered = await offlineCtx.startRendering()
  return { pcm: rendered.getChannelData(0), samplingRate: 16000 }
}

export async function transcribeAudio(audioUrl, lang, onPhase) {
  const ctrl = new AbortController()
  _currentAbort = ctrl

  // 1 — fetch (range-chunked when the CDN supports it to cap peak RAM)
  onPhase?.('fetching')
  let arrayBuffers

  try {
    let contentLength  = 0
    let supportsRanges = false

    try {
      const head = await fetch(audioUrl, { method: 'HEAD', signal: ctrl.signal })
      if (head.ok) {
        contentLength  = parseInt(head.headers.get('content-length') || '0', 10)
        supportsRanges = head.headers.get('accept-ranges') === 'bytes'
      }
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('CANCELLED')
      // HEAD failed — continue to full fetch
    }

    if (contentLength > RANGE_CHUNK && supportsRanges) {
      arrayBuffers = []
      const numChunks = Math.ceil(contentLength / RANGE_CHUNK)
      for (let i = 0; i < numChunks; i++) {
        if (ctrl.signal.aborted) throw new Error('CANCELLED')
        const start = i * RANGE_CHUNK
        const end   = Math.min(start + RANGE_CHUNK - 1, contentLength - 1)
        const r = await fetch(audioUrl, { signal: ctrl.signal, headers: { Range: `bytes=${start}-${end}` } })
        if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`)
        arrayBuffers.push(await r.arrayBuffer())
      }
    } else {
      const r = await fetch(audioUrl, { signal: ctrl.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      arrayBuffers = [await r.arrayBuffer()]
    }
  } catch (e) {
    if (e.message === 'CANCELLED' || e.name === 'AbortError') throw new Error('CANCELLED')
    const isCors = e instanceof TypeError && e.message.toLowerCase().includes('fetch')
    throw new Error(isCors
      ? 'CORS: this feed blocks direct audio access. Download the episode and paste a local transcript instead.'
      : `Could not load audio: ${e.message}`)
  }

  // 2 — decode each chunk to 16 kHz mono, then concatenate
  // Processing one chunk at a time keeps peak intermediate RAM around 60–120 MB
  if (ctrl.signal.aborted) throw new Error('CANCELLED')
  onPhase?.('decoding')

  const pcmChunks  = []
  let totalSamples = 0
  for (let i = 0; i < arrayBuffers.length; i++) {
    if (ctrl.signal.aborted) throw new Error('CANCELLED')
    const { pcm } = await decodeAudioTo16k(arrayBuffers[i])
    pcmChunks.push(pcm)
    totalSamples  += pcm.length
    arrayBuffers[i] = null // release compressed buffer
  }
  arrayBuffers = null

  const combined = new Float32Array(totalSamples)
  let offset = 0
  for (const chunk of pcmChunks) { combined.set(chunk, offset); offset += chunk.length }

  const durationSec = totalSamples / 16000
  const totalChunks = Math.ceil(durationSec / 25) // 30 s chunk − 5 s stride = 25 s of new audio each

  // 3 — transfer PCM to worker and run inference
  if (ctrl.signal.aborted) throw new Error('CANCELLED')
  onPhase?.('transcribing')
  const buf = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength)

  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage(
      { id, type: 'transcribe', audio: buf, samplingRate: 16000, lang, totalChunks },
      [buf],
    )
  })
}

export function cancelCurrentTranscription() {
  _currentAbort?.abort()
  _currentAbort = null
  if (worker) worker.postMessage({ type: 'cancel' })
  pending.forEach(p => p.reject(new Error('CANCELLED')))
  pending.clear()
}

export function preloadWhisper() {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'load' })
  })
}
