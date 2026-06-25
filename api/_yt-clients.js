// YouTube InnerTube client configurations used by the Innertube/player API.
// Keys are YouTube's own embedded client identifiers (same values in yt-dlp/youtube-dl).
// Set these three Vercel env vars — they are NOT in code:
//   YT_KEY_IOS, YT_KEY_ANDROID, YT_KEY_WEB
export function ytClients(videoId) {
  return [
    {
      url:     'https://www.youtube.com/youtubei/v1/player?key=' + process.env.YT_KEY_IOS     + '&prettyPrint=false',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)', 'X-YouTube-Client-Name': '5', 'X-YouTube-Client-Version': '19.09.3' },
      client:  { clientName: 'IOS', clientVersion: '19.09.3', deviceModel: 'iPhone14,3', hl: 'en', gl: 'US', userAgent: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)' },
    },
    {
      url:     'https://www.youtube.com/youtubei/v1/player?key=' + process.env.YT_KEY_ANDROID + '&prettyPrint=false',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': '19.09.37' },
      client:  { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' },
    },
    {
      url:     'https://www.youtube.com/youtubei/v1/player?key=' + process.env.YT_KEY_WEB     + '&prettyPrint=false',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': '2.20241201.01.00', 'Origin': 'https://www.youtube.com', 'Referer': `https://www.youtube.com/watch?v=${videoId}` },
      client:  { clientName: 'WEB', clientVersion: '2.20241201.01.00', hl: 'en', gl: 'US' },
    },
  ]
}
