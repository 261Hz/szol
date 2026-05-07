export function normalize(word) {
  return (word || '').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
}

export function scoreWords(original, typed) {
  const origWords = original.trim().split(/\s+/)
  const typedWords = typed.trim().split(/\s+/)
  let correct = 0
  const errors = []

  for (let i = 0; i < origWords.length; i++) {
    if (i < typedWords.length && normalize(typedWords[i]) === normalize(origWords[i])) {
      correct++
    } else if (i < typedWords.length) {
      errors.push({ typed: typedWords[i], expected: origWords[i] })
    } else {
      errors.push({ typed: null, expected: origWords[i] })
    }
  }

  return {
    correct,
    total: origWords.length,
    pct: Math.round((correct / origWords.length) * 100),
    errors,
  }
}

export function scoreChars(original, typed) {
  const chars = [...original]
  const typedChars = [...typed]
  let pos = 0

  for (let i = 0; i < typedChars.length && i < chars.length; i++) {
    if (typedChars[i] === chars[i]) pos = i + 1
    else break
  }

  return {
    pos,
    total: chars.length,
    pct: chars.length ? Math.round((pos / chars.length) * 100) : 0,
  }
}