<template>
  <div class="flex flex-col gap-4">

    <!-- Auth gate -->
    <div v-if="!currentUser" class="flex flex-col items-center gap-3 py-14 text-center">
      <div class="text-3xl text-gray-600">✦</div>
      <p class="text-sm text-gray-500">Sign in to access the AI tutor.</p>
      <button
        @click="$emit('open-auth')"
        class="text-sm px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-colors"
      >Sign in</button>
    </div>

    <template v-else>

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-200">{{ langName }} tutor</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">immersion · Gemma 2</span>
        </div>
        <button
          v-if="messages.length"
          @click="clearChat"
          class="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >Clear</button>
      </div>

      <!-- Message thread -->
      <div ref="messagesEl" class="flex flex-col gap-3 max-h-[65vh] overflow-y-auto scroll-smooth">
        <div v-if="!messages.length" class="text-center text-gray-600 text-sm py-8 leading-relaxed">
          Responds only in {{ langName }}.<br>
          <span class="text-gray-700 text-xs">Ask about grammar, vocabulary, what you're reading — anything.</span>
        </div>

        <div v-for="msg in messages" :key="msg.id">
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div class="max-w-[75%] px-3 py-2 rounded-2xl rounded-br-sm bg-green-800 text-white text-sm leading-snug">
              {{ msg.content }}
            </div>
          </div>
          <div v-else class="flex justify-start">
            <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-800 text-gray-100 text-sm leading-snug whitespace-pre-wrap">
              <span v-if="msg.loading" class="flex gap-1 items-center h-4">
                <span v-for="i in 3" :key="i"
                  class="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                  :style="{ animationDelay: (i - 1) * 150 + 'ms' }"
                />
              </span>
              <span v-else>{{ msg.content }}</span>
            </div>
          </div>
        </div>

        <div v-if="error" class="text-xs text-red-400 text-center">{{ error }}</div>
      </div>

      <!-- Input row -->
      <div class="flex gap-2">
        <input
          v-model="input"
          @keydown.enter.prevent="send"
          :disabled="waiting"
          placeholder="Type in any language…"
          class="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-green-600 transition-colors disabled:opacity-50"
        />
        <button
          @click="send"
          :disabled="waiting || !input.trim()"
          class="px-4 py-2.5 rounded-xl bg-green-700 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-all"
        >{{ waiting ? '…' : 'Send' }}</button>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'
import { tutorChat } from '../utils/api.js'

const props = defineProps({
  currentUser: Object,
  lang:        String,
})

defineEmits(['open-auth'])

const langName = computed(() => LANGS[props.lang]?.name || props.lang || 'the language')

const messages   = ref([])
const input      = ref('')
const waiting    = ref(false)
const error      = ref('')
const modelUsed  = ref('gemma-4')   // updated per response
const messagesEl = ref(null)

async function send() {
  const text = input.value.trim()
  if (!text || waiting.value) return
  input.value = ''
  error.value = ''

  messages.value.push({ id: Date.now(), role: 'user', content: text })
  const aiMsg = { id: Date.now() + 1, role: 'assistant', content: '', loading: true }
  messages.value.push(aiMsg)
  waiting.value = true
  scrollBottom()

  const history = messages.value
    .slice(0, -1)
    .map(m => ({ role: m.role, content: m.content }))

  const result = await tutorChat({ messages: history, lang: props.lang })

  aiMsg.loading = false
  waiting.value = false

  if (result?.reply) {
    aiMsg.content = result.reply
    if (result.model) modelUsed.value = result.model
  } else {
    aiMsg.content = ''
    error.value   = result?.error || 'Could not reach the tutor — try again.'
  }

  scrollBottom()
}

function clearChat() {
  messages.value = []
  error.value    = ''
}

function scrollBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}
</script>
