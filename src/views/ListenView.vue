<template>
  <!-- Hidden YouTube IFrame container — must be a real DOM node (dictation player) -->
  <div ref="ytContainerEl" style="width:0;height:0;overflow:hidden;position:absolute;pointer-events:none;" />

  <!-- HTML5 audio element for non-YouTube dictation sources -->
  <audio
    v-if="selectedStory && selectedStory.source_type !== 'youtube'"
    ref="audioEl"
    :src="selectedStory.audio_url"
    preload="metadata"
    @loadedmetadata="onAudioLoaded"
    @timeupdate="onAudioTimeUpdate"
    @play="isPlaying = true; startWave()"
    @pause="isPlaying = false; stopWave()"
    @ended="isPlaying = false; stopWave()"
    @error="onAudioCorsError"
    style="display:none"
  />

  <!-- Clip viewer: opened from Vocab → Video tab -->
  <div v-if="activeClip" class="flex flex-col gap-2 mb-4 bg-slate-900 border border-blue-800 rounded-xl p-3">

    <!-- Header: title + test toggle + close -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-blue-400 font-medium">{{ t(lang, 'videoClip') }}</span>
      <div class="flex items-center gap-3">
        <button
          @click="toggleTest"
          :class="testMode ? 'text-emerald-400 font-medium' : 'text-gray-500 hover:text-emerald-400'"
          class="text-xs transition-all"
          title="Listening comprehension test — hides transcript and disables CC"
        >🎧 {{ t(lang, 'listenTest') }}</button>
        <button @click="closeClip" class="text-xs text-gray-500 hover:text-white transition-all">✕</button>
      </div>
    </div>

    <!-- YouTube player — cc_load_policy=0 always (test mode) or by default -->
    <div class="relative w-full rounded-lg overflow-hidden bg-black" style="padding-bottom:56.25%">
      <iframe
        :src="`https://www.youtube.com/embed/${activeClip.video_id}?start=${activeClip.start_sec}&cc_load_policy=0&rel=0`"
        class="absolute inset-0 w-full h-full"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      />
    </div>

    <!-- Normal view: transcript + report -->
    <template v-if="!testMode">
      <div class="flex items-start justify-between gap-2 px-1">
        <p v-if="activeClip.context" class="text-sm text-gray-300 leading-snug flex-1">{{ activeClip.context }}</p>
        <div class="flex-shrink-0 flex flex-col items-end gap-1">
          <button
            v-if="!clipReportSent"
            @click="clipReportOpen = !clipReportOpen; clipReportNote = ''"
            class="text-xs text-gray-600 hover:text-red-400 transition-all"
            title="Report a transcript error"
          >⚑ report</button>
          <span v-if="clipReportSent" class="text-xs text-green-500">Reported ✓</span>
          <div v-if="clipReportOpen && !clipReportSent" class="flex items-center gap-1">
            <input
              v-model="clipReportNote"
              type="text"
              placeholder="What's wrong?"
              class="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 placeholder-gray-600 w-40 focus:outline-none focus:border-red-700"
              @keydown.enter="submitClipReport"
              @keydown.escape="clipReportOpen = false"
            />
            <button @click="submitClipReport" class="text-xs text-red-400 hover:text-red-300">Send</button>
          </div>
        </div>
      </div>
    </template>

    <!-- Test mode: type what you hear -->
    <template v-else>
      <!-- Input phase -->
      <template v-if="!testResult">
        <textarea
          v-model="testInput"
          :placeholder="t(lang, 'typeWhatYouHear')"
          rows="2"
          class="w-full text-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-emerald-700"
          @keydown.meta.enter.prevent="checkAnswer"
          @keydown.ctrl.enter.prevent="checkAnswer"
        />
        <div class="flex items-center gap-2">
          <button
            @click="checkAnswer"
            :disabled="!testInput.trim()"
            class="text-xs px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-all"
          >{{ t(lang, 'check') }}</button>
          <span class="text-xs text-gray-600">Ctrl/Cmd+Enter</span>
        </div>
      </template>

      <!-- Results phase -->
      <template v-else>
        <div class="flex items-center gap-3 text-xs">
          <span :class="testResult.pct >= 80 ? 'text-green-400' : testResult.pct >= 50 ? 'text-yellow-400' : 'text-red-400'" class="font-medium">
            {{ testResult.correct }}/{{ testResult.total }} {{ t(lang, 'words') }}
          </span>
          <button @click="testResult = null; testInput = ''" class="text-gray-600 hover:text-blue-400 transition-all">{{ t(lang, 'tryAgain') }}</button>
        </div>
        <!-- Word-by-word colouring -->
        <p class="text-sm leading-relaxed">
          <template v-for="(s, i) in testResult.scored" :key="i">
            <span :class="s.ok ? 'bg-green-800 text-green-200 rounded px-0.5' : 'bg-purple-900 text-purple-200 rounded px-0.5'">{{ s.w }}</span>
            <span> </span>
          </template>
        </p>
        <!-- Reveal transcript -->
        <button
          v-if="!clipShowTranscript"
          @click="clipShowTranscript = true"
          class="text-xs text-blue-400 hover:text-blue-300 transition-all self-start"
        >{{ t(lang, 'revealTranscript') }}</button>
        <p v-if="clipShowTranscript" class="text-xs text-gray-400 leading-snug border-t border-gray-700 pt-2">{{ activeClip.context }}</p>
      </template>
    </template>

  </div>

  <div class="flex flex-col gap-3">

    <!-- Story picker -->
    <div v-if="!selectedStory" class="flex flex-col gap-3">

      <!-- ── Curated stories ── -->
      <div v-if="storiesLoading" class="text-sm text-gray-500 text-center py-10">{{ t(lang, 'loading') }}</div>
      <div v-else-if="storiesError" class="text-sm text-red-400 text-center py-6">{{ storiesError }}</div>
      <div v-else-if="!stories.length" class="text-sm text-gray-500 text-center py-6">
        {{ t(lang, 'noExercises') }}
      </div>
      <div v-if="stories.length" class="flex flex-col gap-2">
        <button
          v-for="story in stories"
          :key="story.id"
          @click="loadStory(story)"
          class="w-full text-left bg-slate-900 border border-gray-700 hover:border-emerald-700 rounded-lg px-4 py-3 transition-all"
        >
          <div class="font-medium text-sm text-gray-100 leading-snug">{{ story.title }}</div>
          <div class="text-xs text-gray-500 mt-0.5 flex gap-2 flex-wrap">
            <span v-if="story.author">{{ story.author }}</span>
            <span v-if="story.source" class="text-gray-600">{{ story.source }}</span>
            <span>{{ story.segments.length }} {{ t(lang, 'segment') }}</span>
            <span v-if="story.is_autogenerated" class="text-yellow-600">{{ t(lang, 'autoCaptions') }}</span>
          </div>
        </button>
      </div>

    </div>

    <!-- Player -->
    <div v-else class="flex flex-col gap-4">

      <!-- Back + header -->
      <div class="flex items-start gap-3">
        <button
          @click="backToList"
          class="flex-shrink-0 text-gray-500 hover:text-white text-lg leading-none pt-0.5 transition-all"
          title="Back to list"
        >←</button>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <h2 class="font-semibold text-gray-100 text-base leading-snug">{{ selectedStory.title }}</h2>
          <div class="text-xs text-gray-500 flex gap-2">
            <span v-if="selectedStory.author">{{ selectedStory.author }}</span>
            <span v-if="selectedStory.source" class="uppercase tracking-wide">{{ selectedStory.source }}</span>
            <span>{{ LANGS[selectedStory.lang]?.name ?? selectedStory.lang }}</span>
          </div>
        </div>
        <button
          v-if="resumeSegment !== null"
          @click="resumeFromSaved"
          class="flex-shrink-0 text-xs text-emerald-400 border border-emerald-800 rounded-md px-2.5 py-1 hover:bg-emerald-950 transition-all"
        >{{ t(lang, 'resumeSeg') }} {{ resumeSegment + 1 }}</button>
      </div>

      <!-- Auto-generated transcript warning -->
      <div
        v-if="selectedStory.is_autogenerated"
        class="text-xs text-yellow-400 bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2"
      >
        {{ t(lang, 'autoGeneratedWarning') }}
      </div>

      <!-- Mode + difficulty toggles -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-1">
          <button
            @click="mode = 'dictation'; translationResult = null; showTranscript = false"
            :class="['mode-btn', mode === 'dictation' ? 'mode-on' : '']"
          >{{ t(lang, 'dictation') }}</button>
          <button
            @click="mode = 'loop'; translationResult = null; showTranscript = false; loopStep = 'dictation'; loopDictationSaved = null"
            :class="['mode-btn', mode === 'loop' ? 'mode-on' : '']"
          >{{ t(lang, 'listenTranslate') }}</button>
          <button
            @click="mode = 'translation'; translationResult = null; showTranscript = false"
            :class="['mode-btn', mode === 'translation' ? 'mode-on' : '']"
          >{{ t(lang, 'translation') }}</button>
        </div>
        <div v-if="mode === 'dictation' || (mode === 'loop' && loopStep === 'dictation')" class="flex gap-1.5">
          <button
            v-for="d in ['easy', 'medium', 'hard']"
            :key="d"
            @click="difficulty = d"
            :class="['mode-btn', difficulty === d ? 'diff-on' : '']"
          >{{ t(lang, d) }}</button>
        </div>
      </div>

      <!-- Hybrid tube/solid-state integrated amplifier -->
      <div class="amp-body">
        <div class="amp-screw tl" /><div class="amp-screw tr" />
        <div class="amp-screw bl" /><div class="amp-screw br" />

        <!-- Face: tubes · VU meters · VFD display -->
        <div class="amp-face">

          <!-- Left tube (12AX7 preamp) -->
          <div class="amp-tube-wrap">
            <div class="amp-tube" :style="{ '--glow': tubeGlowIntensity }">
              <div class="tube-glass">
                <div class="tube-plate" />
                <div class="tube-grid" />
                <div class="tube-glow-inner" />
              </div>
              <div class="tube-pins"><span /><span /><span /></div>
            </div>
            <span class="tube-label">12AX7</span>
          </div>

          <!-- L VU meter -->
          <div class="amp-vu">
            <div class="vu-leds">
              <div v-for="n in 8" :key="n" class="vu-led"
                :class="vuLeft >= n ? (n <= 5 ? 'vu-g' : n <= 7 ? 'vu-y' : 'vu-r') : 'vu-off'" />
            </div>
            <span class="vu-ch">L</span>
          </div>

          <!-- VFD display panel -->
          <div class="amp-display" :class="selectedStory.image_url ? 'amp-display-art' : ''">
            <img v-if="selectedStory.image_url" :src="selectedStory.image_url" class="art-thumb" alt="" />
            <div class="vfd-body">
            <div class="vfd-title">{{ selectedStory.title?.replace(/_/g, ' ') }}</div>
            <div class="vfd-sub">{{ selectedStory.source ?? selectedStory.author ?? '' }}</div>
            <div class="vfd-row">
              <span class="vfd-time">{{ fmtTime(currentTime) }} / {{ fmtTime(duration || (currentSegment?.end ?? 0)) }}</span>
              <span v-if="segments.length" class="vfd-seg">{{ segmentIdx + 1 }}/{{ segments.length }}</span>
              <span v-if="currentWord && isPlaying" class="vfd-word">{{ currentWord.raw }}</span>
              <span v-if="!playerReady && !playerError" class="vfd-loading">loading…</span>
            </div>
            <div v-if="playerError" class="vfd-err">{{ playerError }}</div>
            </div>
          </div>

          <!-- R VU meter -->
          <div class="amp-vu">
            <span class="vu-ch">R</span>
            <div class="vu-leds">
              <div v-for="n in 8" :key="n" class="vu-led"
                :class="vuRight >= n ? (n <= 5 ? 'vu-g' : n <= 7 ? 'vu-y' : 'vu-r') : 'vu-off'" />
            </div>
          </div>

          <!-- Right tube (KT88 output) -->
          <div class="amp-tube-wrap">
            <div class="amp-tube" :style="{ '--glow': tubeGlowIntensity }">
              <div class="tube-glass">
                <div class="tube-plate" />
                <div class="tube-grid" />
                <div class="tube-glow-inner" />
              </div>
              <div class="tube-pins"><span /><span /><span /></div>
            </div>
            <span class="tube-label">KT88</span>
          </div>
        </div>

        <div class="amp-divider" />

        <!-- Controls: speed · transport · volume -->
        <div class="amp-controls">

          <!-- Speed -->
          <div class="amp-section">
            <span class="amp-label">SPEED</span>
            <div class="speed-btns">
              <button v-for="s in [0.5, 1, 1.5]" :key="s"
                @click="setSpeed(s)"
                :class="['speed-btn', speed === s ? 'speed-on' : '']">{{ s }}×</button>
            </div>
          </div>

          <!-- Transport -->
          <div class="amp-transport">
            <button @click="skipBack"           :disabled="!playerReady" class="xport-btn" title="-15s">
              <span class="xi">⏮</span><span class="xl">15s</span>
            </button>
            <button @click="seekToSegmentStart" :disabled="!playerReady" class="xport-btn" title="Restart segment">
              <span class="xi">↩</span>
            </button>
            <button @click="togglePlay"         :disabled="!playerReady" class="xport-play">{{ isPlaying ? '⏸' : '▶' }}</button>
            <button @click="nextSegment"        :disabled="!playerReady || segmentIdx >= segments.length - 1" class="xport-btn" title="Next segment">
              <span class="xi">↪</span>
            </button>
            <button @click="skipFwd"            :disabled="!playerReady" class="xport-btn" title="+15s">
              <span class="xi">⏭</span><span class="xl">15s</span>
            </button>
          </div>

          <!-- Volume -->
          <div class="amp-section">
            <span class="amp-label">VOL</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="volume" @input="applyVolume" class="vol-slider" />
          </div>

        </div>
      </div>

      <!-- Input area -->
      <div class="flex flex-col gap-2">
        <textarea
          v-model="userInput"
          rows="3"
          :placeholder="(mode === 'translation' || (mode === 'loop' && loopStep === 'translation')) ? `Type your ${TRANSLATE_TO_OPTIONS.find(o => o.code === translateTo)?.label ?? ''} translation…` : t(lang, 'typeWhatYouHear')"
          @keydown.space="(mode === 'dictation' || (mode === 'loop' && loopStep === 'dictation')) ? playWordTick() : undefined"
          class="listen-textarea"
        />

        <!-- Dictation: word-by-word colour feedback -->
        <template v-if="mode === 'dictation' || (mode === 'loop' && loopStep === 'dictation')">
          <div v-if="comparedWords.length" class="flex flex-wrap gap-1.5 px-1">
            <span
              v-for="(w, i) in comparedWords"
              :key="i"
              :class="['text-sm px-1.5 py-0.5 rounded font-mono transition-colors',
                w.state === 'correct' ? 'word-correct' :
                w.state === 'wrong'   ? 'word-wrong' :
                                        'word-pending']"
            >{{ w.typed }}</span>
          </div>
          <div v-if="accuracy !== null" class="flex justify-end">
            <span class="text-xs text-gray-500">
              {{ t(lang, 'accuracy') }}: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
              <span class="ml-1 text-gray-600">({{ correctCount }}/{{ segmentWords.length }} {{ t(lang, 'words') }})</span>
            </span>
          </div>
          <div v-if="mode === 'loop' && userInput.trim()" class="flex justify-end mt-1">
            <button
              @click="advanceToTranslation"
              class="text-xs px-4 py-1.5 rounded-md bg-teal-700 text-white hover:bg-teal-600 transition-all"
            >{{ t(lang, 'translateIt') }}</button>
          </div>
        </template>

        <!-- Translation mode or loop translation step -->
        <template v-else-if="mode === 'translation' || (mode === 'loop' && loopStep === 'translation')">
          <!-- Loop mode: locked dictation result summary -->
          <div v-if="mode === 'loop' && loopDictationSaved" class="flex items-center gap-2 text-xs border border-gray-800 rounded-lg px-3 py-2 bg-slate-900">
            <span class="text-gray-500">{{ t(lang, 'dictation') }}</span>
            <span :class="loopDictationSaved.accuracy >= 80 ? 'text-emerald-400' : loopDictationSaved.accuracy >= 50 ? 'text-yellow-400' : 'text-red-400'" class="font-medium">{{ loopDictationSaved.accuracy }}%</span>
            <span class="text-gray-600">({{ loopDictationSaved.correct }}/{{ loopDictationSaved.total }} {{ t(lang, 'words') }})</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-gray-500">{{ t(lang, 'translateTo') }}:</span>
            <select
              v-model="translateTo"
              class="text-xs bg-slate-800 border border-gray-700 rounded px-2 py-1 text-gray-200 outline-none"
            >
              <option v-for="opt in TRANSLATE_TO_OPTIONS" :key="opt.code" :value="opt.code">{{ opt.label }}</option>
            </select>
          </div>
          <div v-if="sameLang" class="text-xs text-yellow-400">{{ t(lang, 'sameLangWarning') }}</div>
          <div v-else class="flex items-center gap-2">
            <button
              @click="runTranslationCheck"
              :disabled="!userInput.trim() || translationChecking"
              class="text-xs px-4 py-1.5 rounded-md bg-violet-700 text-white hover:bg-violet-600 disabled:opacity-40 transition-all"
            >{{ translationChecking ? t(lang, 'checkingEllipsis') : t(lang, 'checkTranslation') }}</button>
          </div>
          <div v-if="translationResult" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <span
                :class="['text-sm font-bold px-2.5 py-0.5 rounded-full',
                  translationResult.score >= 80 ? 'bg-emerald-900 text-emerald-300' :
                  translationResult.score >= 55 ? 'bg-yellow-900 text-yellow-300' :
                                                   'bg-red-900 text-red-300']"
              >{{ translationResult.score }}%</span>
              <span class="text-xs text-gray-400 leading-snug">{{ translationResult.feedback }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Transcript / original text reveal -->
      <div
        v-if="showTranscript && currentSegment"
        ref="segmentEl"
        class="listen-reveal"
        :dir="isRTL(props.lang) ? 'rtl' : 'ltr'"
      >{{ currentSegment.text }}</div>

      <!-- Local translation result -->
      <div v-if="localTranslation" class="listen-translation">
        {{ localTranslation }}
      </div>

      <!-- Model download progress -->
      <div v-if="isDownloading" class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span class="truncate max-w-[70%]">{{ downloadLabel || 'Loading language engine…' }}</span>
          <span>{{ downloadPct }}%</span>
        </div>
        <div class="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div class="h-full bg-indigo-600 rounded-full transition-all duration-300" :style="{ width: downloadPct + '%' }" />
        </div>
      </div>

      <!-- Transcript loading indicator -->
      <div v-if="transcriptLoading" class="text-xs text-gray-500 text-center py-1 animate-pulse">
        Loading transcript…
      </div>

      <!-- On-device transcription panel -->
      <div v-else-if="!segments.length && selectedStory?.audio_url" class="flex flex-col gap-2 py-1">
        <!-- Idle: offer to generate -->
        <div v-if="xStage === 'idle' || xStage === 'done'" class="flex items-center justify-between gap-2">
          <span class="text-xs" style="color:rgba(255,255,255,0.35);">No transcript — generate one on this device?</span>
          <button
            @click="startTranscribe"
            class="text-xs px-3 py-1 rounded border border-emerald-700 text-emerald-400 hover:bg-emerald-900 transition-all flex-shrink-0"
          >Generate transcript</button>
        </div>
        <!-- Loading model or transcribing -->
        <div v-else-if="xStage === 'loading' || xStage === 'transcribing'" class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-xs" style="color:rgba(255,255,255,0.5);">
            <span>{{ xStage === 'loading' ? 'Downloading Whisper model…' : 'Transcribing…' }}</span>
            <span>{{ xPct }}%</span>
          </div>
          <div class="w-full rounded-full overflow-hidden" style="height:3px; background:rgba(255,255,255,0.08);">
            <div class="h-full rounded-full bg-emerald-500 transition-all duration-300" :style="`width:${xPct}%`" />
          </div>
          <div v-if="xStage === 'loading'" class="text-[10px]" style="color:rgba(255,255,255,0.25);">
            ~80 MB download · cached after first use · stays on your device
          </div>
        </div>
        <!-- Error -->
        <div v-else-if="xStage === 'error'" class="flex items-center justify-between gap-2">
          <span class="text-xs text-red-400">{{ xError }}</span>
          <button @click="startTranscribe" class="text-xs text-emerald-400 underline flex-shrink-0">Retry</button>
        </div>
      </div>

      <!-- Action row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            v-if="segments.length"
            @click="showTranscript = !showTranscript"
            class="act-btn"
          >{{ showTranscript ? t(lang, 'hideTranscript') : ((mode === 'translation' || (mode === 'loop' && loopStep === 'translation')) ? t(lang, 'showOriginal') : t(lang, 'showCorrectText')) }}</button>

          <button
            v-if="segments.length && currentSegment && lang !== 'en'"
            @click="translateSegment"
            :disabled="isTranslating || isDownloading"
            class="act-btn disabled:opacity-40"
          >{{ isTranslating ? '…' : (localTranslation ? t(lang, 'retranslateBtn') : t(lang, 'translateBtn')) }}</button>

          <button
            v-if="selectedStory.audio_url"
            @click="downloadAudio"
            :disabled="downloadingAudio"
            class="act-btn disabled:opacity-40"
            title="Download audio for offline use"
          >{{ downloadingAudio ? '…' : t(lang, 'downloadAudio') }}</button>
        </div>

        <button
          v-if="segments.length > 1"
          @click="nextSegment"
          :disabled="segmentIdx >= segments.length - 1"
          class="act-btn act-primary disabled:opacity-40"
        >{{ t(lang, 'nextSegment') }}</button>
      </div>

    </div>
  </div>


</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, watchEffect } from 'vue'
import Fuse from 'fuse.js'
import { LANGS } from '../data/stories.js'
import { fetchListenStories, checkTranslation, fetchPodcastTranscript, fetchOgjreTranscript, savePodcastTranscript } from '../utils/api.js'
import { t } from '../utils/i18n.js'
import { isRTL } from '../utils/rtl.js'
import { spokenNumbers } from '../utils/spokenNumbers.js'
import { rootHighlightOn, applyRoots, clearRoots } from '../utils/rootHighlight.js'
import { useLocalTranslator } from '../composables/useLocalTranslator.js'
import { useTranscribe } from '../composables/useTranscribe.js'
import { getStoredTranscript, saveStoredTranscript } from '../utils/transcriptStore.js'

