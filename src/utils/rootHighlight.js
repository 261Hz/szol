/**
 * Semitic root highlighting — Hebrew and Arabic.
 *
 * Lookup order:
 *   1. In-memory session cache (Map)  — free, instant
 *   2. Small localStorage cache (~500 entries LRU) — free, persists session
 *   3. Backend /roots/analyze endpoint — proxies real morphology APIs
 *      (Dicta for Hebrew, CAMeL Tools for Arabic)
 *   4. No highlight (graceful degradation, no error shown)
 *
 * DB storage: zero. Roots cached only in memory + localStorage.
 * No DOM mutation — uses CSS Custom Highlight API.
 */

import { ref, watch } from 'vue'

// ── Global toggle ─────────────────────────────────────────────────────────────

export const rootHighlightOn = ref(localStorage.getItem('szol_roots') === '1')

watch(rootHighlightOn, v => {
  localStorage.setItem('szol_roots', v ? '1' : '0')
  if (!v) clearRoots()
})

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_KEY    = 'szol_root_cache'
const CACHE_LIMIT  = 500
const _session     = new Map()   // word:lang → [root chars] | null

function _loadLocal() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function _saveLocal(store) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)) } catch {}
}

function cacheGet(word, lang) {
  const key = `${lang}:${word}`
  if (_session.has(key)) return _session.get(key)
  const store = _loadLocal()
  if (key in store) { _session.set(key, store[key]); return store[key] }
  return undefined
}

function cacheSet(word, lang, root) {
  const key = `${lang}:${word}`
  _session.set(key, root)
  const store = _loadLocal()
  const keys  = Object.keys(store)
  if (keys.length >= CACHE_LIMIT) delete store[keys[0]]  // LRU evict oldest
  store[key] = root
  _saveLocal(store)
}

// ── API lookup ────────────────────────────────────────────────────────────────

const _inflight = new Map()  // deduplicate concurrent requests

async function fetchRoot(word, lang) {
  const key = `${lang}:${word}`
  if (_inflight.has(key)) return _inflight.get(key)

  const promise = fetch('/api/roots/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word, lang }),
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const root = data?.root ?? null   // expected: ["כ","ת","ב"] or null
      cacheSet(word, lang, root)
      _inflight.delete(key)
      return root
    })
    .catch(() => { _inflight.delete(key); return null })

  _inflight.set(key, promise)
  return promise
}

// ── Root character range finder ───────────────────────────────────────────────

const HE_VOWEL = /[ְ-ׇ]/
const AR_VOWEL = /[ً-ٰٟ]/

function stripVowels(text, lang) {
  return lang === 'he' ? text.replace(/[ְ-ׇ]/g, '')
       : lang === 'ar' ? text.replace(/[ً-ٰٟ]/g, '')
       : text
}

function buildIndexMap(word, lang) {
  // stripped-char-index → original-char-index
  const isVowel = lang === 'he'
    ? c => HE_VOWEL.test(c)
    : c => AR_VOWEL.test(c)
  const map = []
  for (let i = 0; i < word.length; i++) {
    if (!isVowel(word[i])) map.push(i)
  }
  return map
}

function findRootRanges(word, rootChars, lang) {
  const stripped = stripVowels(word, lang)
  const idxMap   = buildIndexMap(word, lang)
  const ranges   = []
  let ri = 0
  for (let si = 0; si < stripped.length && ri < rootChars.length; si++) {
    if (stripped[si] === rootChars[ri]) {
      const origStart = idxMap[si]
      let origEnd = origStart + 1
      // include any immediately following combining diacritics
      while (origEnd < word.length && (HE_VOWEL.test(word[origEnd]) || AR_VOWEL.test(word[origEnd]))) {
        origEnd++
      }
      ranges.push({ start: origStart, end: origEnd })
      ri++
    }
  }
  return ri === rootChars.length ? ranges : null
}

// ── CSS Custom Highlight API ──────────────────────────────────────────────────

const HIGHLIGHT_KEY = 'szol-root'
const WORD_RE_HE    = /[א-תװ-״יִ-פֿ]+/g
const WORD_RE_AR    = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g

export function clearRoots() {
  CSS.highlights?.delete(HIGHLIGHT_KEY)
}

export async function applyRoots(containerEl, lang) {
  if (!rootHighlightOn.value) return
  if (!CSS.highlights) return
  if (!containerEl) return
  if (lang !== 'he' && lang !== 'ar') return

  const wordRe = lang === 'he' ? WORD_RE_HE : WORD_RE_AR
  const allRanges = []

  // Collect all words across all text nodes first
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT)
  const pending = []   // { node, word, wordOffset }
  let node
  while ((node = walker.nextNode())) {
    const text = node.textContent
    wordRe.lastIndex = 0
    let m
    while ((m = wordRe.exec(text)) !== null) {
      const cached = cacheGet(m[0], lang)
      if (cached !== undefined) {
        // Already know the answer — build range directly
        if (cached) {
          const ranges = findRootRanges(m[0], cached, lang)
          if (ranges) for (const { start, end } of ranges) {
            const r = new Range()
            r.setStart(node, m.index + start)
            r.setEnd(node,   m.index + end)
            allRanges.push(r)
          }
        }
      } else {
        pending.push({ node, word: m[0], wordOffset: m.index })
      }
    }
  }

  // Apply what we have immediately
  if (allRanges.length) {
    CSS.highlights.set(HIGHLIGHT_KEY, new Highlight(...allRanges))
  }

  // Fetch unknowns in parallel then update
  if (pending.length) {
    const unique = [...new Set(pending.map(p => p.word))]
    await Promise.all(unique.map(w => fetchRoot(w, lang)))

    // Rebuild full range list after API results arrive
    const finalRanges = [...allRanges]
    for (const { node, word, wordOffset } of pending) {
      const root = cacheGet(word, lang)
      if (!root) continue
      const ranges = findRootRanges(word, root, lang)
      if (!ranges) continue
      for (const { start, end } of ranges) {
        const r = new Range()
        r.setStart(node, wordOffset + start)
        r.setEnd(node,   wordOffset + end)
        finalRanges.push(r)
      }
    }
    if (finalRanges.length) {
      CSS.highlights.set(HIGHLIGHT_KEY, new Highlight(...finalRanges))
    }
  }
}
