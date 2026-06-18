// api/substack-feed.js — discovers Substack publications by category, fetches their
// RSS feeds, and filters to a target language. No auth required; results CDN-cached 4h.
//
// ?lang=de&category=gaming&limit=10

// Stop-word language detection — fires when RSS <language> tag is absent
const STOP = {
  de: ['der','die','das','und','ist','nicht','mit','von','zu','ein','eine','auch','auf','aber'],
  fr: ['le','la','les','et','est','pas','en','un','une','du','des','pour','dans','qui','sur'],
  es: ['el','la','los','las','y','es','no','en','un','una','de','que','por','con','del'],
  pt: ['o','a','os','as','e','não','em','um','uma','de','que','para','com','uma','do'],
  it: ['il','la','i','le','e','non','di','un','una','in','che','per','con','del','una'],
  nl: ['de','het','een','en','van','is','niet','dat','op','te','een','zijn','maar'],
  ru: ['и','в','не','на','что','с','это','как','я','он','они','мы','но','то','за'],
  pl: ['i','w','nie','na','jest','to','się','że','z','do','jak','ale','czy'],
  tr: ['ve','bir','bu','da','de','ile','için','olan','daha','ama','olan','çok'],
  sv: ['och','det','att','en','av','på','är','som','för','med','men','om'],
  ja: ['の','に','は','を','が','で','と','も','た','て','から','まで'],
  ko: ['이','그','에','를','은','는','가','의','을','로','도','한'],
  zh: ['的','了','在','是','有','我','不','他','这','个','们','上','来'],
}

// Category name in each language for a better Substack search query
const CAT_TERMS = {
  sports:  { de:'Sport',      fr:'Sport',    es:'Deporte', pt:'Esporte',  it:'Sport',     ru:'спорт',    ja:'スポーツ',      ko:'스포츠',  zh:'体育',   tr:'Spor',   sv:'Sport', nl:'Sport', pl:'Sport'  },
  gaming:  { de:'Gaming',     fr:'Jeux',     es:'Videojuegos',pt:'Jogos', it:'Videogiochi',ru:'игры',    ja:'ゲーム',        ko:'게임',    zh:'游戏',   tr:'Oyun',   sv:'Spel',  nl:'Spellen',pl:'Gry' },
  anime:   { de:'Anime',      fr:'Anime',    es:'Anime',   pt:'Anime',    it:'Anime',     ru:'аниме',    ja:'アニメ',        ko:'애니메이션',zh:'动漫',  tr:'Anime',  sv:'Anime', nl:'Anime', pl:'Anime' },
  manga:   { de:'Manga',      fr:'Manga',    es:'Manga',   pt:'Mangá',    it:'Manga',     ru:'манга',    ja:'マンガ',        ko:'만화',    zh:'漫画',   tr:'Manga',  sv:'Manga', nl:'Manga', pl:'Manga' },
  culture: { de:'Kultur',     fr:'Culture',  es:'Cultura', pt:'Cultura',  it:'Cultura',   ru:'культура', ja:'文化',          ko:'문화',    zh:'文化',   tr:'Kültür', sv:'Kultur',nl:'Cultuur',pl:'Kultura'},
  fashion: { de:'Mode',       fr:'Mode',     es:'Moda',    pt:'Moda',     it:'Moda',      ru:'мода',     ja:'ファッション',  ko:'패션',    zh:'时尚',   tr:'Moda',   sv:'Mode',  nl:'Mode',  pl:'Moda'  },
  history: { de:'Geschichte', fr:'Histoire', es:'Historia',pt:'História', it:'Storia',    ru:'история',  ja:'歴史',          ko:'역사',    zh:'历史',   tr:'Tarih',  sv:'Historia',nl:'Geschiedenis',pl:'Historia'},
  tech:    { de:'Technologie',fr:'Technologie',es:'Tecnología',pt:'Tecnologia',it:'Tecnologia',ru:'технологии',ja:'テクノロジー',ko:'기술', zh:'技术',   tr:'Teknoloji',sv:'Teknik',nl:'Technologie',pl:'Technologia'},
  science: { de:'Wissenschaft',fr:'Science', es:'Ciencia', pt:'Ciência',  it:'Scienza',   ru:'наука',    ja:'科学',          ko:'과학',    zh:'科学',   tr:'Bilim',  sv:'Vetenskap',nl:'Wetenschap',pl:'Nauka'},
  food:    { de:'Essen',      fr:'Cuisine',  es:'Comida',  pt:'Culinária',it:'Cucina',    ru:'еда',      ja:'料理',          ko:'음식',    zh:'美食',   tr:'Yemek',  sv:'Mat',   nl:'Koken', pl:'Jedzenie'},
  music:   { de:'Musik',      fr:'Musique',  es:'Música',  pt:'Música',   it:'Musica',    ru:'музыка',   ja:'音楽',          ko:'음악',    zh:'音乐',   tr:'Müzik',  sv:'Musik', nl:'Muziek',pl:'Muzyka' },
  film:    { de:'Film',       fr:'Cinéma',   es:'Cine',    pt:'Cinema',   it:'Cinema',    ru:'кино',     ja:'映画',          ko:'영화',    zh:'电影',   tr:'Film',   sv:'Film',  nl:'Film',  pl:'Film'  },
  comedy:  { de:'Komödie',    fr:'Comédie',  es:'Comedia', pt:'Comédia',  it:'Commedia',  ru:'юмор',     ja:'コメディ',      ko:'코미디',  zh:'喜剧',   tr:'Komedi', sv:'Komedi',nl:'Komedie',pl:'Komedia'},
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

  // Channel-level metadata comes before the first <item>
  const chanPart  = xml.slice(0, xml.indexOf('<item>') || xml.length)
  const chanLang  = (/<language>(.*?)<\/language>/i.exec(chanPart) ?? [])[1]?.slice(0, 2) ?? ''
  const chanTitle = stripHtml(get(chanPart, 'title'))
  const chanEd    = (/<managingEditor>(.*?)<\/managingEditor>/i.exec(chanPart) ?? [])[1] ?? ''

  return { items, lang: chanLang, title: chanTitle, author: chanEd }
}

