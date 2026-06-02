<!-- App.vue is the root component -- the outermost shell that holds everything else. -->
<!-- Every Vue file has three sections: <template> (HTML), <script> (JS logic), <style> (CSS). -->
<template>
  <!-- The outermost div wraps the whole page. -->
  <!-- "min-h-screen" = minimum height of 100% of the screen height (Tailwind CSS class). -->
  <!-- "bg-white text-gray-900" = white background, dark gray text (Tailwind CSS). -->
  <div class="min-h-screen bg-white text-gray-900">

    <!-- NavBar is a component defined in src/components/NavBar.vue. -->
    <!-- :active="activeTab" passes the activeTab variable as a prop called "active". -->
    <!--   The : prefix (colon) means the value is a JavaScript expression, not a plain string. -->
    <!-- :lang="activeLang" passes the currently selected language code. -->
    <!-- @tab="activeTab = $event" listens for the 'tab' event emitted by NavBar. -->
    <!--   @ prefix means "listen for this event". $event holds whatever the event sent. -->
    <!-- @lang="activeLang = $event" listens for language change events from NavBar. -->
    <NavBar
      :active="activeTab"
      :lang="activeLang"
      @tab="activeTab = $event"
      @lang="activeLang = $event"
    />

    <!-- <main> is an HTML semantic element meaning "the main content area of the page". -->
    <!-- "max-w-3xl" = maximum width of 48rem (Tailwind). "mx-auto" = centered horizontally. -->
    <!-- "px-4 py-6" = horizontal padding 1rem, vertical padding 1.5rem (Tailwind). -->
    <main class="max-w-3xl mx-auto px-4 py-6">

      <!-- v-if shows this component ONLY when activeTab equals 'read'. -->
      <!-- When the condition is false, the component is removed from the page entirely. -->
      <!-- :story="currentStory" passes the loaded story object as a prop. -->
      <!-- :saved-words="savedWordSet" passes the Set of already-saved word keys. -->
      <!-- @go="activeTab = $event" lets ReadView navigate to another tab (e.g. 'retype'). -->
      <!-- @save-word="addToVocab" calls addToVocab() when the user saves a word. -->
      <ReadView
        v-if="activeTab === 'read'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordSet"
        @go="activeTab = $event"
        @save-word="addToVocab"
      />

      <!-- RetypeView shows the typing practice for the current story. -->
      <RetypeView
        v-if="activeTab === 'retype'"
        :story="currentStory"
        :lang="activeLang"
      />

      <!-- SpeakView shows the pronunciation / speech recognition practice. -->
      <SpeakView
        v-if="activeTab === 'speak'"
        :story="currentStory"
        :lang="activeLang"
      />

      <!-- WriteView shows the handwriting / stroke order practice. -->
      <WriteView
        v-if="activeTab === 'write'"
        :story="currentStory"
        :lang="activeLang"
      />

      <!-- LibraryView shows the list of stories to choose from. -->
      <!-- @load="loadStory" calls loadStory() when the user picks a story. -->
      <LibraryView
        v-if="activeTab === 'library'"
        :lang="activeLang"
        :current="currentStory"
        @load="loadStory"
      />

      <!-- VocabView shows the user's saved vocabulary words. -->
      <!-- :words="vocabBank" passes the array of saved words. -->
      <!-- @remove="vocabBank.splice($event, 1)" removes one word by its index in the array. -->
      <!--   .splice(index, 1) removes 1 item at the given index. $event is the index number. -->
      <!-- @save-word listens for words clicked inside Tatoeba examples in VocabView. -->
      <!-- addToVocab() is the same handler used by ReadView -- deduplication is built in. -->
      <VocabView
       v-if="activeTab === 'vocab'"
       :words="vocabBank"
       :lang="activeLang"
       @remove="vocabBank.splice($event, 1)"
       @save-word="addToVocab"
      />

      <!-- SettingsView shows the voice preferences screen (opened via the ⚙ gear button). -->
      <SettingsView v-if="activeTab === 'settings'" />

    </main>
  </div>
</template>

<script setup>
// Import reactive utilities from Vue:
// ref      = creates a reactive variable (changes trigger re-renders)
// computed = creates a value that auto-recalculates when its dependencies change
// watch    = runs code whenever a reactive value changes
import { ref, computed, watch } from 'vue'

// Import all the view and component files used in the template above.
import NavBar      from './components/NavBar.vue'
import ReadView    from './views/ReadView.vue'
import RetypeView  from './views/RetypeView.vue'
import LibraryView from './views/LibraryView.vue'
import VocabView   from './views/VocabView.vue'
import SpeakView   from './views/SpeakView.vue'
import WriteView   from './views/WriteView.vue'
import SettingsView from './views/SettingsView.vue'

// activeTab controls which view is visible. Starts on 'library' so the user picks a story first.
const activeTab = ref('library')

// activeLang stores the currently selected language code (e.g. 'es', 'el', 'zh').
const activeLang = ref('es')

// currentStory holds the story object the user is currently working with (or null if none selected).
const currentStory = ref(null)

// vocabBank is the list of words the user has saved.
// JSON.parse(...) converts the stored JSON string back to a JavaScript array.
// localStorage.getItem('szol_vocab') reads the saved words from the browser's local storage.
// || '[]' means: if nothing is saved yet, use an empty array as the default.
const vocabBank = ref(JSON.parse(localStorage.getItem('szol_vocab') || '[]'))

// watch() monitors vocabBank for any changes and runs a function whenever it changes.
// (val) => { ... } is an arrow function -- shorthand for function(val) { ... }.
// val is the new value of vocabBank.
// localStorage.setItem() writes data to the browser's local storage under the given key.
// JSON.stringify() converts the JavaScript array to a JSON string for storage.
// { deep: true } means watch for changes INSIDE the array (not just the array reference itself).
//   Without deep:true, adding/removing items wouldn't trigger the watch.
watch(vocabBank, (val) => {
  localStorage.setItem('szol_vocab', JSON.stringify(val))
}, { deep: true })

// savedWordSet is a computed Set of normalized word keys for fast "is this word already saved?" lookups.
// computed() re-runs automatically whenever vocabBank changes.
// new Set([...]) creates a Set -- like an array but with no duplicates and O(1) lookup speed.
//   O(1) = "order 1" = constant time, meaning it's instant regardless of how many words are saved.
// .map(v => ...) transforms each item in the array to something else.
//   Here each vocab entry (v) is converted to its normalized lowercase key.
// .toLowerCase() converts to lowercase so 'Hello' and 'hello' are treated as the same word.
// .replace(/[^\p{L}\p{M}]/gu, '') removes non-letter characters (punctuation, numbers).
const savedWordSet = computed(() =>
  new Set(vocabBank.value.map(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')))
)

// loadStory() is called when the user picks a story from the Library.
// It sets the current story, updates the language, and navigates to the Read tab.
function loadStory(story) {
  currentStory.value = story       // save the selected story object
  activeLang.value   = story.lang  // switch the active language to match the story
  activeTab.value    = 'read'      // navigate to the Read view
}

// addToVocab() adds a word to the vocab bank, but only if it's not already saved.
// "entry" is an object like { word: 'hola', lang: 'es', sentence: '...', story: '...' }.
function addToVocab(entry) {
  // Normalize the new word to its "key" form for comparison.
  const key = entry.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  // .some() returns true if ANY item in the array passes the test.
  //   Here: check if any existing saved word has the same key (prevents duplicates).
  if (!vocabBank.value.some(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key)) {
    // .push() appends the new entry to the end of the vocabBank array.
    vocabBank.value.push(entry)
  }
}
</script>
