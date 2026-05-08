<template>
  <div class="min-h-screen bg-white text-gray-900">

    <NavBar
      :active="activeTab"
      :lang="activeLang"
      @tab="activeTab = $event"
      @lang="activeLang = $event"
    />

    <main class="max-w-3xl mx-auto px-4 py-6">

      <ReadView
        v-if="activeTab === 'read'"
        :story="currentStory"
        :lang="activeLang"
        :saved-words="savedWordSet"
        @go="activeTab = $event"
        @save-word="addToVocab"
      />

      <RetypeView
        v-if="activeTab === 'retype'"
        :story="currentStory"
        :lang="activeLang"
      />

      <LibraryView
        v-if="activeTab === 'library'"
        :lang="activeLang"
        :current="currentStory"
        @load="loadStory"
      />

      <VocabView
       v-if="activeTab === 'vocab'"
       :words="vocabBank"
       :lang="activeLang"
       @remove="vocabBank.splice($event, 1)"
      />

    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import NavBar from './components/NavBar.vue'
import ReadView from './views/ReadView.vue'
import RetypeView from './views/RetypeView.vue'
import LibraryView from './views/LibraryView.vue'
import VocabView from './views/VocabView.vue'

const activeTab = ref('library')
const activeLang = ref('es')
const currentStory = ref(null)
const vocabBank = ref([])

const savedWordSet = computed(() =>
  new Set(vocabBank.value.map(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')))
)

function loadStory(story) {
  currentStory.value = story
  activeLang.value = story.lang
  activeTab.value = 'read'
}

function addToVocab(entry) {
  const key = entry.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')
  if (!vocabBank.value.some(v => v.word.toLowerCase().replace(/[^\p{L}\p{M}]/gu, '') === key)) {
    vocabBank.value.push(entry)
  }
}
</script>