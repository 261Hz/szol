import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { inject } from '@vercel/analytics'
inject()
createApp(App).mount('#app')

// When the service worker serves a stale chunk that no longer exists on the
// server (404), Vite fires this event instead of crashing silently. A reload
// fetches the current index.html and the new chunk hashes.
window.addEventListener('vite:preloadError', () => { window.location.reload() })
