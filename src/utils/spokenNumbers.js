// Converts digit sequences in text to their spoken English form so dictation
// comparison works when captions write "1958" but the speaker says "nineteen fifty eight".

const ONES = [
  'zero','one','two','three','four','five','six','seven','eight','nine',
  'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
  'seventeen','eighteen','nineteen',
]
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']

function twoDigits(n) {
  if (n < 20) return ONES[n]
  const t = TENS[Math.floor(n / 10)]
  const o = ONES[n % 10]
  return o ? `${t} ${o}` : t
}

function spokenInt(n) {
  if (n === 0) return 'zero'
  if (n < 20)  return ONES[n]
  if (n < 100) return twoDigits(n)

  if (n < 1000) {
    const h = Math.floor(n / 100)
    const r = n % 100
    return r === 0 ? `${ONES[h]} hundred` : `${ONES[h]} hundred ${twoDigits(r)}`
  }

  // Years: 1100–1999 → "nineteen fifty eight"
  if (n >= 1100 && n <= 1999) {
    const high = Math.floor(n / 100)
    const low  = n % 100
    return low === 0 ? `${twoDigits(high)} hundred` : `${twoDigits(high)} ${twoDigits(low)}`
  }

  // Years: 2000–2009 → "two thousand and one"
  if (n >= 2000 && n <= 2009) {
    const r = n % 100
    return r === 0 ? 'two thousand' : `two thousand and ${ONES[r]}`
  }

  // Years: 2010–2099 → "twenty twenty four"
  if (n >= 2010 && n <= 2099) {
    return `twenty ${twoDigits(n % 100)}`
  }

  // General thousands
  if (n < 1000000) {
    const th = Math.floor(n / 1000)
    const r  = n % 1000
    const base = `${spokenInt(th)} thousand`
    return r === 0 ? base : `${base} ${spokenInt(r)}`
  }

  return String(n)
}

// Languages where this makes sense (all use similar spoken number patterns).
// Skip CJK, Arabic etc. where the word order and words are completely different.
const SKIP_LANGS = new Set(['zh', 'ja', 'ko', 'ar', 'fa', 'hi', 'he', 'th', 'vi'])

export function spokenNumbers(text, lang = 'en') {
  if (SKIP_LANGS.has((lang ?? 'en').slice(0, 2))) return text
  // Replace standalone digit sequences (not part of a larger word like "mp3" or "1950s")
  return text.replace(/(?<![a-zA-Z])\b(\d{1,7})\b(?![a-zA-Z])/g, (_, m) => {
    const n = parseInt(m, 10)
    return isNaN(n) ? m : spokenInt(n)
  })
}
