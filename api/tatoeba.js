// Vercel serverless function: proxies Tatoeba API requests server-side.
//
// WHY THIS EXISTS:
// Tatoeba's API doesn't include the Access-Control-Allow-Origin header,
// so browsers block direct requests from szol.vercel.app (CORS error).
// Server-to-server requests have no CORS restriction, so this function
// fetches from Tatoeba on the user's behalf and returns the result.
//
// The frontend calls  GET /api/tatoeba?query=hola&from=spa&...
// This function forwards those params to Tatoeba and returns the JSON.

// "export default" works because package.json has "type": "module".
// Vercel automatically deploys every file in /api/ as a serverless function.
// "handler" receives req (the incoming request) and res (the outgoing response).
export default async function handler(req, res) {
  // req.query is an object of all URL query parameters.
  // new URLSearchParams(...).toString() turns { query:'hola', from:'spa', ... }
  // back into the string "query=hola&from=spa&..." for the Tatoeba URL.
  const params = new URLSearchParams(req.query).toString()

  try {
    // fetch() here runs on Vercel's servers, not in the browser -- no CORS restrictions.
    const r = await fetch(`https://tatoeba.org/en/api_v0/search?${params}`)

    // If Tatoeba returned an error status, send an empty results object.
    if (!r.ok) return res.status(200).json({ results: [] })

    // Parse the JSON body of Tatoeba's response.
    const data = await r.json()

    // Cache for 1 year -- the HTTP standard maximum, effectively permanent.
    // Tatoeba sentences are static; there's no reason to re-fetch the same query.
    // s-maxage = Vercel CDN cache lifetime in seconds. 31536000 = 60×60×24×365.
    res.setHeader('Cache-Control', 's-maxage=31536000, immutable')

    // Send Tatoeba's full JSON response back to the browser.
    res.status(200).json(data)
  } catch {
    // Any error (network failure, Tatoeba down, JSON parse error) returns an empty result
    // rather than a 500 error, so the UI shows "No examples found." gracefully.
    res.status(200).json({ results: [] })
  }
}
