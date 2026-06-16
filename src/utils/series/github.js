// GitHub raw adapter — CORS ✓ on raw.githubusercontent.com.
// Used for source texts mirrored on GitHub (Aozora Bunko, Ben Yehuda, etc.)
//
// adapterConfig:  { owner, repo, branch }   — default branch: "master"
// locator:        { path }                   — path within the repo
//
// Built-in repo shortcuts (set via adapterConfig.shortcut):
//   "aozora"     → aozorabunko/aozorabunko/master
//   "benyehuda"  → projectbenyehuda/public_domain_dump/master

const SHORTCUTS = {
  aozora:    { owner: 'aozorabunko',         repo: 'aozorabunko',            branch: 'master' },
  benyehuda: { owner: 'projectbenyehuda',    repo: 'public_domain_dump',     branch: 'master' },
}

function buildUrl(adapterConfig, locator) {
  const shortcut = adapterConfig?.shortcut ? SHORTCUTS[adapterConfig.shortcut] : null
  const owner  = shortcut?.owner  ?? adapterConfig?.owner
  const repo   = shortcut?.repo   ?? adapterConfig?.repo
  const branch = shortcut?.branch ?? adapterConfig?.branch ?? 'master'
  const path   = locator?.path
  if (!owner || !repo || !path) return null
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Aozora: remove ruby annotations (keep kanji base, drop furigana)
  doc.querySelectorAll('rt, rp').forEach(el => el.remove())
  return Array.from(doc.querySelectorAll('p, div.main_text, .text'))
    .map(el => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

export async function fetchGithub(adapterConfig, locator) {
  const url = buildUrl(adapterConfig, locator)
  if (!url) return null

  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  } catch {
    return null
  }
  if (!res.ok) return null

  const text = await res.text()
  if (url.endsWith('.html') || url.endsWith('.htm')) return stripHtml(text)
  return text
}
