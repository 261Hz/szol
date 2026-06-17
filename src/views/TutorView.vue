<template>
  <div class="flex flex-col gap-4">

    <!-- Auth gate -->
    <div v-if="!currentUser" class="flex flex-col items-center gap-3 py-14 text-center">
      <div class="text-3xl text-gray-600">✦</div>
      <p class="text-sm text-gray-500">Sign in to access the local AI tutor.</p>
      <button
        @click="$emit('open-auth')"
        class="text-sm px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-colors"
      >Sign in</button>
    </div>

    <template v-else>

      <!-- WebGPU not available -->
      <div v-if="!gpuOk" class="text-sm text-amber-400 border border-amber-800 rounded-xl px-4 py-3">
        WebGPU is required for local AI. Use Chrome 113+ or Edge 113+ on a desktop device.
      </div>

      <template v-else>

        <!-- ── Model management banner ── -->

        <!-- Idle: not downloaded -->
        <div v-if="status === 'idle'" class="flex flex-col gap-3 border border-gray-800 rounded-xl p-4">
          <div>
            <div class="font-medium text-gray-100">Gemma 2B — local AI tutor</div>
            <div class="text-xs text-gray-500 mt-0.5">~1.5 GB · runs entirely on your device · works offline after download</div>
          </div>
          <button
            @click="startLoad"
            class="self-start text-sm px-4 py-2 rounded-lg bg-green-700 text-white hover:bg-green-600 transition-colors"
          >Download &amp; load</button>
        </div>

        <!-- Loading / downloading -->
        <div v-else-if="status === 'loading'" class="flex flex-col gap-2 border border-gray-800 rounded-xl p-4">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400 truncate pr-3">{{ loadText || 'Initialising…' }}</span>
            <span class="text-gray-500 font-mono flex-shrink-0">{{ Math.round(loadProgress * 100) }}%</span>
          </div>
          <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-green-600 rounded-full transition-all duration-300"
              :style="{ width: (loadProgress * 100) + '%' }"
            />
          </div>
        </div>

        <!-- Ready -->
        <div v-else-if="status === 'ready'" class="flex items-center justify-between px-4 py-2.5 border border-green-900/60 rounded-xl bg-green-950/20">
          <div class="flex items-center gap-2 text-sm">
            <span class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
            <span class="text-green-300 font-medium">Gemma 2B ready</span>
            <span class="text-gray-600 text-xs">· local · offline</span>
          </div>
          <button @click="deleteModel" class="text-xs text-gray-600 hover:text-red-400 transition-colors">Delete</button>
        </div>

        <!-- Error -->
        <div v-else-if="status === 'error'" class="flex items-center justify-between px-4 py-3 border border-red-900 rounded-xl">
          <span class="text-sm text-red-400">{{ errorMsg }}</span>
          <button @click="startLoad" class="text-xs text-gray-400 hover:text-white ml-3">Retry</button>
        </div>

        <!-- ── Chat (only when ready) ── -->
        <template v-if="status === 'ready'">

          <!-- Context pills -->
          <div class="flex flex-wrap gap-1.5 text-xs">
            <span v-if="story" class="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 truncate max-w-[200px]">
              📖 {{ story.title }}
            </span>
            <span v-if="vocab?.length" class="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {{ vocab.length }} saved words
            </span>
            <span class="px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">{{ langName }}</span>
          </div>

          <!-- Message thread -->
          <div ref="messagesEl" class="flex flex-col gap-3 max-h-[60vh] overflow-y-auto scroll-smooth">
            <!-- Empty state -->
            <div v-if="!messages.length" class="text-center text-gray-600 text-sm py-6">
              Ask anything about {{ langName }} — grammar, vocabulary, pronunciation, culture.
            </div>

            <div v-for="msg in messages" :key="msg.id">
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[75%] px-3 py-2 rounded-2xl rounded-br-sm bg-green-800 text-white text-sm leading-snug">
                  {{ msg.content }}
                </div>
              </div>
              <div v-else class="flex justify-start">
                <div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-800 text-gray-100 text-sm leading-snug whitespace-pre-wrap">
                  {{ msg.content }}<span
                    v-if="msg.streaming"
                    class="inline-block w-1.5 h-3.5 bg-gray-400 ml-0.5 rounded-sm animate-pulse align-text-bottom"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Input row -->
          <div class="flex gap-2">
            <input
              v-model="input"
              @keydown.enter.prevent="send"
              :disabled="generating"
              placeholder="Ask anything about the language…"
              class="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-green-600 transition-colors disabled:opacity-50"
            />
            <button
              @click="send"
              :disabled="generating || !input.trim()"
              class="px-4 py-2.5 rounded-xl bg-green-700 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-all"
            >{{ generating ? '…' : 'Send' }}</button>
          </div>

          <button
            v-if="messages.length"
            @click="clearChat"
            class="self-start text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >Clear chat</button>

        </template>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { LANGS } from '../data/stories.js'

