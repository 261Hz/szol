<!-- LibraryView.vue: multi-section content discovery hub. -->
<!-- Sections: Curated · Today · On This Day · Travel · Import URL · Topics · Subtitles · Community -->
<template>
  <div class="flex flex-col gap-2">

    <!-- ─── ▶ IN PROGRESS ─── -->
    <div v-if="inProgressStories.length" class="border border-green-800 rounded-lg overflow-hidden">
      <button @click="toggle('inprogress')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-green-300 hover:bg-gray-800 transition-all">
        <span>▶ In Progress</span>
        <span class="text-gray-500 text-xs">{{ open.inprogress ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.inprogress" class="px-4 pb-4 pt-1 flex flex-col gap-1.5">
        <div
          v-for="p in inProgressStories"
          :key="p.story_id + p.tab"
          :class="['rounded-lg border transition-all overflow-hidden',
            current?.id === p.story_id ? 'border-green-600' : 'border-gray-700']"
        >
          <div class="flex items-center justify-between px-3 py-2.5 gap-2">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="font-medium text-sm text-gray-200 truncate">{{ p.story_title || p.story_id }}</span>
              <span class="text-xs text-gray-500 capitalize">{{ p.tab }} · sentence {{ p.sentence_index }}</span>
            </div>
            <button
              @click="resumeStory(p)"
              class="flex-shrink-0 text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all"
            >Resume →</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 📖 CURATED ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('curated')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📖 Curated</span>
        <span class="text-gray-500 text-xs">{{ open.curated ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.curated" class="px-4 pb-4 pt-1 min-h-[200px]">
        <div v-if="loading" class="text-gray-500 text-sm text-center py-6">{{ t(lang, 'loading') }}</div>
        <div v-else-if="!curatedAndLocal.length" class="text-xs text-gray-500 py-4 text-center">No stories yet for this language.</div>
        <div v-else class="flex flex-col gap-1.5">
          <div
            v-for="book in groupedCurated"
            :key="book.bookTitle + (book.author || '')"
            :class="['rounded-lg border transition-all overflow-hidden',
              book.chapters.some(c => current?.id === c.id) ? 'border-green-600' : 'border-gray-700']"
          >
            <!-- Book header — single-chapter: load directly; multi-chapter: expand -->
            <button
              @click="book.chapters.length === 1
                ? emitLoad(book.chapters[0])
                : (expandedBook = expandedBook === book.bookTitle ? null : book.bookTitle)"
              class="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-800 transition-all"
            >
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="font-medium text-sm break-words leading-snug" :dir="isRTL(book.lang) ? 'rtl' : 'ltr'">
                  {{ book.bookTitle }}
                </span>
                <div class="flex gap-1.5 text-xs text-gray-500 flex-wrap">
                  <span v-if="book.author">{{ book.author }}</span>
                  <span v-if="book.chapters.length > 1">· {{ book.chapters.length }} chapters</span>
                  <span v-if="chaptersWithProgress(book) > 0" class="text-green-400">
                    · {{ chaptersWithProgress(book) }}/{{ book.chapters.length }} read
                  </span>
                  <span v-if="book.chapters[0]?.local" class="text-gray-600">· local</span>
                </div>
              </div>
              <span class="text-gray-600 text-xs ml-2 flex-shrink-0">
                {{ book.chapters.length > 1 ? (expandedBook === book.bookTitle ? '▲' : '▼') : '→' }}
              </span>
            </button>

            <!-- Chapter list (multi-chapter books only, when expanded) -->
            <div
              v-if="book.chapters.length > 1 && expandedBook === book.bookTitle"
              class="border-t border-gray-800 divide-y divide-gray-800"
              :class="book.chapters.some(c => current?.id === c.id) ? 'bg-green-950' : 'bg-gray-900'"
            >
              <div
                v-for="chapter in book.chapters"
                :key="chapter.id"
                class="flex items-center justify-between px-3 py-2 gap-2"
              >
                <span class="text-sm text-gray-300 min-w-0 truncate" :dir="isRTL(book.lang) ? 'rtl' : 'ltr'">
                  {{ chapterLabel(chapter) }}
                </span>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span
                    v-if="progressByStory[chapter.id]?.sentence_index > 0"
                    class="text-xs text-green-400 border border-green-800 rounded-full px-2 py-0.5"
                  >↗ {{ progressByStory[chapter.id].sentence_index }}</span>
                  <button
                    @click="emitLoad(chapter)"
                    :class="['text-xs px-2.5 py-1 rounded-md transition-all',
                      current?.id === chapter.id
                        ? 'bg-green-600 text-white'
                        : 'bg-green-700 text-white hover:bg-green-600']"
                  >{{ current?.id === chapter.id ? 'Reading' : 'Read →' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add-story form -->
        <div class="mt-3 border-t border-gray-800 pt-3">
          <button @click="showAdd = !showAdd" class="text-xs text-green-300 hover:text-green-200 underline transition-all">
            {{ showAdd ? 'Hide form' : '+ Add your own story' }}
          </button>
          <div v-if="showAdd" class="mt-3 flex flex-col gap-3">
            <input v-model="customTitle" type="text" :placeholder="t(lang, 'titleHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
            <textarea v-model="customText" rows="4" :placeholder="t(lang, 'pasteStory')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 resize-none" />
            <input v-if="lang === 'arz'" v-model="customFranco" type="text" placeholder="Franco transliteration (optional)…" dir="ltr" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
            <div v-if="showShareForm" class="flex flex-col gap-2 border-t border-gray-800 pt-3">
              <div class="text-xs text-gray-400">{{ t(lang, 'shareRequired') }}</div>
              <input v-model="customAuthor" type="text" :placeholder="t(lang, 'authorHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
              <input v-model="customSource" type="text" :placeholder="t(lang, 'sourceHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
            </div>
            <div class="flex items-center justify-end gap-2">
              <button @click="addLocal" class="text-sm px-4 py-1.5 rounded-md border border-gray-700 hover:border-green-600 transition-all">{{ t(lang, 'saveLocal') }}</button>
              <!-- Share Global requires login -->
              <button
                v-if="currentUser"
                @click="shareGlobal"
                :disabled="submitting"
                class="text-sm px-4 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all"
              >{{ submitting ? t(lang, 'sharing') : t(lang, 'shareGlobal') }}</button>
              <span v-else class="text-xs text-gray-500">
                <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">Login</button>
                to share with the community
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 🌍 TODAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('today')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🌍 Today</span>
        <span class="text-gray-500 text-xs">{{ open.today ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.today" class="px-4 pb-4 pt-1">
        <div v-if="todayLoading" class="text-xs text-gray-500 py-4 text-center">Loading…</div>
        <div v-else-if="todayArticle" class="flex flex-col gap-3">
          <div class="flex gap-3 items-start">
            <img v-if="todayArticle.thumbnail" :src="todayArticle.thumbnail" class="w-20 h-20 object-cover rounded-md flex-shrink-0" />
            <div class="flex flex-col gap-1 flex-1 min-w-0">
              <div class="font-semibold text-sm text-gray-100">{{ todayArticle.title }}</div>
              <div class="text-xs text-gray-400 line-clamp-4">
            <ClickableText
              :text="todayArticle.extract"
              :lang="lang"
              :savedWords="savedWordsSet"
              @tap="({ word, sentence }) => saveFromLibrary(word, sentence)"
            />
          </div>
            </div>
          </div>
          <button @click="importWikipediaArticle(todayArticle)" class="self-start text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">Import as Story</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">No featured article available for this language today.</div>
      </div>
    </div>

    <!-- ─── 📜 QUOTE OF THE DAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('quote')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📜 Quote of the Day</span>
        <span class="text-gray-500 text-xs">{{ open.quote ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.quote" class="px-4 pb-4 pt-1">
        <div v-if="quoteLoading" class="text-xs text-gray-500 py-4 text-center">Loading…</div>
        <div v-else-if="quoteOfDay" class="flex flex-col gap-3">
          <p class="text-sm text-gray-200 italic leading-relaxed" :dir="isRTL(lang) ? 'rtl' : 'ltr'">"{{ quoteOfDay.quote }}"</p>
          <p class="text-xs text-gray-500">— {{ quoteOfDay.author }}</p>
          <button @click="importQuote" class="self-start text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">Import as Story</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">No quote available for this language.</div>
      </div>
    </div>

    <!-- ─── 📅 ON THIS DAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('onthisday')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📅 On This Day</span>
        <span class="text-gray-500 text-xs">{{ open.onthisday ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.onthisday" class="px-4 pb-4 pt-1">
        <div v-if="otdLoading" class="text-xs text-gray-500 py-4 text-center">Loading…</div>
        <div v-else-if="onThisDay.length" class="flex flex-col gap-2">
          <div v-for="(ev, i) in onThisDay" :key="i" class="text-xs text-gray-300 leading-snug">
            <span class="font-medium text-gray-500">{{ ev.year }}</span> —
            <ClickableText
              :text="ev.text"
              :lang="lang"
              :savedWords="savedWordsSet"
              @tap="({ word, sentence }) => saveFromLibrary(word, sentence)"
            />
          </div>
          <button @click="importOnThisDay" class="self-start mt-2 text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">Import All as Story</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">No "On This Day" events available for this language.</div>
      </div>
    </div>

    <!-- ─── 🗺️ TRAVEL ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('travel')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🗺️ Travel</span>
        <span class="text-gray-500 text-xs">{{ open.travel ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.travel" class="px-4 pb-4 pt-1">
        <div class="flex gap-2 mb-3">
          <input v-model="travelQuery" type="text" placeholder="Search destinations…" @keydown.enter="searchTravel" class="flex-1 border border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          <button @click="searchTravel" :disabled="travelLoading" class="text-sm px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ travelLoading ? '…' : 'Search' }}</button>
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="r in travelResults"
            :key="r.pageid"
            class="border border-gray-800 rounded-md p-2.5 hover:border-green-700 transition-all"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-medium text-gray-200">{{ r.title }}</div>
                <div class="text-xs text-gray-500 mt-0.5 break-words">
                  <ClickableText
                    :text="r.snippet.replace(/<[^>]+>/g, '')"
                    :lang="lang"
                    :savedWords="savedWordsSet"
                    @tap="({ word, sentence }) => saveFromLibrary(word, sentence)"
                  />
                </div>
              </div>
              <button @click="importWikivoyage(r)" :disabled="travelImporting === r.pageid" class="flex-shrink-0 text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ travelImporting === r.pageid ? '…' : 'Import' }}</button>
            </div>
          </div>
          <div v-if="!travelResults.length && !travelLoading" class="text-xs text-gray-500 text-center py-2">Search Wikivoyage for a destination to read about.</div>
        </div>
      </div>
    </div>

    <!-- ─── 🔗 IMPORT URL ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('import')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🔗 Import URL</span>
        <span class="text-gray-500 text-xs">{{ open.import ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.import" class="px-4 pb-4 pt-1">
        <div class="flex gap-2 mb-3">
          <input v-model="importUrl" type="url" placeholder="https://…" @keydown.enter="fetchArticle" class="flex-1 border border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          <button @click="fetchArticle" :disabled="importLoading" class="text-sm px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ importLoading ? '…' : 'Fetch' }}</button>
        </div>
        <div v-if="importError" class="text-xs text-red-400 mb-2">{{ importError }}</div>
        <div v-if="importPreview" class="border border-gray-700 rounded-md p-3 flex flex-col gap-2">
          <div class="text-sm font-semibold text-gray-200">{{ importPreview.title }}</div>
          <div class="text-xs text-gray-400 break-words">
            <ClickableText
              :text="importPreview.text.slice(0, 400) + '…'"
              :lang="lang"
              :savedWords="savedWordsSet"
              @tap="({ word, sentence }) => saveFromLibrary(word, sentence)"
            />
          </div>
          <div class="flex gap-2">
            <button @click="confirmImport" class="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">Save as Story</button>
            <button @click="importPreview = null; importError = ''" class="text-xs px-3 py-1.5 rounded-md border border-gray-700 hover:border-red-600 text-gray-500 hover:text-red-400 transition-all">Discard</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── ⭐ BROWSE BY TOPIC ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('topics')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>⭐ Browse by Topic</span>
        <span class="text-gray-500 text-xs">{{ open.topics ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.topics" class="px-4 pb-4 pt-1">
        <div v-if="!Object.keys(visibleTopics).length" class="text-xs text-gray-500 text-center py-2">No topic sources available for this language. Try English.</div>
        <div v-else class="flex flex-col gap-4">
          <div v-for="(sources, topic) in visibleTopics" :key="topic">
            <div class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{{ topic }}</div>
            <div class="flex flex-col gap-1.5">
              <div
                v-for="src in sources"
                :key="src.url"
                class="flex items-center justify-between border border-gray-800 rounded-md px-3 py-2 hover:border-green-800 transition-all"
              >
                <div>
                  <div class="text-sm text-gray-200">{{ src.name }}</div>
                  <div class="text-xs text-gray-500">{{ LANGS[src.lang]?.name ?? src.lang }}</div>
                </div>
                <button @click="importSuggestedSource(src)" :disabled="topicImporting === src.url" class="text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ topicImporting === src.url ? '…' : 'Import' }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 🎬 SUBTITLES ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('subtitles')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🎬 Subtitles</span>
        <span class="text-gray-500 text-xs">{{ open.subtitles ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.subtitles" class="px-4 pb-4 pt-1 flex flex-col gap-3">
        <p class="text-xs text-gray-400">Download an <span class="font-mono">.srt</span> file from any subtitle site (OpenSubtitles, Subscene, etc.), open it in a text editor, then paste the raw content below.</p>
        <input v-model="srtTitle" type="text" placeholder="Story title (e.g. Amélie 2001)…" class="w-full border border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
        <textarea v-model="srtContent" rows="5" placeholder="Paste .srt content here…" dir="ltr" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm font-mono outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 resize-none" />
        <div v-if="srtError" class="text-xs text-red-400">{{ srtError }}</div>
        <button @click="importSRT" class="self-start text-sm px-4 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">Import</button>
      </div>
    </div>

    <!-- ─── 👥 COMMUNITY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('community')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>👥 Community</span>
        <span class="text-gray-500 text-xs">{{ open.community ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.community" class="px-4 pb-4 pt-1">
        <div v-if="loading" class="text-xs text-gray-500 py-4 text-center">Loading…</div>
        <div v-else-if="!filteredCommunity.length" class="text-xs text-gray-500 py-4 text-center">No community stories for this language yet.</div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="story in filteredCommunity"
            :key="story.id"
            @click="emitLoad(story)"
            :class="['p-3 rounded-lg border cursor-pointer transition-all',
              current?.id === story.id ? 'border-green-600 bg-green-950' : 'border-gray-700 hover:border-green-700']"
          >
            <div class="font-medium text-sm break-words" :class="{ 'text-right': isRTL(story.lang) }" :dir="isRTL(story.lang) ? 'rtl' : 'ltr'">{{ story.title }}</div>
            <div class="flex gap-2 mt-1 flex-wrap">
              <span class="text-xs text-gray-500">{{ LANGS[story.lang]?.name }}</span>
              <span class="text-xs text-gray-500">· {{ wordCount(story) }} {{ t(lang, 'words') }}</span>
              <span v-if="story.author" class="text-xs text-gray-500">· {{ story.author }}</span>
              <span class="text-xs text-blue-400">{{ t(lang, 'community') }}</span>
              <span
                v-if="progressByStory[story.id]?.sentence_index > 0"
                class="text-xs text-green-400 border border-green-800 rounded-full px-2 py-0.5"
              >sentence {{ progressByStory[story.id].sentence_index }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable. computed = auto-recalculates. onMounted = runs after the component appears.
import { ref, computed, onMounted, watch } from 'vue'
// LANGS = configuration for all 13 supported languages (name, BCP47, RTL flag, etc.)
import { LANGS } from '../data/stories.js'
// isRTL = true for Arabic and Hebrew (affects text direction in story cards).
import { isRTL } from '../utils/rtl.js'
// t() = translate a UI string key for the active language.
import { t }     from '../utils/i18n.js'
import ClickableText from '../components/ClickableText.vue'
// Supabase functions: fetch/submit stories from the remote database.
import { fetchCommunityStories, submitStory, fetchCuratedStories } from '../utils/supabase.js'
import { getAllProgress } from '../utils/api.js'
// Wikipedia helpers for the Today and On This Day sections.
import { fetchFeaturedArticle, fetchOnThisDay, fetchQuoteOfDay } from '../utils/wikipedia.js'
// Wikivoyage helpers for the Travel section.
import { searchWikivoyage, fetchWikivoyageArticle } from '../utils/wikivoyage.js'

// ── Props / Emits ──────────────────────────────────────────────
// lang    = active language code (e.g. 'fr') — used to filter stories and call APIs.
// current = the story currently loaded in Retype (for the green highlight on story cards).
// words   = full vocabBank array so fetched-content words can be highlighted green if already saved.
const props = defineProps({
  lang:        String,
  current:     Object,
  words:       { type: Array, default: () => [] },
  currentUser: Object,  // null when logged out
})
const emit = defineEmits(['load', 'saveWord', 'openAuth'])

// ── In-progress stories ────────────────────────────────────────────────────
const allProgress = ref([])

async function loadAllProgress() {
  if (!props.currentUser) { allProgress.value = []; return }
  allProgress.value = await getAllProgress()
}

watch(() => props.currentUser, loadAllProgress, { immediate: true })

// Map of storyId → best progress entry (highest sentence_index across tabs)
const progressByStory = computed(() => {
  const map = {}
  for (const p of allProgress.value) {
    if (!map[p.story_id] || p.sentence_index > map[p.story_id].sentence_index) {
      map[p.story_id] = p
    }
  }
  return map
})

// In-progress stories for current language, sorted newest-updated first
const inProgressStories = computed(() => {
  return allProgress.value
    .filter(p => p.lang === props.lang && p.sentence_index > 0)
    .reduce((acc, p) => {
      if (!acc.find(x => x.story_id === p.story_id)) acc.push(p)
      return acc
    }, [])
})

// savedWordsSet = normalized Set of words already saved for the active language.
// Passed to ClickableText so already-saved words highlight green.
const savedWordsSet = computed(() =>
  new Set(
    props.words
      .filter(w => w.lang === props.lang)
      .map(w => w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, ''))
  )
)

// saveFromLibrary() is called when the user clicks a word in any fetched content section.
// Strips punctuation, deduplicates, then emits 'saveWord' to App.vue.
function saveFromLibrary(wordText, sentence) {
  const clean = wordText.replace(/[^\p{L}\p{M}]/gu, '')
  if (!clean) return
  const key = clean.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  const alreadySaved = props.words.some(
    w => w.lang === props.lang && w.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key
  )
  if (alreadySaved) return
  emit('saveWord', { word: clean, lang: props.lang, sentence, story: '' })
}

// ── Supabase data ──────────────────────────────────────────────
// loading = true while waiting for Supabase to respond (shows spinner in Curated section).
const loading          = ref(true)
// Three separate arrays for the three story sources shown in the Curated section.
const curatedStories   = ref([]) // official stories curated by the szol team
const localStories     = ref([]) // user's own stories stored in browser localStorage
const communityStories = ref([]) // stories submitted by other users via Supabase

// onMounted runs once when LibraryView first appears on screen.
// async/await because fetching from Supabase involves a network round-trip.
onMounted(async () => {
  // Load local stories from localStorage instantly (no network needed).
  const saved = localStorage.getItem('szol_local_stories')
  if (saved) localStories.value = JSON.parse(saved)

  // Fetch curated and community stories in parallel (Promise.all waits for both).
  // Array destructuring: [curated, community] = each result goes to its own variable.
  const [curated, community] = await Promise.all([
  fetchCuratedStories(props.lang),
  fetchCommunityStories(props.lang),
])
watch(() => props.lang, async (newLang) => {
  loading.value = true
  const [curated, community] = await Promise.all([
    fetchCuratedStories(newLang),
    fetchCommunityStories(newLang),
  ])
  curatedStories.value = curated
  communityStories.value = community
  loading.value = false
})
  curatedStories.value   = curated
  communityStories.value = community
  loading.value          = false // hide the spinner
})

// curatedAndLocal = official + user-added stories, filtered to the active language.
const curatedAndLocal = computed(() =>
  [...curatedStories.value, ...localStories.value].filter(s => s.lang === props.lang)
)

// groupedCurated groups curatedAndLocal into book objects.
// Titles following "Book Title — Chapter Label" are split; others are their own single-chapter book.
const groupedCurated = computed(() => {
  const bookMap = new Map()
  for (const story of curatedAndLocal.value) {
    const sep      = story.title.indexOf(' — ')   // em dash with spaces
    const bookKey  = sep !== -1 ? story.title.slice(0, sep) : story.title
    const groupKey = bookKey + '|' + (story.author || '')
    if (!bookMap.has(groupKey)) {
      bookMap.set(groupKey, { bookTitle: bookKey, author: story.author || null, lang: story.lang, chapters: [] })
    }
    bookMap.get(groupKey).chapters.push(story)
  }
  for (const g of bookMap.values()) {
    g.chapters.sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
  }
  return [...bookMap.values()]
})

// chapterLabel extracts the part after " — " from a story title, or returns the full title.
function chapterLabel(story) {
  const sep = story.title.indexOf(' — ')
  return sep !== -1 ? story.title.slice(sep + 3) : story.title
}

// chaptersWithProgress counts how many chapters in a book have any recorded progress.
function chaptersWithProgress(book) {
  return book.chapters.filter(c => progressByStory.value[c.id]?.sentence_index > 0).length
}
// filteredCommunity = community stories for the active language only.
const filteredCommunity = computed(() =>
  communityStories.value.filter(s => s.lang === props.lang)
)

// ── Section open/close ─────────────────────────────────────────
// open = tracks which accordion sections are expanded (true) or collapsed (false).
// Curated starts open so users see their stories immediately without clicking.
// All other sections start collapsed to keep the page compact.
const open = ref({
  inprogress: true,
  curated:    true,
  today:      false,
  quote:      false,
  onthisday:  false,
  travel:     false,
  import:     false,
  topics:     false,
  subtitles:  false,
  community:  false,
})

// toggle() flips a section open or closed when the user clicks its header button.
// If a section is being opened for the first time AND it needs network data,
// we fetch that data now (lazy loading — don't fetch until the user wants to see it).
async function toggle(section) {
  open.value[section] = !open.value[section]
  if (open.value[section]) {
    // Only fetch if: the section just opened AND we don't already have data AND not currently loading.
    if (section === 'today'     && !todayArticle.value && !todayLoading.value) await loadToday()
    if (section === 'quote'     && !quoteOfDay.value   && !quoteLoading.value) await loadQuote()
    if (section === 'onthisday' && !onThisDay.value.length && !otdLoading.value) await loadOnThisDay()
  }
}

// ── Today (Wikipedia Featured Article) ────────────────────────
const todayArticle = ref(null) // { title, extract, thumbnail, url } or null
const todayLoading = ref(false)

// loadToday() fetches the day's Wikipedia Featured Article for the active language.
async function loadToday() {
  todayLoading.value = true
  todayArticle.value = await fetchFeaturedArticle(props.lang) // returns null if unavailable
  todayLoading.value = false
}

// importWikipediaArticle() saves the Featured Article as a local story for reading.
function importWikipediaArticle(article) {
  if (!article?.extract) return // safety check in case article loaded but has no text
  pushLocalStory({ title: article.title, content: article.extract, source: 'Wikipedia' })
}

// ── On This Day ────────────────────────────────────────────────
const onThisDay  = ref([]) // array of { text, year } events
const otdLoading = ref(false)

// loadOnThisDay() fetches historical events for today's date from the Wikimedia feed.
async function loadOnThisDay() {
  otdLoading.value = true
  onThisDay.value  = await fetchOnThisDay(props.lang)
  otdLoading.value = false
}

// importOnThisDay() concatenates all the day's events into one story and saves it.
// Each event becomes a line: "1969 — Apollo 11 lands on the Moon."
function importOnThisDay() {
  if (!onThisDay.value.length) return
  const now  = new Date()
  // toLocaleString with { month: 'long' } returns the month name in the browser's locale.
  const date = `${now.toLocaleString('default', { month: 'long' })} ${now.getDate()}`
  // .map() transforms each event into "YEAR — text". .join('\n\n') puts a blank line between them.
  const text = onThisDay.value.map(ev => `${ev.year} — ${ev.text}`).join('\n\n')
  pushLocalStory({ title: `On This Day: ${date}`, content: text, source: 'Wikipedia / On This Day' })
}

// ── Travel (Wikivoyage) ────────────────────────────────────────
const travelQuery     = ref('') // user's search input
const travelResults   = ref([]) // array of { title, pageid, snippet } from Wikivoyage
const travelLoading   = ref(false)
// travelImporting = the pageid of the article currently being downloaded, or null.
// Used to show "…" on the correct Import button while the fetch runs.
const travelImporting = ref(null)

async function searchTravel() {
  if (!travelQuery.value.trim()) return
  travelLoading.value = true
  travelResults.value = await searchWikivoyage(travelQuery.value.trim(), props.lang)
  travelLoading.value = false
}

// importWikivoyage() fetches the full article text for a search result and saves it as a story.
// result.pageid is used as the "in-progress" key so each Import button shows its own spinner.
async function importWikivoyage(result) {
  travelImporting.value = result.pageid
  const article = await fetchWikivoyageArticle(result.title, props.lang)
  if (article?.text) {
    pushLocalStory({ title: article.title, content: article.text, source: 'Wikivoyage' })
  }
  travelImporting.value = null
}

// ── Import URL ─────────────────────────────────────────────────
const importUrl     = ref('') // the URL typed by the user
const importLoading = ref(false)
const importPreview = ref(null) // { title, text } returned by api/extract.js, shown before saving
const importError   = ref('')   // error message shown in red below the URL input

// fetchArticle() calls the api/extract.js Vercel function to extract readable text from a URL.
// Shows a preview card with title + snippet before the user confirms the import.
async function fetchArticle() {
  if (!importUrl.value.trim()) return
  importLoading.value = true
  importPreview.value = null
  importError.value   = ''
  try {
    // encodeURIComponent() percent-encodes the URL so it's safe to pass as a query parameter.
    const res  = await fetch(`/api/extract?url=${encodeURIComponent(importUrl.value.trim())}`)
    const data = await res.json()
    if (data.error || !data.text) {
      importError.value = data.error || 'Could not extract article content.'
    } else {
      importPreview.value = data // show the preview card
    }
  } catch (e) {
    importError.value = e.message
  }
  importLoading.value = false
}

// confirmImport() saves the previewed article as a story and clears the form.
function confirmImport() {
  if (!importPreview.value) return
  pushLocalStory({ title: importPreview.value.title, content: importPreview.value.text, source: importUrl.value })
  importUrl.value     = ''
  importPreview.value = null
}

// ── Browse by Topic ────────────────────────────────────────────
// SUGGESTED_SOURCES = hand-picked content sources organized by topic.
// Each source has: name (display label), url (homepage to extract), lang (the language it's in),
// and optionally wikivoyage: true (fetch via Wikivoyage API instead of the extract proxy).
//
// WHY wikivoyage: true for Travel sources?
// Wikivoyage has a CORS-enabled API, so we can fetch their content directly from the browser
// without going through api/extract.js. Other sites need the server proxy.
const SUGGESTED_SOURCES = {
  News: [
    { name: 'BBC Arabic',      url: 'https://www.bbc.com/arabic',             lang: 'ar' },
    { name: 'Al-Arabiya',      url: 'https://arabic.alarabiya.net',           lang: 'ar' },
    { name: 'DW German',       url: 'https://www.dw.com/de/',                 lang: 'de' },
    { name: 'Spiegel Online',  url: 'https://www.spiegel.de',                 lang: 'de' },
    { name: 'Kathimerini',     url: 'https://www.kathimerini.gr',             lang: 'el' },
    { name: 'RFI French',      url: 'https://www.rfi.fr/fr/',                 lang: 'fr' },
    { name: 'Le Monde',        url: 'https://www.lemonde.fr',                 lang: 'fr' },
    { name: 'Haaretz',         url: 'https://www.haaretz.co.il',              lang: 'he' },
    { name: 'Magyar Hírlap',   url: 'https://www.magyarhirlap.hu',            lang: 'hu' },
    { name: 'NHK Web Easy',    url: 'https://www3.nhk.or.jp/news/easy/',      lang: 'ja' },
    { name: 'Asahi Shimbun',   url: 'https://www.asahi.com',                  lang: 'ja' },
    { name: 'RIA Novosti',     url: 'https://ria.ru',                         lang: 'ru' },
    { name: 'La Vanguardia',   url: 'https://www.lavanguardia.com',           lang: 'es' },
    { name: 'Xinhua',          url: 'https://www.xinhuanet.com',              lang: 'zh' },
    { name: '人民日報',        url: 'https://www.people.com.cn',              lang: 'zh' },
  ],
  Sports: [
    { name: 'BBC Sport',       url: 'https://www.bbc.com/sport',              lang: 'en' },
    { name: 'Marca',           url: 'https://www.marca.com',                  lang: 'es' },
    { name: "L'Équipe",        url: 'https://www.lequipe.fr',                 lang: 'fr' },
    { name: 'Kicker',          url: 'https://www.kicker.de',                  lang: 'de' },
    { name: 'Gazzetta IT',     url: 'https://www.gazzetta.it',                lang: 'it' },
    { name: 'Sports.ru',       url: 'https://www.sports.ru',                  lang: 'ru' },
    { name: 'Sport.hu',        url: 'https://sport.hu',                       lang: 'hu' },
    { name: 'NHK Sports',      url: 'https://www3.nhk.or.jp/sports/',         lang: 'ja' },
    { name: 'Sina Sports',     url: 'https://sports.sina.com.cn',             lang: 'zh' },
  ],
  Tech: [
    { name: 'Wired',           url: 'https://www.wired.com',                  lang: 'en' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com',       lang: 'en' },
    { name: 'Heise Online',    url: 'https://www.heise.de',                   lang: 'de' },
    { name: 'Tom\'s Hardware IT', url: 'https://www.tomshw.it',               lang: 'it' },
    { name: 'Hi-Tech Mail',    url: 'https://hi-tech.mail.ru',                lang: 'ru' },
    { name: 'IT之家',          url: 'https://www.ithome.com',                 lang: 'zh' },
  ],
  'Animals & Nature': [
    { name: 'Nat Geo EN',      url: 'https://www.nationalgeographic.com',     lang: 'en' },
    { name: 'Nat Geo ES',      url: 'https://www.nationalgeographic.com.es',  lang: 'es' },
    { name: 'Nat Geo FR',      url: 'https://www.nationalgeographic.fr',      lang: 'fr' },
    { name: 'Nat Geo DE',      url: 'https://www.nationalgeographic.de',      lang: 'de' },
    { name: 'Nat Geo IT',      url: 'https://www.nationalgeographic.it',      lang: 'it' },
    { name: 'Nat Geo RU',      url: 'https://www.nat-geo.ru',                 lang: 'ru' },
    { name: 'Nat Geo JA',      url: 'https://natgeo.nikkeibp.co.jp',          lang: 'ja' },
    { name: 'WWF',             url: 'https://www.worldwildlife.org',           lang: 'en' },
  ],
  Cooking: [
    { name: 'Serious Eats',    url: 'https://www.seriouseats.com',             lang: 'en' },
    { name: 'Marmiton',        url: 'https://www.marmiton.org',                lang: 'fr' },
    { name: 'Recetas Gratis',  url: 'https://www.recetasgratis.net',           lang: 'es' },
    { name: 'Giallo Zafferano',url: 'https://www.giallozafferano.it',          lang: 'it' },
    { name: 'Gastronom.ru',    url: 'https://www.gastronom.ru',                lang: 'ru' },
    { name: 'Cookpad JP',      url: 'https://cookpad.com/jp',                  lang: 'ja' },
    { name: '下厨房',           url: 'https://www.xiachufang.com',              lang: 'zh' },
  ],
  Science: [
    { name: 'Scientific American', url: 'https://www.scientificamerican.com',      lang: 'en' },
    { name: 'Investigación y Ciencia', url: 'https://www.investigacionyciencia.es', lang: 'es' },
    { name: 'Spektrum.de',     url: 'https://www.spektrum.de',                lang: 'de' },
    { name: 'Le Scienze',      url: 'https://www.lescienze.it',               lang: 'it' },
    { name: 'Nauka i Zhizn',   url: 'https://www.nkj.ru',                     lang: 'ru' },
    { name: 'Science日本語',   url: 'https://www.science.org',                lang: 'ja' },
  ],
  Travel: [
    { name: 'Wikivoyage EN',  url: 'https://en.wikivoyage.org',  lang: 'en',  wikivoyage: true },
    { name: 'Wikivoyage ES',  url: 'https://es.wikivoyage.org',  lang: 'es',  wikivoyage: true },
    { name: 'Wikivoyage FR',  url: 'https://fr.wikivoyage.org',  lang: 'fr',  wikivoyage: true },
    { name: 'Wikivoyage DE',  url: 'https://de.wikivoyage.org',  lang: 'de',  wikivoyage: true },
    { name: 'Wikivoyage IT',  url: 'https://it.wikivoyage.org',  lang: 'it',  wikivoyage: true },
    { name: 'Wikivoyage RU',  url: 'https://ru.wikivoyage.org',  lang: 'ru',  wikivoyage: true },
    { name: 'Wikivoyage HE',  url: 'https://he.wikivoyage.org',  lang: 'he',  wikivoyage: true },
    { name: 'Wikivoyage AR',  url: 'https://ar.wikivoyage.org',  lang: 'ar',  wikivoyage: true },
    { name: 'Wikivoyage JA',  url: 'https://ja.wikivoyage.org',  lang: 'ja',  wikivoyage: true },
    { name: 'Wikivoyage ZH',  url: 'https://zh.wikivoyage.org',  lang: 'zh',  wikivoyage: true },
    { name: 'Wikivoyage EL',  url: 'https://el.wikivoyage.org',  lang: 'el',  wikivoyage: true },
    { name: 'Wikivoyage HU',  url: 'https://hu.wikivoyage.org',  lang: 'hu',  wikivoyage: true },
  ],
}

// visibleTopics = only the topics that have at least one source matching the active language or English.
// For example, if the user is studying German: shows BBC Sport (en) + Kicker (de) under Sports,
// but hides French/Spanish-only sources. English sources always appear since many learners read English too.
const visibleTopics = computed(() => {
  const result = {}
  // Object.entries() converts the object to an array of [key, value] pairs for iteration.
  for (const [topic, sources] of Object.entries(SUGGESTED_SOURCES)) {
    const matching = sources.filter(s => s.lang === props.lang)
    // Only include a topic section if it has at least one matching source.
    if (matching.length) result[topic] = matching
  }
  return result
})

// topicImporting = the URL of the source currently being imported, or null.
// Each Import button checks: topicImporting === src.url to show its own "…" spinner.
const topicImporting = ref(null)

// importSuggestedSource() handles clicking "Import" on a Browse by Topic source.
// Wikivoyage sources use their direct API; all others go through api/extract.js.
async function importSuggestedSource(src) {
  topicImporting.value = src.url

  if (src.wikivoyage) {
    // Wikivoyage: extract the language code from the URL subdomain (e.g. "en" from "en.wikivoyage.org").
    // /^https:\/\/(\w+)\./ = regex that captures the first word before the first dot.
    // ?.[1] = optional chaining on the match result in case the URL doesn't match.
    const langCode = src.url.match(/^https:\/\/(\w+)\./)?.[1] ?? 'en'
    const article  = await fetchWikivoyageArticle('Main Page', langCode)
    if (article?.text) {
      pushLocalStory({ title: src.name, content: article.text, source: src.url })
    }
  } else {
    // All other sources: call the api/extract.js Vercel proxy to extract article text.
    try {
      const res  = await fetch(`/api/extract?url=${encodeURIComponent(src.url)}`)
      const data = await res.json()
      if (data.text) {
        // Use the extracted title if available, fall back to the source name.
        pushLocalStory({ title: data.title || src.name, content: data.text, source: src.url })
      }
    } catch { /* silently ignore — network errors don't crash the UI */ }
  }

  topicImporting.value = null
}

// ── Quote of the Day (Wikiquote) ───────────────────────────────
const quoteOfDay   = ref(null)
const quoteLoading = ref(false)

async function loadQuote() {
  quoteLoading.value = true
  quoteOfDay.value   = await fetchQuoteOfDay(props.lang)
  quoteLoading.value = false
}

watch(() => props.lang, () => { quoteOfDay.value = null })

function importQuote() {
  if (!quoteOfDay.value) return
  pushLocalStory({
    title:   `"${quoteOfDay.value.author}"`,
    content: quoteOfDay.value.quote,
    source:  'Wikiquote',
  })
}

// ── Subtitles (SRT paste) ───────────────────────────────────────
const srtTitle   = ref('')
const srtContent = ref('')
const srtError   = ref('')

function parseSRT(srt) {
  return srt
    .replace(/^\d+\s*$/gm, '')
    .replace(/\d{2}:\d{2}:\d{2}[,.:]\d{2,3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.:]\d{2,3}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .split('\n').map(l => l.trim()).filter(Boolean).join(' ')
    .replace(/\s{2,}/g, ' ').trim()
}

function importSRT() {
  srtError.value = ''
  const raw = srtContent.value.trim()
  if (!raw) { srtError.value = 'Paste SRT content first.'; return }
  const text = parseSRT(raw)
  if (text.length < 20) { srtError.value = 'Could not extract dialogue from this SRT content.'; return }
  const title = srtTitle.value.trim() || 'Subtitles'
  pushLocalStory({ title, content: text, source: 'Subtitles' })
  srtTitle.value   = ''
  srtContent.value = ''
}

// ── Add story form ─────────────────────────────────────────────
// These refs bind to the form inputs inside the Curated section via v-model.
const expandedBook  = ref(null)    // bookTitle of the currently expanded book card
const showAdd       = ref(false)  // controls whether the form is visible
const customTitle   = ref('')
const customText    = ref('')
const customFranco  = ref('')  // Egyptian Arabic only (shown when lang === 'arz')
const customAuthor  = ref('')  // required before sharing to community
const customSource  = ref('')  // optional attribution URL / publication name
const showShareForm = ref(false) // reveals the author + source fields when sharing
const submitting    = ref(false) // disables the Share button during the Supabase upload

// addLocal() saves the story to localStorage without uploading it anywhere.
function addLocal() {
  if (!customTitle.value.trim() || !customText.value.trim()) return
  pushLocalStory({
    title:   customTitle.value.trim(),
    content: customText.value.trim(),
    franco:  customFranco.value.trim() || null, // null instead of '' keeps JSON tidy
  })
  clearForm()
}

// shareGlobal() uploads the story to the community_stories table in Supabase.
// Requires an author name — if not yet provided, shows the author/source fields first.
async function shareGlobal() {
  if (!customTitle.value.trim() || !customText.value.trim()) {
    alert('Please add a title and text first.')
    return
  }
  submitting.value = true
  try {
    // author is auto-filled server-side from the logged-in user's username.
    // source is optional — show the extra fields only if the user wants to add attribution.
    const story = await submitStory({
      title:    customTitle.value.trim(),
      content:  customText.value.trim(),
      franco:   customFranco.value.trim() || null,
      lang:     props.lang,
      author:   customAuthor.value.trim() || null,   // backend fills from JWT if blank
      source:   customSource.value.trim() || null,
      reviewed: false,
    })
    // .unshift() adds to the start of the array so the new story appears at the top.
    // { ...story, community: true } spreads all story fields and adds the 'community' flag.
    communityStories.value.unshift({ ...story, community: true })
    clearForm()
    showShareForm.value = false
    alert('Story shared with the community!')
  } catch (e) {
    alert('Error submitting story: ' + e.message)
  }
  submitting.value = false
}

// clearForm() resets all form input fields to empty strings after a successful save/share.
function clearForm() {
  customTitle.value  = ''
  customText.value   = ''
  customFranco.value = ''
  customAuthor.value = ''
  customSource.value = ''
}

// ── Shared helper ──────────────────────────────────────────────
// pushLocalStory() is the single function all import actions call to save a story.
// It adds to the reactive array (triggering re-render), persists to localStorage,
// and immediately emits 'load' so App.vue navigates to Retype with the story ready.
// franco defaults to null because only Egyptian Arabic stories have a Latin-script version.
// source is optional — undefined is cleaner than an empty string in the stored JSON.
function pushLocalStory({ title, content, franco = null, source = '' }) {
  if (!title || !content) return // safety guard — never save empty stories
  const story = {
    // 'l' prefix distinguishes local IDs from Supabase UUID strings.
    // Date.now() = milliseconds since epoch, effectively unique for rapid sequential saves.
    id:     'l' + Date.now(),
    title,
    content,
    franco,
    lang:   props.lang,
    local:  true,
    source: source || undefined,
  }
  localStories.value.push(story)
  // JSON.stringify converts the full array to a string for localStorage (which only stores strings).
  localStorage.setItem('szol_local_stories', JSON.stringify(localStories.value))
  // Immediately load the story — App.vue will switch to the Retype tab.
  // This means importing any content (URL, Wikipedia, Wikivoyage, etc.) takes you straight to practice.
  emitLoad(story)
}

function emitLoad(story) {
  window.clarity?.('event', 'story_loaded')
  window.clarity?.('set', 'story_lang', story.lang)
  emit('load', story)
}

function resumeStory(progress) {
  const all = [...curatedStories.value, ...localStories.value, ...communityStories.value]
  const story = all.find(s => s.id === progress.story_id)
  if (story) {
    emitLoad(story)
  }
}

// wordCount() returns the appropriate size metric depending on the story's language.
// CJK languages (Chinese, Japanese) have no spaces between words, so counting whitespace-split
// chunks always returns 1 for a full paragraph. Instead we count individual letter characters.
// For all other languages: split by whitespace and count the chunks.
function wordCount(story) {
  if (['zh', 'ja'].includes(story.lang)) {
    // [...story.text] spreads the string into an array of Unicode code points (handles emoji/CJK correctly).
    // /\p{L}/u = Unicode property escape: matches any letter character in any script.
    return [...story.content].filter(c => /\p{L}/u.test(c)).length
  }
  // .split(/\s+/) splits on any whitespace. .filter(Boolean) removes empty strings from leading/trailing spaces.
  return story.content.split(/\s+/).filter(Boolean).length
}
</script>
