<template>
  <div class="min-h-screen bg-white text-gray-900">
    
    <NavBar
      :active="activeTab"
      :lang="activeLang"
      @tab="activeTab = $event"
      @lang="activeLang = $event"
    />

    <main class="max-w-3xl mx-auto px-4 py-6">
      <p class="text-gray-400 text-sm">{{ activeTab }} — {{ activeLang }}</p>
    </main>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from './components/NavBar.vue'

const activeTab = ref('read')
const activeLang = ref('es')
</script>