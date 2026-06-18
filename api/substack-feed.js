// api/substack-feed.js — fetches recent Substack posts filtered by language.
// Discovers publications via the leaderboard API, falls back to a seed list.
// No category filtering — just language.
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

async function fetchRSS(slug) {
  try {
    const r = await fetch(`https://${slug}.substack.com/feed`, {
      headers: { 'User-Agent': 'SzolBot/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const xml = await r.text()
    const p   = parseRSS(xml)
    if (!p.lang && p.items.length) {
      const sample = p.items.slice(0, 3).map(i => i.title + ' ' + i.description).join(' ')
      p.lang = detectLang(sample)
    }
    return { ...p, slug }
  } catch {
    return null
  }
}

// Seed list of known non-English Substack publications, by language.
// The leaderboard is tried first; seeds are the fallback.
const SEEDS = {
  de: ['nilsminkmar','krautreporter','riffreporter','correctiv','uebermedien'],
  fr: ['lessurligneurs','davduf','mariefrance','latribune','ledesk'],
  es: ['elordenmundial','gatopardo','masdemedios','elconfidencial','elespanol'],
  pt: ['agenciapublica','piauimagazine','nexojornal'],
  it: ['minimamoralia','editorialedomani','ilpost'],
  ru: ['meduza','theins','novayagazeta'],
  ja: ['nikkei-substack','tokyotimes'],
  nl: ['decorrespondent','groene'],
  pl: ['tokfm','noizz'],
  tr: ['gazetesayfa','bianet'],
  ko: ['hankookilbo'],
  en: ['platformer','pragmaticengineer','noahpinion','slowboring','acoup','cremieux','astralcodexten'],
}

async function leaderboardSlugs(limit = 50) {
  try {
    const r = await fetch(
      `https://substack.com/api/v1/leaderboard?limit=${limit}&type=newsletter`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return []
    const data = await r.json()
    const pubs = data.leaderboard ?? data.results ?? data.publications ?? data.items ?? []
    return pubs.map(p => p.subdomain ?? p.slug ?? p.handle).filter(Boolean)
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  const { lang = 'en', limit = '10' } = req.query
  const n = Math.min(parseInt(limit) || 10, 20)

  // Get publication slugs — leaderboard first, language-specific seeds as fallback
  let slugs = await leaderboardSlugs(50)
  console.log(`substack-feed lang=${lang} leaderboard=${slugs.length} slugs`)
  const langSeeds = SEEDS[lang] ?? []
  const seen = new Set(slugs)
  for (const s of langSeeds) if (!seen.has(s)) slugs.push(s)
  console.log(`substack-feed total slugs to fetch: ${Math.min(slugs.length, 20)}`)

  // Fetch up to 20 feeds in parallel (Vercel function has ~10s budget)
  const feeds = await Promise.all(slugs.slice(0, 20).map(fetchRSS))
  const fetched = feeds.filter(Boolean)
  console.log(`substack-feed fetched ${fetched.length}/${Math.min(slugs.length, 20)} feeds`)

  const articles = []
  for (const feed of feeds) {
    if (!feed || !feed.items.length) continue
    const feedLang = feed.lang || detectLang(feed.items.map(i => i.title + ' ' + i.description).join(' '))
    console.log(`  ${feed.slug}: detected=${feedLang} items=${feed.items.length}`)
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

  console.log(`substack-feed returning ${articles.length} articles for lang=${lang}`)
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600')
  return res.status(200).json(articles.slice(0, n))
}
