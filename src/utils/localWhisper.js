// Singleton Whisper worker + main-thread audio decode/resample.
// AudioContext / OfflineAudioContext are main-thread only — decode stays here.

// Backend URL — matches api.js. On CORS failure the audio is proxied through here.
const BACKEND = 'https://szol.onrender.com'

let worker    = null
let seq       = 1
const pending   = new Map()
const listeners = new Set()
let _currentAbort = null
// One-episode cache: avoids re-downloading on inference crash + retry.
// Stores compressed ArrayBuffers (before decode) keyed by audio URL.
let _cache = null  // { url: string, buffers: ArrayBuffer[] }

// 20 MB per fetch segment. MP3 frames are independently decodable at byte offsets;
// AAC/MP4 containers need the moov atom — they cannot be range-decoded.
const RANGE_CHUNK   = 20 * 1024 * 1024
// Fallback bit-rate when RSS duration is unavailable.
// 128 kbps is safe for most podcasts; pass episodeDurationSecs for 64 kbps feeds.
const BYTES_PER_SEC = 16_000
// Hard cap: decode peak memory would exceed ~1.9 GB for AAC
const AAC_MAX_MINS  = 90
// Soft warning: decode peak ~635 MB, risky on mobile
const AAC_WARN_MINS = 30

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
    if (type === 'result')     p.resolve(data.segments)
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

// Hard-stop the worker. Model files stay in the browser cache; next getWorker()
// recreates the worker and the cached files avoid a full re-download.
export function terminateWhisperWorker() {
  if (worker) { worker.terminate(); worker = null }
  pending.forEach(p => p.reject(new Error('CANCELLED')))
  pending.clear()
}

function detectCodec(url, contentType) {
  const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase()
  const ct  = (contentType ?? '').toLowerCase()
  if (ext === 'mp3' || ct.includes('mpeg') || ct.includes('mp3')) return 'mp3'
  if (['m4a', 'mp4', 'aac', 'm4b'].includes(ext) ||
      ct.includes('mp4') || ct.includes('aac') || ct.includes('m4a')) return 'aac'
  return 'unknown'
}

// Returns standalone Float32Array (byteOffset=0, owns its whole buffer) — safe to
// postMessage-transfer without an extra .slice() copy at the call site.
async function decodeAudioTo16k(arrayBuffer) {
  const audioCtx    = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const inputRate   = audioBuffer.sampleRate
  const channels    = audioBuffer.numberOfChannels
  audioCtx.close()

  // Hoist channel data references outside the loop — getChannelData(c) inside the
  // per-sample loop would be ~240M method calls for a 45-min stereo file.
  const chans = Array.from({ length: channels }, (_, c) => audioBuffer.getChannelData(c))
  const mono  = new Float32Array(audioBuffer.length)
  for (let i = 0; i < audioBuffer.length; i++) {
    let s = 0
    for (let c = 0; c < channels; c++) s += chans[c][i]
    mono[i] = s / channels
  }

  if (inputRate === 16000) return mono   // already a standalone Float32Array

  const targetRate = 16000
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * targetRate), targetRate)
  const monoBuf    = new AudioBuffer({ length: mono.length, sampleRate: inputRate, numberOfChannels: 1 })
  monoBuf.copyToChannel(mono, 0)
  const src = offlineCtx.createBufferSource()
  src.buffer = monoBuf
  src.connect(offlineCtx.destination)
  src.start(0)
  const rendered = await offlineCtx.startRendering()

  // getChannelData returns a view into AudioBuffer's internal memory — copy into a
  // standalone buffer that we can transfer (no extra slice at the call site).
  return new Float32Array(rendered.getChannelData(0))
}