const { translateText, isTranslating, isDownloading, downloadPct, downloadLabel } = useLocalTranslator()
const localTranslation = ref('')

const props = defineProps({
  story:       Object,
  lang:        String,
  currentUser: Object,
  clip:        Object,  // { video_id, start_sec, context } from Vocab → Video tab
})

const emit = defineEmits(['closeClip', 'openAuth'])

const activeClip = ref(props.clip ?? null)
watch(() => props.clip, c => { activeClip.value = c ?? null })

function closeClip() {
  activeClip.value = null
  clipReportOpen.value = false
  clipReportSent.value = false
  emit('closeClip')
}

const clipReportOpen = ref(false)
const clipReportNote = ref('')
const clipReportSent = ref(false)

// ── Listening test ────────────────────────────────────────────────────────────
const testMode       = ref(false)
const testInput      = ref('')
const testResult     = ref(null)
const clipShowTranscript = ref(false)

function toggleTest() {
  testMode.value = !testMode.value
  testInput.value = ''
  testResult.value = null
  clipShowTranscript.value = false
}

function checkAnswer() {
  if (!testInput.value.trim() || !activeClip.value?.context) return
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, '').trim()
  const words  = norm(testInput.value).split(/\s+/).filter(Boolean)
  const refSet = new Set(norm(activeClip.value.context).split(/\s+/).filter(Boolean))
  const scored = words.map(w => ({ w, ok: refSet.has(w) }))
  const correct = scored.filter(s => s.ok).length
  testResult.value = { scored, correct, total: words.length, pct: words.length ? Math.round(correct / words.length * 100) : 0 }
}

