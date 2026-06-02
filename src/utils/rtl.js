// This file exports helper functions that answer questions about a language's writing system.
// "export" means other files can import and use these functions.
// "function" defines a reusable block of code that takes inputs and gives back an output.

// isRTL = "is Right-To-Left?" -- Arabic and Hebrew are written right-to-left, not left-to-right.
export function isRTL(lang) {
  // "lang" is a short language code like 'he' (Hebrew), 'ar' (Arabic), 'arz' (Egyptian Arabic).
  // .includes() checks if the value is in the list.
  // The square brackets [ ] create a list (called an "array") of values to check against.
  return ['he', 'ar', 'arz'].includes(lang)
  // Returns true if lang is one of those three codes, false otherwise.
}

// isScript checks if the language uses a non-Latin writing system (not A-Z letters).
// Latin = English alphabet. Non-Latin = Arabic letters, Hebrew letters, Cyrillic (Russian), CJK (Chinese/Japanese).
export function isScript(lang) {
  // 'ja' = Japanese, 'ru' = Russian (Cyrillic script)
  return ['he', 'ar', 'arz', 'ja', 'ru'].includes(lang)
}

// hasFranco checks if this language has a "franco" (romanized / phonetic Latin) version.
// Egyptian Arabic (arz) is commonly written in Latin letters online, called "Franco Arabic".
export function hasFranco(lang) {
  // === means "exactly equal to". Returns true only for Egyptian Arabic.
  return lang === 'arz'
}