async function fetchRSS(slug) {
  try {
    const r = await fetch(`https://${slug}.substack.com/feed`, {
      headers: { 'User-Agent': 'SzolBot/1.0 (language-learning app)' },
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

// Discover publication slugs via Substack's internal search API
async function discoverSlugs(query, limit = 25) {
  const shapes = []
  try {
    const r = await fetch(
      `https://substack.com/api/v1/search?query=${encodeURIComponent(query)}&type=publication&limit=${limit}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (r.ok) {
      const data = await r.json()
      // Substack may return different shapes; try all known locations
      shapes.push(...(data.publications ?? data.results?.publications ?? data.items ?? []))
    }
  } catch { /* fall through */ }

  return shapes
    .map(p => p.subdomain ?? p.custom_domain_optional ?? p.slug ?? p.handle)
    .filter(Boolean)
}

export default async function handler(req, res) {
  const { lang = 'en', category = 'culture', limit = '10' } = req.query
  const n = Math.min(parseInt(limit) || 10, 20)

  // Search for the category in the target language so we surface non-English results
  const localTerm = CAT_TERMS[category]?.[lang] ?? category
  const queries   = localTerm !== category ? [localTerm, category] : [category]

  // Run both queries and merge slugs (deduped)
  const slugSets = await Promise.all(queries.map(q => discoverSlugs(q, 20)))
  const seen     = new Set()
  const slugs    = []
  for (const set of slugSets) {
    for (const s of set) {
      if (!seen.has(s)) { seen.add(s); slugs.push(s) }
    }
  }

  if (!slugs.length) {
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json([])
  }

  // Fetch RSS for first 12 slugs in parallel
  const feeds = await Promise.all(slugs.slice(0, 12).map(fetchRSS))

  const articles = []
  for (const feed of feeds) {
    if (!feed || !feed.items.length) continue
    const feedLang = feed.lang || 'en'
    // Include if it matches target language OR is English (many polyglots read English)
    if (feedLang !== lang && feedLang !== 'en') continue
    for (const item of feed.items.slice(0, 2)) {
      articles.push({
        title:   item.title,
        excerpt: item.description,
        url:     item.url,
        date:    item.date,
        pub:     feed.title,
        author:  feed.author,
        lang:    feedLang,
      })
      if (articles.length >= n) break
    }
    if (articles.length >= n) break
  }

  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600')
  return res.status(200).json(articles.slice(0, n))
}
