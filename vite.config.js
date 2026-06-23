import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: {
    proxy: {
      // In local dev, redirect /api/tatoeba to Tatoeba's real API.
      // Vite makes this request from its own Node.js process (no browser CORS restriction).
      // In production on Vercel, /api/tatoeba is handled by api/tatoeba.js instead.
      '/api/tatoeba': {
        target: 'https://tatoeba.org',
        changeOrigin: true, // makes the request look like it came from tatoeba.org itself
        // rewrite() transforms the path before forwarding.
        // /api/tatoeba?query=... → /en/api_v0/search?query=...
        // The query string (?query=...) is preserved automatically; only the path is rewritten.
        rewrite: (path) => path.replace('/api/tatoeba', '/en/api_v0/search'),
      },
    },
  },
})