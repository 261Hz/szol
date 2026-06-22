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
  bottom: 1rem;
  right: 1rem;
  z-index: 20;
  max-width: 200px;
  text-align: right;
  cursor: pointer;
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
  user-select: none;
}

.litclock:hover {
  background: rgba(245,235,220,0.04);
}

.litclock-text {
  font-size: 0.6rem;
  line-height: 1.55;
  font-style: italic;
  color: rgba(245,235,220,0.35);
  transition: color 0.2s;
}

.litclock:hover .litclock-text,
.litclock--expanded .litclock-text {
  color: rgba(245,235,220,0.55);
}

.litclock-time {
  font-style: normal;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: rgba(245,235,220,0.85);
}

.litclock:hover .litclock-time,
.litclock--expanded .litclock-time {
  color: rgba(245,235,220,1);
}

.litclock-credit {
  font-size: 0.55rem;
  color: rgba(245,235,220,0.3);
  margin-top: 0.3rem;
  font-style: normal;
}
</style>
