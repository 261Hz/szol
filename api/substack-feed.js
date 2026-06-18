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


const STRIP = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// rss2json.com is a neutral proxy — fetches Substack RSS from their own IPs,
// which are not blocked by Substack the way Vercel's egress IPs are.
async function fetchViaProxy(slug) {
  const feedUrl = `https://${slug}.substack.com/feed`
  try {
    const r = await fetch(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=5`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) return null
    const data = await r.json()
    if (data.status !== 'ok' || !data.items?.length) return null

    const items = data.items
      .map(p => ({
        title:       p.title ?? '',
        description: STRIP(p.description ?? '').slice(0, 220),
        url:         p.link ?? '',
        date:        p.pubDate ?? '',
      }))
      .filter(i => i.title && i.url)

    if (!items.length) return null

    const feedLang = data.feed?.language?.slice(0, 2) ?? ''
    const lang = feedLang || detectLang(items.map(i => i.title + ' ' + i.description).join(' '))

    return { slug, items, lang, title: data.feed?.title ?? slug, author: data.feed?.author ?? '' }
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

  // Fetch up to 8 publications via rss2json proxy
  const feeds = await Promise.all(slugs.slice(0, 8).map(fetchViaProxy))
  const ok = feeds.filter(Boolean)
  console.log(`substack-feed fetched ${ok.length}/${Math.min(slugs.length, 8)} pubs`)
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
