<template>
  <div class="flex flex-col gap-4 select-none" @contextmenu.prevent>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="font-semibold text-gray-800">Voice Messages</h2>
      <span class="text-xs text-gray-300 flex items-center gap-1">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        protected
      </span>
    </div>

    <!-- Login gate -->
    <div v-if="!currentUser" class="text-center py-16 text-gray-400 text-sm">
      <button @click="$emit('open-auth')" class="text-emerald-500 underline">Log in</button>
      to send and receive voice messages.
    </div>

    <template v-else>

      <!-- Tab bar -->
      <div class="flex gap-1 border-b border-gray-100 pb-2">
        <button v-for="tab in tabs" :key="tab.key" @click="switchTab(tab.key)"
          :class="['px-3 py-1.5 text-sm rounded-md transition-all relative',
            activeTab === tab.key ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800']">
          {{ tab.label }}
          <span v-if="tab.key === 'inbox' && unread > 0"
            class="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center">
            {{ unread > 9 ? '9+' : unread }}
          </span>
        </button>
      </div>

      <!-- ── INBOX ─────────────────────────────────────────────── -->
      <div v-if="activeTab === 'inbox'">
        <div v-if="loadingInbox" class="text-center py-8 text-gray-400 text-sm animate-pulse">Loading…</div>
        <div v-else-if="!inbox.length" class="text-center py-8 text-gray-400 text-sm">No messages yet.</div>
        <div v-else class="flex flex-col gap-2">
          <div v-for="msg in inbox" :key="msg.id"
            :class="['p-3 rounded-lg border', !msg.read_at ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200']">

            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span v-if="!msg.read_at" class="w-2 h-2 flex-shrink-0 bg-blue-500 rounded-full"></span>
                <span class="font-medium text-sm truncate">{{ msg.sender_username }}</span>
                <span class="text-xs text-gray-400 flex-shrink-0">{{ fmtMs(msg.duration_ms) }}</span>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="text-xs text-gray-400">{{ timeAgo(msg.created_at) }}</span>
                <button @click.stop="pendingDelete = msg" title="Delete"
                  class="p-1 rounded text-gray-300 hover:text-red-400 transition-all">
                  <TrashIcon />
                </button>
                <button @click.stop="pendingBlock = msg" title="Block sender"
                  class="p-1 rounded text-gray-300 hover:text-red-400 transition-all">
                  <BanIcon />
                </button>
              </div>
            </div>

            <PlayerBar :msg="msg" :current-id="currentId" :playing="playing"
              :progress="progress" :current-time="currentTime" :loading-id="loadingId"
              @play="playMsg" @seek="seekTo" />
          </div>
        </div>
      </div>

      <!-- ── SENT ──────────────────────────────────────────────── -->
      <div v-if="activeTab === 'sent'">
        <div v-if="loadingSent" class="text-center py-8 text-gray-400 text-sm animate-pulse">Loading…</div>
        <div v-else-if="!sent.length" class="text-center py-8 text-gray-400 text-sm">Nothing sent yet.</div>
        <div v-else class="flex flex-col gap-2">
          <div v-for="msg in sent" :key="msg.id" class="p-3 rounded-lg border border-gray-200">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs text-gray-400 flex-shrink-0">To</span>
                <span class="font-medium text-sm truncate">{{ msg.recipient_username }}</span>
                <span class="text-xs text-gray-400 flex-shrink-0">{{ fmtMs(msg.duration_ms) }}</span>
                <span v-if="msg.read_at" class="text-xs text-emerald-500 flex-shrink-0">✓ heard</span>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="text-xs text-gray-400">{{ timeAgo(msg.created_at) }}</span>
                <button @click.stop="pendingDelete = msg" title="Delete"
                  class="p-1 rounded text-gray-300 hover:text-red-400 transition-all">
                  <TrashIcon />
                </button>
              </div>
            </div>
            <PlayerBar :msg="msg" :current-id="currentId" :playing="playing"
              :progress="progress" :current-time="currentTime" :loading-id="loadingId"
              @play="playMsg" @seek="seekTo" />
          </div>
        </div>
      </div>

      <!-- ── NEW MESSAGE ────────────────────────────────────────── -->
      <div v-if="activeTab === 'new'" class="flex flex-col gap-4">

        <template v-if="!selectedPartner">
          <p class="text-sm text-gray-500">
            Pick a native {{ targetLangName }} speaker to practice with:
          </p>
          <div v-if="loadingPartners" class="text-center py-6 text-gray-400 text-sm animate-pulse">Loading…</div>
          <div v-else-if="!partners.length" class="text-center py-6 text-gray-400 text-sm">
            No partners available. Make sure your target language is set in settings.
          </div>
          <div v-else class="flex flex-col gap-2">
            <button v-for="p in partners" :key="p.id" @click="selectedPartner = p"
              class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-emerald-400 text-left transition-all">
              <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold text-sm flex-shrink-0">
                {{ p.username[0].toUpperCase() }}
              </div>
              <div>
                <div class="font-medium text-sm">{{ p.username }}</div>
                <div class="text-xs text-gray-400">native {{ p.native_lang }}</div>
              </div>
            </button>
          </div>
        </template>

        <template v-else>
          <div class="flex items-center gap-2">
            <button @click="selectedPartner = null; discardRecording()"
              class="text-gray-400 hover:text-gray-700 transition-all p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span class="text-sm text-gray-600">To <strong>{{ selectedPartner.username }}</strong></span>
          </div>

          <!-- idle -->
          <div v-if="recState === 'idle'" class="flex flex-col items-center gap-4 py-6">
            <button @click="startRecording"
              class="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all active:scale-95">
              <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4zm-1 16.93V20H9v2h6v-2h-2v-2.07A8.001 8.001 0 0020 12h-2a6 6 0 01-12 0H4a8.001 8.001 0 007 7.93z"/>
              </svg>
            </button>
            <p class="text-sm text-gray-400">Tap to record · max 90 s</p>
          </div>

          <!-- recording -->
          <div v-else-if="recState === 'recording'" class="flex flex-col items-center gap-4 py-6">
            <div class="relative">
              <button @click="stopRecording"
                class="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                <span class="w-7 h-7 rounded bg-white block"></span>
              </button>
              <span class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
            </div>
            <p class="text-sm text-gray-700 font-mono tabular-nums">{{ fmtMs(recDuration) }}</p>
            <p class="text-xs text-gray-400">Recording… tap to stop</p>
          </div>

          <!-- preview -->
          <div v-else-if="recState === 'preview' || recState === 'sending'" class="flex flex-col gap-3">
            <p class="text-sm text-gray-600 text-center">Preview your message:</p>
            <audio ref="previewAudioEl" :src="recordedUrl" controls
              class="w-full rounded-lg" controlsList="nodownload nofullscreen noremoteplayback" />
            <div class="flex gap-2">
              <button @click="discardRecording" :disabled="recState === 'sending'"
                class="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-400 text-gray-600 transition-all disabled:opacity-40">
                Re-record
              </button>
              <button @click="sendRecording" :disabled="recState === 'sending'"
                class="flex-1 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-40 transition-all">
                {{ recState === 'sending' ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </div>
        </template>
      </div>

    </template>

    <!-- Shared playback audio element (hidden, no controls = no right-click download) -->
    <audio ref="audioEl" class="hidden"
      @timeupdate="onTimeUpdate" @ended="onEnded" @loadedmetadata="onMeta" />

    <!-- Delete confirm -->
    <Teleport to="body">
      <div v-if="pendingDelete" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-xl p-5 max-w-xs w-full shadow-xl">
          <p class="text-sm text-gray-700 mb-4">Delete this voice message? This cannot be undone.</p>
          <div class="flex gap-2 justify-end">
            <button @click="pendingDelete = null" class="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button @click="doDelete" class="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Delete</button>
          </div>
        </div>
      </div>

      <div v-if="pendingBlock" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-xl p-5 max-w-xs w-full shadow-xl">
          <p class="text-sm font-medium text-gray-900 mb-1">Block {{ pendingBlock.sender_username }}?</p>
          <p class="text-xs text-gray-500 mb-4">
            They won't be able to message you again. Their existing messages will be hidden.
          </p>
          <div class="flex gap-2 justify-end">
            <button @click="pendingBlock = null" class="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button @click="doBlock" class="px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">Block</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, defineComponent, h } from 'vue'
import { LANGS } from '../data/stories.js'
import {
  getInbox, getSent, deleteMessage, blockUser,
  markMessageRead, fetchAudioBlob, sendVoiceMessage, discoverPartners,
} from '../utils/api.js'

const props = defineProps({ currentUser: Object })
const emit  = defineEmits(['open-auth', 'unread-count'])

// ── Tiny inline icon components ───────────────────────────────────────────────
const TrashIcon = defineComponent({
  setup: () => () => h('svg', { class: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2',
      d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' }),
  ]),
})

const BanIcon = defineComponent({
  setup: () => () => h('svg', { class: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2',
      d: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' }),
  ]),
})

// ── Inline PlayerBar component ────────────────────────────────────────────────
const PlayerBar = defineComponent({
  name: 'PlayerBar',
  props: {
    msg:         Object,
    currentId:   String,
    playing:     Boolean,
    progress:    Number,
    currentTime: Number,
    loadingId:   String,
  },
  emits: ['play', 'seek'],
  setup(p, { emit: em }) {
    const fmtMs = ms => {
      if (!ms) return '0:00'
      const s = Math.round(ms / 1000)
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }
    const fmtSec = s => {
      if (!s || isNaN(s)) return '0:00'
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    }
    return () => {
      const active  = p.currentId === p.msg.id
      const loading = p.loadingId === p.msg.id

      const playBtn = h('button', {
        class: 'w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 transition-all',
        onClick: (e) => { e.stopPropagation(); em('play', p.msg.id) },
      }, loading
        ? [h('span', { class: 'text-[9px] animate-pulse' }, '…')]
        : (active && p.playing)
          ? [h('svg', { class: 'w-3 h-3', fill: 'currentColor', viewBox: '0 0 24 24' },
              [h('path', { d: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' })])]
          : [h('svg', { class: 'w-3 h-3', fill: 'currentColor', viewBox: '0 0 24 24' },
              [h('path', { d: 'M8 5v14l11-7z' })])]
      )

      const bar = h('input', {
        type: 'range', min: 0, max: 1, step: 0.01,
        value: active ? p.progress : 0,
        class: 'flex-1 accent-emerald-500 cursor-pointer',
        onInput: (e) => { e.stopPropagation(); em('seek', { msgId: p.msg.id, value: parseFloat(e.target.value) }) },
        onClick: (e) => e.stopPropagation(),
      })

      const time = h('span', { class: 'text-xs text-gray-400 w-9 text-right flex-shrink-0' },
        active ? fmtSec(p.currentTime) : fmtMs(p.msg.duration_ms)
      )

      return h('div', { class: 'flex items-center gap-2 mt-1' }, [playBtn, bar, time])
    }
  },
})

// ── Tabs ─────────────────────────────────────────────────────────────────────
const activeTab = ref('inbox')
const tabs = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent',  label: 'Sent' },
  { key: 'new',   label: '+ New' },
]

// ── Data ──────────────────────────────────────────────────────────────────────
const inbox    = ref([])
const sent     = ref([])
const partners = ref([])
const loadingInbox    = ref(false)
const loadingSent     = ref(false)
const loadingPartners = ref(false)
const unread = computed(() => inbox.value.filter(m => !m.read_at).length)

// ── Audio playback ────────────────────────────────────────────────────────────
const audioEl     = ref(null)
const currentId   = ref(null)
const playing     = ref(false)
const progress    = ref(0)
const currentTime = ref(0)
const loadingId   = ref(null)
const blobCache   = ref({})

async function playMsg(msgId) {
  if (currentId.value === msgId) {
    if (audioEl.value.paused) { audioEl.value.play(); playing.value = true }
    else                       { audioEl.value.pause(); playing.value = false }
    return
  }
  currentId.value   = msgId
  playing.value     = false
  progress.value    = 0
  currentTime.value = 0

  if (!blobCache.value[msgId]) {
    loadingId.value = msgId
    const url = await fetchAudioBlob(msgId)
    loadingId.value = null
    if (!url) return
    blobCache.value[msgId] = url
  }
  audioEl.value.src = blobCache.value[msgId]
  await audioEl.value.play().catch(() => {})
  playing.value = true

  const msg = inbox.value.find(m => m.id === msgId)
  if (msg && !msg.read_at) {
    msg.read_at = new Date().toISOString()
    markMessageRead(msgId)
  }
}

function seekTo({ msgId, value }) {
  if (msgId !== currentId.value || !audioEl.value) return
  audioEl.value.currentTime = value * (audioEl.value.duration || 0)
}
function onTimeUpdate() {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  progress.value    = audioEl.value.duration ? audioEl.value.currentTime / audioEl.value.duration : 0
}
function onEnded()  { playing.value = false; progress.value = 0 }
function onMeta()   { /* nothing extra needed */ }

// ── Recording ─────────────────────────────────────────────────────────────────
const recState        = ref('idle')
const recDuration     = ref(0)
const recordedUrl     = ref(null)
const recordedBlob    = ref(null)
const selectedPartner = ref(null)
const previewAudioEl  = ref(null)
let mediaRecorder = null
let timerInterval = null
let recordStart   = 0

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks = []
    const mime   = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime })
    mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      recordedBlob.value = new Blob(chunks, { type: mime })
      recordedUrl.value  = URL.createObjectURL(recordedBlob.value)
      recState.value     = 'preview'
    }
    chunks.length     = 0
    recordStart       = Date.now()
    recDuration.value = 0
    timerInterval     = setInterval(() => {
      recDuration.value = Date.now() - recordStart
      if (recDuration.value >= 90_000) stopRecording()
    }, 100)
    mediaRecorder.start(100)
    recState.value = 'recording'
  } catch (e) {
    alert('Microphone access denied: ' + e.message)
  }
}

function stopRecording() {
  clearInterval(timerInterval)
  if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop()
}

function discardRecording() {
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  recordedUrl.value  = null
  recordedBlob.value = null
  recState.value     = 'idle'
  recDuration.value  = 0
}

async function sendRecording() {
  if (!selectedPartner.value || !recordedBlob.value) return
  recState.value = 'sending'
  try {
    const fd = new FormData()
    fd.append('recipient_id',  selectedPartner.value.id)
    fd.append('lang',          props.currentUser?.target_lang || 'en')
    fd.append('duration_ms',   String(Math.round(recDuration.value)))
    fd.append('allow_download','false')
    fd.append('audio',         recordedBlob.value, 'voice.webm')
    await sendVoiceMessage(fd)
    discardRecording()
    selectedPartner.value = null
    await loadSent()
    activeTab.value = 'sent'
  } catch (e) {
    alert(e.message)
    recState.value = 'preview'
  }
}

// ── Modals ────────────────────────────────────────────────────────────────────
const pendingDelete = ref(null)
const pendingBlock  = ref(null)

async function doDelete() {
  const msg = pendingDelete.value
  pendingDelete.value = null
  try {
    await deleteMessage(msg.id)
    inbox.value = inbox.value.filter(m => m.id !== msg.id)
    sent.value  = sent.value.filter(m => m.id !== msg.id)
  } catch { /* already removed */ }
}

async function doBlock() {
  const msg = pendingBlock.value
  pendingBlock.value = null
  try {
    await blockUser(String(msg.sender_id))
    inbox.value = inbox.value.filter(m => m.sender_id !== msg.sender_id)
  } catch (e) { alert(e.message) }
}

// ── Loading ───────────────────────────────────────────────────────────────────
async function loadInbox() {
  loadingInbox.value = true
  inbox.value = await getInbox()
  loadingInbox.value = false
  emit('unread-count', unread.value)
}
async function loadSent() {
  loadingSent.value = true
  sent.value = await getSent()
  loadingSent.value = false
}
async function loadPartners() {
  if (!props.currentUser?.target_lang) return
  loadingPartners.value = true
  partners.value = await discoverPartners(props.currentUser.target_lang)
  loadingPartners.value = false
}

async function switchTab(key) {
  activeTab.value = key
  if (key === 'inbox' && !inbox.value.length)    await loadInbox()
  if (key === 'sent'  && !sent.value.length)     await loadSent()
  if (key === 'new'   && !partners.value.length) await loadPartners()
}

onMounted(() => { if (props.currentUser) loadInbox() })
onUnmounted(() => {
  Object.values(blobCache.value).forEach(u => URL.revokeObjectURL(u))
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const targetLangName = computed(() =>
  LANGS[props.currentUser?.target_lang]?.name || props.currentUser?.target_lang || ''
)

function fmtMs(ms) {
  if (!ms) return '0:00'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
</script>
