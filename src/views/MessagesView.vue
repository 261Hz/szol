<template>
  <div class="flex flex-col gap-0 h-full">

    <!-- Not logged in -->
    <div v-if="!currentUser" class="text-sm text-gray-500 text-center py-16">
      <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">Log in</button>
      to send and receive voice messages.
    </div>

    <template v-else>

      <!-- ── Conversation selected → thread view ── -->
      <div v-if="activePartner" class="flex flex-col gap-0">

        <!-- Thread header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <button @click="activePartner = null" class="text-gray-500 hover:text-gray-200 transition-all text-sm">←</button>
          <div class="font-medium text-sm text-gray-100">{{ activePartner.username }}</div>
          <div class="text-xs text-gray-600 ml-auto">{{ LANGS[studyLang]?.name }} practice</div>
        </div>

        <!-- Thread messages -->
        <div class="flex flex-col gap-3 px-4 py-3 overflow-y-auto" style="max-height: 55vh">
          <div v-if="!threadMessages.length" class="text-xs text-gray-600 text-center py-8">
            No messages yet. Record one below.
          </div>

          <div
            v-for="msg in threadMessages"
            :key="msg.id"
            :class="['flex flex-col gap-1', msg.sender_id === currentUser.id ? 'items-end' : 'items-start']"
          >
            <!-- Bubble -->
            <div
              :class="[
                'rounded-2xl px-3 py-2 max-w-[85%] flex flex-col gap-1.5',
                msg.sender_id === currentUser.id
                  ? 'bg-green-800 rounded-tr-sm'
                  : 'bg-purple-900 rounded-tl-sm'
              ]"
            >
              <!-- Audio player (uses blob URL loaded via authenticated fetch) -->
              <audio
                v-if="audioBlobUrls[msg.id]"
                :src="audioBlobUrls[msg.id]"
                controls
                class="h-8 w-48"
                style="accent-color: #16a34a"
                @play="markRead(msg)"
              />
              <div v-else class="flex items-center gap-2">
                <button
                  @click="loadAudio(msg)"
                  :disabled="loadingAudio[msg.id]"
                  class="text-xs text-green-400 hover:text-green-300 transition-all disabled:opacity-40"
                >{{ loadingAudio[msg.id] ? 'Loading…' : '▶ Play' }}</button>
                <span v-if="!msg.read_at && msg.sender_id !== currentUser.id" class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              </div>

              <!-- Footer row -->
              <div class="flex items-center gap-2 justify-between">
                <span class="text-xs text-gray-500">{{ timeAgo(msg.created_at) }}</span>
                <div class="flex items-center gap-1.5">
                  <span v-if="msg.expires_at" class="text-xs text-amber-600" :title="`Expires ${new Date(msg.expires_at).toLocaleDateString()}`">⏱</span>
                  <!-- Sent/Played status for outgoing messages -->
                  <span
                    v-if="msg.sender_id === currentUser.id"
                    class="text-xs"
                    :class="msg.read_at ? 'text-green-400' : 'text-gray-600'"
                  >{{ msg.read_at ? 'Played' : 'Sent' }}</span>
                  <!-- Played indicator for received messages -->
                  <span v-if="msg.sender_id !== currentUser.id && msg.read_at" class="text-xs text-purple-400">Played</span>
                  <!-- Save button — only if sender allowed it and it's a received message -->
                  <a
                    v-if="msg.allow_download && msg.sender_id !== currentUser.id && audioBlobUrls[msg.id]"
                    :href="audioBlobUrls[msg.id]"
                    download="voice-message.webm"
                    class="text-xs text-gray-600 hover:text-green-400 transition-all"
                    title="Save recording"
                  >⬇</a>
                  <button
                    @click="deleteMsg(msg)"
                    class="text-xs text-gray-600 hover:text-red-400 transition-all"
                    :title="msg.sender_id === currentUser.id ? 'Delete for everyone' : 'Delete for me'"
                  >✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recorder (reply) -->
        <div class="border-t border-gray-800 px-4 py-3 flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <!-- allow_download toggle -->
            <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" v-model="allowDownload" class="accent-green-600" />
              Allow save
            </label>

            <div class="flex-1" />

            <!-- Record / Stop -->
            <button
              v-if="!recording && !audioBlob"
              @click="startRecording"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-700 text-white text-xs hover:bg-red-600 transition-all"
            >⏺ Record</button>
            <button
              v-else-if="recording"
              @click="stopRecording"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-700 text-white text-xs hover:bg-gray-600 transition-all"
            >⏹ {{ recordingSeconds }}s</button>

            <!-- Send -->
            <button
              v-if="audioBlob && !recording"
              @click="sendMessage"
              :disabled="sending"
              class="px-3 py-1.5 rounded-full bg-green-700 text-white text-xs hover:bg-green-600 disabled:opacity-40 transition-all"
            >{{ sending ? '…' : '📤 Send' }}</button>
            <button
              v-if="audioBlob && !recording"
              @click="audioBlob = null"
              class="text-xs text-gray-600 hover:text-red-400 transition-all"
            >✕</button>
          </div>

          <!-- Preview -->
          <audio v-if="audioBlob" :src="audioPreviewUrl" controls class="w-full h-7" style="accent-color: #16a34a" />

          <div v-if="sendError"   class="text-xs text-red-400">{{ sendError }}</div>
          <div v-if="sendSuccess" class="text-xs text-green-400">Sent!</div>
        </div>
      </div>

      <!-- ── Conversation list ── -->
      <div v-else class="flex flex-col gap-3 px-4 py-3">

        <!-- Language switcher -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500">Studying:</span>
          <select
            v-model="studyLang"
            @change="changeLang"
            class="text-xs bg-gray-900 text-gray-200 border border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:border-green-700"
          >
            <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
          </select>
        </div>

        <!-- Tabs: Inbox / Find -->
        <div class="flex gap-3 text-xs border-b border-gray-800 pb-2">
          <button @click="listTab = 'inbox'" :class="listTab === 'inbox' ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'" class="transition-all">Inbox</button>
          <button @click="listTab = 'find';  loadDiscoverable()" :class="listTab === 'find'  ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'" class="transition-all">Find people</button>
        </div>

        <!-- Inbox list -->
        <div v-if="listTab === 'inbox'" class="flex flex-col gap-2">
          <div v-if="loadingInbox" class="text-xs text-gray-500 text-center py-8">Loading…</div>
          <div v-else-if="!conversations.length" class="text-xs text-gray-500 text-center py-8">
            No messages yet. Use <button class="underline hover:text-green-400" @click="listTab='find'; loadDiscoverable()">Find people</button> to start a conversation.
          </div>
          <button
            v-for="conv in conversations"
            :key="conv.partner.id"
            @click="openConversation(conv.partner)"
            class="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-green-700 text-left transition-all"
          >
            <!-- Unread dot -->
            <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0 relative">
              {{ conv.partner.username[0].toUpperCase() }}
              <span v-if="conv.unread" class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-gray-950" />
            </div>
            <div class="flex flex-col gap-0.5 flex-1 min-w-0">
              <div class="text-sm text-gray-200 font-medium">{{ conv.partner.username }}</div>
              <div class="text-xs text-gray-500 truncate">{{ conv.unread ? `${conv.unread} new message${conv.unread > 1 ? 's' : ''}` : timeAgo(conv.latest) }}</div>
            </div>
          </button>
        </div>

        <!-- Find people -->
        <div v-else class="flex flex-col gap-2">
          <div class="text-xs text-gray-500">
            Native <strong class="text-gray-300">{{ LANGS[studyLang]?.name }}</strong> speakers open to messages:
          </div>
          <div v-if="loadingUsers" class="text-xs text-gray-500 text-center py-4">Looking…</div>
          <div v-else-if="!discoverableUsers.length" class="text-xs text-gray-500 text-center py-4">None available right now.</div>
          <button
            v-for="u in discoverableUsers"
            :key="u.id"
            @click="openConversation(u)"
            class="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-green-700 text-left transition-all"
          >
            <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">
              {{ u.username[0].toUpperCase() }}
            </div>
            <div class="text-sm text-gray-200">{{ u.username }}</div>
          </button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { discoverUsers } from '../utils/api.js'

