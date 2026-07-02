// Opt-in flag and cache management for on-device models.
// Models are cached in the browser Cache API by @huggingface/transformers.

export function localModelsEnabled() {
  return localStorage.getItem('szol_local_models') === 'on'
}

export function setLocalModelsEnabled(v) {
  localStorage.setItem('szol_local_models', v ? 'on' : 'off')
}

async function _scanCaches(filter) {
  try {
    let total = 0
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      const keys  = await cache.keys()
      for (const req of keys) {
        if (!filter(req.url)) continue
        const res = await cache.match(req)
        const buf = await res?.arrayBuffer()
        total += buf?.byteLength ?? 0
      }
    }
    return total
  } catch { return 0 }
}

// HuggingFace models that are NOT the Whisper ASR model
export function translatorCacheBytes() {
  return _scanCaches(url => url.includes('huggingface.co') && !url.includes('whisper'))
}

// Whisper ASR model only (whisper-base or whisper-small)
export function whisperCacheBytes() {
  return _scanCaches(url => url.includes('huggingface.co') && url.includes('whisper'))
}

// Total of both (kept for any external callers)
export async function modelCacheBytes() {
  const [t, w] = await Promise.all([translatorCacheBytes(), whisperCacheBytes()])
  return t + w
}

export function fmtBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

// Deletes all caches that contain HuggingFace model files.
export async function clearModelCache() {
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    const keys  = await cache.keys()
    if (keys.some(r => r.url.includes('huggingface.co'))) {
      await caches.delete(name)
    }
  }
}
