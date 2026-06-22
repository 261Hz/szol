<!-- LibraryView.vue: multi-section content discovery hub. -->
<!-- Sections: Curated · Today · On This Day · Travel · Import URL · Topics · Subtitles · Community -->
<template>
  <div class="flex flex-col gap-2">

    <!-- ─── ▶ IN PROGRESS ─── -->
    <div v-if="inProgressStories.length" class="border border-green-800 rounded-lg overflow-hidden">
      <button @click="toggle('inprogress')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-green-300 hover:bg-gray-800 transition-all">
        <span>▶ {{ t(lang, 'inProgress') }}</span>
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
            >{{ t(lang, 'resumeArrow') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 📖 CURATED ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('curated')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📖 {{ t(lang, 'curated') }}</span>
        <span class="text-gray-500 text-xs">{{ open.curated ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.curated" class="px-4 pb-4 pt-1 min-h-[200px]">
        <div v-if="loading" class="text-gray-500 text-sm text-center py-6">{{ t(lang, 'loading') }}</div>
        <div v-else-if="!curatedAndLocal.length" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'noStoriesYet') }}</div>
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
                  <span v-if="book.chapters.length > 1">· {{ book.chapters.length }} {{ t(lang, 'chapters') }}</span>
                  <span v-if="chaptersWithProgress(book) > 0" class="text-green-400">
                    · {{ chaptersWithProgress(book) }}/{{ book.chapters.length }} {{ t(lang, 'read') }}
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
                  >{{ current?.id === chapter.id ? t(lang, 'reading') : t(lang, 'readArrow') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ─── 📰 FEED ARTICLES ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('feed')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📰 Articles</span>
        <span class="text-gray-500 text-xs">{{ open.feed ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.feed" class="px-4 pb-4 pt-1 flex flex-col gap-2">
        <div v-if="feedLoading && !feedStories.length" class="text-gray-500 text-sm text-center py-6">{{ t(lang, 'loading') }}</div>
        <div v-else-if="!feedStories.length" class="text-xs text-gray-500 py-4 text-center">No articles yet for this language.</div>
        <div v-else class="flex flex-col gap-1.5">
          <div
            v-for="article in feedStories"
            :key="article.id"
            @click="openFeedArticle(article)"
            :class="['p-3 rounded-lg border transition-all',
              articleFetching === article.id ? 'opacity-60 cursor-wait' : 'cursor-pointer',
              current?.id === article.id ? 'border-green-600 bg-green-950' : 'border-gray-700 hover:border-green-700']"
          >
            <div class="font-medium text-sm text-gray-100 leading-snug mb-1">{{ article.title }}</div>
            <div class="flex gap-2 flex-wrap">
              <span class="text-xs text-gray-500">{{ article.source_name }}</span>
              <span v-if="article.author" class="text-xs text-gray-500">· {{ article.author }}</span>
              <span class="text-xs text-gray-600">· {{ wordCount({ content: article.text, lang: article.lang }) }} words</span>
              <span v-if="articleFetching === article.id" class="text-xs text-green-500">fetching…</span>
            </div>
          </div>
          <button
            v-if="!feedExhausted"
            @click="loadFeed()"
            :disabled="feedLoading"
            class="mt-1 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40 text-center py-2 border border-gray-700 rounded-lg hover:border-gray-500 transition-all"
          >{{ feedLoading ? 'Loading…' : 'Load more' }}</button>
        </div>

        <!-- Suggest a source -->
        <div class="mt-2 border-t border-gray-800 pt-2">
          <button v-if="!suggestOpen && !suggestDone" @click="suggestOpen = true"
            class="text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-center py-1">
            + Suggest a source
          </button>
          <div v-if="suggestDone" class="text-xs text-green-400 text-center py-1">Suggestion received, thanks!</div>
          <div v-if="suggestOpen && !suggestDone" class="flex flex-col gap-2">
            <input v-model="suggestUrl" type="url" placeholder="https://example.com/feed"
              class="w-full text-xs bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500" />
            <input v-model="suggestNote" type="text" placeholder="Note (optional)"
              class="w-full text-xs bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500" />
            <div class="flex gap-2">
              <button @click="submitSuggestion" :disabled="suggestSending || !suggestUrl.trim()"
                class="flex-1 text-xs py-1.5 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition-all">
                {{ suggestSending ? 'Sending…' : 'Submit' }}
              </button>
              <button @click="suggestOpen = false; suggestUrl = ''; suggestNote = ''"
                class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-500 hover:text-gray-300 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 🎙 PODCASTS ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('podcasts')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🎙 Podcasts</span>
        <span class="text-gray-500 text-xs">{{ open.podcasts ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.podcasts" class="px-4 pb-4 pt-1 flex flex-col gap-2">
        <div v-if="podcastLoading && !podcastEpisodes.length" class="text-gray-500 text-sm text-center py-6">Loading…</div>
        <div v-else-if="!podcastEpisodes.length" class="text-xs text-gray-500 py-4 text-center">No podcast episodes for this language yet.</div>
        <div v-else class="flex flex-col gap-1.5">
          <div
            v-for="ep in podcastEpisodes"
            :key="ep.id"
            :class="['p-3 rounded-lg border transition-all',
              current?.id === ep.id ? 'border-green-600 bg-green-950' : 'border-gray-700']"
          >
            <div class="font-medium text-sm text-gray-100 leading-snug">{{ ep.title }}</div>
            <div class="flex gap-2 flex-wrap items-center mt-1">
              <span class="text-xs text-gray-500">{{ ep.podcast_name }}</span>
              <span v-if="ep.duration_sec" class="text-xs text-gray-600">
                · {{ Math.round(ep.duration_sec / 60) }} min
              </span>
              <span v-if="ep.has_transcript" class="text-xs text-green-600">· transcript ready</span>
            </div>
            <div v-if="ep.description" class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{{ ep.description }}</div>
            <div class="mt-2">
              <button
                @click="listenEpisode(ep)"
                class="text-xs px-3 py-1.5 rounded-md border border-blue-700 text-blue-300 hover:border-blue-500 transition-all"
              >▶ Listen</button>
            </div>
          </div>
        </div>

        <!-- Suggest a podcast -->
        <div class="mt-2 border-t border-gray-800 pt-2">
          <button v-if="!suggestPodcastOpen && !suggestPodcastDone" @click="suggestPodcastOpen = true"
            class="text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-center py-1">
            + Suggest a podcast
          </button>
          <div v-if="suggestPodcastDone" class="text-xs text-green-400 text-center py-1">Suggestion received, thanks!</div>
          <div v-if="suggestPodcastOpen && !suggestPodcastDone" class="flex flex-col gap-2">
            <input v-model="suggestPodcastUrl" type="url" placeholder="https://feeds.example.com/podcast.rss"
              class="w-full text-xs bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500" />
            <input v-model="suggestPodcastNote" type="text" placeholder="Note (optional)"
              class="w-full text-xs bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500" />
            <div class="flex gap-2">
              <button @click="submitPodcastSuggestion" :disabled="suggestPodcastSending || !suggestPodcastUrl.trim()"
                class="flex-1 text-xs py-1.5 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition-all">
                {{ suggestPodcastSending ? 'Sending…' : 'Submit' }}
              </button>
              <button @click="suggestPodcastOpen = false; suggestPodcastUrl = ''; suggestPodcastNote = ''"
                class="text-xs px-3 py-1.5 rounded-md border border-gray-700 text-gray-500 hover:text-gray-300 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 🌍 TODAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('today')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🌍 {{ t(lang, 'today') }}</span>
        <span class="text-gray-500 text-xs">{{ open.today ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.today" class="px-4 pb-4 pt-1">
        <div v-if="todayLoading" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'loading') }}</div>
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
          <button @click="importWikipediaArticle(todayArticle)" class="self-start text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">{{ t(lang, 'importAsStory') }}</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'noToday') }}</div>
      </div>
    </div>

    <!-- ─── 📜 QUOTE OF THE DAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('quote')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📜 {{ t(lang, 'quoteOfDay') }}</span>
        <span class="text-gray-500 text-xs">{{ open.quote ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.quote" class="px-4 pb-4 pt-1">
        <div v-if="quoteLoading" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'loading') }}</div>
        <div v-else-if="quoteOfDay" class="flex flex-col gap-3">
          <p class="text-sm text-gray-200 italic leading-relaxed" :dir="isRTL(lang) ? 'rtl' : 'ltr'">"{{ quoteOfDay.quote }}"</p>
          <p class="text-xs text-gray-500">— {{ quoteOfDay.author }}</p>
          <button @click="importQuote" class="self-start text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">{{ t(lang, 'importAsStory') }}</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'noQuote') }}</div>
      </div>
    </div>

    <!-- ─── 🕐 LITERARY CLOCK (English only) ─── -->
    <div v-if="lang === 'en'" class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('litclock')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🕐 Literary Clock</span>
        <span class="text-gray-500 text-xs">{{ open.litclock ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.litclock" class="px-4 pb-4 pt-1">
        <div v-if="litClockLoading" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'loading') }}</div>
        <div v-else-if="litClockQuote" class="flex flex-col gap-3">
          <p class="text-sm text-gray-200 italic leading-relaxed">
            <ClickableText :text="litClockQuote.quote_first" lang="en" :savedWords="savedWordsSet" @tap="({ word, sentence }) => saveFromLibrary(word, sentence)" /><!--
            --><span class="text-purple-400 font-semibold not-italic">{{ litClockQuote.quote_time_case }}</span><!--
            --><ClickableText :text="litClockQuote.quote_last" lang="en" :savedWords="savedWordsSet" @tap="({ word, sentence }) => saveFromLibrary(word, sentence)" />
          </p>
          <p class="text-xs text-gray-500">— <em>{{ litClockQuote.title }}</em> · {{ litClockQuote.author }}</p>
        </div>
        <div v-else class="text-xs text-gray-500 text-center py-4">No quote for this time.</div>
      </div>
    </div>

    <!-- ─── 📅 ON THIS DAY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('onthisday')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>📅 {{ t(lang, 'onThisDay') }}</span>
        <span class="text-gray-500 text-xs">{{ open.onthisday ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.onthisday" class="px-4 pb-4 pt-1">
        <div v-if="otdLoading" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'loading') }}</div>
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
          <button @click="importOnThisDay" class="self-start mt-2 text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">{{ t(lang, 'importAll') }}</button>
        </div>
        <div v-else class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'noOnThisDay') }}</div>
      </div>
    </div>

    <!-- ─── 🔗 IMPORT URL ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('import')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>🔗 {{ t(lang, 'importUrlSec') }}</span>
        <span class="text-gray-500 text-xs">{{ open.import ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.import" class="px-4 pb-4 pt-1">
        <div class="flex gap-2 mb-3">
          <input v-model="importUrl" type="url" placeholder="https://…" @keydown.enter="fetchArticle" class="flex-1 border border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          <button @click="fetchArticle" :disabled="importLoading" class="text-sm px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ importLoading ? '…' : t(lang, 'fetch') }}</button>
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
            <button @click="confirmImport" class="text-xs px-3 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 transition-all">{{ t(lang, 'saveAsStory') }}</button>
            <button @click="importPreview = null; importError = ''" class="text-xs px-3 py-1.5 rounded-md border border-gray-700 hover:border-red-600 text-gray-500 hover:text-red-400 transition-all">{{ t(lang, 'discard') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── ⭐ BROWSE BY TOPIC ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('topics')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>⭐ {{ t(lang, 'browseTopics') }}</span>
        <span class="text-gray-500 text-xs">{{ open.topics ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.topics" class="px-4 pb-4 pt-1">
        <div v-if="!Object.keys(visibleTopics).length" class="text-xs text-gray-500 text-center py-2">{{ t(lang, 'noTopics') }}</div>
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
                <button @click="importSuggestedSource(src)" :disabled="topicImporting === src.url" class="text-xs px-2.5 py-1 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all">{{ topicImporting === src.url ? '…' : t(lang, 'import') }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 👥 COMMUNITY ─── -->
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button @click="toggle('community')" class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-800 transition-all">
        <span>👥 {{ t(lang, 'community') }}</span>
        <span class="text-gray-500 text-xs">{{ open.community ? '▲' : '▼' }}</span>
      </button>
      <div v-if="open.community" class="px-4 pb-4 pt-1 flex flex-col gap-3">

        <!-- Community story list -->
        <div v-if="loading" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'loading') }}</div>
        <div v-else-if="!filteredCommunity.length" class="text-xs text-gray-500 py-4 text-center">{{ t(lang, 'noCommunity') }}</div>
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

        <!-- Submit a story -->
        <div class="border-t border-gray-800 pt-3 flex flex-col gap-3">
          <div class="text-xs font-medium text-gray-400">Submit a story</div>
          <input v-model="customTitle" type="text" :placeholder="t(lang, 'titleHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          <textarea v-model="customText" rows="4" :placeholder="t(lang, 'pasteStory')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600 resize-none" />
          <input v-if="lang === 'arz'" v-model="customFranco" type="text" placeholder="Franco transliteration (optional)…" dir="ltr" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          <!-- Step 2: author + source fields revealed after first Share click -->
          <div v-if="showShareForm" class="flex flex-col gap-2">
            <div class="flex flex-col gap-1">
              <input v-model="customAuthor" type="text" :placeholder="t(lang, 'authorHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
              <div class="text-xs text-gray-600">Shown publicly — use a pen name if you prefer.</div>
            </div>
            <input v-model="customSource" type="text" :placeholder="t(lang, 'sourceHere')" :dir="isRTL(lang) ? 'rtl' : 'ltr'" class="w-full border border-gray-700 rounded-md px-3 py-2 text-sm outline-none bg-gray-900 text-gray-100 placeholder:text-gray-600 focus:border-green-600" />
          </div>
          <div class="flex items-center justify-end gap-2">
            <button @click="addLocal" class="text-sm px-4 py-1.5 rounded-md border border-gray-700 hover:border-green-600 transition-all">{{ t(lang, 'saveLocal') }}</button>
            <button
              v-if="currentUser"
              @click="shareGlobal"
              :disabled="submitting"
              class="text-sm px-4 py-1.5 rounded-md bg-green-700 text-white hover:bg-green-600 disabled:opacity-40 transition-all"
            >{{ submitting ? t(lang, 'sharing') : (showShareForm ? t(lang, 'shareGlobal') : 'Share →') }}</button>
            <span v-else class="text-xs text-gray-500">
              <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">{{ t(lang, 'login') ?? 'Login' }}</button>
              {{ t(lang, 'loginToShare') }}
            </span>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable. computed = auto-recalculates. onMounted = runs after the component appears.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
// LANGS = configuration for all 13 supported languages (name, BCP47, RTL flag, etc.)
import { LANGS } from '../data/stories.js'
// isRTL = true for Arabic and Hebrew (affects text direction in story cards).
import { isRTL } from '../utils/rtl.js'
// t() = translate a UI string key for the active language.
import { t }     from '../utils/i18n.js'
import ClickableText from '../components/ClickableText.vue'
// Supabase functions: fetch/submit stories from the remote database.
import { fetchCommunityStories, submitStory, fetchCuratedStories, saveUserStory, getUserStories, deleteUserStory, fetchFeed, fetchFeedArticle, suggestSource, fetchPodcasts } from '../utils/api.js'
import { getAllProgress } from '../utils/api.js'
// Wikipedia helpers for the Today and On This Day sections.
import { fetchFeaturedArticle, fetchOnThisDay, fetchQuoteOfDay } from '../utils/wikipedia.js'
// Wikivoyage helpers for the Travel section.

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
const emit = defineEmits(['load', 'open-listen', 'saveWord', 'openAuth'])

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

  // If logged in, merge account stories — stories saved on another device show up here.
  if (props.currentUser) {
    const accountStories = await getUserStories(props.lang)
    if (accountStories.length) {
      const localIds = new Set(localStories.value.map(s => s.id))
      const newFromAccount = accountStories
        .filter(s => !localIds.has(s.id))
        .map(s => ({ ...s, local: true }))
      localStories.value.push(...newFromAccount)
      localStorage.setItem('szol_local_stories', JSON.stringify(localStories.value))
    }
  }

  // Fetch curated and community stories in parallel (Promise.all waits for both).
  // Array destructuring: [curated, community] = each result goes to its own variable.
  const [curated, community] = await Promise.all([
  fetchCuratedStories(props.lang),
  fetchCommunityStories(props.lang),
])
watch(() => props.lang, async (newLang) => {
  // Reset all lazy-loaded content so stale data from the previous language is cleared
  loading.value          = true
  feedStories.value      = []
  feedPage.value         = 0
  feedExhausted.value    = false
  podcastEpisodes.value  = []
  todayArticle.value     = null
  quoteOfDay.value       = null
  onThisDay.value        = []

  const [curated, community] = await Promise.all([
    fetchCuratedStories(newLang),
    fetchCommunityStories(newLang),
  ])
  curatedStories.value   = curated
  communityStories.value = community
  loading.value          = false

  // Reload whichever lazy sections the user already had open
  if (open.value.feed)      loadFeed(true)
  if (open.value.podcasts)  loadPodcasts()
  if (open.value.today)     loadToday()
  if (open.value.quote)     loadQuote()
  if (open.value.onthisday) loadOnThisDay()
})
  curatedStories.value   = curated
  communityStories.value = community
  loading.value          = false // hide the spinner
  startLitClockTimer()
})