const props = defineProps({ currentUser: Object, lang: String })
const emit  = defineEmits(['openAuth', 'updateLang'])

const API_URL = import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'
const token   = () => localStorage.getItem('szol_token')
const authH   = () => ({ Authorization: `Bearer ${token()}` })

// ── State ─────────────────────────────────────────────────────────────────────

const listTab       = ref('inbox')
const activePartner = ref(null)   // { id, username }
const studyLang     = ref(props.currentUser?.target_lang ?? '')

const inbox        = ref([])
const sent         = ref([])
const loadingInbox = ref(false)

const discoverableUsers = ref([])
const loadingUsers      = ref(false)

const audioBlobUrls = ref({})   // { msg.id: blobUrl }
const loadingAudio  = ref({})   // { msg.id: bool }

const allowDownload    = ref(true)
const recording        = ref(false)
const recordingSeconds = ref(0)
const audioBlob        = ref(null)
const audioPreviewUrl  = ref(null)
const sending          = ref(false)
const sendError        = ref('')
const sendSuccess      = ref(false)

let mediaRecorder = null
let chunks        = []
let ticker        = null

// ── Computed ──────────────────────────────────────────────────────────────────

// Group inbox by sender → conversation list
const conversations = computed(() => {
  const map = new Map()
  for (const msg of inbox.value) {
    const pid = msg.sender_id
    if (!map.has(pid)) {
      map.set(pid, {
        partner: { id: pid, username: msg.sender_username },
        unread:  0,
        latest:  msg.created_at,
      })
    }
    const c = map.get(pid)
    if (!msg.read_at) c.unread++
    if (msg.created_at > c.latest) c.latest = msg.created_at
  }
  return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest))
})

