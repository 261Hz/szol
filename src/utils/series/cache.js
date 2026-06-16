// IndexedDB cache for fetched chapter content.
// Keyed by adapter:locator so re-opens are instant and source isn't hit twice.

const DB_NAME    = 'szol-series'
const STORE_NAME = 'chapters'
const VERSION    = 1

let _db = null

async function openDB() {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror   = ()  => reject(new Error('IndexedDB unavailable'))
  })
}

export async function getCached(key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function setCached(key, value) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(value, key)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch { /* non-fatal */ }
}
