import { pinyin } from 'pinyin-pro'

// ── Arabic → Franco-Arabic transliteration ────────────────────────────────────
// Maps each Arabic character to its most common Franco (Arabizi) equivalent.
// Unvocalised Arabic (no harakat) is common, so consonants are the priority.

const AR = {
  'ا': 'a',   'أ': '2',  'إ': '2',  'آ': 'aa', 'ء': '2',
  'ئ': '2',   'ؤ': 'w',
  'ب': 'b',   'ت': 't',  'ث': 'th',
  'ج': 'j',   'ح': '7',  'خ': 'kh',
  'د': 'd',   'ذ': 'z',
  'ر': 'r',   'ز': 'z',
  'س': 's',   'ش': 'sh',
  'ص': 's',   'ض': 'd',
  'ط': 't',   'ظ': 'z',
  'ع': '3',   'غ': 'gh',
  'ف': 'f',   'ق': '2',
  'ك': 'k',   'ل': 'l',  'م': 'm',  'ن': 'n',
  'ه': 'h',   'و': 'w',  'ي': 'y',  'ى': 'a',
  'ة': 'a',   'لا': 'la',
  // Harakat (short vowels) — present in educational/religious texts
  'َ': 'a', 'ُ': 'u', 'ِ': 'i',
  'ً': 'an','ٌ': 'un','ٍ': 'in',
  'ّ': '',  'ْ': '',  'ـ': '',   // shadda, sukun, tatweel
}

export function charFranco(char) {
  return AR[char] ?? ''
}

export function arabicToFranco(text) {
  return [...text].map(c => AR[c] !== undefined ? AR[c] : c).join('').replace(/\s+/g, ' ').trim()
}

// ── Chinese → Pinyin ──────────────────────────────────────────────────────────

const CJK_RE = /[一-鿿㐀-䶿豈-﫿]/

export function charPinyin(char) {
  if (!CJK_RE.test(char)) return ''
  return pinyin(char, { toneType: 'symbol', type: 'array' })[0] ?? ''
}

export function chineseToPinyinText(text) {
  return pinyin(text, { toneType: 'none', separator: ' ' })
}
