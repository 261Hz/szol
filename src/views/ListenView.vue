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
  <div v-if="activeClip" class="flex flex-col gap-2 mb-4 bg-stone-900 border border-stone-700 rounded-xl p-3">

    <!-- Header: title + test toggle + close -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-stone-400 font-medium">{{ t(lang, 'videoClip') }}</span>
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
        <p v-if="activeClip.context" class="text-sm text-stone-300 leading-snug flex-1">{{ activeClip.context }}</p>
        <div class="flex-shrink-0 flex flex-col items-end gap-1">
          <button
            v-if="!clipReportSent"
            @click="clipReportOpen = !clipReportOpen; clipReportNote = ''"
            class="text-xs text-stone-600 hover:text-red-400 transition-all"
            title="Report a transcript error"
          >⚑ report</button>
          <span v-if="clipReportSent" class="text-xs text-green-500">{{ t(lang, 'reported') }}</span>
          <div v-if="clipReportOpen && !clipReportSent" class="flex items-center gap-1">
            <input
              v-model="clipReportNote"
              type="text"
              :placeholder="t(lang, 'whatsWrong')"
              class="text-xs bg-stone-800 border border-stone-700 rounded px-2 py-0.5 text-stone-300 placeholder-stone-600 w-40 focus:outline-none focus:border-red-700"
              @keydown.enter="submitClipReport"
              @keydown.escape="clipReportOpen = false"
            />
            <button @click="submitClipReport" class="text-xs text-red-400 hover:text-red-300">{{ t(lang, 'send') }}</button>
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
          class="w-full text-sm bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-200 placeholder-stone-600 resize-none focus:outline-none focus:border-emerald-700"
          @keydown.meta.enter.prevent="checkAnswer"
          @keydown.ctrl.enter.prevent="checkAnswer"
        />
        <div class="flex items-center gap-2">
          <button
            @click="checkAnswer"
            :disabled="!testInput.trim()"
            class="text-xs px-3 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-all"
          >{{ t(lang, 'check') }}</button>
          <span class="text-xs text-stone-600">Ctrl/Cmd+Enter</span>
        </div>
      </template>

      <!-- Results phase -->
      <template v-else>
        <div class="flex items-center gap-3 text-xs">
          <span :class="testResult.pct >= 80 ? 'text-green-400' : testResult.pct >= 50 ? 'text-yellow-400' : 'text-red-400'" class="font-medium">
            {{ testResult.correct }}/{{ testResult.total }} {{ t(lang, 'words') }}
          </span>
          <button @click="testResult = null; testInput = ''" class="text-stone-500 hover:text-stone-300 transition-all">{{ t(lang, 'tryAgain') }}</button>
        </div>
        <!-- Word-by-word colouring -->
        <p class="text-sm leading-relaxed">
          <template v-for="(s, i) in testResult.scored" :key="i">
            <span :class="s.ok ? 'bg-green-800 text-green-200 rounded px-0.5' : 'bg-rose-900 text-rose-200 rounded px-0.5'">{{ s.w }}</span>
            <span> </span>
          </template>
        </p>
        <!-- Reveal transcript -->
        <button
          v-if="!clipShowTranscript"
          @click="clipShowTranscript = true"
          class="text-xs text-stone-400 hover:text-stone-200 transition-all self-start"
        >{{ t(lang, 'revealTranscript') }}</button>
        <p v-if="clipShowTranscript" class="text-xs text-stone-400 leading-snug border-t border-stone-700 pt-2">{{ activeClip.context }}</p>
      </template>
    </template>

  </div>

  <div class="flex flex-col gap-3">

    <!-- Story picker -->
    <div v-if="!selectedStory" class="flex flex-col gap-3">

      <!-- Search input -->
      <input
        v-model="searchQuery"
        type="search"
        :placeholder="t(lang, 'searchPodcasts')"
        class="w-full text-sm bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-stone-200 placeholder-stone-500 outline-none focus:border-emerald-700 transition-colors"
      />

      <!-- Loading -->
      <div v-if="storiesLoading" class="text-sm text-stone-500 text-center py-10">{{ t(lang, 'loading') }}</div>
      <div v-else-if="storiesError" class="text-sm text-red-400 text-center py-6">{{ storiesError }}</div>

      <!-- In-library results -->
      <div v-if="filteredStories.length" class="flex flex-col gap-2">
        <div v-if="searchQuery.trim()" class="text-xs text-stone-500 px-1">{{ t(lang, 'inYourLibrary') }}</div>
        <button
          v-for="story in filteredStories"
          :key="story.id"
          @click="loadStory(story)"
          class="w-full text-left bg-stone-900 border border-stone-700 hover:border-emerald-700 rounded-lg px-4 py-3 transition-all"
        >
          <div class="font-medium text-sm text-stone-100 leading-snug">{{ story.title }}</div>
          <div class="text-xs text-stone-500 mt-0.5 flex gap-2 flex-wrap items-center">
            <span v-if="story.podcast_name" class="text-stone-400">{{ story.podcast_name }}</span>
            <span v-else-if="story.author">{{ story.author }}</span>
            <span v-if="story.source && !story.podcast_name" class="text-stone-600">{{ story.source }}</span>
            <span v-if="story.segments?.length">{{ story.segments.length }} {{ t(lang, 'segment') }}</span>
            <span v-else-if="story.has_transcript" class="text-emerald-500">{{ t(lang, 'hasTranscript') }}</span>
            <span v-if="story.is_autogenerated" class="text-amber-600">{{ t(lang, 'autoCaptions') }}</span>
          </div>
        </button>
      </div>
      <div v-else-if="!storiesLoading && !searchQuery.trim()" class="text-sm text-stone-500 text-center py-6">
        {{ t(lang, 'noExercises') }}
      </div>

      <!-- Discover section (iTunes results) -->
      <div v-if="searchQuery.trim().length >= 2" class="flex flex-col gap-2 mt-1">
        <div class="text-xs text-stone-500 px-1 flex items-center gap-2">
          {{ t(lang, 'addPodcast') }}
          <span v-if="discoverLoading" class="inline-block w-3 h-3 border border-stone-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div v-if="!discoverLoading && !discoverResults.length && searchQuery.trim().length >= 3" class="text-xs text-stone-600 px-1">
          {{ t(lang, 'noPodcastsFound') }}
        </div>
        <div
          v-for="pod in discoverResults"
          :key="pod.feed_url"
          class="flex items-center gap-3 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2.5"
        >
          <img v-if="pod.artwork" :src="pod.artwork" class="w-10 h-10 rounded object-cover flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-stone-100 font-medium truncate">{{ pod.title }}</div>
            <div class="text-xs text-stone-500 truncate">{{ pod.publisher }}<span v-if="pod.episode_count"> · {{ pod.episode_count }} {{ t(lang, 'episodes') }}</span></div>
          </div>
          <button
            @click="subscribe(pod.feed_url, pod.lang)"
            :disabled="subscribingFeed === pod.feed_url"
            class="text-xs px-3 py-1 rounded border border-emerald-700 text-emerald-400 hover:bg-emerald-900 disabled:opacity-40 transition-all flex-shrink-0"
          >{{ subscribingFeed === pod.feed_url ? '…' : t(lang, 'addBtn') }}</button>
        </div>
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
            @click="mode = 'translation'; translationResult = null; showTranscript = false"
            :class="['mode-btn', mode === 'translation' ? 'mode-on' : '']"
          >{{ t(lang, 'translation') }}</button>
        </div>
        <div v-if="mode === 'dictation'" class="flex gap-1.5">
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
          :placeholder="mode === 'translation' ? t(lang, 'typeTranslation') : t(lang, 'typeWhatYouHear')"
          @keydown.space="mode === 'dictation' ? playWordTick() : undefined"
          class="listen-textarea"
        />

        <!-- Dictation: word-by-word colour feedback -->
        <template v-if="mode === 'dictation'">
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
            <span class="text-xs text-stone-500">
              {{ t(lang, 'accuracy') }}: <span class="text-emerald-400 font-medium">{{ accuracy }}%</span>
              <span class="ml-1 text-stone-600">({{ correctCount }}/{{ segmentWords.length }} {{ t(lang, 'words') }})</span>
            </span>
          </div>
        </template>

        <!-- Translation mode -->
        <template v-else-if="mode === 'translation'">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-stone-400">{{ t(lang, 'translateTo') }}:</span>
            <select
              v-model="translateTo"
              class="text-xs bg-stone-800 border border-stone-600 rounded px-2 py-1 text-stone-200 outline-none"
            >
              <option v-for="opt in TRANSLATE_TO_OPTIONS" :key="opt.code" :value="opt.code">{{ opt.label }}</option>
            </select>
          </div>
          <div v-if="sameLang" class="text-xs text-amber-400">{{ t(lang, 'sameLangWarning') }}</div>
          <div v-else class="flex items-center gap-2">
            <button
              @click="runTranslationCheck"
              :disabled="!userInput.trim() || translationChecking"
              class="act-btn act-primary disabled:opacity-40"
            >{{ translationChecking ? t(lang, 'checkingEllipsis') : t(lang, 'checkTranslation') }}</button>
          </div>
          <div v-if="translationResult" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <span
                :class="['text-sm font-bold px-2.5 py-0.5 rounded-full',
                  translationResult.score >= 80 ? 'bg-emerald-900 text-emerald-300' :
                  translationResult.score >= 55 ? 'bg-amber-900 text-amber-300' :
                                                   'bg-red-900 text-red-300']"
              >{{ translationResult.score }}%</span>
              <span class="text-xs text-stone-400 leading-snug">{{ translationResult.feedback }}</span>
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
        <div class="flex items-center justify-between text-xs text-stone-500">
          <span class="truncate max-w-[70%]">{{ downloadLabel || t(lang, 'loadingEngine') }}</span>
          <span>{{ downloadPct }}%</span>
        </div>
        <div class="h-1 bg-stone-800 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-700 rounded-full transition-all duration-300" :style="{ width: downloadPct + '%' }" />
        </div>
      </div>

      <!-- Transcript loading indicator -->
      <div v-if="transcriptLoading" class="text-xs text-stone-500 text-center py-1 animate-pulse">
        {{ t(lang, 'loadingTranscript') }}
      </div>

      <!-- No-transcript panel -->
      <div v-else-if="!segments.length && selectedStory?.audio_url" class="flex flex-col gap-2 py-1">

        <!-- Paste mode -->
        <template v-if="pasteMode">
          <div class="text-xs text-stone-500 mb-1">Paste an SRT, VTT, or plain-text transcript below.</div>
          <textarea
            v-model="pasteText"
            rows="10"
            :placeholder="t(lang, 'srtPaste')"
            class="w-full text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-stone-800 placeholder-stone-400 resize-y focus:outline-none focus:border-amber-400 leading-relaxed"
          />
          <div v-if="pasteError" class="text-sm text-red-400">{{ pasteError }}</div>
          <div class="flex items-center gap-3 mt-1">
            <button
              @click="applyPastedTranscript"
              :disabled="!pasteText.trim()"
              class="px-4 py-1.5 rounded border border-emerald-600 text-emerald-400 text-sm hover:bg-emerald-900 disabled:opacity-40 transition-all"
            >{{ t(lang, 'useTranscript') }}</button>
            <button @click="pasteMode = false; pasteText = ''; pasteError = ''" class="text-sm text-stone-500 hover:text-stone-300 transition-all">{{ t(lang, 'cancel') }}</button>
          </div>
        </template>

        <!-- Idle -->
        <template v-else>
          <div class="text-sm text-stone-500">{{ t(lang, 'noTranscript') }}</div>
          <button
            @click="pasteMode = true"
            class="text-sm px-4 py-1.5 self-start rounded border border-stone-600 text-stone-300 hover:border-stone-400 transition-all"
          >{{ t(lang, 'pasteTranscript') }}</button>
        </template>

      </div>

      <!-- Action row -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            v-if="segments.length"
            @click="showTranscript = !showTranscript"
            class="act-btn"
          >{{ showTranscript ? t(lang, 'hideTranscript') : (mode === 'translation' ? t(lang, 'showOriginal') : t(lang, 'showCorrectText')) }}</button>

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

