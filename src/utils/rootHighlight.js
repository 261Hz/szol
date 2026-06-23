/**
 * Semitic root annotation — Hebrew and Arabic.
 *
 * Lookup order:
 *   1. In-memory session cache (Map)  — instant
 *   2. localStorage cache (~500 entries LRU) — persists session
 *   3. Backend /roots/analyze endpoint — proxies Dicta (Hebrew) and CAMeL Tools (Arabic)
 *   4. Null (graceful degradation)
 *
 * rootMode drives the visual layer:
 *   'off'        — plain text, no annotation
 *   'roots'      — ruby text: root sits above each word as a medieval gloss
 *   'manuscript' — roots mode + each root family gets a consistent ink color
 */

import { ref, computed, watch } from 'vue'

// ── Mode ──────────────────────────────────────────────────────────────────────

function loadMode() {
  const s = localStorage.getItem('szol_roots')
  if (s === '1') return 'roots'  // migrate old boolean
  if (['off', 'roots', 'manuscript'].includes(s)) return s
  return 'off'
}

export const rootMode = ref(loadMode())

// Backward-compat alias (VocabView still uses this)
export const rootHighlightOn = computed(() => rootMode.value !== 'off')

watch(rootMode, v => localStorage.setItem('szol_roots', v))

// ── Manuscript ink palette ────────────────────────────────────────────────────

const PALETTE = [
  '#8b3a3a',  // burgundy
  '#2d5a7b',  // deep blue
  '#4a6b3a',  // forest
  '#7a4a2a',  // amber
  '#5a3a7a',  // purple
  '#3a6a5a',  // teal
  '#7a5a2a',  // gold
  '#6a2a5a',  // plum
]

export function rootInkColor(root) {
  if (!root) return '#1f1b17'
  let h = 0
  for (const ch of root) h = (h * 31 + ch.codePointAt(0)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_KEY   = 'szol_root_cache_v2'  // v2: browser-direct Dicta; purges old server-404 nulls
const CACHE_LIMIT = 500
const _session    = new Map()   // `${lang}:${word}` → char[] | null

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
  if (keys.length >= CACHE_LIMIT) delete store[keys[0]]
  store[key] = root
  _saveLocal(store)
}

// ── API lookup ────────────────────────────────────────────────────────────────

const _inflight = new Map()

async function fetchRoot(word, lang) {
  const key = `${lang}:${word}`
  if (_inflight.has(key)) return _inflight.get(key)

  const promise = fetch('/api/roots-analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word, lang }),
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const root = data?.root ?? null   // e.g. ["כ","ת","ב"] or null
      cacheSet(word, lang, root)
      _inflight.delete(key)
      return root
    })
    .catch(() => { _inflight.delete(key); return null })

  _inflight.set(key, promise)
  return promise
}

// ── Dicta nakdan — called directly from the browser (CORS is allowed) ────────
// Sending through Vercel serverless returned 404; calling from browser works
// because Dicta's own web app is also a browser-side SPA calling this endpoint.

const DICTA_URL = 'https://nakdan.dicta.org.il/api'

async function dictaHebrewBatch(words) {
  const text = words.join('\n')  // newline-separated keeps words as distinct tokens
  let res
  try {
    res = await fetch(DICTA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'nakdan', genre: 'modern', addmorph: true, keepqq: false, nodagesh: false, text }),
    })
  } catch {
    return {}  // network error / CORS — degrade silently
  }
  if (!res.ok) return {}

  const data   = await res.json()
  const tokens = Array.isArray(data[0]) ? data.flat() : data
  const roots  = {}
  for (const tok of tokens) {
    // Strip niqqud from response word (nakdan adds vowel marks to output)
    const w = (tok.word ?? '').replace(/[֑-ׇ]/g, '')
    if (!w) continue
    const rawMorph = tok.morph
    const analysis = Array.isArray(rawMorph) ? rawMorph[0] : rawMorph
    const raw = analysis?.shoresh ?? null
    if (!raw || typeof raw !== 'string') continue
    const chars = [...raw.replace(/[.\-\s]/g, '')]
    if (chars.length >= 2) roots[w] = chars
  }
  return roots
}

// ── Public: batch pre-fetch for a word list ───────────────────────────────────
// Returns { word → rootString } for all words that have a known root.

export async function preFetchRoots(words, lang) {
  if (!['ar', 'he'].includes(lang)) return {}

  const unique   = [...new Set(words.filter(Boolean))]
  const map      = {}
  const uncached = []

  for (const word of unique) {
    const cached = cacheGet(word, lang)
    if (cached !== undefined) {
      if (Array.isArray(cached) && cached.length) map[word] = cached.join('')
    } else {
      uncached.push(word)
    }
  }

  if (!uncached.length) return map

  try {
    const roots = lang === 'he' ? await dictaHebrewBatch(uncached) : {}

    for (const word of uncached) {
      const chars = roots[word] ?? null
      if (chars) {
        cacheSet(word, lang, chars)   // only cache positive hits — nulls get retried next visit
        map[word] = chars.join('')
      }
    }
  } catch (e) {
    console.error('[roots] batch error:', e.message)
  }

  return map
}

// ── CSS Custom Highlight API (root consonant highlighting) ────────────────────
// Used in VocabView for consonant-level marking within words.

const HIGHLIGHT_KEY = 'szol-root'
const WORD_RE_HE    = /[א-תװ-״יִ-פֿ]+/g
const WORD_RE_AR    = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g
const HE_VOWEL      = /[ְ-ׇ]/
const AR_VOWEL      = /[ً-ٰٟ]/

export function clearRoots() {
  CSS.highlights?.delete(HIGHLIGHT_KEY)
}

function stripVowels(text, lang) {
  return lang === 'he' ? text.replace(/[ְ-ׇ]/g, '')
       : lang === 'ar' ? text.replace(/[ً-ٰٟ]/g, '')
       : text
}

function buildIndexMap(word, lang) {
  const isVowel = lang === 'he' ? c => HE_VOWEL.test(c) : c => AR_VOWEL.test(c)
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
      while (origEnd < word.length && (HE_VOWEL.test(word[origEnd]) || AR_VOWEL.test(word[origEnd]))) origEnd++
      ranges.push({ start: origStart, end: origEnd })
      ri++
    }
  }
  return ri === rootChars.length ? ranges : null
}

export async function applyRoots(containerEl, lang) {
  if (!rootHighlightOn.value) return
  if (!CSS.highlights) return
  if (!containerEl) return
  if (lang !== 'he' && lang !== 'ar') return

  const wordRe    = lang === 'he' ? WORD_RE_HE : WORD_RE_AR
  const allRanges = []

  const walker  = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT)
  const pending = []
  let node
  while ((node = walker.nextNode())) {
    const text = node.textContent
    wordRe.lastIndex = 0
    let m
    while ((m = wordRe.exec(text)) !== null) {
      const cached = cacheGet(m[0], lang)
      if (cached !== undefined) {
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

  if (allRanges.length) CSS.highlights.set(HIGHLIGHT_KEY, new Highlight(...allRanges))

  if (pending.length) {
    const unique = [...new Set(pending.map(p => p.word))]
    await Promise.all(unique.map(w => fetchRoot(w, lang)))

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
    if (finalRanges.length) CSS.highlights.set(HIGHLIGHT_KEY, new Highlight(...finalRanges))
  }
}