watch(activeClip, () => {
  clipReportOpen.value = false
  clipReportSent.value = false
  testMode.value = false
  testInput.value = ''
  testResult.value = null
  clipShowTranscript.value = false
})

async function submitClipReport() {
  const clip = activeClip.value
  if (!clip) return
  await fetch('/api/report-clip', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      video_id:  clip.video_id,
      start_sec: clip.start_sec,
      word:      clip.context ?? '',
      lang:      props.lang ?? '',
      note:      clipReportNote.value.trim(),
    }),
  }).catch(() => {})
  clipReportOpen.value = false
  clipReportSent.value = true
}

// ── Story list ────────────────────────────────────────────────────────────────

const stories         = ref([])
const storiesLoading  = ref(false)
const storiesError    = ref('')
const selectedStory   = ref(null)

async function loadStories() {
  storiesLoading.value = true
  storiesError.value   = ''
  try {
    stories.value = await fetchListenStories(props.lang)
  } catch {
    storiesError.value = 'Could not load listening exercises.'
  } finally {
    storiesLoading.value = false
  }
}

watch(() => props.lang, () => {
  backToList()
  if (props.currentUser) loadStories()
})

watch(() => props.story, (newStory) => {
  if (newStory) loadStory(newStory)
})

// ── Load a story into the player ──────────────────────────────────────────────