// ── Search + discovery ────────────────────────────────────────────────────────
const searchQuery       = ref('')
const discoverResults   = ref([])
const discoverLoading   = ref(false)
const subscribingFeed   = ref(null)   // feed_url currently being subscribed
let   _discoverTimer    = null

const filteredStories = computed(() => {
  if (!searchQuery.value.trim()) return stories.value
  const fuse = new Fuse(stories.value, {
    keys: ['title', 'podcast_name', 'author', 'source'],
    threshold: 0.35,
  })
  return fuse.search(searchQuery.value).map(r => r.item)
})

watch(searchQuery, (q) => {
  clearTimeout(_discoverTimer)
  discoverResults.value = []
  if (q.trim().length < 2) return
  _discoverTimer = setTimeout(async () => {
    discoverLoading.value = true
    discoverResults.value = await searchPodcasts(q.trim())
    discoverLoading.value = false
  }, 400)
})

async function subscribe(feedUrl, lang) {
  subscribingFeed.value = feedUrl
  const result = await subscribePodcast(feedUrl, lang || props.lang)
  subscribingFeed.value = null
  if (result) await loadStories()
}

async function loadStories() {
  storiesLoading.value = true
  storiesError.value   = ''
  try {
    const [curated, episodes] = await Promise.all([
      fetchListenStories(props.lang),
      fetchPodcasts(props.lang),
    ])
    // Merge: curated first, then podcast episodes not already in curated
    const curatedIds = new Set(curated.map(s => s.id))
    stories.value = [
      ...curated,
      ...episodes.filter(e => !curatedIds.has(e.id)),
    ]
  } catch {
    storiesError.value = t(props.lang, 'loadError')
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
const WAVE_BARS           = 400                          // resolution of the amplitude history
const waveHistory         = ref(new Float32Array(WAVE_BARS)) // real measured peaks 0-1, indexed by position
const liveWave            = ref([])   // real-time time-domain data –1..1 from analyser

// ── Paste transcript ──────────────────────────────────────────────────────────

const pasteMode  = ref(false)
const pasteText  = ref('')
const pasteError = ref('')

function _toSecs(ts) {
  const s = ts.trim().replace(',', '.')
  const parts = s.split(':')
  try {
    if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2])
    if (parts.length === 2) return +parts[0] * 60 + parseFloat(parts[1])
    return parseFloat(parts[0])
  } catch { return 0 }
}

