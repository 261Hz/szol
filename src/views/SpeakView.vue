<template>
  <div class="flex flex-col gap-4 h-full">

    <!-- No story loaded -->
    <div v-if="!story" class="text-gray-400 text-sm text-center py-16">
      Load a story first to start your tutoring session.
    </div>

    <template v-else>

      <!-- Story title header -->
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold text-gray-800 text-lg leading-tight" :dir="isRTL(lang) ? 'rtl' : 'ltr'">
            {{ story.title }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">{{ LANGS[lang]?.name }} · AI Tutor</div>
        </div>
        <button
          v-if="messages.length"
          @click="clearConversation"
          class="text-xs text-gray-400 hover:text-red-400 transition-all px-2 py-1 rounded border border-gray-200 hover:border-red-200"
        >Clear</button>
      </div>

      <!-- Conversation -->
      <div
        ref="scrollEl"
        class="flex flex-col gap-3 flex-1 overflow-y-auto min-h-[200px] max-h-[420px] pr-1"
      >
        <!-- Starter prompt -->
        <div v-if="!messages.length" class="text-xs text-gray-400 text-center py-6">
          Say anything in {{ LANGS[lang]?.name }} to start the conversation.
        </div>

        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="flex"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <!-- User bubble: plain text (they typed it) -->
          <div
            v-if="msg.role === 'user'"
            class="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm text-sm leading-relaxed bg-emerald-500 text-white"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >{{ msg.content }}</div>

          <!-- Tutor bubble: clickable words to save to vocab -->
          <div
            v-else
            class="max-w-[80%] px-3 py-2 rounded-2xl rounded-bl-sm text-sm leading-relaxed bg-gray-100 text-gray-800"
            :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          >
            <ClickableText
              :text="msg.content"
              :lang="lang"
              :savedWords="savedWordSet"
              @tap="({ word, sentence }) => saveWord(word, sentence)"
            />
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="loading" class="flex justify-start">
          <div class="bg-gray-100 text-gray-400 text-sm px-3 py-2 rounded-2xl rounded-bl-sm">
            <span class="animate-pulse">···</span>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-xs text-red-500 px-1">{{ error }}</div>

      <!-- Input row -->
      <div class="flex gap-2">
        <input
          ref="inputEl"
          v-model="draft"
          type="text"
          :placeholder="`Write in ${LANGS[lang]?.name ?? 'the language'}…`"
          :dir="isRTL(lang) ? 'rtl' : 'ltr'"
          class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 transition-all"
          :disabled="loading"
          autocorrect="off"
          autocapitalize="off"
          @keydown.enter.prevent="send"
        />
        <button
          @click="send"
          :disabled="loading || !draft.trim()"
          class="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >Send</button>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { isRTL } from '../utils/rtl.js'
import { LANGS } from '../data/stories.js'
import { sendChat } from '../utils/api.js'
import ClickableText from '../components/ClickableText.vue'

const props = defineProps({
  story:       Object,
  lang:        String,
  vocabBank:   { type: Array, default: () => [] },
  savedWords:  { type: Object, default: () => new Set() },
  currentUser: Object,
})

const emit = defineEmits(['save-word'])

const savedWordSet = computed(() => props.savedWords)

const messages = ref([])  // [{ role: "user"|"assistant", content: "..." }]
const draft    = ref('')
const loading  = ref(false)
const error    = ref('')
const scrollEl = ref(null)
const inputEl  = ref(null)

watch(() => props.story, () => {
  messages.value = []
  draft.value    = ''
  error.value    = ''
})

async function send() {
  const text = draft.value.trim()
  if (!text || loading.value) return

  error.value = ''
  draft.value = ''
  messages.value.push({ role: 'user', content: text })
  loading.value = true
  await scrollToBottom()

  try {
    const vocab = props.vocabBank
      .filter(w => w.lang === props.lang)
      .map(w => w.word)

    const { reply } = await sendChat({
      message:      text,
      storyContent: props.story?.content ?? '',
      lang:         props.lang,
      history:      messages.value.slice(0, -1),   // exclude the message we just pushed
      vocab,
      proficiency:  props.currentUser?.proficiency ?? null,
    })

    messages.value.push({ role: 'assistant', content: reply })
  } catch (e) {
    error.value = e.message
    messages.value.pop()  // remove the user message on failure so they can retry
    draft.value = text
  } finally {
    loading.value = false
    await scrollToBottom()
    inputEl.value?.focus()
  }
}

function saveWord(word, sentence) {
  const clean = word.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return
  emit('save-word', {
    word:     clean,
    lang:     props.lang,
    langName: LANGS[props.lang]?.name ?? props.lang,
    sentence: sentence ?? '',
    story:    props.story?.title ?? '',
  })
}

function clearConversation() {
  messages.value = []
  error.value    = ''
  draft.value    = ''
}

async function scrollToBottom() {
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
}
</script>
