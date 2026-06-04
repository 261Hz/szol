<template>
  <!-- Not logged in -->
  <div v-if="!currentUser" class="text-center py-16 flex flex-col gap-3">
    <div class="text-4xl">🤖</div>
    <div class="text-gray-600 text-sm font-medium">AI Language Tutor</div>
    <div class="text-gray-400 text-xs">
      <button @click="$emit('open-auth')" class="underline hover:text-emerald-500 transition-all">Login</button>
      to chat with your language tutor.
    </div>
  </div>

  <!-- Chat UI -->
  <div v-else class="flex flex-col" style="height: calc(100dvh - 100px); min-height: 400px;">

    <!-- Header -->
    <div class="flex items-start justify-between mb-3 flex-shrink-0">
      <div>
        <div class="text-sm font-medium text-gray-700">💬 AI Tutor</div>
        <div class="text-xs text-gray-400 mt-0.5">
          <span v-if="story">{{ story.title ?? story.text?.slice(0, 50) + '…' }}</span>
          <span v-else>Load a story for richer context</span>
        </div>
      </div>
      <button
        v-if="messages.length"
        @click="clearChat"
        class="text-xs text-gray-400 hover:text-red-400 transition-all px-2 py-1 rounded-md border border-gray-200 hover:border-red-200 flex-shrink-0"
      >Clear</button>
    </div>

    <!-- Messages — fills remaining space and scrolls -->
    <div
      ref="scrollEl"
      class="flex-1 overflow-y-auto flex flex-col gap-2.5 min-h-0 pb-2"
    >
      <div v-if="!messages.length" class="text-gray-400 text-sm text-center py-10">
        Say something in {{ langName }} to start practicing!
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        :class="[
          'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed w-fit max-w-[82%]',
          msg.role === 'user'
            ? 'bg-emerald-500 text-white self-end rounded-br-sm'
            : 'bg-gray-100 text-gray-800 self-start rounded-bl-sm'
        ]"
        :dir="isRTL(lang) ? 'rtl' : 'ltr'"
      >{{ msg.text }}</div>

      <!-- Typing indicator -->
      <div v-if="loading" class="self-start bg-gray-100 text-gray-400 text-lg px-4 py-2 rounded-2xl rounded-bl-sm tracking-widest">
        <span class="animate-pulse">···</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="text-xs text-red-500 py-1 flex-shrink-0">{{ error }}</div>

    <!-- Input area — always at the bottom -->
    <div class="flex-shrink-0 pt-2 border-t border-gray-100">
      <div class="flex gap-2 items-end">
        <textarea
          ref="inputEl"
          v-model="input"
          :placeholder="`Write in ${langName}…`"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          rows="1"
          class="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400 resize-none transition-all leading-snug max-h-28 overflow-y-auto"
          style="field-sizing: content"
          @keydown.enter.exact.prevent="send"
          @input="autoResize"
        />
        <button
          @click="send"
          :disabled="loading || !input.trim()"
          class="h-10 w-16 rounded-2xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 transition-all flex-shrink-0 flex items-center justify-center"
        >
          <span v-if="loading">···</span>
          <span v-else>Send</span>
        </button>
      </div>
      <div class="text-[11px] text-gray-300 mt-1.5 text-right hidden sm:block">⏎ Enter to send</div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { sendChat } from '../utils/api.js'

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
  vocabBank:   { type: Array, default: () => [] },
})

defineEmits(['open-auth'])

const input    = ref('')
const loading  = ref(false)
const error    = ref('')
const messages = ref([])
const scrollEl = ref(null)
const inputEl  = ref(null)

const langName = computed(() => LANGS[props.lang]?.name ?? props.lang)

const vocabWords = computed(() =>
  props.vocabBank.filter(v => v.lang === props.lang).map(v => v.word).slice(0, 50)
)

// Auto-resize textarea as the user types (field-sizing:content is the CSS way;
// this JS fallback handles browsers that don't support it yet).
function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 112) + 'px'
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  error.value = ''
  messages.value.push({ role: 'user', text })
  input.value   = ''
  // reset textarea height
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  loading.value = true
  await scrollToBottom()

  try {
    const { reply } = await sendChat({
      message:      text,
      storyContent: props.story?.text ?? props.story?.content ?? '',
      lang:         props.lang,
      history:      messages.value.slice(0, -1),
      vocab:        vocabWords.value,
      proficiency:  props.currentUser?.proficiency ?? null,
    })
    messages.value.push({ role: 'model', text: reply })
  } catch (e) {
    error.value = e.message
    messages.value.pop()
    input.value = text
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

function clearChat() {
  messages.value = []
  error.value    = ''
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}
</script>