const segments            = ref([])
const segmentIdx          = ref(0)
const userInput           = ref('')
const showTranscript      = ref(false)
const resumeSegment       = ref(null)
const difficulty          = ref('medium')
const mode                = ref('dictation') // 'dictation' | 'translation'
const translateTo         = ref(props.lang === 'en' ? 'es' : 'en')
const transcriptLoading   = ref(false)
const speed               = ref(1)
const volume              = ref(1)

// ── On-device transcription (Whisper via @huggingface/transformers) ───────────

const { transcribe, stage: xStage, pct: xPct, error: xError, reset: xReset } = useTranscribe()

async function startTranscribe() {
  const story = selectedStory.value
  if (!story?.audio_url) return
  xReset()
  const segs = await transcribe(story.audio_url, props.lang)
  if (segs?.length) {
    segments.value = segs
    await saveStoredTranscript(story.id, segs)
  }
}

async function tryFetchTranscript(storyId, title, podcastName) {
  transcriptLoading.value = true
  try {
    // JRE only: try ogjre.com directly from the browser (faster, no backend hop)
    if (podcastName === 'The Joe Rogan Experience' && title) {
      const ogjre = await fetchOgjreTranscript(title)
      if (ogjre?.segments?.length) {
        segments.value = ogjre.segments
        transcriptLoading.value = false
        savePodcastTranscript(storyId, ogjre.segments)
        return
      }
    }
    // All other sources: backend fetches from the appropriate transcript source
    const data = await fetchPodcastTranscript(storyId)
    if (data?.segments?.length) {
      segments.value = data.segments
    }
  } catch {}
  transcriptLoading.value = false
}

