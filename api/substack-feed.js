// api/substack-feed.js — returns recent Substack posts in the target language.
// Uses a curated seed list per language; no leaderboard API (too slow from serverless).
// Results CDN-cached 4h so the function rarely executes.
//
// ?lang=de&limit=10

// Stop-word language detection — used when RSS <language> tag is absent
const STOP = {
  de: ['der','die','das','und','ist','nicht','mit','von','zu','ein','eine','auch','auf','aber'],
  fr: ['le','la','les','et','est','pas','en','un','une','du','des','pour','dans','qui','sur'],
  es: ['el','la','los','las','y','es','no','en','un','una','de','que','por','con','del'],
  pt: ['o','a','os','as','e','não','em','um','uma','de','que','para','com','do','da'],
  it: ['il','la','i','le','e','non','di','un','una','in','che','per','con','del'],
  nl: ['de','het','een','en','van','is','niet','dat','op','te','zijn','maar','ook'],
  ru: ['и','в','не','на','что','с','это','как','я','он','они','мы','но','то','за'],
  pl: ['i','w','nie','na','jest','to','się','że','z','do','jak','ale','czy'],
  tr: ['ve','bir','bu','da','de','ile','için','olan','daha','ama','çok'],
  sv: ['och','det','att','en','av','på','är','som','för','med','men','om'],
  ja: ['の','に','は','を','が','で','と','も','た','て','から','まで'],
  ko: ['이','그','에','를','은','는','가','의','을','로','도','한'],
  zh: ['的','了','在','是','有','我','不','他','这','个','们','上','来'],
}

function detectLang(text) {
  const words = new Set(text.toLowerCase().match(/\b\w+\b/g) ?? [])
  let best = 'en', score = 0
  for (const [l, markers] of Object.entries(STOP)) {
    const s = markers.filter(m => words.has(m)).length
    if (s > score) { best = l; score = s }
  }
  return best
}

function parseRSS(xml) {
  const get = (src, tag) => {
    const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i').exec(src)
    return m ? m[1].trim() : ''
  }
  const stripHtml = s => s.replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#\d+);/g, ' ').replace(/\s+/g, ' ').trim()

  const items = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1]
    const title = get(chunk, 'title')
    const url   = get(chunk, 'link')
    if (!title || !url) continue
    items.push({
      title,
      description: stripHtml(get(chunk, 'description')).slice(0, 220),
      url,
      date: get(chunk, 'pubDate'),
    })
  }

  const chanPart  = xml.slice(0, xml.indexOf('<item>') || xml.length)
  const chanLang  = (/<language>(.*?)<\/language>/i.exec(chanPart) ?? [])[1]?.slice(0, 2) ?? ''
  const chanTitle = stripHtml(get(chanPart, 'title'))
  const chanEd    = (/<managingEditor>(.*?)<\/managingEditor>/i.exec(chanPart) ?? [])[1] ?? ''

  return { items, lang: chanLang, title: chanTitle, author: chanEd }
}

// 3s timeout — fast enough to finish within Vercel's 10s limit when fetching 8 in parallel
async function fetchRSS(slug) {
  try {
    const r = await fetch(`https://${slug}.substack.com/feed`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) return null
    const xml = await r.text()
    const p   = parseRSS(xml)
    if (!p.lang && p.items.length) {
      p.lang = detectLang(p.items.slice(0, 3).map(i => i.title + ' ' + i.description).join(' '))
    }
    return { ...p, slug }
  } catch {
    return null
  }
}

// Curated seed list of Substack publications per language.
// Add more slugs here as you discover them — content is always live from RSS.
const SEEDS = {
  de: ['krautreporter','riffreporter','correctiv','uebermedien','nilsminkmar','nils-minkmar'],
  fr: ['lessurligneurs','davduf','ledesk','streetpress','le-grand-continent'],
  es: ['elordenmundial','gatopardo','masdemedios','politica-argentina','ladiaria'],
  pt: ['agenciapublica','piauimagazine','nexojornal','the-intercept-brasil'],
  it: ['minimamoralia','editorialedomani','ilpost','valigia-blu'],
  ru: ['meduza','theins','novayagazeta','the-insider'],
  ja: ['tokyotimes','japan-now','nipponica'],
  ko: ['hankookilbo','koreaexpose'],
  nl: ['decorrespondent','groene-amsterdammer'],
  pl: ['konkret24','oko-press','gazeta-wyborcza-substack'],
  tr: ['bianet','medyascope','gazete-duvar'],
  sv: ['omni-nyheter','di-digital','svt-substack'],
  zh: ['initium-media','chinadigitaltimes'],
  ar: ['alaraby','asharq-al-awsat-substack'],
  en: ['platformer','pragmaticengineer','noahpinion','slowboring','acoup',
       'cremieux','astralcodexten','freddie-deboer','hamiltonnolan','persuasion'],
}

export default async function handler(req, res) {
  const { lang = 'en', limit = '10' } = req.query
  const n = Math.min(parseInt(limit) || 10, 20)

  const slugs = SEEDS[lang] ?? SEEDS['en']
  console.log(`substack-feed lang=${lang} slugs=${slugs.length}`)

  // Fetch up to 8 feeds in parallel — leaves headroom within Vercel's 10s limit
  const feeds = await Promise.all(slugs.slice(0, 8).map(fetchRSS))
  const ok = feeds.filter(Boolean)
  console.log(`substack-feed fetched ${ok.length}/${Math.min(slugs.length, 8)} feeds`)
  ok.forEach(f => console.log(`  ${f.slug}: lang=${f.lang} items=${f.items.length}`))

  const articles = []
  for (const feed of ok) {
    const feedLang = feed.lang || 'en'
    if (feedLang !== lang) continue
    for (const item of feed.items.slice(0, 2)) {
      articles.push({
        title:   item.title,
        excerpt: item.description,
        url:     item.url,
        date:    item.date,
        pub:     feed.title,
        author:  feed.author,
      })
      if (articles.length >= n) break
    }
    if (articles.length >= n) break
  }

  console.log(`substack-feed returning ${articles.length} articles`)
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600')
  return res.status(200).json(articles.slice(0, n))
}
