let worker = null
let seq    = 1
const pending   = new Map()
const listeners = new Set()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/explainer.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const { id, type, result, error, info } = data
    if (type === 'progress') { listeners.forEach(fn => fn(info)); return }
    const p = pending.get(id)
    pending.delete(id)
    if (!p) return
    if (type === 'result') p.resolve(result)
    else p.reject(new Error(error || 'Explainer failed'))
  }
  worker.onerror = (e) => {
    pending.forEach(p => p.reject(new Error(e.message || 'Worker error')))
    pending.clear()
    worker = null
  }
  return worker
}

export function onExplainerProgress(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function explain(word, lang) {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, msgType: 'explain', word, lang })
  })
}

export function preload(lang) {
  return new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, msgType: 'load', lang })
  })
}