const translationResult   = ref(null) // { score, feedback }
const translationChecking = ref(false)

const loopStep           = ref('dictation') // 'dictation' | 'translation'
const loopDictationSaved = ref(null)         // { accuracy, correct, total } snapshot

const TRANSLATE_TO_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'he', label: 'Hebrew' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
]

const sameLang = computed(() => props.lang === translateTo.value)

async function runTranslationCheck() {
  if (!currentSegment.value || !userInput.value.trim() || translationChecking.value || sameLang.value) return
  translationChecking.value = true
  translationResult.value   = null
  const result = await checkTranslation(
    currentSegment.value.text,
    userInput.value.trim(),
    props.lang,
    translateTo.value,
  )
  translationResult.value   = result
  translationChecking.value = false
}

function advanceToTranslation() {
  loopDictationSaved.value = accuracy.value !== null
    ? { accuracy: accuracy.value, correct: correctCount.value, total: segmentWords.value.length }
    : null
  userInput.value         = ''
  translationResult.value = null
  loopStep.value          = 'translation'
}

async function loadStory(story, startAt = null) {
  teardown()
  selectedStory.value    = story
  segments.value         = story.segments ?? []
  segmentIdx.value       = 0
  userInput.value        = ''
  showTranscript.value   = false
  localTranslation.value = ''
  _pendingStartAt      = startAt

  const saved = JSON.parse(localStorage.getItem('szol_listen_progress') || '{}')
  const vp    = saved[story.id]
  resumeSegment.value = (startAt === null && vp && vp.segmentIndex > 0 && vp.segmentIndex < segments.value.length)
    ? vp.segmentIndex : null

  if (story.source_type === 'youtube') {
    loadYTApi(story.video_id)
  } else {
    await nextTick()
    setupAnalyser()
    if (audioEl.value) {
      audioEl.value.currentTime  = segments.value[0]?.start ?? 0
      audioEl.value.playbackRate = speed.value
      audioEl.value.volume       = volume.value
      if (audioEl.value.readyState >= 1) onAudioLoaded()
    }
  }

  // Auto-fetch transcript for known podcast sources; check IndexedDB first for RSS imports
  if (!story.segments?.length) {
    const stored = await getStoredTranscript(story.id)
    if (stored?.length) {
      segments.value = stored
    } else if (story.source_type === 'podcast') {
      tryFetchTranscript(story.id, story.title, story.podcast_name)
    }
  }
  xReset()
}

function backToList() {
  teardown()
  selectedStory.value      = null
  segments.value           = []
  segmentIdx.value         = 0
  userInput.value          = ''
  showTranscript.value     = false
  resumeSegment.value      = null
  localTranslation.value   = ''
  loopStep.value           = 'dictation'
  loopDictationSaved.value = null
}

// ── YouTube player (dictation) ────────────────────────────────────────────────

const ytContainerEl = ref(null)
const playerReady   = ref(false)
const playerError   = ref('')
const isPlaying     = ref(false)
const currentTime   = ref(0)
const duration      = ref(0)

let player          = null
let pollTimer       = null
let _pendingStartAt = null

function initPlayer(id) {
  if (!ytContainerEl.value) return
  try {
    player = new window.YT.Player(ytContainerEl.value, {
      width:    0,
      height:   0,
      videoId:  id,
      playerVars: { controls: 0, rel: 0, disablekb: 1, fs: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady(e) {
          playerReady.value = true
          duration.value    = e.target.getDuration() || 0
          let seekTarget = segments.value[segmentIdx.value]?.start ?? 0
          if (_pendingStartAt !== null) {
            seekTarget = _pendingStartAt
            const idx  = segments.value.findIndex(s => s.start <= _pendingStartAt && s.end >= _pendingStartAt)
            if (idx >= 0) segmentIdx.value = idx
            _pendingStartAt = null
          }
          e.target.seekTo(seekTarget, true)
          e.target.pauseVideo()
        },
        onStateChange(e) {
          const playing = e.data === window.YT.PlayerState.PLAYING
          isPlaying.value = playing
          if (playing) {
            startWave()
            pollTimer = setInterval(pollYTTime, 150)
          } else {
            stopWave()
            clearInterval(pollTimer)
            pollTimer = null
          }
        },
        onError() {
          playerError.value = 'Video unavailable — it may be restricted or deleted.'
          playerReady.value = false
        },
      },
    })
  } catch {
    playerError.value = 'Could not load the YouTube player.'
  }
}

function loadYTApi(id) {
  if (window.YT?.Player) { initPlayer(id); return }
  window.onYouTubeIframeAPIReady = () => initPlayer(id)
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s   = document.createElement('script')
    s.src     = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { playerError.value = 'Failed to load YouTube API.' }
    document.head.appendChild(s)
  }
}

function pollYTTime() {
  if (!player?.getCurrentTime) return
  currentTime.value = player.getCurrentTime()
  const seg = segments.value[segmentIdx.value]
  if (seg?.end != null && currentTime.value >= seg.end) {
    player.pauseVideo()
    currentTime.value = seg.end
  }
}

// ── HTML5 audio handlers ──────────────────────────────────────────────────────

const audioEl = ref(null)

function onAudioLoaded() {
  playerReady.value = true
  duration.value    = audioEl.value?.duration || 0
  const startAt = segments.value[segmentIdx.value]?.start ?? 0
  if (audioEl.value && Math.abs(audioEl.value.currentTime - startAt) > 1) {
    audioEl.value.currentTime = startAt
  }
}

function onAudioTimeUpdate() {
  if (!audioEl.value) return
  currentTime.value = audioEl.value.currentTime
  const seg = segments.value[segmentIdx.value]
  if (seg?.end != null && currentTime.value >= seg.end) {
    audioEl.value.pause()
    currentTime.value = seg.end
  }
}

// ── Unified player controls ───────────────────────────────────────────────────

function isYouTubeStory() { return selectedStory.value?.source_type === 'youtube' }

function togglePlay() {
  if (!playerReady.value) return
  if (isYouTubeStory()) {
    isPlaying.value ? player.pauseVideo() : player.playVideo()
  } else {
    // AudioContext is created suspended when not in a user-gesture context.
    // Resume here (button click IS a user gesture) so audio actually plays.
    if (_audioCtx?.state === 'suspended') _audioCtx.resume().catch(() => {})
    isPlaying.value ? audioEl.value.pause() : audioEl.value.play()
  }
}

function rewind() {
  if (!playerReady.value) return
  const segStart = segments.value[segmentIdx.value]?.start ?? 0
  const newTime  = Math.max(segStart, (isYouTubeStory() ? player.getCurrentTime() : audioEl.value.currentTime) - 10)
  seekTo(newTime)
}

