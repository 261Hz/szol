// Adapter registry — dispatches to the right source and caches the result.
//
// Usage:
//   const text = await fetchDocumentContent(collection, document)
//
// collection: { adapter, adapter_config }   (from /collections/{id} response)
// document:   { content, locator }

import { getCached, setCached }  from './cache.js'
import { fetchMediaWiki }        from './mediawiki.js'
import { fetchGithub }           from './github.js'

async function runAdapter(adapter, adapterConfig, locator) {
  switch (adapter) {
    case 'mediawiki': return fetchMediaWiki(adapterConfig, locator)
    case 'github':    return fetchGithub(adapterConfig, locator)
    case 'inline':    return null   // content already in document.content
    default:          return null
  }
}

export async function fetchDocumentContent(collection, document) {
  // Inline: content stored directly in the DB row
  if (document.content) return document.content

  const { adapter, adapter_config } = collection
  const locator = document.locator

  if (!adapter || !locator) return null

  // Cache key includes adapter, config site, and locator so each unique
  // source+page+entry combination is cached once.
  const siteKey = adapter_config?.site ?? adapter_config?.shortcut ?? ''
  const cacheKey = `${adapter}:${siteKey}:${JSON.stringify(locator)}`

  const cached = await getCached(cacheKey)
  if (cached) return cached

  const text = await runAdapter(adapter, adapter_config, locator)
  if (text) await setCached(cacheKey, text)
  return text
}
