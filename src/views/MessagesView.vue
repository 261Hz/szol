<template>
  <div class="flex flex-col gap-4">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium text-gray-200">🎙 Voice Messages</div>
      <div class="flex gap-2 text-xs">
        <button @click="tab = 'inbox'"  :class="tab === 'inbox'  ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'" class="transition-all">Inbox</button>
        <span class="text-gray-700">·</span>
        <button @click="tab = 'send'"   :class="tab === 'send'   ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'" class="transition-all">Send</button>
        <span class="text-gray-700">·</span>
        <button @click="tab = 'sent'"   :class="tab === 'sent'   ? 'text-green-400' : 'text-gray-500 hover:text-gray-300'" class="transition-all">Sent</button>
      </div>
    </div>

    <!-- Not logged in -->
    <div v-if="!currentUser" class="text-sm text-gray-500 text-center py-12">
      <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">Log in</button>
      to send and receive voice messages.
    </div>

    <template v-else>

      <!-- ── INBOX ── -->
      <div v-if="tab === 'inbox'" class="flex flex-col gap-3">
        <div v-if="loadingInbox" class="text-xs text-gray-500 text-center py-8">Loading…</div>
        <div v-else-if="!inbox.length" class="text-xs text-gray-500 text-center py-8">No messages yet.</div>
        <div
          v-for="msg in inbox"
          :key="msg.id"
          class="border border-gray-700 rounded-lg p-3 flex flex-col gap-2"
          :class="msg.read_at ? '' : 'border-green-800'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-gray-200">{{ msg.sender_username }}</span>
              <span v-if="!msg.read_at" class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-600">{{ timeAgo(msg.created_at) }}</span>
              <span v-if="msg.expires_at" class="text-xs text-amber-600" :title="`Expires ${new Date(msg.expires_at).toLocaleDateString()}`">⏱</span>
              <button @click="deleteMsg(msg)" class="text-xs text-gray-600 hover:text-red-400 transition-all">✕</button>
            </div>
          </div>

          <!-- Audio player -->
          <audio
            :src="msg.audio_url"
            controls
            @play="markRead(msg)"
            class="w-full h-8"
            style="accent-color: #16a34a"
          />

          <!-- Save locally (only if sender allowed it) -->
          <div v-if="msg.allow_download" class="flex justify-end">
            <a
              :href="msg.audio_url"
              download
              class="text-xs text-gray-500 hover:text-green-400 transition-all"
            >⬇ Save</a>
          </div>
          <div v-else class="text-xs text-gray-700 text-right">Saving disabled by sender</div>
        </div>
      </div>

      <!-- ── SEND ── -->
      <div v-else-if="tab === 'send'" class="flex flex-col gap-4">

        <!-- Discover native speakers of target language -->
        <div class="flex flex-col gap-2">
          <div class="text-xs text-gray-400">
            Send to a native <strong class="text-gray-300">{{ LANGS[currentUser.target_lang]?.name ?? currentUser.target_lang }}</strong> speaker:
          </div>
          <div v-if="loadingUsers" class="text-xs text-gray-500">Looking for people…</div>
          <div v-else-if="!discoverableUsers.length" class="text-xs text-gray-500">
            No native speakers accepting messages right now.
          </div>
          <div v-else class="flex flex-col gap-1">
            <button
              v-for="u in discoverableUsers"
              :key="u.id"
              @click="selectedRecipient = u"
              :class="[
                'px-3 py-2 rounded-lg border text-sm text-left transition-all',
                selectedRecipient?.id === u.id
                  ? 'border-green-600 bg-green-950 text-green-200'
                  : 'border-gray-700 hover:border-green-700 text-gray-300'
              ]"
            >{{ u.username }}</button>
          </div>
        </div>

        <!-- Recorder -->
        <div v-if="selectedRecipient" class="flex flex-col gap-3 border border-gray-700 rounded-lg p-4">
          <div class="text-xs text-gray-400">
            Recording for <strong class="text-gray-200">{{ selectedRecipient.username }}</strong>
            · max 90 seconds
          </div>

          <!-- Safety: allow_download toggle -->
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="allowDownload" id="allow-dl" class="accent-green-600" />
            <label for="allow-dl" class="text-xs text-gray-400">Allow recipient to save this recording</label>
          </div>

          <!-- Record button -->
          <div class="flex items-center gap-3">
            <button
              v-if="!recording && !audioBlob"
              @click="startRecording"
              class="px-4 py-2 rounded-lg bg-red-700 text-white text-sm hover:bg-red-600 transition-all"
            >⏺ Record</button>
            <button
              v-else-if="recording"
              @click="stopRecording"
              class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600 transition-all"
            >⏹ Stop ({{ recordingSeconds }}s)</button>
            <button
              v-if="audioBlob && !recording"
              @click="audioBlob = null; audioPreviewUrl = null"
              class="text-xs text-gray-500 hover:text-red-400 transition-all"
            >Discard</button>
          </div>

          <!-- Preview + send -->
          <div v-if="audioBlob && !recording" class="flex flex-col gap-2">
            <audio :src="audioPreviewUrl" controls class="w-full h-8" style="accent-color: #16a34a" />
            <button
              @click="sendMessage"
              :disabled="sending"
              class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm hover:bg-green-600 disabled:opacity-40 transition-all"
            >{{ sending ? 'Sending…' : '📤 Send' }}</button>
          </div>
          <div v-if="sendError" class="text-xs text-red-400">{{ sendError }}</div>
          <div v-if="sendSuccess" class="text-xs text-green-400">Sent!</div>
        </div>
      </div>

      <!-- ── SENT ── -->
      <div v-else-if="tab === 'sent'" class="flex flex-col gap-3">
        <div v-if="loadingSent" class="text-xs text-gray-500 text-center py-8">Loading…</div>
        <div v-else-if="!sent.length" class="text-xs text-gray-500 text-center py-8">No sent messages.</div>
        <div
          v-for="msg in sent"
          :key="msg.id"
          class="border border-gray-700 rounded-lg p-3 flex flex-col gap-2"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400">To recipient</span>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-600">{{ timeAgo(msg.created_at) }}</span>
              <span v-if="msg.read_at" class="text-xs text-green-600" title="Listened">✓</span>
              <span v-if="msg.expires_at" class="text-xs text-amber-600" :title="`Expires ${new Date(msg.expires_at).toLocaleDateString()}`">⏱</span>
            </div>
          </div>
          <audio :src="msg.audio_url" controls class="w-full h-8" style="accent-color: #16a34a" />
        </div>
      </div>

    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { discoverUsers } from '../utils/api.js'

