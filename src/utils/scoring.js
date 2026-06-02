// This file has functions for cleaning up text and comparing what a user typed vs. the original.
// These are used in the Speak view to score pronunciation attempts.

// normalize() strips punctuation and makes text lowercase so comparisons are fair.
// For example "Hello," and "hello" will be treated as the same word.
export function normalize(word) {
  // "|| ''" means: if "word" is null/undefined/empty, use an empty string instead.
  // || is the "or" operator -- use the right side if the left side is falsy (empty/null/undefined).
  // .toLowerCase() converts all letters to lowercase (e.g. "Hello" → "hello").
  // .replace() swaps text matching a pattern with something else. Here it removes unwanted characters.
  // /[^\p{L}\p{M}]/gu is a "regular expression" (a search pattern):
  //   [ ] = a set of characters to match
  //   ^  = inside [ ], means "NOT any of these"
  //   \p{L} = any Unicode letter (covers all alphabets, not just A-Z)
  //   \p{M} = any Unicode combining mark (like accents: é, ñ, ü)
  //   g = global flag: replace ALL matches, not just the first one
  //   u = unicode flag: treat the pattern as Unicode-aware
  // So this removes anything that isn't a letter or accent mark.
  return (word || '').toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
}

// scoreWords() compares the original sentence to what the user said.
// Returns an object with how many words were correct and a percentage.
export function scoreWords(original, typed) {
  // .trim() removes leading and trailing spaces (e.g. "  hello  " → "hello").
  // .split(/\s+/) splits a string into an array of words by any whitespace.
  // \s = any whitespace character (space, tab, newline). + = one or more.
  const origWords  = original.trim().split(/\s+/) // e.g. ["The", "cat", "sat"]
  const typedWords = typed.trim().split(/\s+/)    // e.g. ["the", "cat", "set"]

  // "let" declares a variable that can be changed later (unlike "const" which is fixed).
  let correct = 0  // counts how many words matched
  // errors will hold a list of mistakes: what the user said vs what was expected.
  const errors = []

  // Loop through each word in the original sentence.
  // "for" loop: start at i=0, keep going while i < origWords.length, add 1 each time (i++).
  // i++ means "increment i by 1" -- shorthand for i = i + 1.
  for (let i = 0; i < origWords.length; i++) {
    // Check if the user said a word at this position AND it matches the original (after normalizing both).
    if (i < typedWords.length && normalize(typedWords[i]) === normalize(origWords[i])) {
      correct++ // short for: correct = correct + 1
    } else if (i < typedWords.length) {
      // User said SOMETHING at this position, but it was wrong.
      // .push() adds an item to the end of an array.
      errors.push({ typed: typedWords[i], expected: origWords[i] })
    } else {
      // User didn't say anything at this position (ran out of words).
      // null means "nothing / no value".
      errors.push({ typed: null, expected: origWords[i] })
    }
  }

  // Return an object { } with multiple pieces of information at once.
  return {
    correct,                                               // how many words were right
    total:  origWords.length,                             // total number of words
    pct:    Math.round((correct / origWords.length) * 100), // percentage (0-100), rounded to nearest integer
    // Math.round() rounds a decimal: Math.round(87.4) = 87, Math.round(87.6) = 88.
    errors,                                               // list of wrong words
  }
}

// scoreChars() compares text character by character, used for typing practice.
// Returns how far the user got through the text correctly (from the start, no gaps).
export function scoreChars(original, typed) {
  // [...original] spreads a string into an array of individual characters.
  // e.g. [...'cat'] = ['c', 'a', 't']
  const chars      = [...original]
  const typedChars = [...typed]

  // pos tracks the last correct character position reached.
  let pos = 0

  // Loop through both arrays at the same time, stopping at whichever is shorter.
  for (let i = 0; i < typedChars.length && i < chars.length; i++) {
    if (typedChars[i] === chars[i]) {
      // This character matches -- advance pos to mark progress.
      pos = i + 1 // +1 because pos represents "number of correct chars from start"
    } else {
      // Mismatch found -- stop counting. Only count consecutive correct chars from the start.
      break // "break" exits the loop immediately
    }
  }

  return {
    pos,   // how many characters from the beginning were correct in a row
    total: chars.length,  // total characters in the original
    // Ternary operator: condition ? valueIfTrue : valueIfFalse
    // If chars.length is 0 (empty string), return 0 to avoid dividing by zero.
    pct: chars.length ? Math.round((pos / chars.length) * 100) : 0,
  }
}
