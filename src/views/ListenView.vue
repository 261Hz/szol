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
          class="flex-shrink-0 text-lg leading-none pt-0.5 transition-all"
          style="color:rgba(31,27,23,0.45);"
          title="Back to list"
        >←</button>
        <div class="flex flex-col gap-0.5 min-w-0 flex-1">
          <h2 class="font-semibold text-base leading-snug" style="color:#1f1b17; font-family:'EB Garamond',serif;">{{ selectedStory.title?.replace(/_/g,' ') }}</h2>
          <div class="text-xs flex gap-2 flex-wrap" style="color:rgba(31,27,23,0.45); font-family:'EB Garamond',serif;">
            <span v-if="selectedStory.author">{{ selectedStory.author }}</span>
            <span v-if="selectedStory.source && selectedStory.source !== selectedStory.author">{{ selectedStory.source }}</span>
            <span>{{ LANGS[selectedStory.lang]?.name ?? selectedStory.lang }}</span>
          </div>
        </div>
        <button
          v-if="resumeSegment !== null"
          @click="resumeFromSaved"
          class="flex-shrink-0 text-xs rounded px-2.5 py-1 transition-all"
          style="border:1px solid rgba(31,27,23,0.2); color:rgba(31,27,23,0.55); font-family:'EB Garamond',serif;"
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

      <!-- Analog VU meters + transport -->
      <div class="vu-wrap">

        <!-- Dual needle meters -->
        <svg class="vu-svg" viewBox="0 0 430 130" xmlns="http://www.w3.org/2000/svg">
          <!-- LEFT CHANNEL -->
          <g>
            <path :d="VU_ARC_FULL" fill="none" stroke="rgba(31,27,23,0.11)" stroke-width="2.5" stroke-linecap="round"/>
            <path :d="VU_ARC_RED"  fill="none" stroke="rgba(155,25,15,0.38)" stroke-width="2.5" stroke-linecap="round"/>
            <g v-for="t in VU_TICKS" :key="'L'+t.label">
              <line
                :x1="(100 + 67 * Math.sin(t.angle * DEG)).toFixed(1)" :y1="(105 - 67 * Math.cos(t.angle * DEG)).toFixed(1)"
                :x2="(100 + 79 * Math.sin(t.angle * DEG)).toFixed(1)" :y2="(105 - 79 * Math.cos(t.angle * DEG)).toFixed(1)"
                :stroke="t.red ? 'rgba(155,25,15,0.4)' : 'rgba(31,27,23,0.25)'" stroke-width="1.2"/>
              <text
                :x="(100 + 91 * Math.sin(t.angle * DEG)).toFixed(1)" :y="(105 - 91 * Math.cos(t.angle * DEG)).toFixed(1)"
                text-anchor="middle" dominant-baseline="middle" font-size="7"
                :fill="t.red ? 'rgba(155,25,15,0.5)' : 'rgba(31,27,23,0.38)'"
                font-family="'Courier New',monospace">{{ t.label }}</text>
            </g>
            <g :transform="`rotate(${needleAngleL.toFixed(1)},100,105)`">
              <line x1="100" y1="105" x2="100" y2="26" stroke="rgba(31,27,23,0.72)" stroke-width="1.4" stroke-linecap="round"/>
            </g>
            <circle cx="100" cy="105" r="3" fill="rgba(31,27,23,0.48)"/>
            <text x="100" y="122" text-anchor="middle" font-size="7" fill="rgba(31,27,23,0.3)" font-family="'Courier New',monospace" letter-spacing="1.5">LEFT CHANNEL</text>
          </g>
          <!-- RIGHT CHANNEL (offset 215px) -->
          <g transform="translate(215,0)">
            <path :d="VU_ARC_FULL" fill="none" stroke="rgba(31,27,23,0.11)" stroke-width="2.5" stroke-linecap="round"/>
            <path :d="VU_ARC_RED"  fill="none" stroke="rgba(155,25,15,0.38)" stroke-width="2.5" stroke-linecap="round"/>
            <g v-for="t in VU_TICKS" :key="'R'+t.label">
              <line
                :x1="(100 + 67 * Math.sin(t.angle * DEG)).toFixed(1)" :y1="(105 - 67 * Math.cos(t.angle * DEG)).toFixed(1)"
                :x2="(100 + 79 * Math.sin(t.angle * DEG)).toFixed(1)" :y2="(105 - 79 * Math.cos(t.angle * DEG)).toFixed(1)"
                :stroke="t.red ? 'rgba(155,25,15,0.4)' : 'rgba(31,27,23,0.25)'" stroke-width="1.2"/>
              <text
                :x="(100 + 91 * Math.sin(t.angle * DEG)).toFixed(1)" :y="(105 - 91 * Math.cos(t.angle * DEG)).toFixed(1)"
                text-anchor="middle" dominant-baseline="middle" font-size="7"
                :fill="t.red ? 'rgba(155,25,15,0.5)' : 'rgba(31,27,23,0.38)'"
                font-family="'Courier New',monospace">{{ t.label }}</text>
            </g>
            <g :transform="`rotate(${needleAngleR.toFixed(1)},100,105)`">
              <line x1="100" y1="105" x2="100" y2="26" stroke="rgba(31,27,23,0.72)" stroke-width="1.4" stroke-linecap="round"/>
            </g>
            <circle cx="100" cy="105" r="3" fill="rgba(31,27,23,0.48)"/>
            <text x="100" y="122" text-anchor="middle" font-size="7" fill="rgba(31,27,23,0.3)" font-family="'Courier New',monospace" letter-spacing="1.5">RIGHT CHANNEL</text>
          </g>
        </svg>

        <!-- Physics-realistic waveform -->
        <canvas ref="waveformCanvas" class="wave-canvas" @click="onWaveClick" @mousedown="onWaveDragStart" />

        <!-- Time + scrubber -->
        <div class="vu-timeline">
          <div class="vu-time">
            {{ fmtTime(currentTime) }} / {{ fmtTime(duration || (currentSegment?.end ?? 0)) }}
            <span v-if="segments.length" class="vu-seg-n">· {{ segmentIdx + 1 }}/{{ segments.length }}</span>
            <span v-if="currentWord && isPlaying" class="vu-word">{{ currentWord.raw }}</span>
          </div>
          <input type="range" class="seek-bar"
            min="0" :max="duration > 0 ? duration : 1" step="0.1"
            :value="currentTime"
            @input="seekTo(Number($event.target.value))"
            :disabled="!playerReady"
          />
          <div v-if="playerError" class="vu-err">{{ playerError }}</div>
          <div v-if="!playerReady && !playerError" class="vu-loading">loading…</div>
        </div>

        <!-- Controls: speed · transport · volume -->
        <div class="vu-controls">
          <div class="spd-row">
            <button v-for="s in [0.5, 1, 1.5]" :key="s"
              @click="setSpeed(s)"
              :class="['spd-btn', speed === s ? 'spd-on' : '']">{{ s }}×</button>
          </div>
          <div class="xport-row">
            <button @click="skipBack" :disabled="!playerReady" class="xbtn">
              <span class="xi">⏮</span><span class="xl">15s</span>
            </button>
            <button @click="togglePlay" :disabled="!playerReady" class="xplay">{{ isPlaying ? '⏸' : '▶' }}</button>
            <button @click="skipFwd" :disabled="!playerReady" class="xbtn">
              <span class="xl">15s</span><span class="xi">⏭</span>
            </button>
          </div>
          <div class="vol-row">
            <span class="vol-lbl">vol</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="volume" @input="applyVolume" class="vol-bar" />
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
const waveformCanvas      = ref(null)
const waveformData        = ref([])   // 400 amplitude values 0-1 (seeded from metadata)
const liveWave            = ref([])   // real-time time-domain data –1..1 from analyser

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