function seekToSegmentStart() {
  if (!playerReady.value) return
  seekTo(segments.value[segmentIdx.value]?.start ?? 0)
}

function seekTo(t) {
  if (isYouTubeStory()) {
    player.seekTo(t, true)
  } else if (audioEl.value) {
    audioEl.value.currentTime = t
  }
  currentTime.value = t
}

function nextSegment() {
  if (segmentIdx.value >= segments.value.length - 1) return
  const next = segments.value[segmentIdx.value + 1]
  seekTo(next.start)
  if (isYouTubeStory()) player.pauseVideo()
  else if (audioEl.value) audioEl.value.pause()
  segmentIdx.value++
  userInput.value          = ''
  showTranscript.value     = false
  translationResult.value  = null
  localTranslation.value   = ''
  loopStep.value           = 'dictation'
  loopDictationSaved.value = null
}

async function translateSegment() {
  if (!currentSegment.value?.text) return
  localTranslation.value = await translateText(currentSegment.value.text, props.lang)
}

// ── Teardown ──────────────────────────────────────────────────────────────────

function teardown() {
  clearInterval(pollTimer); pollTimer = null
  stopWave()
  if (_mediaSrc) { try { _mediaSrc.disconnect() } catch {} _mediaSrc = null; _analyser = null }
  if (player?.destroy) { player.destroy(); player = null }
  if (audioEl.value)   { audioEl.value.pause(); audioEl.value.currentTime = 0 }
  playerReady.value = false
  playerError.value = ''
  isPlaying.value   = false
  currentTime.value = 0
  duration.value    = 0
}

// ── Segment state ─────────────────────────────────────────────────────────────

const currentSegment = computed(() => segments.value[segmentIdx.value] ?? null)

const segDuration = computed(() => {
  const seg = currentSegment.value
  return seg ? (seg.end - seg.start) : 0
})

// Binary-search the word currently being spoken (requires word-level json3 data).
const currentWord = computed(() => {
  const words = selectedStory.value?.words
  if (!words?.length) return null
  const t = currentTime.value
  let lo = 0, hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    words[mid].start <= t ? (lo = mid) : (hi = mid - 1)
  }
  return words[lo]?.start <= t ? words[lo] : null
})

function fmtTime(secs) {
  const s = Math.floor(secs || 0)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Speed / volume / skip ─────────────────────────────────────────────────────

function setSpeed(rate) {
  speed.value = rate
  if (audioEl.value) audioEl.value.playbackRate = rate
}

function applyVolume() {
  if (audioEl.value) audioEl.value.volume = volume.value
}

function skipBack() {
  if (!playerReady.value) return
  const segStart = segments.value[segmentIdx.value]?.start ?? 0
  const now      = isYouTubeStory() ? player.getCurrentTime() : (audioEl.value?.currentTime ?? 0)
  seekTo(Math.max(segStart, now - 15))
}

function skipFwd() {
  if (!playerReady.value) return
  const maxTime = duration.value || (currentSegment.value?.end ?? 0)
  const now     = isYouTubeStory() ? player.getCurrentTime() : (audioEl.value?.currentTime ?? 0)
  seekTo(Math.min(maxTime, now + 15))
}

// VU meter levels derived from analyser bars (0–8 segments each channel)
const vuLeft = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(0, 20).reduce((a, b) => a + b, 0) / 20
  return Math.ceil((avg / 44) * 8)
})
const vuRight = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(20).reduce((a, b) => a + b, 0) / 20
  return Math.ceil((avg / 44) * 8)
})
const tubeGlowIntensity = computed(() => {
  if (!isPlaying.value) return 0.22
  const avg = bars.value.reduce((a, b) => a + b, 0) / bars.value.length
  return 0.45 + (avg / 56) * 0.55
})

// ── Waveform (Web Audio API analyser with fake-animation fallback) ────────────

const BASE_HEIGHTS = Array.from({ length: 40 }, (_, i) => {
  const envelope = Math.sin((i / 39) * Math.PI)
  const detail   = Math.sin(i * 1.7) * 0.25
  return Math.max(4, Math.round((envelope * 0.6 + detail + 0.5) * 44 + 6))
})

const bars      = ref([...BASE_HEIGHTS])
let waveTimer   = null
let _analyser   = null
let _mediaSrc   = null
let _rafId      = null

function setupAnalyser() {
  if (!audioEl.value || _mediaSrc) return
  try {
    // createMediaElementSource outputs silence for cross-origin audio without CORS headers.
    // Skip it for any cross-origin URL; waveform uses the fake-animation fallback instead.
    if (!audioEl.value.src.startsWith(window.location.origin + '/')) return
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {})
    const src = _audioCtx.createMediaElementSource(audioEl.value)
    const an  = _audioCtx.createAnalyser()
    an.fftSize = 128
    an.smoothingTimeConstant = 0.78
    src.connect(an)
    an.connect(_audioCtx.destination)
    _mediaSrc = src
    _analyser = an
  } catch {
    _mediaSrc = null
    _analyser = null
  }
}

function onAudioCorsError() {
  _mediaSrc = null
  _analyser = null
}

function startWave() {
  stopWave()
  if (_analyser) {
    const buf  = new Uint8Array(_analyser.frequencyBinCount)
    const step = buf.length / 40
    function tick() {
      _analyser.getByteFrequencyData(buf)
      bars.value = Array.from({ length: 40 }, (_, i) => {
        const v = buf[Math.floor(i * step)]
        return Math.max(4, Math.round((v / 255) * 52 + 4))
      })
      _rafId = requestAnimationFrame(tick)
    }
    _rafId = requestAnimationFrame(tick)
  } else {
    waveTimer = setInterval(() => {
      bars.value = BASE_HEIGHTS.map(b => Math.max(4, Math.min(56, b + (Math.random() - 0.5) * 28)))
    }, 90)
  }
}

function stopWave() {
  cancelAnimationFrame(_rafId); _rafId = null
  clearInterval(waveTimer);     waveTimer = null
  bars.value = [...BASE_HEIGHTS]
}

// ── Word tick (audio feedback on word completion) ─────────────────────────────

let _audioCtx = null
function playWordTick() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (_audioCtx.state === 'suspended') _audioCtx.resume()
    const osc  = _audioCtx.createOscillator()
    const gain = _audioCtx.createGain()
    osc.connect(gain)
    gain.connect(_audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, _audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, _audioCtx.currentTime + 0.04)
    gain.gain.setValueAtTime(0.07, _audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.08)
    osc.start(_audioCtx.currentTime)
    osc.stop(_audioCtx.currentTime + 0.08)
  } catch {}
}

// ── Word comparison ───────────────────────────────────────────────────────────

