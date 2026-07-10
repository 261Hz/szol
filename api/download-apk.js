// api/download-apk.js — serves the Android APK from a private Vercel Blob
// store, tracking each download server-side.
//
// The blob store is private (auth required for every read) specifically so
// downloads can't bypass tracking by sharing the raw storage URL -- this
// endpoint is the only way to get the file at all.
import { get } from '@vercel/blob'
import { track } from '@vercel/analytics/server'
import { Readable } from 'node:stream'

const FALLBACK_URL = 'https://github.com/261Hz/szol/releases/download/android-latest/szol-debug.apk'

export default async function handler(req, res) {
  try {
    await track('apk_download')
  } catch {
    // never let an analytics hiccup block the actual download
  }

  let result
  try {
    result = await get('szol.apk', { access: 'private' })
  } catch {
    result = null
  }

  if (!result) {
    res.writeHead(302, { Location: FALLBACK_URL })
    return res.end()
  }

  const { stream, blob } = result
  res.writeHead(200, {
    'Content-Type':        blob.contentType || 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="szol.apk"',
    ...(blob.size ? { 'Content-Length': blob.size } : {}),
  })
  Readable.fromWeb(stream).pipe(res)
}