// ── Waveform canvas (physics-realistic amplitude overview) ────────────────────

function _seedRng(seed) {
  let h = 0
  for (const c of String(seed || '')) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return () => { h = (Math.imul(1664525, h) + 1013904223) | 0; return (h >>> 0) / 2 ** 32 }
}

function generateWaveform(seed, count = 400) {
  const rng = _seedRng(seed)
  const raw = Array.from({ length: count }, rng)
  // 3-tap smooth
  const sm = raw.map((v, i) => (raw[i - 1] ?? v) * 0.25 + v * 0.5 + (raw[i + 1] ?? v) * 0.25)
  // Speech-like loudness envelope: quiet passages + louder sections
  return sm.map((v, i) => {
    const t = i / count
    const env = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * 21.4 + Math.sin(t * 6.1) * 2.9))
    return Math.max(0.04, v * env)
  })
}

function drawWaveform() {
  const canvas = waveformCanvas.value
  if (!canvas) return
  const data = waveformData.value
  if (!data.length) return

  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = canvas.offsetHeight
  if (!W || !H) return

  const pw = Math.round(W * dpr)
  const ph = Math.round(H * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width  = pw
    canvas.height = ph
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)

  const dur    = duration.value > 0 ? duration.value : (currentSegment.value?.end ?? 1)
  const pos    = Math.min(1, currentTime.value / dur)
  const playX  = pos * W
  const cy     = H / 2
  const barW   = W / data.length
  const live   = liveWave.value
  const lStart = live.length ? Math.floor(pos * data.length) - Math.floor(live.length / 2) : -1

  data.forEach((amp, i) => {
    const x     = i * barW
    // Blend in real-time time-domain data near the playhead
    let   disp  = amp
    const li    = i - lStart
    if (li >= 0 && li < live.length) disp = Math.abs(live[li]) * 0.88 + 0.12

    const h     = disp * cy * 0.82
    ctx.fillStyle = x < playX ? 'rgba(31,27,23,0.42)' : 'rgba(31,27,23,0.16)'
    ctx.fillRect(x, cy - h, Math.max(1, barW - 0.8), h * 2)
  })

  // Playhead
  ctx.fillStyle = 'rgba(31,27,23,0.62)'
  ctx.fillRect(Math.round(playX) - 0.5, 0, 1.5, H)
}

