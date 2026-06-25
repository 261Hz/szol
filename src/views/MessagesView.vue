<template>
  <div class="flex flex-col gap-0 h-full">

    <!-- Not logged in -->
    <div v-if="!currentUser" class="text-sm text-center py-16 flex flex-col gap-2" style="color:rgba(31,27,23,0.4);">
      <button @click="$emit('openAuth')" class="underline transition-all" style="color:rgba(31,27,23,0.6);">Log in</button>
      to send and receive voice messages.
    </div>

    <template v-else>

      <!-- ── Thread view ── -->
      <div v-if="activePartner" class="flex flex-col gap-0">

        <!-- Thread header -->
        <div class="flex items-center gap-3 px-4 py-3" style="border-bottom:1px solid rgba(31,27,23,0.1);">
          <button @click="activePartner = null" class="transition-all text-sm" style="color:rgba(31,27,23,0.45);">←</button>
          <div class="font-medium text-sm" style="color:#1f1b17; font-family:'IM Fell English',serif;">{{ activePartner.username }}</div>
          <div class="text-xs ml-auto" style="color:rgba(31,27,23,0.35);">{{ LANGS[studyLang]?.name }} practice</div>
        </div>

        <!-- Messages -->
        <div class="flex flex-col gap-3 px-4 py-3 overflow-y-auto" style="max-height:55vh;">
          <div v-if="!threadMessages.length" class="text-xs text-center py-8" style="color:rgba(31,27,23,0.35);">
            {{ t(props.lang, 'noMessages') }}
          </div>

          <div
            v-for="msg in threadMessages"
            :key="msg.id"
            :class="['flex flex-col gap-1', msg.sender_id === currentUser.id ? 'items-end' : 'items-start']"
          >
            <div
              class="rounded px-3 py-2 max-w-[85%] flex flex-col gap-1.5"
              :style="msg.sender_id === currentUser.id
                ? 'background:#8b3a3a; border-radius:4px 4px 2px 4px;'
                : 'background:rgba(31,27,23,0.07); border:1px solid rgba(31,27,23,0.1); border-radius:4px 4px 4px 2px;'"
            >
              <!-- Audio player -->
              <audio
                v-if="audioBlobUrls[msg.id]"
                :src="audioBlobUrls[msg.id]"
                controls
                class="h-8 w-48"
                :style="msg.sender_id === currentUser.id ? 'accent-color:#e8dcc4;' : 'accent-color:#8b3a3a;'"
                @play="markRead(msg)"
              />
              <div v-else class="flex items-center gap-2">
                <button
                  @click="loadAudio(msg)"
                  :disabled="loadingAudio[msg.id]"
                  class="text-xs font-medium transition-all disabled:opacity-40 flex items-center gap-1"
                  :style="msg.sender_id === currentUser.id ? 'color:#e8dcc4;' : 'color:#8b3a3a;'"
                >
                  <svg v-if="!loadingAudio[msg.id]" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  {{ loadingAudio[msg.id] ? 'Loading…' : 'Play' }}
                </button>
                <span v-if="!msg.read_at && msg.sender_id !== currentUser.id" class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#8b3a3a;" />
              </div>

              <!-- Footer -->
              <div class="flex items-center gap-2 justify-between">
                <span class="text-xs" :style="msg.sender_id === currentUser.id ? 'color:rgba(232,220,196,0.6);' : 'color:rgba(31,27,23,0.4);'">{{ timeAgo(msg.created_at) }}</span>
                <div class="flex items-center gap-1.5">
                  <span v-if="msg.expires_at" class="text-xs" style="color:#b07d3a;" :title="`Expires ${new Date(msg.expires_at).toLocaleDateString()}`">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
                  </span>
                  <span v-if="msg.sender_id === currentUser.id" class="text-xs" :style="msg.read_at ? 'color:rgba(232,220,196,0.7);' : 'color:rgba(232,220,196,0.4);'">
                    {{ msg.read_at ? 'Played' : 'Sent' }}
                  </span>
                  <span v-if="msg.sender_id !== currentUser.id && msg.read_at" class="text-xs" style="color:rgba(31,27,23,0.4);">Played</span>
                  <a
                    v-if="msg.allow_download && msg.sender_id !== currentUser.id && audioBlobUrls[msg.id]"
                    :href="audioBlobUrls[msg.id]"
                    download="voice-message.webm"
                    class="text-xs transition-all"
                    style="color:rgba(31,27,23,0.4);"
                    title="Save recording"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  </a>
                  <button @click="deleteMsg(msg)" class="transition-all" style="color:rgba(31,27,23,0.3);" :title="msg.sender_id === currentUser.id ? t(props.lang, 'deleteForAll') : t(props.lang, 'deleteForMe')">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recorder -->
        <div class="px-4 py-3 flex flex-col gap-2" style="border-top:1px solid rgba(31,27,23,0.1);">
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs cursor-pointer" style="color:rgba(31,27,23,0.4);">
              <input type="checkbox" v-model="allowDownload" />
              Allow save
            </label>
            <div class="flex-1" />

            <!-- Record -->
            <button
              v-if="!recording && !audioBlob"
              @click="startRecording"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all"
              style="border-radius:2px; background:#8b3a3a; color:#e8dcc4;"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
              {{ t(props.lang, 'record') }}
            </button>

            <!-- Stop -->
            <button
              v-else-if="recording"
              @click="stopRecording"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all"
              style="border-radius:2px; border:1px solid rgba(31,27,23,0.2); color:#1f1b17;"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
              {{ recordingSeconds }}s
            </button>

            <!-- Send -->
            <button
              v-if="audioBlob && !recording"
              @click="sendMessage"
              :disabled="sending"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all disabled:opacity-40"
              style="border-radius:2px; background:#8b3a3a; color:#e8dcc4;"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              {{ sending ? '…' : 'Send' }}
            </button>
            <button
              v-if="audioBlob && !recording"
              @click="audioBlob = null"
              class="text-xs transition-all"
              style="color:rgba(31,27,23,0.35);"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>

          <!-- Preview -->
          <audio v-if="audioBlob" :src="audioPreviewUrl" controls class="w-full h-7" style="accent-color:#8b3a3a;" />

          <div v-if="sendError"   class="text-xs" style="color:#8b3a3a;">{{ sendError }}</div>
          <div v-if="sendSuccess" class="text-xs" style="color:#4a783c;">Sent.</div>
        </div>
      </div>

      <!-- ── Conversation list ── -->
      <div v-else class="flex flex-col gap-3 px-4 py-3">

        <!-- Language selector -->
        <div class="flex items-center gap-2">
          <span class="text-xs" style="color:rgba(31,27,23,0.4);">Studying:</span>
          <select
            v-model="studyLang"
            @change="changeLang"
            class="text-xs border px-1.5 py-0.5 focus:outline-none transition-all"
            style="background:rgba(31,27,23,0.03); border-color:rgba(31,27,23,0.15); color:#1f1b17; border-radius:2px;"
          >
            <option v-for="(l, code) in LANGS" :key="code" :value="code">{{ l.name }}</option>
          </select>
        </div>

        <!-- Tabs -->
        <div class="flex gap-4 text-xs pb-2" style="border-bottom:1px solid rgba(31,27,23,0.1);">
          <button
            @click="listTab = 'inbox'"
            class="transition-all pb-1"
            :style="listTab === 'inbox'
              ? 'color:#8b3a3a; border-bottom:1px solid #8b3a3a;'
              : 'color:rgba(31,27,23,0.4);'"
          >Inbox</button>
          <button
            @click="listTab = 'find'; loadDiscoverable()"
            class="transition-all pb-1"
            :style="listTab === 'find'
              ? 'color:#8b3a3a; border-bottom:1px solid #8b3a3a;'
              : 'color:rgba(31,27,23,0.4);'"
          >Find people</button>
        </div>

        <!-- Inbox -->
        <div v-if="listTab === 'inbox'" class="flex flex-col gap-2">
          <div v-if="loadingInbox" class="text-xs text-center py-8" style="color:rgba(31,27,23,0.35);">Loading…</div>
          <div v-else-if="!conversations.length" class="text-xs text-center py-8" style="color:rgba(31,27,23,0.35);">
            No messages yet.
            <button class="underline transition-all ml-1" style="color:rgba(31,27,23,0.5);" @click="listTab='find'; loadDiscoverable()">Find people</button>
            to start a conversation.
          </div>
          <button
            v-for="conv in conversations"
            :key="conv.partner.id"
            @click="openConversation(conv.partner)"
            class="flex items-center gap-3 p-3 text-left transition-all"
            style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;"
          >
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 relative font-medium" style="background:rgba(31,27,23,0.08); color:#1f1b17;">
              {{ conv.partner.username[0].toUpperCase() }}
              <span v-if="conv.unread" class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style="background:#8b3a3a;" />
            </div>
            <div class="flex flex-col gap-0.5 flex-1 min-w-0">
              <div class="text-sm font-medium" style="color:#1f1b17;">{{ conv.partner.username }}</div>
              <div class="text-xs truncate" :style="conv.unread ? 'color:#8b3a3a;' : 'color:rgba(31,27,23,0.4);'">
                {{ conv.unread ? `${conv.unread} new message${conv.unread > 1 ? 's' : ''}` : timeAgo(conv.latest) }}
              </div>
            </div>
          </button>
        </div>

        <!-- Find people -->
        <div v-else class="flex flex-col gap-2">
          <div class="text-xs" style="color:rgba(31,27,23,0.5);">
            Native <strong style="color:#1f1b17;">{{ LANGS[studyLang]?.name }}</strong> speakers open to messages:
          </div>
          <div v-if="loadingUsers" class="text-xs text-center py-4" style="color:rgba(31,27,23,0.35);">Looking…</div>
          <div v-else-if="!discoverableUsers.length" class="text-xs text-center py-4" style="color:rgba(31,27,23,0.35);">None available right now.</div>
          <button
            v-for="u in discoverableUsers"
            :key="u.id"
            @click="openConversation(u)"
            class="flex items-center gap-3 p-3 text-left transition-all"
            style="border:1px solid rgba(31,27,23,0.12); border-radius:3px;"
          >
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 font-medium" style="background:rgba(31,27,23,0.08); color:#1f1b17;">
              {{ u.username[0].toUpperCase() }}
            </div>
            <div class="text-sm" style="color:#1f1b17;">{{ u.username }}</div>
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
import { t } from '../utils/i18n.js'

