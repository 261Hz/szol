// Per-language SEO metadata — title, meta description, and html[lang] value.
// Call updateSEO(lang) whenever the active language changes.

const BASE_URL = 'https://szol.vercel.app'

export const SEO = {
  en: {
    htmlLang: 'en',
    title: 'Szól — Read, retype & speak in a new language',
    description: 'Improve your language skills by reading real articles, retyping sentences, and practicing pronunciation. New content every day.',
  },
  es: {
    htmlLang: 'es',
    title: 'Szól — Lee, reescribe y habla en otro idioma',
    description: 'Mejora tus habilidades en otro idioma leyendo artículos reales, reescribiendo frases y practicando pronunciación. Contenido nuevo cada día.',
  },
  fr: {
    htmlLang: 'fr',
    title: 'Szól — Lisez, retapez et parlez une nouvelle langue',
    description: 'Améliorez votre niveau en lisant de vrais articles, en retapant des phrases et en pratiquant la prononciation. Nouveau contenu chaque jour.',
  },
  de: {
    htmlLang: 'de',
    title: 'Szól — Lesen, Nachtippen und Sprechen auf Deutsch',
    description: 'Verbessere deine Sprachkenntnisse durch echte Artikel lesen, Sätze nachtippen und Aussprache üben. Täglich neuer Inhalt.',
  },
  it: {
    htmlLang: 'it',
    title: 'Szól — Leggi, riscrivi e parla in un\'altra lingua',
    description: 'Migliora le tue abilità linguistiche leggendo articoli reali, riscrivendo frasi e praticando la pronuncia. Nuovo contenuto ogni giorno.',
  },
  ru: {
    htmlLang: 'ru',
    title: 'Szól — Читайте, перепечатывайте и говорите на новом языке',
    description: 'Улучшайте знание языка, читая реальные статьи, перепечатывая предложения и практикуя произношение. Новый контент каждый день.',
  },
  he: {
    htmlLang: 'he',
    title: 'Szól — קרא, הקלד מחדש ודבר בשפה חדשה',
    description: 'שפר את כישורי השפה שלך על ידי קריאת מאמרים אמיתיים, הקלדה מחדש של משפטים ותרגול הגייה. תוכן חדש כל יום.',
  },
  ar: {
    htmlLang: 'ar',
    title: 'Szól — اقرأ وأعد الكتابة وتحدث بلغة جديدة',
    description: 'طوّر مهاراتك اللغوية بقراءة مقالات حقيقية وإعادة كتابة الجمل وتدريب النطق. محتوى جديد كل يوم.',
  },
  arz: {
    htmlLang: 'ar',
    title: 'Szól — اقرأ وأعد الكتابة وتكلم باللغة المصرية',
    description: 'حسّن مهاراتك باللغة المصرية من خلال قراءة مقالات حقيقية وإعادة كتابة الجمل وتدريب النطق. محتوى جديد كل يوم.',
  },
  ja: {
    htmlLang: 'ja',
    title: 'Szól（ソール）— 日本語を読んで・打ち込んで・話して上達',
    description: '本物の日本語記事を読み、文章を入力練習し、発音を鍛えることで語学力を向上させましょう。毎日新しいコンテンツを配信。',
  },
  zh: {
    htmlLang: 'zh-Hans',
    title: 'Szól — 阅读、默写和口语练习，轻松学外语',
    description: '通过阅读真实文章、默写句子和发音练习，全面提高你的语言能力。每天更新内容，持续进步。',
  },
  'zh-TW': {
    htmlLang: 'zh-Hant',
    title: 'Szól — 閱讀、默寫和口語練習，輕鬆學外語',
    description: '透過閱讀真實文章、默寫句子和發音練習，全面提升你的語言能力。每天更新內容，持續進步。',
  },
  hu: {
    htmlLang: 'hu',
    title: 'Szól — Olvasd, gépeld és mondd egy új nyelven',
    description: 'Fejleszd nyelvtudásodat valódi cikkek olvasásával, mondatok begépelésével és kiejtés gyakorlásával. Minden nap új tartalom.',
  },
  el: {
    htmlLang: 'el',
    title: 'Szól — Διάβασε, ξαναγράψε και μίλα σε μια νέα γλώσσα',
    description: 'Βελτίωσε τις γλωσσικές σου δεξιότητες διαβάζοντας πραγματικά άρθρα, ξαναγράφοντας προτάσεις και εξασκώντας την προφορά. Νέο περιεχόμενο κάθε μέρα.',
  },
}

export function updateSEO(lang) {
  const meta = SEO[lang] || SEO.en

  // Page title
  document.title = meta.title

  // html[lang]
  document.documentElement.lang = meta.htmlLang

  // Meta description
  let desc = document.querySelector('meta[name="description"]')
  if (!desc) {
    desc = document.createElement('meta')
    desc.setAttribute('name', 'description')
    document.head.appendChild(desc)
  }
  desc.setAttribute('content', meta.description)

  // Open Graph
  setMeta('property', 'og:title', meta.title)
  setMeta('property', 'og:description', meta.description)
  setMeta('property', 'og:url', `${BASE_URL}/?lang=${lang}`)

  // Twitter
  setMeta('name', 'twitter:title', meta.title)
  setMeta('name', 'twitter:description', meta.description)
}

function setMeta(attr, value, content) {
  let el = document.querySelector(`meta[${attr}="${value}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, value)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}
