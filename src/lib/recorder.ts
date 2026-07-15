// Screen recorder: getDisplayMedia (+ optional mic, mixed via AudioContext),
// MediaRecorder → webm, hard 3-minute cap with a countdown callback.

export const MAX_RECORD_MS = 3 * 60 * 1000

export interface RecordingHandle {
  stop(): void
  /** resolves with the finished webm when recording ends (stop, cap, or the
   *  browser's own "stop sharing" bar) */
  done: Promise<Blob>
}

export interface RecordOptions {
  mic: boolean
  onTick?: (msLeft: number) => void
}

export async function startRecording(opts: RecordOptions): Promise<RecordingHandle> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  const stream = opts.mic ? await withMic(display) : display

  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (ev) => {
    if (ev.data.size) chunks.push(ev.data)
  }

  const startedAt = Date.now()
  const ticker = setInterval(() => {
    opts.onTick?.(Math.max(0, MAX_RECORD_MS - (Date.now() - startedAt)))
  }, 500)
  const capTimer = setTimeout(() => stop(), MAX_RECORD_MS)

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(ticker)
    clearTimeout(capTimer)
    if (recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach((t) => t.stop())
    display.getTracks().forEach((t) => t.stop())
  }
  // browser's native "Stop sharing" ends the video track
  display.getVideoTracks()[0]?.addEventListener('ended', stop)

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
    recorder.onerror = () => {
      stop()
      reject(new Error('recording failed'))
    }
  })

  recorder.start(1000)
  return { stop, done }
}

/** Mix mic audio into the display stream. If the mic is unavailable the
 *  recording proceeds without it — the caller surfaces that in the UI. */
async function withMic(display: MediaStream): Promise<MediaStream> {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  for (const s of [display, mic]) {
    if (s.getAudioTracks().length) ctx.createMediaStreamSource(s).connect(dest)
  }
  const video = display.getVideoTracks()[0]
  if (!video) throw new Error('no video track')
  return new MediaStream([video, ...dest.stream.getAudioTracks()])
}