const props = defineProps({ currentUser: Object, lang: String })
const emit  = defineEmits(['openAuth'])

const tab = ref('inbox')

// ── Inbox ──────────────────────────────────────────────────────────────────────

const inbox        = ref([])
const loadingInbox = ref(false)

async function loadInbox() {
  if (!props.currentUser) return
  loadingInbox.value = true
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'}/messages/inbox`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('szol_token')}` },
    })
    inbox.value = res.ok ? await res.json() : []
  } finally {
    loadingInbox.value = false
  }
}

async function markRead(msg) {
  if (msg.read_at) return
  await fetch(`${import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'}/messages/${msg.id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${localStorage.getItem('szol_token')}` },
  })
  msg.read_at = new Date().toISOString()
}

async function deleteMsg(msg) {
  await fetch(`${import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'}/messages/${msg.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem('szol_token')}` },
  })
  inbox.value = inbox.value.filter(m => m.id !== msg.id)
}

// ── Send ───────────────────────────────────────────────────────────────────────

const discoverableUsers  = ref([])
const loadingUsers       = ref(false)
const selectedRecipient  = ref(null)
const allowDownload      = ref(true)

const recording         = ref(false)
const recordingSeconds  = ref(0)
const audioBlob         = ref(null)
const audioPreviewUrl   = ref(null)
const sending           = ref(false)
const sendError         = ref('')
const sendSuccess       = ref(false)

let mediaRecorder = null
let chunks        = []
let ticker        = null

async function loadDiscoverable() {
  if (!props.currentUser?.target_lang) return
  loadingUsers.value = true
  discoverableUsers.value = await discoverUsers(props.currentUser.target_lang)
  loadingUsers.value = false
}

async function startRecording() {
  sendSuccess.value = false
  sendError.value   = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunks = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob         = new Blob(chunks, { type: 'audio/webm' })
      audioBlob.value    = blob
      audioPreviewUrl.value = URL.createObjectURL(blob)
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
  if (!audioBlob.value || !selectedRecipient.value) return
  sending.value   = true
  sendError.value = ''
  try {
    const form = new FormData()
    form.append('recipient_id',   selectedRecipient.value.id)
    form.append('lang',           props.currentUser.target_lang)
    form.append('duration_ms',    String(recordingSeconds.value * 1000))
    form.append('allow_download', String(allowDownload.value))
    form.append('audio',          audioBlob.value, 'message.webm')

    const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'}/messages/`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('szol_token')}` },
      body:    form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Send failed')
    }
    audioBlob.value       = null
    audioPreviewUrl.value = null
    sendSuccess.value     = true
  } catch (e) {
    sendError.value = e.message
  } finally {
    sending.value = false
  }
}

// ── Sent ───────────────────────────────────────────────────────────────────────

const sent       = ref([])
const loadingSent = ref(false)

async function loadSent() {
  if (!props.currentUser) return
  loadingSent.value = true
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'}/messages/sent`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('szol_token')}` },
    })
    sent.value = res.ok ? await res.json() : []
  } finally {
    loadingSent.value = false
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
  return `${days} days ago`
}

onMounted(() => {
  if (props.currentUser) {
    loadInbox()
    loadDiscoverable()
    loadSent()
  }
})
</script>