function normalizeWord(w) {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function wordMatch(typed, expected) {
  if (difficulty.value === 'hard')  return typed === expected
  const t = normalizeWord(typed)
  const e = normalizeWord(expected)
  if (difficulty.value === 'medium') return t === e
  return new Fuse([e], { threshold: 0.4 }).search(t).length > 0
}

const segmentWords = computed(() =>
  spokenNumbers(currentSegment.value?.text ?? '', props.lang).split(/\s+/).filter(Boolean)
)
const userWords    = computed(() => userInput.value.trim().split(/\s+/).filter(w => w))

const comparedWords = computed(() =>
  userWords.value.map((w, i) => {
    const expected = segmentWords.value[i]
    if (!expected) return { typed: w, state: 'extra' }
    return { typed: w, state: wordMatch(w, expected) ? 'correct' : 'wrong' }
  })
)

const correctCount = computed(() => comparedWords.value.filter(w => w.state === 'correct').length)

const accuracy = computed(() => {
  if (!userWords.value.length) return null
  return Math.round((correctCount.value / segmentWords.value.length) * 100)
})

// ── localStorage progress ─────────────────────────────────────────────────────

function saveProgress() {
  if (!selectedStory.value) return
  const all = JSON.parse(localStorage.getItem('szol_listen_progress') || '{}')
  all[selectedStory.value.id] = { segmentIndex: segmentIdx.value, timestamp: Date.now() }
  localStorage.setItem('szol_listen_progress', JSON.stringify(all))
}

function resumeFromSaved() {
  const idx = resumeSegment.value
  resumeSegment.value  = null
  segmentIdx.value     = idx
  userInput.value      = ''
  showTranscript.value = false
  seekTo(segments.value[idx]?.start ?? 0)
}

watch(segmentIdx, saveProgress)

// ── Audio download ────────────────────────────────────────────────────────────

const downloadingAudio = ref(false)

async function downloadAudio() {
  if (!selectedStory.value?.audio_url) return
  downloadingAudio.value = true
  try {
    const res  = await fetch(selectedStory.value.audio_url)
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const ext  = selectedStory.value.audio_url.split('.').pop().split('?')[0] || 'mp3'
    a.download = `${selectedStory.value.title}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    downloadingAudio.value = false
  }
}

// ── Root highlight ────────────────────────────────────────────────────────────

const segmentEl = ref(null)

watchEffect(() => {
  if (rootHighlightOn.value && segmentEl.value) {
    nextTick(() => applyRoots(segmentEl.value, props.lang))
  } else {
    clearRoots()
  }
})
watch([() => props.lang, currentSegment], () => {
  nextTick(() => {
    if (rootHighlightOn.value && segmentEl.value) applyRoots(segmentEl.value, props.lang)
  })
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  if (props.currentUser) loadStories()
  if (props.story) loadStory(props.story)
  // Pre-load YouTube iframe API (used by dictation player).
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
})

onUnmounted(() => {
  teardown()
})
</script>

<style scoped>
/* ── Mode / difficulty buttons ─────────────────────────────────────────────── */
.mode-btn {
  font-size: 0.72rem;
  padding: 4px 11px;
  border-radius: 9999px;
  border: 1px solid rgba(31,27,23,0.2);
  background: transparent;
  color: rgba(31,27,23,0.42);
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'EB Garamond', serif;
  white-space: nowrap;
}
.mode-btn:hover { color: rgba(31,27,23,0.7); border-color: rgba(31,27,23,0.38); }
.mode-on  { background: #1f1b17; color: #e8d8b8; border-color: #1f1b17; }
.diff-on  { background: rgba(20,55,28,0.12); color: #2a6a3a; border-color: rgba(42,106,58,0.45); }

/* ── Amplifier chassis ─────────────────────────────────────────────────────── */
.amp-body {
  position: relative;
  background: linear-gradient(170deg, #1e1508 0%, #130e04 100%);
  border: 1px solid #3a2a14;
  border-radius: 6px;
  padding: 14px 16px 12px;
  box-shadow: 0 4px 28px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,200,80,0.05);
}
.amp-screw {
  position: absolute;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #6b5030, #2a1c08);
  border: 1px solid #4a3520;
}
.amp-screw.tl { top:6px;    left:6px; }
.amp-screw.tr { top:6px;    right:6px; }
.amp-screw.bl { bottom:6px; left:6px; }
.amp-screw.br { bottom:6px; right:6px; }

/* ── Amp face (tube · VU · display · VU · tube) ────────────────────────────── */
.amp-face {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

/* Tubes */
.amp-tube-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.amp-tube {
  position: relative;
  width: 26px;
  height: 50px;
}
.tube-glass {
  width: 100%;
  height: 80%;
  border-radius: 13px 13px 5px 5px;
  background: linear-gradient(180deg,
    rgba(255,180,50,calc(var(--glow) * 0.13)) 0%,
    rgba(255,110,15,calc(var(--glow) * 0.28)) 55%,
    rgba(180,60,5,calc(var(--glow) * 0.18)) 100%);
  border: 1px solid rgba(255,160,40,calc(var(--glow) * 0.65));
  box-shadow:
    0 0 calc(var(--glow) * 14px) calc(var(--glow) * 3px) rgba(255,110,20,calc(var(--glow) * 0.45)),
    inset 0 0 7px rgba(255,195,70,calc(var(--glow) * 0.18));
  overflow: hidden;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.tube-plate {
  position: absolute;
  left: 28%; right: 28%;
  top: 14%; bottom: 14%;
  border: 1px solid rgba(255,160,40,0.35);
  border-radius: 2px;
}
.tube-grid {
  position: absolute;
  left: 18%; right: 18%;
  top: 26%; height: 1px;
  background: rgba(255,155,35,0.45);
  box-shadow: 0 6px 0 rgba(255,155,35,0.35), 0 12px 0 rgba(255,155,35,0.25);
}
.tube-glow-inner {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(ellipse at 50% 65%,
    rgba(255,140,25,calc(var(--glow) * 0.55)) 0%,
    transparent 72%);
  animation: tube-pulse 2.4s ease-in-out infinite;
}
@keyframes tube-pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.65; }
}
.tube-pins {
  display: flex;
  justify-content: center;
  gap: 3px;
  height: 11px;
  align-items: flex-end;
}
.tube-pins span {
  width: 3px; height: 8px;
  background: #3a2510;
  border-radius: 1px;
}
.tube-label {
  font-size: 8.5px;
  color: #5a4020;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.04em;
  text-align: center;
}

/* VU meters */
.amp-vu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-top: 2px;
}
.vu-leds {
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
}
.vu-led {
  width: 13px; height: 5px;
  border-radius: 1px;
  transition: background 0.06s, box-shadow 0.06s;
}
.vu-g   { background: #15803d; box-shadow: 0 0 5px rgba(21,128,61,0.75); }
.vu-y   { background: #a16207; box-shadow: 0 0 5px rgba(161,98,7,0.75); }
.vu-r   { background: #b91c1c; box-shadow: 0 0 5px rgba(185,28,28,0.75); }
.vu-off { background: rgba(255,255,255,0.05); }
.vu-ch  {
  font-size: 8.5px;
  color: #7a5a30;
  font-family: 'Courier New', monospace;
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* VFD display */
.amp-display {
  flex: 1;
  min-width: 0;
  background-color: #080401;
  border: 1px solid #2a1c08;
  border-radius: 4px;
  padding: 7px 10px 6px;
  box-shadow: inset 0 2px 6px rgba(0,0,0,0.85);
}
.amp-display-art {
  display: flex;
  gap: 8px;
  padding: 6px 10px 6px 6px;
}
.art-thumb {
  width: 46px;
  height: 46px;
  border-radius: 3px;
  object-fit: cover;
  flex-shrink: 0;
  opacity: 0.85;
  border: 1px solid #2a1c08;
}
.vfd-body { flex: 1; min-width: 0; }
.vfd-title {
  font-size: 11.5px;
  font-family: 'Courier New', monospace;
  color: #f59e0b;
  letter-spacing: 0.025em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 0 7px rgba(245,158,11,0.55);
  margin-bottom: 2px;
  line-height: 1.3;
}
.vfd-sub {
  font-size: 9.5px;
  font-family: 'Courier New', monospace;
  color: rgba(245,158,11,0.48);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 5px;
}
.vfd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.vfd-time {
  font-size: 10.5px;
  font-family: 'Courier New', monospace;
  color: rgba(245,158,11,0.82);
  text-shadow: 0 0 4px rgba(245,158,11,0.38);
  font-variant-numeric: tabular-nums;
}
.vfd-seg, .vfd-loading {
  font-size: 9.5px;
  font-family: 'Courier New', monospace;
  color: rgba(245,158,11,0.42);
}
.vfd-word {
  font-size: 10px;
  font-family: 'Courier New', monospace;
  color: #6ee07a;
  text-shadow: 0 0 5px rgba(110,224,122,0.5);
  margin-left: auto;
}
.vfd-err {
  font-size: 9.5px;
  font-family: 'Courier New', monospace;
  color: #f87171;
  margin-top: 3px;
}

/* Divider */
.amp-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #3a2a14 25%, #3a2a14 75%, transparent);
  margin: 0 -16px 12px;
}

/* Controls row */
.amp-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.amp-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.amp-label {
  font-size: 7.5px;
  color: #5a4020;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

/* Speed */
.speed-btns { display: flex; gap: 3px; }
.speed-btn {
  font-size: 9.5px;
  font-family: 'Courier New', monospace;
  padding: 3px 7px;
  border-radius: 3px;
  border: 1px solid #3a2a14;
  background: #130e04;
  color: #7a5a30;
  cursor: pointer;
  transition: all 0.15s;
}
.speed-btn:hover { border-color: #c8a96e; color: #c8a96e; }
.speed-on { border-color: #c8a96e; background: #2a1c08; color: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.25); }

/* Transport */
.amp-transport {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
}
.xport-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid #3a2a14;
  background: #130e04;
  color: #7a5a30;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}
.xport-btn:hover:not(:disabled) { border-color: #c8a96e; color: #c8a96e; }
.xport-btn:disabled { opacity: 0.28; cursor: not-allowed; }
.xi { font-size: 13px; }
.xl { font-size: 7.5px; font-family: 'Courier New', monospace; }
.xport-play {
  width: 42px; height: 42px;
  border-radius: 50%;
  border: 2px solid #c8a96e;
  background: radial-gradient(circle at 40% 38%, #3a2a14, #130e04);
  color: #f59e0b;
  font-size: 17px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  box-shadow: 0 0 12px rgba(245,158,11,0.18), inset 0 1px 0 rgba(255,200,80,0.08);
  flex-shrink: 0;
}
.xport-play:hover:not(:disabled) { box-shadow: 0 0 20px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,200,80,0.14); }
.xport-play:disabled { opacity: 0.3; cursor: not-allowed; }

/* Volume */
.vol-slider {
  width: 56px;
  height: 3px;
  -webkit-appearance: none;
  appearance: none;
  background: #3a2a14;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 35%, #f59e0b, #9a6a18);
  border: 1px solid #c8a96e;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(245,158,11,0.4);
}
.vol-slider::-moz-range-thumb {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 35%, #f59e0b, #9a6a18);
  border: 1px solid #c8a96e;
  cursor: pointer;
}

/* ── Transcript / input text areas ─────────────────────────────────────────── */
.listen-textarea {
  width: 100%;
  background: #0e0a03;
  border: 1px solid #3a2a14;
  border-radius: 5px;
  padding: 10px 12px;
  font-size: 0.875rem;
  color: #e8d8b8;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
  font-family: 'EB Garamond', Georgia, serif;
  line-height: 1.6;
}
.listen-textarea:focus { border-color: #c8a96e; }
.listen-textarea::placeholder { color: rgba(232,216,184,0.22); }

.listen-reveal {
  background: #0e0a03;
  border: 1px solid #4a3820;
  border-radius: 5px;
  padding: 12px 14px;
  font-size: 0.875rem;
  color: #e8d8b8;
  line-height: 1.75;
  font-family: 'EB Garamond', Georgia, serif;
}
.listen-translation {
  background: #0a0d14;
  border: 1px solid #1e2a3a;
  border-radius: 5px;
  padding: 12px 14px;
  font-size: 0.875rem;
  color: rgba(200,210,232,0.7);
  line-height: 1.7;
  font-style: italic;
  font-family: 'EB Garamond', Georgia, serif;
}

/* ── Word feedback chips ────────────────────────────────────────────────────── */
.word-correct { background: rgba(21,80,38,0.55); color: #6ee07a; }
.word-wrong   { background: rgba(60,15,70,0.55); color: #c084fc; }
.word-pending { color: rgba(200,180,140,0.35); }

/* ── Action row buttons ─────────────────────────────────────────────────────── */
.act-btn {
  font-size: 0.72rem;
  padding: 5px 11px;
  border-radius: 4px;
  border: 1px solid #3a2a14;
  background: transparent;
  color: rgba(200,169,110,0.65);
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'EB Garamond', serif;
}
.act-btn:hover:not(:disabled) { border-color: #c8a96e; color: #c8a96e; }
.act-primary { background: #2a1c08; color: #f0c860; border-color: #c8a96e; }
.act-primary:hover:not(:disabled) { box-shadow: 0 0 8px rgba(245,158,11,0.25); }

/* ── Accuracy / model download lines ───────────────────────────────────────── */
:deep(.text-gray-500)  { color: rgba(200,180,140,0.45) !important; }
:deep(.text-gray-600)  { color: rgba(200,180,140,0.3)  !important; }
</style>