onUnmounted(() => {
  clearTimeout(litClockTimer)
  clearInterval(litClockTimer)
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

// ── Feed stories (ingested RSS articles) ──────────────────────────────────────
const feedStories   = ref([])
const feedLoading   = ref(false)
const feedPage      = ref(0)
const feedExhausted = ref(false)
const FEED_PAGE     = 20

async function loadFeed(reset = false) {
  if (feedLoading.value || (!reset && feedExhausted.value)) return
  feedLoading.value = true
  if (reset) { feedPage.value = 0; feedExhausted.value = false; feedStories.value = [] }
  const items = await fetchFeed(props.lang, feedPage.value * FEED_PAGE, FEED_PAGE)
  if (items.length < FEED_PAGE) feedExhausted.value = true
  feedStories.value.push(...items)
  feedPage.value++
  feedLoading.value = false
}

const articleFetching = ref(null)

async function openFeedArticle(article) {
  if (articleFetching.value) return
  const wordCount = (article.text || '').split(/\s+/).filter(Boolean).length
  if (wordCount >= 100) {
    emitLoad({ id: article.id, title: article.title, content: article.text, lang: article.lang, source: article.source_name })
    return
  }
  articleFetching.value = article.id
  const data = await fetchFeedArticle(article.source_url)
  articleFetching.value = null
  const text = data?.text && data.text.split(/\s+/).length > wordCount ? data.text : article.text
  emitLoad({ id: article.id, title: article.title, content: text, lang: article.lang, source: article.source_name })
}


// ── Source suggestion ─────────────────────────────────────────────────────────
const suggestOpen    = ref(false)
const suggestUrl     = ref('')
const suggestNote    = ref('')
const suggestSending = ref(false)
const suggestDone    = ref(false)

async function submitSuggestion() {
  const url = suggestUrl.value.trim()
  if (!url) return
  suggestSending.value = true
  const ok = await suggestSource(url, props.lang, suggestNote.value.trim())
  suggestSending.value = false
  if (ok) {
    suggestDone.value = true
    suggestUrl.value  = ''
    suggestNote.value = ''
    setTimeout(() => { suggestDone.value = false; suggestOpen.value = false }, 2500)
  }
}

// ── Podcasts ──────────────────────────────────────────────────────────────────
const podcastEpisodes = ref([])
const podcastLoading  = ref(false)

const suggestPodcastOpen    = ref(false)
const suggestPodcastUrl     = ref('')
const suggestPodcastNote    = ref('')
const suggestPodcastSending = ref(false)
const suggestPodcastDone    = ref(false)

async function submitPodcastSuggestion() {
  const url = suggestPodcastUrl.value.trim()
  if (!url) return
  suggestPodcastSending.value = true
  const ok = await suggestSource(url, props.lang, suggestPodcastNote.value.trim())
  suggestPodcastSending.value = false
  if (ok) {
    suggestPodcastDone.value = true
    suggestPodcastUrl.value  = ''
    suggestPodcastNote.value = ''
    setTimeout(() => { suggestPodcastDone.value = false; suggestPodcastOpen.value = false }, 2500)
  }
}

async function loadPodcasts() {
  podcastLoading.value = true
  podcastEpisodes.value = await fetchPodcasts(props.lang)
  podcastLoading.value = false
}

function listenEpisode(ep) {
  emit('open-listen', {
    id:           ep.id,
    title:        ep.title,
    lang:         ep.lang,
    author:       ep.podcast_name,
    source:       ep.podcast_name,
    source_type:  'podcast',
    podcast_name: ep.podcast_name,
    audio_url:    ep.audio_url,
    segments:     ep.segments || [],
    is_autogenerated: true,
  })
}


// ── Section open/close ─────────────────────────────────────────
// open = tracks which accordion sections are expanded (true) or collapsed (false).
// Curated starts open so users see their stories immediately without clicking.
// All other sections start collapsed to keep the page compact.
const open = ref({
  inprogress: true,
  curated:    false,
  feed:       false,
  podcasts:   false,
  today:      false,
  quote:      false,
  litclock:   false,
  onthisday:  false,
  import:     false,
  topics:     false,
  community:  false,
})

// toggle() flips a section open or closed when the user clicks its header button.
// If a section is being opened for the first time AND it needs network data,
// we fetch that data now (lazy loading — don't fetch until the user wants to see it).
async function toggle(section) {
  open.value[section] = !open.value[section]
  if (open.value[section]) {
    // Only fetch if: the section just opened AND we don't already have data AND not currently loading.
    if (section === 'feed'      && !feedStories.value.length   && !feedLoading.value)    await loadFeed(true)
    if (section === 'podcasts'  && !podcastEpisodes.value.length && !podcastLoading.value) await loadPodcasts()
    if (section === 'today'     && !todayArticle.value && !todayLoading.value) await loadToday()
    if (section === 'quote'     && !quoteOfDay.value   && !quoteLoading.value) await loadQuote()
    if (section === 'litclock'  && !litClockQuote.value && !litClockLoading.value) await fetchLitClock()
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

// ── Literary Clock ────────────────────────────────────────────────────────────
// Data: https://literature-clock.jenevoldsen.com — English quotes keyed to the minute.
const litClockQuote   = ref(null)   // { quote_first, quote_time_case, quote_last, title, author }
const litClockLoading = ref(false)
let   litClockTimer   = null

async function fetchLitClock() {
  litClockLoading.value = true
  try {
    const now = new Date()
    const hh  = String(now.getHours()).padStart(2, '0')
    const mm  = String(now.getMinutes()).padStart(2, '0')
    const res = await fetch(`https://raw.githubusercontent.com/JohannesNE/literature-clock/master/docs/times/${hh}_${mm}.json`)
    if (!res.ok) throw new Error()
    const quotes = await res.json()
    if (quotes?.length) {
      // Pick a random quote from the list for this minute
      litClockQuote.value = quotes[Math.floor(Math.random() * quotes.length)]
    }
  } catch {
    litClockQuote.value = null
  } finally {
    litClockLoading.value = false
  }
}

function startLitClockTimer() {
  // Refresh at the start of every new minute
  const msToNextMinute = (60 - new Date().getSeconds()) * 1000
  litClockTimer = setTimeout(() => {
    fetchLitClock()
    litClockTimer = setInterval(fetchLitClock, 60_000)
  }, msToNextMinute)
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
    { name: 'Kompas',          url: 'https://www.kompas.com',                 lang: 'id' },
    { name: 'BBC Indonesia',   url: 'https://www.bbc.com/indonesia',          lang: 'id' },
    { name: 'Tempo.co',        url: 'https://www.tempo.co',                   lang: 'id' },
    { name: 'The Guardian',    url: 'https://www.theguardian.com/world',      lang: 'en' },
    { name: 'The Economist',   url: 'https://www.economist.com',              lang: 'en' },
    { name: 'Wall Street Journal', url: 'https://www.wsj.com',               lang: 'en' },
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
    { name: 'Bola.com',        url: 'https://www.bola.com',                   lang: 'id' },
  ],
  Tech: [
    { name: 'Wired',           url: 'https://www.wired.com',                  lang: 'en' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com',       lang: 'en' },
    { name: 'Heise Online',    url: 'https://www.heise.de',                   lang: 'de' },
    { name: 'Tom\'s Hardware IT', url: 'https://www.tomshw.it',               lang: 'it' },
    { name: 'Hi-Tech Mail',    url: 'https://hi-tech.mail.ru',                lang: 'ru' },
    { name: 'IT之家',          url: 'https://www.ithome.com',                 lang: 'zh' },
    { name: 'Detikinet',       url: 'https://inet.detik.com',                 lang: 'id' },
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
    { name: 'Nat Geo ID',      url: 'https://www.nationalgeographic.grid.id', lang: 'id' },
  ],
  Cooking: [
    { name: 'Serious Eats',    url: 'https://www.seriouseats.com',             lang: 'en' },
    { name: 'Marmiton',        url: 'https://www.marmiton.org',                lang: 'fr' },
    { name: 'Recetas Gratis',  url: 'https://www.recetasgratis.net',           lang: 'es' },
    { name: 'Giallo Zafferano',url: 'https://www.giallozafferano.it',          lang: 'it' },
    { name: 'Gastronom.ru',    url: 'https://www.gastronom.ru',                lang: 'ru' },
    { name: 'Cookpad JP',      url: 'https://cookpad.com/jp',                  lang: 'ja' },
    { name: '下厨房',           url: 'https://www.xiachufang.com',              lang: 'zh' },
    { name: 'Cookpad ID',      url: 'https://cookpad.com/id',                 lang: 'id' },
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
    { name: 'Wikivoyage JA',  url: 'https://ja.wikivoyage.org',  lang: 'ja',  wikivoyage: true },
    { name: 'Wikivoyage ZH',  url: 'https://zh.wikivoyage.org',  lang: 'zh',  wikivoyage: true },
    { name: 'Wikivoyage EL',  url: 'https://el.wikivoyage.org',  lang: 'el',  wikivoyage: true },
    { name: 'Wikivoyage ID',  url: 'https://id.wikivoyage.org',  lang: 'id',  wikivoyage: true },
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

function importQuote() {
  if (!quoteOfDay.value) return
  pushLocalStory({
    title:   `"${quoteOfDay.value.author}"`,
    content: quoteOfDay.value.quote,
    source:  'Wikiquote',
  })
}

// ── Add story form ─────────────────────────────────────────────
// These refs bind to the form inputs inside the Curated section via v-model.
const expandedBook  = ref(null)    // bookTitle of the currently expanded book card
const customTitle   = ref('')
const customText    = ref('')
const customFranco  = ref('')  // Egyptian Arabic only (shown when lang === 'arz')
const customAuthor  = ref('')  // required before sharing to community
const customSource  = ref('')  // optional attribution URL / publication name
const showShareForm = ref(false) // reveals the author + source fields when sharing
const submitting    = ref(false) // disables the Share button during the Supabase upload

// addLocal() saves the story locally and, if logged in, also syncs to the user's account.
async function addLocal() {
  if (!customTitle.value.trim() || !customText.value.trim()) return
  const storyData = {
    title:   customTitle.value.trim(),
    content: customText.value.trim(),
    franco:  customFranco.value.trim() || null,
  }
  if (props.currentUser) {
    const saved = await saveUserStory({ ...storyData, lang: props.lang })
    if (saved) {
      // Use the server-assigned UUID as the id so progress tracking works across devices
      const story = { ...saved, local: true }
      localStories.value.push(story)
      localStorage.setItem('szol_local_stories', JSON.stringify(localStories.value))
      emitLoad(story)
      clearForm()
      return
    }
  }
  pushLocalStory(storyData)
  clearForm()
}

// shareGlobal() is a two-step process:
//   Step 1 (first click): reveal the author/source fields, pre-fill author with username.
//   Step 2 (second click, form already open): validate and submit.
// This ensures users always see what name will be published before it goes live.
async function shareGlobal() {
  if (!customTitle.value.trim() || !customText.value.trim()) {
    alert('Please add a title and text first.')
    return
  }
  if (!showShareForm.value) {
    // Step 1: show the form, pre-fill author so the user can review/change it.
    customAuthor.value = props.currentUser?.username ?? ''
    showShareForm.value = true
    return
  }
  // Step 2: submit.
  submitting.value = true
  try {
    const story = await submitStory({
      title:    customTitle.value.trim(),
      content:  customText.value.trim(),
      franco:   customFranco.value.trim() || null,
      lang:     props.lang,
      author:   customAuthor.value.trim() || null,
      source:   customSource.value.trim() || null,
      reviewed: false,
    })
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
