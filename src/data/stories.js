// LANGS is the master configuration object for all supported languages.
// Each key is a short language code (e.g. 'es' for Spanish, 'el' for Greek).
// "export" makes this available to import in other files.
// "const" means this value won't be reassigned (it's a fixed constant).
export const LANGS = {
  // Each language entry is an object with these properties:
  //   name   = the language's own name for itself (used in the UI dropdown and labels)
  //   wiki   = the Wikipedia/Wiktionary language code (used to build dictionary URLs)
  //   rtl    = true if the language is written right-to-left (Arabic, Hebrew)
  //   script = true if the language uses a non-Latin alphabet (Cyrillic, Arabic, Hebrew, CJK)
  //   bcp47  = the BCP-47 language tag used for text-to-speech (e.g. 'es-ES' = Spanish, Spain)
  //            BCP-47 = Best Current Practice 47, the international standard for language codes
  //            Format: languageCode-CountryCode (e.g. 'zh-CN' = Chinese, China mainland)
  //   franco = true only for languages that have a Latin-alphabet romanized version

  ar:  { name: 'العربية',    wiki: 'ar', rtl: true,  script: true,  bcp47: 'ar-SA' },
  // Modern Standard Arabic: RTL, Arabic script. 'ar-SA' = Arabic as spoken in Saudi Arabia.

  zh:    { name: '中文（简体）', wiki: 'zh', rtl: false, script: true, bcp47: 'zh-CN' },
  // Simplified Chinese (Mainland China).
  'zh-TW': { name: '中文（繁體）', wiki: 'zh', rtl: false, script: true, bcp47: 'zh-TW' },
  // Traditional Chinese (Taiwan).

  arz: { name: 'مصري',       wiki: 'ar', rtl: true,  script: true,  franco: true, bcp47: 'ar-EG' },
  // Egyptian Colloquial Arabic: RTL, Arabic script, has Franco (Latin) mode.
  // 'arz' is the ISO 639-3 code for Egyptian Arabic. wiki:'ar' uses Arabic Wiktionary.
  // 'ar-EG' = Arabic as spoken in Egypt.

  en:  { name: 'English',    wiki: 'en', rtl: false, script: false, bcp47: 'en-US' },
  // 'en-US' = English as spoken in the United States (affects TTS accent)

  fr:  { name: 'Français',   wiki: 'fr', rtl: false, script: false, bcp47: 'fr-FR' },
  // 'fr-FR' = French as spoken in France

  de:  { name: 'Deutsch',    wiki: 'de', rtl: false, script: false, bcp47: 'de-DE' },
  // 'de-DE' = German as spoken in Germany

  el:  { name: 'Ελληνικά',   wiki: 'el', rtl: false, script: true,  bcp47: 'el-GR' },
  // Greek: uses the Greek alphabet (non-Latin, script: true). Not RTL.
  // 'el-GR' = Greek as spoken in Greece.

  he:  { name: 'עברית',      wiki: 'he', rtl: true,  script: true,  bcp47: 'he-IL' },
  // Hebrew: RTL, non-Latin script. 'he-IL' = Hebrew as spoken in Israel.

  hu:  { name: 'Magyar',     wiki: 'hu', rtl: false, script: false, bcp47: 'hu-HU' },
  // Hungarian: Latin alphabet. 'hu-HU' = Hungarian as spoken in Hungary.

  it:  { name: 'Italiano',   wiki: 'it', rtl: false, script: false, bcp47: 'it-IT' },
  // 'it-IT' = Italian as spoken in Italy

  ja:  { name: '日本語',      wiki: 'ja', rtl: false, script: true,  bcp47: 'ja-JP' },
  // Japanese: non-Latin script (uses Hiragana, Katakana, Kanji). Not RTL.
  // 'ja-JP' = Japanese as spoken in Japan.

  ru:  { name: 'Русский',    wiki: 'ru', rtl: false, script: true,  bcp47: 'ru-RU' },
  // Russian uses the Cyrillic alphabet (script: true). Not RTL (reads left-to-right).

  es:  { name: 'Español',    wiki: 'es', rtl: false, script: false, bcp47: 'es-ES' },
  // 'es-ES' = Spanish as spoken in Spain

  id:  { name: 'Bahasa Indonesia', wiki: 'id', rtl: false, script: false, bcp47: 'id-ID' },
  // Indonesian: Latin alphabet, LTR. 'id-ID' = Indonesian as spoken in Indonesia.
}