function _distributeEvenly(text, totalSecs) {
  const words = text.split(/\s+/).filter(Boolean)
  const size  = 15
  const segs  = []
  for (let i = 0; i < words.length; i += size)
    segs.push(words.slice(i, i + size).join(' '))
  const dur = totalSecs || segs.length * 8
  return segs.map((txt, i) => ({
    start: Math.round((i / segs.length) * dur),
    end:   Math.round(((i + 1) / segs.length) * dur),
    text:  txt,
  }))
}

function parsePastedTranscript(raw, totalSecs) {
  const text = raw.trim()

  // 1. SRT / VTT blocks (contains -->)
  if (text.includes('-->')) {
    const segs = []
    for (const block of text.split(/\n\n+/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      const tl = lines.find(l => l.includes('-->'))
      if (!tl) continue
      const [a, b] = tl.split('-->')
      const body = lines.filter(l => !l.includes('-->') && !/^\d+$/.test(l) && l.toUpperCase() !== 'WEBVTT').join(' ').trim()
      if (body) segs.push({ start: _toSecs(a), end: _toSecs(b), text: body })
    }
    if (segs.length) return segs
  }

  // 2. Lines beginning with timestamp: "00:01:23 text", "[1:23] text", "(0:01) text"
  const lineRe = /^(?:\[|\()?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)(?:\]|\))?\s*[-–:]\s*(.*)/
  const lineSegs = []
  for (const line of text.split('\n')) {
    const m = line.trim().match(lineRe)
    if (m && m[2].trim()) lineSegs.push({ ts: _toSecs(m[1]), text: m[2].trim() })
  }
  if (lineSegs.length >= 2) {
    return lineSegs.map((s, i) => ({
      start: s.ts,
      end:   i + 1 < lineSegs.length ? lineSegs[i + 1].ts : (totalSecs || s.ts + 120),
      text:  s.text,
    }))
  }

  // 3. Podscripts inline: "Starting point is HH:MM:SS text…"
  const podRe = /starting point is\s+(\d{1,2}:\d{2}:\d{2})\s*([\s\S]*?)(?=starting point is|$)/gi
  const podSegs = []
  let pm
  while ((pm = podRe.exec(text)) !== null) {
    const body = pm[2].trim()
    if (body) podSegs.push({ ts: _toSecs(pm[1]), text: body })
  }
  if (podSegs.length >= 2) {
    return podSegs.map((s, i) => ({
      start: s.ts,
      end:   i + 1 < podSegs.length ? podSegs[i + 1].ts : (totalSecs || s.ts + 120),
      text:  s.text,
    }))
  }

  // 4. Inline "(1:23)" markers splitting paragraphs
  const inlineRe = /\((\d{1,2}:\d{2}(?::\d{2})?)\)\s*/g
  const chunks = text.split(inlineRe)
  if (chunks.length > 2) {
    const result = []
    for (let i = 1; i < chunks.length; i += 2) {
      const body = (chunks[i + 1] || '').trim()
      if (body) result.push({ ts: _toSecs(chunks[i]), text: body })
    }
    if (result.length >= 2)
      return result.map((s, i) => ({
        start: s.ts,
        end:   i + 1 < result.length ? result[i + 1].ts : (totalSecs || s.ts + 120),
        text:  s.text,
      }))
  }

  // 5. No timestamps — distribute evenly across audio duration
  return _distributeEvenly(text, totalSecs)
}

