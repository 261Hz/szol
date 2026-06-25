import { Capacitor, registerPlugin } from '@capacitor/core'

const SpeechPlugin = registerPlugin('Speech')

export const isNative = Capacitor.isNativePlatform()

let partialListener = null

export async function startNativeRecognition(lang, onPartial) {
  if (partialListener) { partialListener.remove(); partialListener = null }
  partialListener = await SpeechPlugin.addListener('partialResult', ({ transcript }) => {
    onPartial(transcript)
  })
  const result = await SpeechPlugin.startRecognition({ lang })
  if (partialListener) { partialListener.remove(); partialListener = null }
  return result.transcript
}

export async function stopNativeRecognition() {
  await SpeechPlugin.stopRecognition()
}
