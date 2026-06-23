import { ref, onUnmounted } from 'vue'
import { translate, onProgress } from '../utils/localTranslator.js'

export function useLocalTranslator() {
  const isTranslating  = ref(false)
  const isDownloading  = ref(false)
  const downloadPct    = ref(0)
  const downloadLabel  = ref('')

  let pendingFiles = 0
  let doneFiles    = 0

  const removeListener = onProgress((info) => {
    if (info.status === 'initiate') {
      pendingFiles++
      isDownloading.value = true
    } else if (info.status === 'progress') {
      isDownloading.value = true
      downloadPct.value   = Math.round(info.progress ?? 0)
      downloadLabel.value = info.file ?? ''
    } else if (info.status === 'done') {
      doneFiles++
      if (doneFiles >= pendingFiles) {
        downloadPct.value   = 100
        downloadLabel.value = ''
        setTimeout(() => { isDownloading.value = false; doneFiles = 0; pendingFiles = 0 }, 600)
      }
    }
  })

  onUnmounted(removeListener)

  async function translateText(text, srcLang, tgtLang = 'en') {
    if (!text?.trim()) return ''
    isTranslating.value = true
    try {
      return await translate(text.trim(), srcLang, tgtLang)
    } finally {
      isTranslating.value = false
    }
  }

  return { translateText, isTranslating, isDownloading, downloadPct, downloadLabel }
}