async function applyPastedTranscript() {
  pasteError.value = ''
  const segs = parsePastedTranscript(pasteText.value, duration.value || 0)
  if (!segs.length) {
    pasteError.value = 'Could not parse any text from the transcript.'
    return
  }
  segments.value = segs
  pasteMode.value = false
  pasteText.value = ''
  await saveStoredTranscript(selectedStory.value.id, segs)
}

async function tryFetchTranscript(storyId, title, podcastName) {
  transcriptLoading.value = true
  try {
    // JRE: ogjre.com directly from browser
    if (podcastName === 'The Joe Rogan Experience' && title) {
      const ogjre = await fetchOgjreTranscript(title)
      if (ogjre?.segments?.length) {
        segments.value = ogjre.segments
        transcriptLoading.value = false
        // On-demand episodes have an audio URL as their ID — save locally, not to backend
        if (storyId?.startsWith('http')) {
          saveStoredTranscript(storyId, ogjre.segments)
        } else {
          savePodcastTranscript(storyId, ogjre.segments)
        }
        return
      }
    }

    // On-demand episodes: try embedded podcast:transcript URL from RSS
    const txUrl = selectedStory.value?.transcript_url
    if (txUrl) {
      const r = await fetch(`/api/fetch-transcript?url=${encodeURIComponent(txUrl)}`).catch(() => null)
      if (r?.ok) {
        const data = await r.json().catch(() => null)
        if (data?.segments?.length) {
          segments.value = data.segments
          transcriptLoading.value = false
          await saveStoredTranscript(storyId, data.segments)
          return
        }
      }
    }

    // DB-stored episodes: backend UUID lookup
    if (storyId && !storyId.startsWith('http')) {
      const data = await fetchPodcastTranscript(storyId)
      if (data?.segments?.length) {
        segments.value = data.segments
      }
    }
  } catch {}
  transcriptLoading.value = false
}

