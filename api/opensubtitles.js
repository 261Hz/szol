// api/opensubtitles.js — Vercel serverless function: proxy for the OpenSubtitles REST API v1.
//
// WHY THIS EXISTS:
// OpenSubtitles requires an API key sent in the request headers, which cannot be exposed
// in browser-side JavaScript. Running the requests through this server-side function keeps
// the key secret in Vercel's environment variables.
//
// SETUP: Add OPENSUBTITLES_API_KEY to your Vercel project environment variables.
// Get a free API key at: https://www.opensubtitles.com/consumers
//
// Two actions:
//   GET /api/opensubtitles?action=search&query=Inception&lang=en
//     → searches for subtitles matching the title in the given language
//     → returns { data: [subtitle objects] }
//
//   GET /api/opensubtitles?action=download&file_id=12345
//     → gets a temporary download link from OpenSubtitles, fetches the SRT file,
//       parses it into plain text, and returns { text, fileName, remaining }

// Maps app language codes to the 2-letter codes OpenSubtitles uses.
// arz (Egyptian Arabic) falls back to 'ar' since there is no separate Egyptian Arabic corpus.
const OS_LANG = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it',
  ru: 'ru', he: 'he', ar: 'ar', arz: 'ar',
  ja: 'ja', zh: 'zh', hu: 'hu', el: 'el',
}

// parseSRT() converts an SRT subtitle file into clean readable prose.
// SRT format looks like:
//   1
//   00:00:01,500 --> 00:00:04,000
//   Hello, world.
//
//   2
//   00:00:04,100 --> 00:00:06,000
//   How are you?
//
// We strip sequence numbers, timestamps, and styling tags, leaving only dialogue.
// Lines are joined into a single paragraph for use as a reading story.
function parseSRT(srt) {
  return srt
    // Remove lines that are only digits (sequence numbers like "1", "2", "123").
    // ^...$gm = ^ start of line, $ end of line, g = all matches, m = multiline mode.
    .replace(/^\d+\s*$/gm, '')
    // Remove timestamp lines: "00:00:01,500 --> 00:00:04,000"
    // Handles both comma and period as the millisecond separator (format varies by tool).
    .replace(/\d{2}:\d{2}:\d{2}[,.:]\d{2,3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{2,3}/g, '')
    // Strip HTML-style italic/bold tags some SRT files use: <i>...</i>, <b>...</b>
    .replace(/<[^>]+>/g, '')
    // Strip ASS/SSA override tags like {\an8} used by some subtitle authoring tools.
    .replace(/\{[^}]+\}/g, '')
    // Split into lines, trim whitespace, remove blanks, then join into one paragraph.
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join(' ')
    // Collapse any double spaces that result from removing tags mid-line.
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// handler() is the Vercel serverless function entry point.
export default async function handler(req, res) {
  // Read the API key from environment variables — never hard-code secrets in source.
  const API_KEY = process.env.OPENSUBTITLES_API_KEY || ''

  if (!API_KEY) {
    // Return an empty result (not an error status) so the UI degrades gracefully.
    return res.status(200).json({ error: 'OpenSubtitles API key not configured', data: [] })
  }

  // All OpenSubtitles API requests require these three headers.
  const headers = {
    'Api-Key':      API_KEY,
    'Content-Type': 'application/json',
    'User-Agent':   'szol v1.0',
  }

  // Destructure all possible query parameters from the incoming request URL.
  const { action, query, lang, file_id } = req.query

  // ── SEARCH ACTION ──────────────────────────────────────────────────────
  if (action === 'search') {
    if (!query) return res.status(400).json({ error: 'query required' })

    // Map the app language code to the OpenSubtitles language code.
    const osLang = OS_LANG[lang] || 'en'

    try {
      // Search endpoint: returns subtitle metadata (not the actual subtitle text).
      // per_page=10 = return up to 10 results to give the user options.
      const r = await fetch(
        `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(query)}&languages=${osLang}&per_page=10`,
        { headers }
      )
      if (!r.ok) return res.status(200).json({ data: [] })
      const data = await r.json()

      // Cache search results for 5 minutes — subtitle metadata rarely changes.
      res.setHeader('Cache-Control', 's-maxage=300')
      // data.data is the array of subtitle match objects from OpenSubtitles.
      res.status(200).json({ data: data.data ?? [] })
    } catch {
      res.status(200).json({ data: [] })
    }

  // ── DOWNLOAD ACTION ────────────────────────────────────────────────────
  } else if (action === 'download') {
    if (!file_id) return res.status(400).json({ error: 'file_id required' })

    try {
      // Step 1: POST to the download endpoint to get a temporary download link.
      // OpenSubtitles doesn't let you download SRT files directly — you must request
      // a short-lived signed URL. The API also tracks download quotas per user/API key.
      const dlRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_id: Number(file_id) }), // file_id must be a number, not a string
      })
      if (!dlRes.ok) return res.status(200).json({ error: 'Download request failed', text: '' })
      const dlData = await dlRes.json()

      if (!dlData.link) return res.status(200).json({ error: 'No download link returned', text: '' })

      // Step 2: Fetch the actual SRT file using the temporary signed link.
      const srtRes = await fetch(dlData.link)
      if (!srtRes.ok) return res.status(200).json({ error: 'Could not fetch subtitle file', text: '' })
      const srtText = await srtRes.text() // .text() reads the response as a raw string (not JSON)

      // Parse the SRT into a clean paragraph of dialogue.
      const text = parseSRT(srtText)
      res.status(200).json({
        text,
        // file_name = the original subtitle filename (e.g. "Inception.2010.en.srt")
        fileName:  dlData.file_name ?? '',
        // remaining = how many downloads are left in the API key's daily quota
        remaining: dlData.remaining ?? null,
      })
    } catch (e) {
      res.status(200).json({ error: e.message, text: '' })
    }

  } else {
    res.status(400).json({ error: 'action must be "search" or "download"' })
  }
}
