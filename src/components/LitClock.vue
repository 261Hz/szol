<template>
  <div
    v-if="quote"
    class="litclock"
    :class="{ 'litclock--expanded': expanded }"
    @click="expanded = !expanded"
    title="Literary Clock"
  >
    <p class="litclock-text">
      <span class="litclock-context">{{ trimFirst(quote.quote_first) }}</span><!--
      --><span class="litclock-time">{{ quote.quote_time_case }}</span><!--
      --><span class="litclock-context">{{ trimLast(quote.quote_last) }}</span>
    </p>
    <p v-if="expanded" class="litclock-credit">— {{ quote.title }} &middot; {{ quote.author }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const quote    = ref(null)
const expanded = ref(false)
let   timer    = null

function trimFirst(str) {
  if (!str) return ''
  const words = str.trim().split(/\s+/)
  return (words.length > 5 ? '…' + words.slice(-5).join(' ') : str.trim()) + ' '
}

function trimLast(str) {
  if (!str) return ''
  const words = str.trim().split(/\s+/)
  return ' ' + (words.length > 7 ? words.slice(0, 7).join(' ') + '…' : str.trim())
}

async function fetchQuote() {
  try {
    const now = new Date()
    const hh  = String(now.getHours()).padStart(2, '0')
    const mm  = String(now.getMinutes()).padStart(2, '0')
    const res = await fetch(`https://raw.githubusercontent.com/JohannesNE/literature-clock/master/docs/times/${hh}_${mm}.json`)
    if (!res.ok) return
    const quotes = await res.json()
    if (quotes?.length) quote.value = quotes[Math.floor(Math.random() * quotes.length)]
  } catch { /* ignore */ }
}

onMounted(() => {
  fetchQuote()
  const msToNext = (60 - new Date().getSeconds()) * 1000
  timer = setTimeout(() => {
    fetchQuote()
    timer = setInterval(fetchQuote, 60_000)
  }, msToNext)
})

onUnmounted(() => {
  clearTimeout(timer)
  clearInterval(timer)
})
</script>

<style scoped>
.litclock {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  max-width: 380px;
  width: max-content;
  text-align: center;
  cursor: pointer;
  padding: 0.35rem 1rem 0.3rem;
  border-radius: 0 0 6px 6px;
  background: rgba(212,199,164,0.82);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(31,27,23,0.1);
  border-top: none;
  transition: background 0.2s;
  user-select: none;
}

.litclock:hover {
  background: rgba(212,199,164,0.96);
}

.litclock-text {
  font-size: 0.65rem;
  line-height: 1.5;
  font-style: italic;
  font-family: 'EB Garamond', serif;
  color: rgba(31,27,23,0.38);
  transition: color 0.2s;
}

.litclock:hover .litclock-text,
.litclock--expanded .litclock-text {
  color: rgba(31,27,23,0.58);
}

.litclock-time {
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(31,27,23,0.78);
}

.litclock:hover .litclock-time,
.litclock--expanded .litclock-time {
  color: #1f1b17;
}

.litclock-credit {
  font-size: 0.58rem;
  color: rgba(31,27,23,0.32);
  margin-top: 0.25rem;
  font-style: normal;
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.02em;
}
</style>