function onWaveClick(e) {
  if (!playerReady.value) return
  const rect = waveformCanvas.value.getBoundingClientRect()
  const pos  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(pos * (duration.value || currentSegment.value?.end || 0))
}

function onWaveDragStart(e) {
  if (!playerReady.value) return
  const move = (ev) => {
    const rect = waveformCanvas.value?.getBoundingClientRect()
    if (!rect) return
    const pos = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
    seekTo(pos * (duration.value || currentSegment.value?.end || 0))
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup',  up)
}

// Regenerate waveform when story changes; redraw on time update
watch(selectedStory, async (story) => {
  waveformData.value = story ? generateWaveform(story.id ?? story.audio_url ?? story.title ?? '', 400) : []
  await nextTick()
  drawWaveform()
})
watch(currentTime, drawWaveform)

// ── Analog VU meter constants ─────────────────────────────────────────────────

const DEG      = Math.PI / 180
const VU_START = -80   // degrees from 12 o'clock at -20 dB
const VU_END   = +40   // degrees from 12 o'clock at +3 dB
const VU_RANGE = VU_END - VU_START

function _vuPt(deg, r) {
  return [(100 + r * Math.sin(deg * DEG)).toFixed(1), (105 - r * Math.cos(deg * DEG)).toFixed(1)]
}
function vuArcPath(startDeg, endDeg, r) {
  const [x1,y1] = _vuPt(startDeg, r)
  const [x2,y2] = _vuPt(endDeg, r)
  const la = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2}`
}
function _dbToAngle(db) { return VU_START + ((db + 20) / 23) * VU_RANGE }

const VU_ARC_FULL = vuArcPath(VU_START, VU_END, 78)
const VU_ARC_RED  = vuArcPath(_dbToAngle(0), VU_END, 78)
const VU_TICKS    = [-20, -10, -6, 0, 3].map(db => ({
  label: db > 0 ? `+${db}` : `${db}`,
  angle: _dbToAngle(db),
  red:   db >= 0,
}))

// VU meter 0–1 levels from analyser bars
const vuLeft = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(0, 20).reduce((a, b) => a + b, 0) / 20
  return Math.min(1, avg / 44)
})
const vuRight = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(20).reduce((a, b) => a + b, 0) / 20
  return Math.min(1, avg / 44)
})
// Needle angles in degrees from 12 o'clock (clockwise)
const needleAngleL = computed(() => VU_START + vuLeft.value  * VU_RANGE)
const needleAngleR = computed(() => VU_START + vuRight.value * VU_RANGE)

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
    _analyser.fftSize = 512
    const freqBuf = new Uint8Array(_analyser.frequencyBinCount)
    const timeBuf = new Uint8Array(_analyser.fftSize)
    const fStep   = freqBuf.length / 40
    const tStep   = timeBuf.length / 80
    function tick() {
      _analyser.getByteFrequencyData(freqBuf)
      _analyser.getByteTimeDomainData(timeBuf)
      bars.value = Array.from({ length: 40 }, (_, i) => {
        const v = freqBuf[Math.floor(i * fStep)]
        return Math.max(4, Math.round((v / 255) * 52 + 4))
      })
      liveWave.value = Array.from({ length: 80 }, (_, i) => {
        return (timeBuf[Math.floor(i * tStep)] - 128) / 128
      })
      drawWaveform()
      _rafId = requestAnimationFrame(tick)
    }
    _rafId = requestAnimationFrame(tick)
  } else {
    // Fake: synthesise plausible speech-like waveform from noise
    waveTimer = setInterval(() => {
      bars.value = BASE_HEIGHTS.map(b => Math.max(4, Math.min(56, b + (Math.random() - 0.5) * 28)))
      const t = currentTime.value
      liveWave.value = Array.from({ length: 80 }, (_, i) => {
        const ph = i / 80
        return (Math.sin(ph * 12.5 + t * 7.3) * 0.35 + (Math.random() - 0.5) * 0.65) * 0.9
      })
      drawWaveform()
    }, 80)
  }
}

function stopWave() {
  cancelAnimationFrame(_rafId); _rafId = null
  clearInterval(waveTimer);     waveTimer = null
  bars.value     = [...BASE_HEIGHTS]
  liveWave.value = []
  drawWaveform()
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

let _resizeObs = null
onMounted(() => {
  if (props.currentUser) loadStories()
  if (props.story) loadStory(props.story)
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src   = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
  nextTick(() => {
    if (waveformCanvas.value) {
      _resizeObs = new ResizeObserver(drawWaveform)
      _resizeObs.observe(waveformCanvas.value)
    }
  })
})

onUnmounted(() => {
  _resizeObs?.disconnect()
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

/* ── VU panel ───────────────────────────────────────────────────────────────── */
.vu-wrap { display: flex; flex-direction: column; gap: 10px; padding: 12px 0 4px; }
.vu-svg  { width: 100%; height: auto; }

/* ── Waveform canvas ────────────────────────────────────────────────────────── */
.wave-canvas {
  width: 100%;
  height: 56px;
  display: block;
  cursor: crosshair;
  border-radius: 2px;
}

/* ── Time / scrubber ────────────────────────────────────────────────────────── */
.vu-timeline { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.vu-time {
  font-size: 10.5px;
  font-family: 'Courier New', monospace;
  color: rgba(31,27,23,0.45);
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.vu-seg-n { margin-left: 6px; color: rgba(31,27,23,0.3); }
.vu-word  { margin-left: 8px; color: rgba(31,27,23,0.65); font-style: italic; }
.vu-err, .vu-loading {
  font-size: 10px;
  font-family: 'Courier New', monospace;
  color: rgba(31,27,23,0.35);
}
.vu-err { color: rgba(160,30,20,0.65); }

.seek-bar {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 2px;
  background: rgba(31,27,23,0.13);
  border-radius: 1px;
  outline: none;
  cursor: pointer;
}
.seek-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px; height: 11px;
  border-radius: 50%;
  background: rgba(31,27,23,0.52);
  cursor: pointer;
}
.seek-bar::-moz-range-thumb {
  width: 11px; height: 11px;
  border-radius: 50%;
  background: rgba(31,27,23,0.52);
  border: none;
  cursor: pointer;
}
.seek-bar:disabled { opacity: 0.28; cursor: not-allowed; }

/* ── Controls row ───────────────────────────────────────────────────────────── */
.vu-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
}
.spd-row { display: flex; gap: 4px; flex-shrink: 0; }
.spd-btn {
  font-size: 10.5px;
  font-family: 'Courier New', monospace;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(31,27,23,0.18);
  background: transparent;
  color: rgba(31,27,23,0.4);
  cursor: pointer;
  transition: all 0.14s;
}
.spd-btn:hover { border-color: rgba(31,27,23,0.42); color: rgba(31,27,23,0.68); }
.spd-on { background: rgba(31,27,23,0.07); border-color: rgba(31,27,23,0.5); color: rgba(31,27,23,0.82); }

.xport-row { display: flex; align-items: center; gap: 8px; flex: 1; justify-content: center; }
.xbtn {
  display: flex; align-items: center; gap: 3px;
  padding: 5px 11px;
  border-radius: 4px;
  border: 1px solid rgba(31,27,23,0.18);
  background: transparent;
  color: rgba(31,27,23,0.45);
  cursor: pointer;
  transition: all 0.14s;
}
.xbtn:hover:not(:disabled) { border-color: rgba(31,27,23,0.45); color: rgba(31,27,23,0.7); }
.xbtn:disabled { opacity: 0.28; cursor: not-allowed; }
.xi { font-size: 13px; }
.xl { font-size: 9px; font-family: 'Courier New', monospace; }
.xplay {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1.5px solid rgba(31,27,23,0.42);
  background: transparent;
  color: rgba(31,27,23,0.72);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.14s;
  flex-shrink: 0;
}
.xplay:hover:not(:disabled) { background: rgba(31,27,23,0.06); border-color: rgba(31,27,23,0.65); }
.xplay:disabled { opacity: 0.28; cursor: not-allowed; }

.vol-row { display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-width: 80px; }
.vol-lbl { font-size: 9px; font-family: 'Courier New', monospace; color: rgba(31,27,23,0.35); letter-spacing: 0.1em; }
.vol-bar {
  width: 58px;
  -webkit-appearance: none; appearance: none;
  height: 2px;
  background: rgba(31,27,23,0.15);
  border-radius: 1px;
  outline: none;
  cursor: pointer;
}
.vol-bar::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: rgba(31,27,23,0.52);
  cursor: pointer;
}
.vol-bar::-moz-range-thumb {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: rgba(31,27,23,0.52);
  border: none;
}

/* ── Transcript / input text areas ─────────────────────────────────────────── */
.listen-textarea {
  width: 100%;
  background: rgba(31,27,23,0.03);
  border: 1px solid rgba(31,27,23,0.18);
  border-radius: 5px;
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #1f1b17;
  outline: none;
  resize: none;
  transition: border-color 0.15s;
  font-family: 'EB Garamond', Georgia, serif;
  line-height: 1.6;
}
.listen-textarea:focus { border-color: rgba(31,27,23,0.42); }
.listen-textarea::placeholder { color: rgba(31,27,23,0.25); }

.listen-reveal {
  background: rgba(31,27,23,0.03);
  border: 1px solid rgba(31,27,23,0.16);
  border-radius: 5px;
  padding: 12px 14px;
  font-size: 0.9rem;
  color: #1f1b17;
  line-height: 1.75;
  font-family: 'EB Garamond', Georgia, serif;
}
.listen-translation {
  background: rgba(31,27,23,0.025);
  border: 1px solid rgba(31,27,23,0.1);
  border-radius: 5px;
  padding: 12px 14px;
  font-size: 0.88rem;
  color: rgba(31,27,23,0.55);
  line-height: 1.7;
  font-style: italic;
  font-family: 'EB Garamond', Georgia, serif;
}

/* ── Word feedback chips ────────────────────────────────────────────────────── */
.word-correct { background: rgba(20,55,28,0.12); color: #2a6a3a; }
.word-wrong   { background: rgba(80,15,80,0.1);  color: #7a3a8a; }
.word-pending { color: rgba(31,27,23,0.32); }

/* ── Action row buttons ─────────────────────────────────────────────────────── */
.act-btn {
  font-size: 0.72rem;
  padding: 5px 11px;
  border-radius: 4px;
  border: 1px solid rgba(31,27,23,0.2);
  background: transparent;
  color: rgba(31,27,23,0.5);
  cursor: pointer;
  transition: all 0.14s;
  font-family: 'EB Garamond', serif;
}
.act-btn:hover:not(:disabled) { border-color: rgba(31,27,23,0.45); color: rgba(31,27,23,0.75); }
.act-primary { background: #1f1b17; color: #e8d8b8; border-color: #1f1b17; }
.act-primary:hover:not(:disabled) { background: #2a2418; }
</style>
