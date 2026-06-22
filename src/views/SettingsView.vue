<template>
  <div class="flex flex-col gap-6">

    <!-- ── Messaging Settings ── -->
    <div class="flex flex-col gap-3">
      <div class="text-sm font-medium text-gray-200">{{ t(lang, 'messaging') }}</div>

      <div v-if="!currentUser" class="text-xs text-gray-500">
        <button @click="$emit('openAuth')" class="underline hover:text-green-400 transition-all">
          {{ t(lang, 'loginToManageMsg') }}
        </button>
      </div>

      <template v-else>
        <!-- Open to messages toggle -->
        <div class="flex items-start justify-between gap-4 py-3 border border-gray-700 rounded-lg px-4">
          <div class="flex flex-col gap-0.5">
            <div class="text-sm text-gray-200">{{ t(lang, 'openToVoice') }}</div>
            <div class="text-xs text-gray-500" v-html="voiceDescHtml" />
          </div>
          <button
            @click="toggleMessages"
            :class="[
              'relative flex-shrink-0 w-11 h-6 rounded-full transition-all',
              openToMessages ? 'bg-green-600' : 'bg-gray-700'
            ]"
          >
            <span :class="['absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all', openToMessages ? 'translate-x-5' : '']" />
          </button>
        </div>

        <div v-if="settingsError" class="text-xs text-red-400">{{ settingsError }}</div>
      </template>
    </div>

    <!-- ── Danger Zone ── -->
    <div v-if="currentUser" class="flex flex-col gap-3 border border-red-900 rounded-lg p-4">
      <div class="text-sm font-medium text-red-400">{{ t(lang, 'dangerZone') }}</div>
      <p class="text-xs text-gray-500">{{ t(lang, 'deleteAccountDesc') }}</p>
      <button
        v-if="!confirmDelete"
        @click="confirmDelete = true"
        class="self-start text-sm px-4 py-1.5 rounded-md border border-red-800 text-red-400 hover:bg-red-950 transition-all"
      >{{ t(lang, 'deleteAccount') }}</button>
      <div v-else class="flex flex-col gap-2">
        <p class="text-xs text-red-400 font-medium">{{ t(lang, 'areYouSure') }}</p>
        <div class="flex gap-2">
          <button
            @click="doDelete"
            :disabled="deleting"
            class="text-sm px-4 py-1.5 rounded-md bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 transition-all"
          >{{ deleting ? t(lang, 'deleting') : t(lang, 'yesDelete') }}</button>
          <button
            @click="confirmDelete = false"
            class="text-sm px-4 py-1.5 rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 transition-all"
          >{{ t(lang, 'cancel') }}</button>
        </div>
        <div v-if="deleteError" class="text-xs text-red-400">{{ deleteError }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { LANGS } from '../data/stories.js'
import { updateSettings, deleteAccount, logout } from '../utils/api.js'
import { t } from '../utils/i18n.js'

const props = defineProps({ currentUser: Object, lang: String })
const emit  = defineEmits(['openAuth', 'userUpdated', 'logout'])

const openToMessages = ref(props.currentUser?.open_to_messages ?? false)
const settingsError  = ref('')
const confirmDelete  = ref(false)
const deleting       = ref(false)
const deleteError    = ref('')

const voiceDescHtml = computed(() => {
  const langName = LANGS[props.currentUser?.native_lang]?.name ?? props.currentUser?.native_lang ?? ''
  return t(props.lang, 'voiceDesc').replace(
    '[language]',
    `<strong class="text-gray-300">${langName}</strong>`
  )
})

async function toggleMessages() {
  const next = !openToMessages.value
  try {
    const updated = await updateSettings({ open_to_messages: next })
    openToMessages.value = updated.open_to_messages
    emit('userUpdated', updated)
    settingsError.value = ''
  } catch {
    settingsError.value = t(props.lang, 'errorTryAgain')
  }
}

async function doDelete() {
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteAccount()
    logout()
    emit('logout')
  } catch {
    deleteError.value = t(props.lang, 'errorTryAgain')
    deleting.value = false
  }
}

</script>