const props = defineProps({ currentUser: Object, lang: String })
const emit  = defineEmits(['openAuth', 'updateLang'])

const API_URL = import.meta.env.VITE_API_URL ?? 'https://szol.onrender.com'
const token   = () => localStorage.getItem('szol_token')
const authH   = () => ({ Authorization: `Bearer ${token()}` })

// ── State ─────────────────────────────────────────────────────────────────────

const listTab       = ref('inbox')
const activePartner = ref(null)
const studyLang     = ref(props.currentUser?.target_lang ?? '')

const inbox        = ref([])
const sent         = ref([])
const loadingInbox = ref(false)

const discoverableUsers = ref([])
const loadingUsers      = ref(false)

const audioBlobUrls = ref({})
const loadingAudio  = ref({})

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

const threadMessages = computed(() => {
  if (!activePartner.value) return []
  const pid      = activePartner.value.id
  const received = inbox.value.filter(m => m.sender_id === pid)
  const mine     = sent.value.filter(m => m.recipient_id === pid)
  return [...received, ...mine].sort((a, b) => a.created_at.localeCompare(b.created_at))
})

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadInbox() {
  if (!props.currentUser) return
  loadingInbox.value = true
  try {
    const res  = await fetch(`${API_URL}/messages/inbox`, { headers: authH() })
    inbox.value = res.ok ? await res.json() : []
  } finally {
    loadingInbox.value = false
  }
}

async function loadSent() {
  if (!props.currentUser) return
  const res  = await fetch(`${API_URL}/messages/sent`, { headers: authH() })
  sent.value = res.ok ? await res.json() : []
}

async function loadDiscoverable() {
  if (!studyLang.value) return
  loadingUsers.value       = true
  discoverableUsers.value  = await discoverUsers(studyLang.value)
  loadingUsers.value       = false
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

// ── Audio ─────────────────────────────────────────────────────────────────────

async function loadAudio(msg) {
  if (audioBlobUrls.value[msg.id] || loadingAudio.value[msg.id]) return
  loadingAudio.value = { ...loadingAudio.value, [msg.id]: true }
  try {
    const res  = await fetch(`${API_URL}/messages/${msg.id}/audio`, { headers: authH() })
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
      const blob            = new Blob(chunks, { type: 'audio/webm' })
      audioBlob.value       = blob
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
    sent.value            = [newMsg, ...sent.value]
    audioBlob.value       = null
    audioPreviewUrl.value = null
    sendSuccess.value     = true
  } catch (e) {
    sendError.value = e.message
  } finally {
    sending.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
