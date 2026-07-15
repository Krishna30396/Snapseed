// Record card: mic toggle → Start (the user gesture getDisplayMedia needs) →
// countdown pill → webm preview → convert to mp4 (progress) → Save.

import { webmToMp4 } from '../lib/ffmpeg'
import { startRecording, type RecordingHandle } from '../lib/recorder'

export function mountRecordUI(host: HTMLElement, onStatus: (text: string) => void): void {
  host.innerHTML = `
    <div class="rec-card">
      <p class="hint">Record your screen (up to 3 minutes)</p>
      <label class="rec-mic"><input type="checkbox" class="mic" /> Include microphone</label>
      <div class="actions">
        <button class="primary rec-start">Start recording</button>
        <button class="rec-stop" hidden>Stop</button>
        <span class="rec-count" hidden></span>
      </div>
      <div class="rec-result" hidden>
        <video class="rec-video" controls></video>
        <div class="actions">
          <button class="primary rec-convert">Convert to MP4</button>
          <a class="tool rec-save" download="snapsend.webm">Save video</a>
        </div>
        <progress class="rec-progress" max="1" value="0" hidden></progress>
      </div>
    </div>`

  const el = <T extends HTMLElement>(sel: string) => host.querySelector<T>(sel)
  const start = el<HTMLButtonElement>('.rec-start')
  const stop = el<HTMLButtonElement>('.rec-stop')
  const count = el<HTMLElement>('.rec-count')
  let handle: RecordingHandle | null = null

  start?.addEventListener('click', () => {
    const mic = el<HTMLInputElement>('.mic')?.checked ?? false
    startRecording({ mic, onTick: (msLeft) => showCountdown(count, msLeft) }).then(
      (h) => {
        handle = h
        toggle(start, stop, count, true)
        h.done.then(
          (webm) => finish(host, webm, onStatus),
          () => onStatus('Recording failed — try again'),
        )
      },
      () => onStatus(mic ? 'Screen or mic access was declined' : 'Screen access was declined'),
    )
  })
  stop?.addEventListener('click', () => handle?.stop())
}

function toggle(
  start: HTMLElement | null,
  stop: HTMLElement | null,
  count: HTMLElement | null,
  recording: boolean,
): void {
  if (start) start.hidden = recording
  if (stop) stop.hidden = !recording
  if (count) count.hidden = !recording
}

function showCountdown(count: HTMLElement | null, msLeft: number): void {
  if (!count) return
  const s = Math.ceil(msLeft / 1000)
  count.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`
}

function finish(host: HTMLElement, webm: Blob, onStatus: (t: string) => void): void {
  const result = host.querySelector<HTMLElement>('.rec-result')
  const video = host.querySelector<HTMLVideoElement>('.rec-video')
  const save = host.querySelector<HTMLAnchorElement>('.rec-save')
  const convert = host.querySelector<HTMLButtonElement>('.rec-convert')
  const progress = host.querySelector<HTMLProgressElement>('.rec-progress')
  toggle(host.querySelector('.rec-start'), host.querySelector('.rec-stop'), host.querySelector('.rec-count'), false)
  if (!result || !video || !save || !convert || !progress) return
  result.hidden = false
  video.src = URL.createObjectURL(webm)
  save.href = video.src
  onStatus('Recording ready — preview below')

  convert.addEventListener('click', () => {
    convert.disabled = true
    progress.hidden = false
    onStatus('Converting to MP4…')
    webmToMp4(webm, (r) => {
      progress.value = r
    }).then(
      (mp4) => {
        const url = URL.createObjectURL(mp4)
        video.src = url
        save.href = url
        save.download = 'snapsend.mp4'
        save.textContent = 'Save MP4'
        progress.hidden = true
        onStatus(`MP4 ready — ${(mp4.size / 1024 / 1024).toFixed(1)}MB`)
      },
      (err: unknown) => {
        console.error('[SnapSend] conversion failed', err)
        convert.disabled = false
        progress.hidden = true
        onStatus('Conversion failed — the webm is still saveable')
      },
    )
  })
}
