import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Szól',
        short_name: 'Szól',
        description: 'Read, listen, and write in any language.',
        theme_color: '#2a241c',
        background_color: '#d4c7a4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Without this, the SPA navigation fallback (needed so refreshing on a
        // client-side route doesn't 404) also catches direct <a href> clicks on
        // /api/* endpoints -- e.g. the APK download link -- and serves the
        // cached app shell instead of letting the request reach the function.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // App API — network first, fall back to cache
            urlPattern: /^https:\/\/szol\.onrender\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // HanziWriter stroke data — cache forever after first load (data never changes)
            urlPattern: /cdn\.jsdelivr\.net\/npm\/hanzi-writer-data/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hanzi-stroke-cache',
              expiration: { maxEntries: 10000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts + web fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    proxy: {
      '/api/tatoeba': {
        target: 'https://tatoeba.org',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/tatoeba', '/en/api_v0/search'),
      },
    },
  },
})
