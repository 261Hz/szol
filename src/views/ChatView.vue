<template>
  <div class="flex flex-col gap-4 h-full">

    <!-- Not logged in -->
    <div v-if="!currentUser" class="text-center py-16 flex flex-col gap-3">
      <div class="text-4xl">🤖</div>
      <div class="text-gray-600 text-sm font-medium">AI Language Tutor</div>
      <div class="text-gray-400 text-xs">
        <button @click="$emit('open-auth')" class="underline hover:text-emerald-500 transition-all">Login</button>
        to chat with your language tutor.
      </div>
    </div>

    <!-- Logged in -->
    <template v-else>

      <!-- Header: story context + clear button -->
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-gray-700">AI Tutor</div>
          <div v-if="story" class="text-xs text-gray-400 mt-0.5">
            Context: <span class="italic">{{ story.title ?? story.text?.slice(0, 40) + '…' }}</span>
          </div>
          <div v-else class="text-xs text-gray-400 mt-0.5">No story loaded — load one from Library for context.</div>
        </div>
        <button
          v-if="messages.length"
          @click="clearChat"
          class="text-xs text-gray-400 hover:text-red-400 transition-all px-2 py-1 rounded border border-gray-200 hover:border-red-200"
        >Clear</button>
      </div>

      <!-- Conversation history -->
      <div
        ref="scrollEl"
        class="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0 max-h-[60vh] pr-1"
      >
        <!-- Empty state -->
        <div v-if="!messages.length" class="text-gray-400 text-sm text-center py-8">
          Say something in {{ langName }} to start practicing!
        </div>

        <!-- Messages -->
        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="[
            'px-4 py-2.5 rounded-xl text-sm leading-relaxed max-w-[85%]',
            msg.role === 'user'
              ? 'bg-emerald-500 text-white self-end rounded-br-sm'
              : 'bg-gray-100 text-gray-800 self-start rounded-bl-sm'
          ]"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
        >{{ msg.text }}</div>

        <!-- Typing indicator -->
        <div v-if="loading" class="bg-gray-100 text-gray-400 text-sm px-4 py-2.5 rounded-xl rounded-bl-sm self-start">
          <span class="animate-pulse">…</span>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-xs text-red-500 px-1">{{ error }}</div>

      <!-- Input row -->
      <div class="flex gap-2 items-end">
        <textarea
          v-model="input"
          rows="2"
          :placeholder="`Write in ${langName}…`"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none transition-all"
          @keydown.enter.exact.prevent="send"
        />
        <button
          @click="send"
          :disabled="loading || !input.trim()"
          class="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 transition-all flex-shrink-0"
        >Send</button>
      </div>
      <div class="text-xs text-gray-400 -mt-2">Enter to send</div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { sendChat } from '../utils/api.js'

const props = defineProps({
  story:       Object,  // current story for context
  lang:        String,
  currentUser: Object,
  vocabBank:   { type: Array, default: () => [] },
})

defineEmits(['open-auth'])

const input    = ref('')
const loading  = ref(false)
const error    = ref('')
const messages = ref([])  // [{ role: 'user'|'model', text: string }]
const scrollEl = ref(null)

const langName = computed(() => LANGS[props.lang]?.name ?? props.lang)

// Vocab words for the active language, capped at 50 to keep the prompt lean
const vocabWords = computed(() =>
  props.vocabBank
    .filter(v => v.lang === props.lang)
    .map(v => v.word)
    .slice(0, 50)
)

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  error.value = ''
  messages.value.push({ role: 'user', text })
  input.value  = ''
  loading.value = true
  await scrollToBottom()

  try {
    const { reply } = await sendChat({
      message:      text,
      storyContent: props.story?.text ?? props.story?.content ?? '',
      lang:         props.lang,
      // Pass all prior turns as history (everything except the message we just appended)
      history:      messages.value.slice(0, -1),
      vocab:        vocabWords.value,
      proficiency:  props.currentUser?.proficiency ?? null,
    })
    messages.value.push({ role: 'model', text: reply })
  } catch (e) {
    error.value = e.message
    messages.value.pop() // remove the user message if the request failed
    input.value = text   // put their text back
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