const props = defineProps({
  currentUser: Object,
  lang:        String,
  story:       Object,
  vocab:       Array,
})

defineEmits(['open-auth'])

// ── WebGPU availability ───────────────────────────────────────────────────────
const gpuOk = typeof navigator !== 'undefined' && 'gpu' in navigator

const langName = computed(() => LANGS[props.lang]?.name || props.lang || 'the language')

// ── Model state ───────────────────────────────────────────────────────────────
const MODEL_ID = 'gemma-2-2b-it-q4f32_1-MLC'

const status       = ref('idle')   // idle | loading | ready | error
const loadProgress = ref(0)
const loadText     = ref('')
const errorMsg     = ref('')

let engine = null

async function startLoad() {
  status.value       = 'loading'
  loadProgress.value = 0
  loadText.value     = 'Initialising…'
  errorMsg.value     = ''
  try {
    const { MLCEngine } = await import('@mlc-ai/web-llm')
    engine = new MLCEngine()
    await engine.reload(MODEL_ID, {
      initProgressCallback: (p) => {
        loadProgress.value = p.progress ?? 0
        loadText.value     = p.text    ?? ''
      },
    })
    status.value = 'ready'
  } catch (e) {
    status.value   = 'error'
    errorMsg.value = e?.message?.slice(0, 120) || 'Failed to load model.'
    engine         = null
  }
}

async function deleteModel() {
  try {
    const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm')
    await deleteModelAllInfoInCache(MODEL_ID)
  } catch {}
  engine         = null
  status.value   = 'idle'
  messages.value = []
}

// ── Chat ──────────────────────────────────────────────────────────────────────
const messages   = ref([])
const input      = ref('')
const generating = ref(false)
const messagesEl = ref(null)

function buildSystemPrompt() {
  const lines = [
    `You are a concise, encouraging language tutor. The user is learning ${langName.value}.`,
    `Respond in English unless the user asks you to use ${langName.value}.`,
    `Keep replies brief (2–4 sentences) unless more detail is clearly needed.`,
  ]
  if (props.story?.content) {
    const excerpt = props.story.content.slice(0, 600)
    lines.push(`\nThe user is currently reading this text (titled "${props.story.title}"):\n"${excerpt}"`)
    lines.push('Help them understand vocabulary, grammar, or cultural context from this text.')
  }
  if (props.vocab?.length) {
    const sample = props.vocab.slice(0, 25).map(v => v.word || v).join(', ')
    lines.push(`\nThe user has saved ${props.vocab.length} vocabulary words, including: ${sample}`)
  }
  return lines.join('\n')
}

async function send() {
  const text = input.value.trim()
  if (!text || generating.value || !engine) return
  input.value = ''

  const userMsg = { id: Date.now(),     role: 'user',      content: text,  streaming: false }
  const aiMsg   = { id: Date.now() + 1, role: 'assistant', content: '',    streaming: true }
  messages.value.push(userMsg, aiMsg)
  generating.value = true

  await nextTick()
  scrollBottom()

  try {
    // Build history from all complete messages (not the current streaming one)
    const history = messages.value
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content }))

    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: text },
      ],
      stream:     true,
      max_tokens: 512,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) {
        aiMsg.content += delta
        scrollBottom()
      }
    }
  } catch (e) {
    aiMsg.content = '(error — ' + (e?.message?.slice(0, 80) || 'unknown') + ')'
  } finally {
    aiMsg.streaming  = false
    generating.value = false
    scrollBottom()
  }
}

function clearChat() {
  messages.value = []
  try { engine?.resetChat?.() } catch {}
}

function scrollBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}
</script>