const translationResult   = ref(null) // { score, feedback }
const translationChecking = ref(false)


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
  { code: 'zh',    label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
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

  pasteMode.value          = false
  pasteText.value          = ''
  pasteError.value         = ''
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

// ── Waveform canvas — real measured peaks, indexed by playback position ──────

function drawWaveform() {
  const canvas = waveformCanvas.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const W   = canvas.offsetWidth
  const H   = canvas.offsetHeight
  if (!W || !H) return

  const pw = Math.round(W * dpr)
  const ph = Math.round(H * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width  = pw
    canvas.height = ph
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const ctx  = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)

  const dur   = Math.max(1, duration.value || (currentSegment.value?.end ?? 1))
  const pos   = Math.min(1, currentTime.value / dur)
  const playX = pos * W
  const cy    = H / 2
  const barW  = W / WAVE_BARS
  const hist  = waveHistory.value

  // Center hairline for full width
  ctx.fillStyle = 'rgba(31,27,23,0.10)'
  ctx.fillRect(0, cy - 0.5, W, 1)

  // Real amplitude bars — only drawn where audio has actually been measured
  for (let i = 0; i < WAVE_BARS; i++) {
    const amp = hist[i]
    if (amp < 0.02) continue
    const x = i * barW
    const h = amp * cy * 0.85
    ctx.fillStyle = x < playX ? 'rgba(31,27,23,0.44)' : 'rgba(31,27,23,0.18)'
    ctx.fillRect(x, cy - h, Math.max(1, barW - 0.5), h * 2)
  }

  // Playhead
  ctx.fillStyle = 'rgba(31,27,23,0.65)'
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

// Reset accumulated waveform when story changes
watch(selectedStory, async () => {
  waveHistory.value = new Float32Array(WAVE_BARS)
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

// VU meter 0–1 levels — bars range 4..56, normalise to that span
const vuLeft = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(0, 20).reduce((a, b) => a + b, 0) / 20
  return Math.min(1, Math.max(0, (avg - 4) / 52))
})
const vuRight = computed(() => {
  if (!isPlaying.value) return 0
  const avg = bars.value.slice(20).reduce((a, b) => a + b, 0) / 20
  return Math.min(1, Math.max(0, (avg - 4) / 52))
})
// Needle angles in degrees from 12 o'clock (clockwise)
const needleAngleL = computed(() => VU_START + vuLeft.value  * VU_RANGE)
const needleAngleR = computed(() => VU_START + vuRight.value * VU_RANGE)

// ── Waveform / VU bars (Web Audio API analyser with fallback) ────────────────

const bars      = ref(Array(40).fill(4))
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

function _stampWavePeak() {
  const live   = liveWave.value
  if (!live.length) return
  const peak   = Math.max(...live.map(Math.abs))
  const dur    = Math.max(1, duration.value || (currentSegment.value?.end ?? 1))
  const barIdx = Math.floor((currentTime.value / dur) * WAVE_BARS)
  if (barIdx >= 0 && barIdx < WAVE_BARS) {
    const h = waveHistory.value
    if (peak > h[barIdx]) { h[barIdx] = peak }
  }
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
      bars.value     = Array.from({ length: 40 }, (_, i) => Math.max(4, Math.round((freqBuf[Math.floor(i * fStep)] / 255) * 52 + 4)))
      liveWave.value = Array.from({ length: 80 }, (_, i) => (timeBuf[Math.floor(i * tStep)] - 128) / 128)
      _stampWavePeak()
      drawWaveform()
      _rafId = requestAnimationFrame(tick)
    }
    _rafId = requestAnimationFrame(tick)
  } else {
    // No real analyser (CORS audio) — only redraw for playhead movement, no fake data
    waveTimer = setInterval(drawWaveform, 80)
  }
}

function stopWave() {
  cancelAnimationFrame(_rafId); _rafId = null
  clearInterval(waveTimer);     waveTimer = null
  bars.value     = Array(40).fill(4)
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