// All messages with active partner (received + sent), sorted oldest→newest
const threadMessages = computed(() => {
  if (!activePartner.value) return []
  const pid = activePartner.value.id
  const received = inbox.value.filter(m => m.sender_id === pid)
  const mine     = sent.value.filter(m => m.recipient_id === pid)
  return [...received, ...mine].sort((a, b) => a.created_at.localeCompare(b.created_at))
})

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadInbox() {
  if (!props.currentUser) return
  loadingInbox.value = true
  try {
    const res = await fetch(`${API_URL}/messages/inbox`, { headers: authH() })
    inbox.value = res.ok ? await res.json() : []
  } finally {
    loadingInbox.value = false
  }
}

async function loadSent() {
  if (!props.currentUser) return
  const res = await fetch(`${API_URL}/messages/sent`, { headers: authH() })
  sent.value = res.ok ? await res.json() : []
}

async function loadDiscoverable() {
  if (!studyLang.value) return
  loadingUsers.value = true
  discoverableUsers.value = await discoverUsers(studyLang.value)
  loadingUsers.value = false
}

async function changeLang(e) {
  studyLang.value = e.target.value
  await fetch(`${API_URL}/users/me`, {
    method: 'PATCH',
    headers: { ...authH(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_lang: studyLang.value }),
  })
  emit('updateLang', studyLang.value)
  if (listTab.value === 'find') loadDiscoverable()
}

function openConversation(partner) {
  activePartner.value = partner
  sendSuccess.value   = false
  sendError.value     = ''
  audioBlob.value     = null
}

// ── Audio loading (authenticated fetch → blob URL) ────────────────────────────

async function loadAudio(msg) {
  if (audioBlobUrls.value[msg.id] || loadingAudio.value[msg.id]) return
  loadingAudio.value = { ...loadingAudio.value, [msg.id]: true }
  try {
    const res = await fetch(`${API_URL}/messages/${msg.id}/audio`, { headers: authH() })
    if (!res.ok) return
    const blob = await res.blob()
    audioBlobUrls.value = { ...audioBlobUrls.value, [msg.id]: URL.createObjectURL(blob) }
  } finally {
    loadingAudio.value = { ...loadingAudio.value, [msg.id]: false }
  }
}

async function markRead(msg) {
  if (msg.read_at || msg.sender_id === props.currentUser?.id) return
  await fetch(`${API_URL}/messages/${msg.id}/read`, { method: 'PATCH', headers: authH() })
  msg.read_at = new Date().toISOString()
}

async function deleteMsg(msg) {
  await fetch(`${API_URL}/messages/${msg.id}`, { method: 'DELETE', headers: authH() })
  inbox.value = inbox.value.filter(m => m.id !== msg.id)
  sent.value  = sent.value.filter(m => m.id !== msg.id)
  if (audioBlobUrls.value[msg.id]) {
    URL.revokeObjectURL(audioBlobUrls.value[msg.id])
    const updated = { ...audioBlobUrls.value }
    delete updated[msg.id]
    audioBlobUrls.value = updated
  }
}

// ── Recording ─────────────────────────────────────────────────────────────────

async function startRecording() {
  sendSuccess.value = false
  sendError.value   = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunks = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob             = new Blob(chunks, { type: 'audio/webm' })
      audioBlob.value        = blob
      audioPreviewUrl.value  = URL.createObjectURL(blob)
      stream.getTracks().forEach(t => t.stop())
    }
    mediaRecorder.start()
    recording.value        = true
    recordingSeconds.value = 0
    ticker = setInterval(() => {
      recordingSeconds.value++
      if (recordingSeconds.value >= 90) stopRecording()
    }, 1000)
  } catch {
    sendError.value = 'Microphone access denied.'
  }
}

function stopRecording() {
  clearInterval(ticker)
  recording.value = false
  mediaRecorder?.stop()
}

async function sendMessage() {
  if (!audioBlob.value || !activePartner.value) return
  sending.value   = true
  sendError.value = ''
  try {
    const form = new FormData()
    form.append('recipient_id',   activePartner.value.id)
    form.append('lang',           studyLang.value)
    form.append('duration_ms',    String(recordingSeconds.value * 1000))
    form.append('allow_download', String(allowDownload.value))
    form.append('audio',          audioBlob.value, 'message.webm')

    const res = await fetch(`${API_URL}/messages/`, {
      method: 'POST', headers: authH(), body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Send failed')
    }
    const newMsg = await res.json()
    sent.value = [newMsg, ...sent.value]
    audioBlob.value       = null
    audioPreviewUrl.value = null
    sendSuccess.value     = true
  } catch (e) {
    sendError.value = e.message
  } finally {
    sending.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  2) return 'just now'
  if (hours <  1) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  <  2) return 'yesterday'
  return `${days}d ago`
}

onMounted(() => {
  if (props.currentUser) { loadInbox(); loadSent() }
})
</script>
