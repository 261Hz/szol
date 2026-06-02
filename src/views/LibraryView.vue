<!-- LibraryView.vue: shows the list of available stories and a form to add your own. -->
<!-- Stories come from three sources: Supabase (curated), Supabase (community), and localStorage (local). -->
<template>
  <!-- Outer container stacks everything vertically. -->
  <div class="flex flex-col gap-6">

    <!-- Loading state: shown while waiting for stories to download from Supabase. -->
    <!-- v-if="loading" = show this section while loading is true. -->
    <div v-if="loading" class="text-gray-400 text-sm text-center py-12">
      {{ t(lang, 'loading') }}
    </div>

    <!-- Story list: shown once loading is complete. -->
    <!-- v-else = shown when v-if above is false (i.e. loading is done). -->
    <div v-else class="flex flex-col gap-2">
      <!-- v-for loops over the "filtered" array (stories for the current language). -->
      <!-- ":key="story.id"" gives each item a unique key for Vue's rendering engine. -->
      <!-- @click="$emit('load', story)" tells App.vue to load this story. -->
      <!-- :class="[...]" applies different styles based on whether this is the selected story. -->
      <!-- current?.id = optional chaining: safely gets .id even if current is null. -->
      <div
        v-for="story in filtered"
        :key="story.id"
        @click="$emit('load', story)"
        :class="[
          'p-3 rounded-lg border cursor-pointer transition-all',
          current?.id === story.id
            ? 'border-emerald-400 bg-emerald-50'   // selected story: green highlight
            : 'border-gray-200 hover:border-emerald-300' // unselected: gray border, green on hover
        ]"
      >
        <!-- Story title. RTL direction applied for Arabic/Hebrew stories. -->
        <!-- story.lang = the story's own language (may differ from the active UI language). -->
        <div
          class="font-medium text-sm"
          :class="{ 'text-right': isRTL(story.lang) }"
          :dir="isRTL(story.lang) ? 'rtl' : 'ltr'"
        >
          {{ story.title }}
        </div>
        <!-- Metadata row: language name, word count, author, and source tags. -->
        <!-- "flex-wrap" allows tags to wrap to a new line if there are too many. -->
        <div class="flex gap-2 mt-1 flex-wrap">
          <!-- Language name (e.g. "Ελληνικά"). -->
          <!-- ?. = optional chaining in case LANGS doesn't have this language code. -->
          <span class="text-xs text-gray-400">{{ LANGS[story.lang]?.name }}</span>
          <span class="text-xs text-gray-400">·</span>
          <!-- Word count: split on whitespace to count words. .length = number of items in array. -->
          <span class="text-xs text-gray-400">{{ story.text.split(/\s+/).length }} {{ t(lang, 'words') }}</span>
          <!-- Author: only shown if the story has one. -->
          <span v-if="story.author" class="text-xs text-gray-400">· {{ story.author }}</span>
          <!-- Source tag: "curated" stories have a sequence_order number set. -->
          <span v-if="story.sequence_order" class="text-xs text-emerald-500">{{ t(lang, 'curated') }}</span>
          <!-- "community" tag: community=true is set when we retrieve from community_stories. -->
          <span v-if="story.community" class="text-xs text-blue-400">{{ t(lang, 'community') }}</span>
          <!-- "local" tag: set when the user added the story themselves. -->
          <span v-if="story.local" class="text-xs text-gray-400">{{ t(lang, 'local') }}</span>
          <!-- "franco" tag: story has an alternate Latin-alphabet version. -->
          <span v-if="story.franco" class="text-xs text-orange-400">franco</span>
        </div>
      </div>
    </div>

    <!-- Add your own story form. -->
    <!-- Always visible (not conditional on loading). -->
    <div class="border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
      <!-- Form section heading. -->
      <!-- "uppercase tracking-wide" = all-caps with wide letter spacing (small header style). -->
      <div class="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {{ t(lang, 'addStory') }}
      </div>

      <!-- Story title input field. -->
      <!-- v-model="customTitle" creates two-way binding: the input and the variable stay in sync. -->
      <!-- :placeholder="t(lang, 'titleHere')" shows translated placeholder text. -->
      <!-- "outline-none focus:border-emerald-400" removes default outline, adds green border on focus. -->
      <input
        v-model="customTitle"
        type="text"
        :placeholder="t(lang, 'titleHere')"
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />

      <!-- Story text textarea (multi-line text input). -->
      <!-- rows="4" makes the textarea 4 lines tall by default. -->
      <!-- "resize-none" prevents the user from resizing the textarea. -->
      <textarea
        v-model="customText"
        rows="4"
        :placeholder="t(lang, 'pasteStory')"
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400 resize-none"
      />

      <!-- Franco/transliteration input: only shown for Egyptian Arabic (arz). -->
      <!-- v-if="lang === 'arz'" = only rendered if current language is Egyptian Arabic. -->
      <input
        v-if="lang === 'arz'"
        v-model="customFranco"
        type="text"
        placeholder="Franco transliteration (optional)..."
        class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
      />

      <!-- Extra fields for sharing with the community (name + source attribution). -->
      <!-- Only shown after the user clicks "Share with community" without filling in their name. -->
      <div v-if="showShareForm" class="flex flex-col gap-2 border-t border-gray-100 pt-3">
        <div class="text-xs text-gray-500">{{ t(lang, 'shareRequired') }}</div>
        <!-- Author name field. -->
        <input
          v-model="customAuthor"
          type="text"
          :placeholder="t(lang, 'authorHere')"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        <!-- Source / attribution field (e.g. "Original", "Gutenberg"). -->
        <input
          v-model="customSource"
          type="text"
          :placeholder="t(lang, 'sourceHere')"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      <!-- Action buttons row, right-aligned. -->
      <div class="flex items-center justify-end gap-2">
        <!-- "Save locally" button: saves to the user's browser only (not uploaded anywhere). -->
        <button
          @click="addLocal"
          class="text-sm px-4 py-1.5 rounded-md border border-gray-200 hover:border-emerald-400 transition-all"
        >
          {{ t(lang, 'saveLocal') }}
        </button>
        <!-- "Share with community" button: uploads the story to Supabase for others to see. -->
        <!-- :disabled="submitting" grays out the button while the upload is in progress. -->
        <button
          @click="shareGlobal"
          :disabled="submitting"
          class="text-sm px-4 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all"
        >
          <!-- Ternary: show "Sharing…" while submitting, otherwise show normal label. -->
          {{ submitting ? t(lang, 'sharing') : t(lang, 'shareGlobal') }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
// ref = reactive variable. computed = auto-updating value. onMounted = run after component appears.
import { ref, computed, onMounted } from 'vue'
import { LANGS } from '../data/stories.js'
import { isRTL } from '../utils/rtl.js'
import { t }     from '../utils/i18n.js'
// Import Supabase functions for fetching and submitting stories.
import { fetchCommunityStories, submitStory, fetchCuratedStories } from '../utils/supabase.js'

// This component receives two props from App.vue:
// lang: the active language code (for filtering stories and translating labels).
// current: the currently loaded story object (for highlighting the selected card).
const props = defineProps({
  lang:    String,
  current: Object,
})

// This component can send one event to App.vue:
// 'load' = emitted when the user clicks a story card, carries the story object.
defineEmits(['load'])

// loading is true while waiting for stories to download from Supabase.
const loading           = ref(true)
// Three separate arrays for the three story sources.
const curatedStories    = ref([]) // official stories from the 'curated_stories' Supabase table
const localStories      = ref([]) // user's own stories stored in localStorage
const communityStories  = ref([]) // stories shared by other users from 'community_stories' table

// Form input bindings (v-model binds these to the input fields in the template).
const customTitle  = ref('') // the title field
const customText   = ref('') // the story text field
const customFranco = ref('') // franco/transliteration field (Egyptian Arabic only)
const customAuthor = ref('') // author name field (for sharing)
const customSource = ref('') // source attribution field (for sharing)
// Controls whether the extra name+source fields appear.
const showShareForm = ref(false)
// True while a story is being uploaded to Supabase.
const submitting    = ref(false)

// onMounted: runs once when this component appears on screen.
// async/await is used because fetching from Supabase takes time (it's a network request).
onMounted(async () => {
  // Load local stories from localStorage (browser storage -- instant, no network).
  const saved = localStorage.getItem('szol_local_stories')
  // If something was saved before, parse it from JSON string back to array.
  if (saved) localStories.value = JSON.parse(saved)

  // Fetch curated AND community stories from Supabase at the same time (in parallel).
  // Promise.all() runs both fetches simultaneously and waits for BOTH to finish.
  // Array destructuring: [curated, community] = assigns each result to its own variable.
  const [curated, community] = await Promise.all([
    fetchCuratedStories(),
    fetchCommunityStories(),
  ])
  curatedStories.value   = curated   // store curated stories
  communityStories.value = community // store community stories
  loading.value          = false     // hide the loading message
})

// filtered = only the stories that match the currently selected language.
// Combines all three story sources into one big list, then filters.
const filtered = computed(() => {
  // Spread operator (...) copies all items from each array into a new combined array.
  const all = [...curatedStories.value, ...localStories.value, ...communityStories.value]
  // .filter() keeps only stories where story.lang equals the currently selected language.
  return all.filter(s => s.lang === props.lang)
})

// addLocal() saves a new story to localStorage only (no upload).
function addLocal() {
  // Validate: don't save if title or text is empty.
  // .trim() removes whitespace. An empty or whitespace-only string is falsy.
  if (!customTitle.value.trim() || !customText.value.trim()) return
  const story = {
    id:     'l' + Date.now(), // unique ID: 'l' prefix + current timestamp in milliseconds
    title:  customTitle.value.trim(),
    text:   customText.value.trim(),
    franco: customFranco.value.trim() || null, // null if no franco text provided
    lang:   props.lang, // use the currently active language
    local:  true,       // mark as a local story (shows 'local' tag)
  }
  localStories.value.push(story) // add to the reactive array (triggers re-render)
  // Save the updated list to localStorage as a JSON string.
  localStorage.setItem('szol_local_stories', JSON.stringify(localStories.value))
  clearForm() // reset all form fields
}

// shareGlobal() uploads the story to the community_stories table in Supabase.
// "async" because the upload takes time.
async function shareGlobal() {
  // Validate title and text.
  if (!customTitle.value.trim() || !customText.value.trim()) {
    alert('Please add a title and text first.')
    return
  }
  // If no author name yet, show the share form to collect it.
  if (!customAuthor.value.trim()) {
    showShareForm.value = true
    return
  }
  submitting.value = true // disable the button and show "Sharing…"
  try {
    // submitStory() sends the story to Supabase and returns the saved record (with an ID).
    const story = await submitStory({
      title:    customTitle.value.trim(),
      text:     customText.value.trim(),
      franco:   customFranco.value.trim() || null,
      lang:     props.lang,
      author:   customAuthor.value.trim() || 'Anonymous', // default author name
      source:   customSource.value.trim() || 'Original',  // default source
      reviewed: false, // new submissions start as unreviewed
    })
    // Add the story to the local community list immediately (so it appears in the library now).
    // .unshift() adds to the BEGINNING of the array (so it shows at the top).
    // { ...story, community: true } spreads all story properties and adds the community flag.
    communityStories.value.unshift({ ...story, community: true })
    clearForm()
    showShareForm.value = false
    alert('Story shared with the community!')
  } catch (e) {
    // e.message = the error message from the exception.
    alert('Error submitting story: ' + e.message)
  }
  submitting.value = false // re-enable the button
}

// clearForm() resets all form input fields to empty strings.
function clearForm() {
  customTitle.value  = ''
  customText.value   = ''
  customFranco.value = ''
  customAuthor.value = ''
  customSource.value = ''
}
</script>
