// api/extract.js — Vercel serverless function: extracts readable article text from any URL.
//
// WHY THIS EXISTS:
// Most news and article sites block direct browser requests with CORS headers.
// Running the extraction on Vercel's servers avoids this restriction — the server

import { requireAuth } from './_auth.js'
// fetches the page, @extractus/article-extractor strips the boilerplate (nav, ads, etc.),
// and we return clean plain text for import as a story.
//
// Usage: GET /api/extract?url=https://www.bbc.com/news/some-article
// Returns: { title, text, description } or { error, title: '', text: '' }
//
// In production: Vercel deploys this file as a serverless function automatically.
// In local dev:  Run `vercel dev` (not `vite dev`) to activate this endpoint.

import { extract } from '@extractus/article-extractor'

// stripHtml() converts HTML content to clean plain text.
// article-extractor returns the article body as HTML — we need plain text for reading.
// The chain of replacements converts block elements to newlines first, then strips all tags,
// then decodes HTML entities (&amp; → &), and finally collapses excess blank lines.
function stripHtml(html) {
  if (!html) return ''
  return html
    // Convert block-level closing tags to newlines before stripping, to preserve paragraph breaks.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,      '\n')
    .replace(/<\/div>/gi,    '\n')
    .replace(/<\/li>/gi,     '\n')
    // Strip all remaining HTML tags (anything between < and >).
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities so the text reads naturally.
    .replace(/&nbsp;/g,  ' ')
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#39;/g,   "'")
    // Collapse 3+ consecutive blank lines into a single blank line.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// handler() is the Vercel serverless function entry point.
// req.query contains the URL parameters (?url=...). res is the response object.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  const { url } = req.query

  if (!url) {
    return res.status(400).json({ error: 'url parameter required' })
  }

  // Validate the URL before fetching — reject non-HTTP protocols to prevent SSRF attacks.
  // (SSRF = Server-Side Request Forgery: using our server to reach internal/private networks.)
  let parsed
  try {
    parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol')
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  try {
    // extract() fetches the URL and uses heuristics to identify the main article content.
    // The custom User-Agent helps avoid being blocked by sites that filter bots.
    const article = await extract(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; szol-app/1.0)' },
    })

    if (!article) {
      // extract() returns null when it cannot confidently identify article content
      // (e.g. home pages, search results, login-walled pages).
      return res.status(200).json({ error: 'Could not extract article content', title: '', text: '' })
    }

    // article.content is the main body (HTML). article.description is the meta description (plain text).
    // Fall back through content → description in case one is missing.
    const text = stripHtml(article.content || article.description || '')

    // Cache for 1 hour: articles don't change every minute, and caching reduces Vercel function calls.
    // s-maxage = Vercel CDN cache lifetime. Client browsers also respect this header.
    res.setHeader('Cache-Control', 's-maxage=3600')
    res.status(200).json({
      // Fall back to the hostname (e.g. "www.bbc.com") if the article has no title.
      title:       article.title ?? parsed.hostname,
      text,
      description: stripHtml(article.description ?? ''),
    })
  } catch (e) {
    // Return status 200 even on error so the frontend can handle it gracefully
    // (a 500 status would trigger the browser's generic error handling).
    res.status(200).json({ error: e.message, title: '', text: '' })
  }
}
