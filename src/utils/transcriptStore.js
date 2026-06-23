// IndexedDB store for on-device transcripts.
// Keyed by story ID so ListenView can load them back without a server round-trip.

const DB_NAME = 'szol-transcripts'
const STORE   = 'segments'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function getStoredTranscript(id) {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result?.segments ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}

export async function saveStoredTranscript(id, segments) {
  try {
    const db = await open()
    await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE)
        .put({ id, segments, savedAt: new Date().toISOString() })
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch {}
}

export async function deleteStoredTranscript(id) {
  try {
    const db = await open()
    await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch {}
}
