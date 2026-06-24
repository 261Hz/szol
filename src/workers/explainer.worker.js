import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache  = true

// Arabic and Hebrew need the larger model for morphological quality
const SEMITIC = new Set(['ar', 'arz', 'he'])

function modelFor(lang) {
  return SEMITIC.has(lang)
    ? 'onnx-community/Qwen2.5-1.5B-Instruct'
    : 'onnx-community/Qwen2.5-0.5B-Instruct'
}

// One-sentence monolingual definition prompts per language
const PROMPT = {
  ar:  w => `اشرح معنى كلمة "${w}" بالعربية في جملة واحدة موجزة.`,
  arz: w => `اشرح معنى كلمة "${w}" بالعربية في جملة واحدة موجزة.`,
  he:  w => `הסבר את המשמעות של המילה "${w}" בעברית במשפט אחד.`,
  ja:  w => `「${w}」の意味を日本語で一文で簡潔に説明してください。`,
  ru:  w => `Объясни значение слова «${w}» на русском одним кратким предложением.`,
  el:  w => `Εξήγησε τη σημασία της λέξης «${w}» στα ελληνικά σε μία πρόταση.`,
  es:  w => `Explica el significado de «${w}» en español en una frase.`,
  fr:  w => `Explique la signification de « ${w} » en français en une phrase.`,
  de:  w => `Erkläre die Bedeutung von „${w}" auf Deutsch in einem Satz.`,
  it:  w => `Spiega il significato di «${w}» in italiano in una frase.`,
  zh:     w => `用中文一句话解释"${w}"的意思。`,
  'zh-TW': w => `請用繁體中文一句話解釋「${w}」的意思。`,
  ko:  w => `"${w}"의 의미를 한국어로 한 문장으로 설명해 주세요.`,
}

function makeMessages(word, lang) {
  const user = (PROMPT[lang] ?? (w => `Define "${w}" in one concise sentence in the same language as the word.`))(word)
  return [
    { role: 'system', content: 'You are a monolingual dictionary. Respond only in the target language. One sentence only. No translation.' },
    { role: 'user',   content: user },
  ]
}

const loaded = new Map()

self.onmessage = async ({ data }) => {
  const { id, word, lang } = data
  try {
    const modelId = modelFor(lang)
    if (!loaded.has(modelId)) {
      const pipe = await pipeline('text-generation', modelId, {
        dtype: 'q4',
        progress_callback: info => self.postMessage({ id, type: 'progress', info }),
      })
      loaded.set(modelId, pipe)
    }
    const pipe = loaded.get(modelId)
    const out  = await pipe(makeMessages(word, lang), { max_new_tokens: 80, do_sample: false })
    const result = out[0].generated_text.at(-1).content.trim()
    self.postMessage({ id, type: 'result', result })
  } catch (e) {
    self.postMessage({ id, type: 'error', error: e.message })
  }
}
