// Convert a MediaRecorder Blob to a mono Float32Array at 16 kHz,
// which is the exact format Whisper expects.
export async function blobToWhisperBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioCtx()
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  ctx.close()

  const targetLen = Math.ceil(decoded.duration * 16000)
  if (targetLen === 0) throw new Error('Empty audio')

  const offline = new OfflineAudioContext(1, targetLen, 16000)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()

  const resampled = await offline.startRendering()
  return resampled.getChannelData(0)
}
