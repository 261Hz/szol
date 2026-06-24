// Geometric stroke recognizer — no ML, no network dependency for matching.
//
// Pipeline (classic $1 approach, extended to multi-stroke):
//   1. Flatten all strokes into one point sequence
//   2. Resample to N evenly-spaced points (removes speed variation)
//   3. Scale + center to unit box (removes size/position variation)
//   4. Average Euclidean distance against template → score in [0, ∞)
//
// For CJK: templates come from HanziWriter stroke medians.
// Score < PASS_THRESHOLD is a match.

const N              = 64
export const PASS_THRESHOLD = 0.38

function d(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function pathLen(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += d(pts[i - 1], pts[i])
  return len
}

function resample(pts, n = N) {
  const points = pts.map(p => ({ x: p.x, y: p.y }))
  const I = pathLen(points) / (n - 1)
  if (!I) return points.slice(0, n)
  let D = 0
  const out = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const seg = d(points[i - 1], points[i])
    if (D + seg >= I) {
      const t = (I - D) / seg
      const q = {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
      }
      out.push(q)
      points.splice(i, 0, q)
      D = 0
    } else {
      D += seg
    }
  }
  while (out.length < n) out.push(points[points.length - 1])
  return out
}

function normalize(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y
  }
  const size = Math.max(x1 - x0, y1 - y0) || 1
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return pts.map(p => ({ x: (p.x - cx) / size, y: (p.y - cy) / size }))
}

function avgDist(a, b) {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += d(a[i], b[i])
  return sum / n
}

// Compare user strokes (array of {x,y}[] per stroke) against template strokes.
// Returns distance in [0, ∞) — lower is better. Use PASS_THRESHOLD to gate.
export function compareStrokes(userStrokes, templateStrokes) {
  const uFlat = userStrokes.flat()
  const tFlat = templateStrokes.flat()
  if (uFlat.length < 2 || tFlat.length < 2) return Infinity
  const u = normalize(resample(uFlat))
  const t = normalize(resample(tFlat))
  // Try both directions — handles reversed writing
  return Math.min(avgDist(u, t), avgDist(u, [...t].reverse()))
}

// Fetch HanziWriter stroke medians for a CJK character.
// Returns null when no data is available (rare / punctuation).
const _cache = new Map()
export async function getHanziTemplate(char) {
  if (_cache.has(char)) return _cache.get(char)
  try {
    const r = await fetch(
      `https://cdn.jsdelivr.net/npm/hanzi-writer-data/${encodeURIComponent(char)}.json`
    )
    if (!r.ok) { _cache.set(char, null); return null }
    const { medians } = await r.json()
    // HanziWriter y is inverted (0 = bottom); flip to match canvas coords
    const strokes = medians.map(s => s.map(([x, y]) => ({ x, y: 900 - y })))
    _cache.set(char, strokes)
    return strokes
  } catch {
    _cache.set(char, null)
    return null
  }
}
