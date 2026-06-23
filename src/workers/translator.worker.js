import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache  = true

const NLLB_LANG = {
  ar: 'ara_Arab', arz: 'ara_Arab', he: 'heb_Hebr',
  ja: 'jpn_Jpan', ru: 'rus_Cyrl', el: 'ell_Grek',
  en: 'eng_Latn', es: 'spa_Latn', fr: 'fra_Latn',
  de: 'deu_Latn', it: 'ita_Latn', zh: 'zho_Hans',
  pt: 'por_Latn', ko: 'kor_Hang', nl: 'nld_Latn',
  tr: 'tur_Latn', pl: 'pol_Latn',
}

// MarianMT fast-lane: small specialist models for common EU pairs
const MARIAN = {
  'es-en': 'Xenova/opus-mt-es-en', 'en-es': 'Xenova/opus-mt-en-es',
  'fr-en': 'Xenova/opus-mt-fr-en', 'en-fr': 'Xenova/opus-mt-en-fr',
  'de-en': 'Xenova/opus-mt-de-en', 'en-de': 'Xenova/opus-mt-en-de',
  'it-en': 'Xenova/opus-mt-it-en', 'en-it': 'Xenova/opus-mt-en-it',
}

const loaded = new Map()

function cfg(src, tgt) {
  const pair = `${src}-${tgt}`
  if (MARIAN[pair]) return { type: 'marian', model: MARIAN[pair], key: pair }
  return {
    type:     'nllb',
    model:    'Xenova/nllb-200-distilled-1.3B',
    key:      'nllb',
    src_lang: NLLB_LANG[src] ?? 'eng_Latn',
    tgt_lang: NLLB_LANG[tgt] ?? 'eng_Latn',
  }
}

self.onmessage = async ({ data }) => {
  const { id, text, srcLang, tgtLang } = data
  try {
    const c = cfg(srcLang, tgtLang)
    if (!loaded.has(c.key)) {
      const pipe = await pipeline('translation', c.model, {
        progress_callback: info => self.postMessage({ id, type: 'progress', info }),
      })
      loaded.set(c.key, pipe)
    }
    const pipe = loaded.get(c.key)
    const opts = { max_new_tokens: 350 }
    if (c.type === 'nllb') { opts.src_lang = c.src_lang; opts.tgt_lang = c.tgt_lang }
    const out = await pipe(text, opts)
    const result = (Array.isArray(out) ? out[0] : out).translation_text
    self.postMessage({ id, type: 'result', result })
  } catch (e) {
    self.postMessage({ id, type: 'error', error: e.message })
  }
}
