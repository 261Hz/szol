// Opt-in flag and cache management for on-device models.
// Models are cached in the browser Cache API by @huggingface/transformers.

export function localModelsEnabled() {
  return localStorage.getItem('szol_local_models') === 'on'
}

export function setLocalModelsEnabled(v) {
  localStorage.setItem('szol_local_models', v ? 'on' : 'off')
}

// Returns bytes used by any HuggingFace model caches.
export async function modelCacheBytes() {
  try {
    let total = 0
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      const keys  = await cache.keys()
      if (!keys.some(r => r.url.includes('huggingface.co'))) continue
      for (const req of keys) {
        const res = await cache.match(req)
        const buf = await res?.arrayBuffer()
        total += buf?.byteLength ?? 0
      }
    }
    return total
  } catch { return 0 }
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