// transcribeAudio(audioUrl, lang, onPhase, episodeDurationSecs?)
//
// onPhase(phase, extra?) — caller may return a Promise or boolean.
//   Returning false from 'size_warning' cancels the operation before the fetch starts.
//   'fetching'             — downloading audio bytes
//   'decoding'             — decoding current segment
//   'transcribing'         — Whisper inference on current segment
//   'size_warning', { estimatedMins }  — large AAC episode; return false to cancel
//
// episodeDurationSecs: pass from RSS itunes:duration or audio element.
//   Without it, byte-count ÷ 128 kbps is used — badly wrong for 64 kbps feeds.
//   A 3-hour 64 kbps episode estimates as 90 min, just under the cap, and would OOM.
export async function transcribeAudio(audioUrl, lang, onPhase, episodeDurationSecs) {
  const ctrl = new AbortController()
  _currentAbort = ctrl

  onPhase?.('fetching')

  let arrayBuffers
  let totalSecs = 0

  try {
    let contentLength  = 0
    let supportsRanges = false
    let codec          = detectCodec(audioUrl, '')

    // Serve from cache on retry — avoids re-downloading after an inference crash.
    if (_cache?.url === audioUrl) {
      arrayBuffers = _cache.buffers.map(b => b.slice(0))
      const totalBytes = arrayBuffers.reduce((s, b) => s + b.byteLength, 0)
      totalSecs = episodeDurationSecs ?? totalBytes / BYTES_PER_SEC
    }

    if (!arrayBuffers) {
    // Resolve to either the direct URL or proxy URL — whichever HEAD succeeds.
    // This means proxy-resolved URLs also feed the range-chunk path, not just single-fetch.
    let fetchBase = audioUrl
    try {
      const head = await fetch(audioUrl, { method: 'HEAD', signal: ctrl.signal })
      if (head.ok) {
        contentLength  = parseInt(head.headers.get('content-length') || '0', 10)
        supportsRanges = head.headers.get('accept-ranges') === 'bytes'
        codec          = detectCodec(audioUrl, head.headers.get('content-type') || '')
      }
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('CANCELLED')
      // Direct HEAD failed (CORS or network) — try proxy HEAD so we get real metadata
      // and can use the proxy for range-chunked fetches too.
      if (e instanceof TypeError) {
        try {
          const proxyUrl  = `${BACKEND}/proxy/audio?url=${encodeURIComponent(audioUrl)}`
          const proxyHead = await fetch(proxyUrl, { method: 'HEAD', signal: ctrl.signal })
          if (proxyHead.ok) {
            fetchBase      = proxyUrl
            contentLength  = parseInt(proxyHead.headers.get('content-length') || '0', 10)
            supportsRanges = proxyHead.headers.get('accept-ranges') === 'bytes'
            codec          = detectCodec(proxyUrl, proxyHead.headers.get('content-type') || '')
          }
        } catch (pe) {
          if (pe.name === 'AbortError') throw new Error('CANCELLED')
          // proxy HEAD also failed — continue with codec guessed from URL, single-fetch later
        }
      }
    }

    // Real episode duration beats byte-count estimate: 64 kbps feeds are 2× longer than
    // 128 kbps would predict, so the byte estimate alone would let a 3-hour episode slip
    // under the safety cap.
    totalSecs            = episodeDurationSecs ?? (contentLength ? contentLength / BYTES_PER_SEC : 0)
    const estimatedMins  = Math.round(totalSecs / 60)

    if (codec === 'mp3' && contentLength > RANGE_CHUNK && supportsRanges) {
      // fetchBase may be the proxy URL here — proxy passes Range headers through,
      // so chunked fetches work the same regardless of whether we're going direct or proxied.
      try {
        arrayBuffers = []
        const numChunks = Math.ceil(contentLength / RANGE_CHUNK)
        for (let i = 0; i < numChunks; i++) {
          if (ctrl.signal.aborted) throw new Error('CANCELLED')
          const start = i * RANGE_CHUNK
          const end   = Math.min(start + RANGE_CHUNK - 1, contentLength - 1)
          const r = await fetch(fetchBase, { signal: ctrl.signal, headers: { Range: `bytes=${start}-${end}` } })
          if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`)
          arrayBuffers.push(await r.arrayBuffer())
        }
      } catch (e) {
        if (e.name === 'AbortError' || e.message === 'CANCELLED') throw e
        arrayBuffers = null  // range fetch failed; fall through to single-fetch
      }
    }

    if (!arrayBuffers) {
      // Single-fetch path: AAC, unknown codec, or range fallback.
      if (codec !== 'mp3') {
        if (estimatedMins > AAC_MAX_MINS) {
          throw new Error(
            `This episode is ~${estimatedMins} min. AAC/MP4 audio must be decoded in full — ` +
            `${estimatedMins} min exceeds safe memory limits. ` +
            `Download the file and paste a local transcript instead.`
          )
        }
        if (estimatedMins > AAC_WARN_MINS) {
          // Await the callback so the UI can pause for user confirmation.
          // If the caller returns false the fetch is cancelled before it starts.
          const proceed = await onPhase?.('size_warning', { estimatedMins })
          if (proceed === false) throw new Error('CANCELLED')
        }
      }

      // fetchBase is already direct or proxy — use it directly.
      // If fetchBase is still the original URL (proxy HEAD failed), fall back to proxy on TypeError.
      let r
      try {
        r = await fetch(fetchBase, { signal: ctrl.signal })
      } catch (directErr) {
        if (directErr.name === 'AbortError') throw new Error('CANCELLED')
        if (directErr instanceof TypeError && fetchBase === audioUrl) {
          const proxyUrl = `${BACKEND}/proxy/audio?url=${encodeURIComponent(audioUrl)}`
          r = await fetch(proxyUrl, { signal: ctrl.signal })
          codec = detectCodec(r.url || audioUrl, r.headers.get('content-type') || '')
        } else {
          throw directErr
        }
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      arrayBuffers = [await r.arrayBuffer()]
    }

    // Cache after successful fetch so retries skip the download.
    _cache = { url: audioUrl, buffers: arrayBuffers.map(b => b.slice(0)) }
    } // end if (!arrayBuffers) fetch block

  } catch (e) {
    if (e.message === 'CANCELLED' || e.name === 'AbortError') throw new Error('CANCELLED')
    // Any TypeError from fetch() is a network or CORS failure.
    // Safari: "Load failed"  Firefox: "NetworkError when attempting to fetch resource"
    // Chrome: "Failed to fetch" — don't match on message text, just the error type.
    if (e instanceof TypeError) {
      throw new Error('CORS: this feed blocks direct audio access. Download the episode and paste a local transcript instead.')
    }
    throw e.message.match(/^(This episode|HTTP )/) ? e : new Error(`Could not load audio: ${e.message}`)
  }

  // Per-segment pipeline: decode → Whisper (with timeOffset) → free PCM → next.
  // Peak RAM ≤ one segment's decoded PCM at a time, bounded regardless of episode length.
  const allSegments = []
  let timeOffset    = 0

  for (let i = 0; i < arrayBuffers.length; i++) {
    if (ctrl.signal.aborted) throw new Error('CANCELLED')
    onPhase?.('decoding')

    const pcm = await decodeAudioTo16k(arrayBuffers[i])
    arrayBuffers[i] = null   // release compressed buffer

    if (ctrl.signal.aborted) throw new Error('CANCELLED')
    onPhase?.('transcribing')

    const segSamples = pcm.length  // capture before transfer detaches the buffer
    // pcm is a standalone Float32Array — transfer its buffer directly (no slice copy)
    const segments = await new Promise((resolve, reject) => {
      const id = seq++
      pending.set(id, { resolve, reject })
      getWorker().postMessage(
        { id, type: 'transcribe', audio: pcm.buffer, samplingRate: 16000, lang, totalSecs, timeOffset },
        [pcm.buffer],
      )
    })

    allSegments.push(...segments)
    timeOffset += segSamples / 16000
  }

  return allSegments
}

// Cancel: abort the fetch and terminate the worker.
// The WASM ONNX runtime runs synchronously — the worker's event loop is blocked
// during inference, so a 'cancel' message would sit in the queue until inference
// finishes. Worker termination is the only reliable cancel path for WASM.
// WebGPU operations are partially async but termination is still the safest route.
export function cancelCurrentTranscription() {
  _currentAbort?.abort()
  _currentAbort = null
  terminateWhisperWorker()
}

export function preloadWhisper() {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'load' })
  })
}
