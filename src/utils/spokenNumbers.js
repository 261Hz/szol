// Converts digit sequences to their spoken form for dictation comparison.
// Delegates to numWords.js for multi-language number words.
// Adds year-specific logic on top: "1958" → "nineteen fifty eight"
// (not "one thousand nine hundred fifty eight") for languages where
// years are pronounced as two two-digit pairs.

import { numToWords } from './numWords.js'

// Languages that split 4-digit years as two pairs (1958 → "nineteen fifty-eight")
const YEAR_SPLIT_LANGS = new Set(['en', 'de', 'nl', 'sv', 'no', 'da'])

function spokenYear(n, lang) {
  if (!YEAR_SPLIT_LANGS.has(lang)) return null
  if (n < 1100 || n > 2099) return null
  if (n >= 2000 && n <= 2009) {
    const unit = numToWords(n % 10, lang)
    const base = numToWords(2000, lang)
    return base && unit ? `${base} and ${unit}` : null
  }
  if (n >= 2010 && n <= 2099) {
    const high = numToWords(20, lang)
    const low  = numToWords(n % 100, lang)
    return high && low ? `${high} ${low}` : null
  }
  // 1100–1999: split into two two-digit numbers
  const high = numToWords(Math.floor(n / 100), lang)
  const low  = n % 100 === 0 ? 'hundred' : numToWords(n % 100, lang)
  return high && low ? `${high} ${low}` : null
}

export function spokenNumbers(text, lang = 'en') {
  const l = (lang ?? 'en').slice(0, 2)
  return text.replace(/(?<![a-zA-Z])\b(\d{1,7})\b(?![a-zA-Z])/g, (_, m) => {
    const n = parseInt(m, 10)
    if (isNaN(n)) return m
    // Try year pronunciation first for 4-digit numbers
    if (m.length === 4) {
      const yearForm = spokenYear(n, l)
      if (yearForm) return yearForm
    }
    return numToWords(n, l) ?? m
  })
}
