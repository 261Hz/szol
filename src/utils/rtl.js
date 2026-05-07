export function isRTL(lang) {
  return ['he', 'ar', 'arz'].includes(lang)
}

export function isScript(lang) {
  return ['he', 'ar', 'arz', 'ja', 'ru'].includes(lang)
}

export function hasFranco(lang) {
  return lang === 'arz'
}