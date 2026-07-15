import type { Msg, SnipRect } from '../lib/messages'
import { copyCurrentCapture } from './clipboard'
import { toast } from './toast'

const OVERLAY_ID = 'snapsend-snip-host'

const CSS = `
:host { all: initial; }
.cover {
  position: fixed; inset: 0; z-index: 2147483647;
  cursor: crosshair; user-select: none; touch-action: none;
}
.dim { position: absolute; inset: 0; background: rgba(0,0,0,.35); }
.sel {
  position: absolute; display: none;
  border: 1px solid #FFB020;
  box-shadow: 0 0 0 100000px rgba(0,0,0,.35);
}
.hint {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  background: #1A1C22; color: #F5F6F8;
  border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
  padding: 8px 14px; font: 400 13px/1 system-ui, sans-serif;
}
`

export function startSnip(): void {
  if (document.getElementById(OVERLAY_ID)) return
  const el = document.createElement('div')
  el.id = OVERLAY_ID
  const shadow = el.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>
    <div class="cover">
      <div class="dim"></div>
      <div class="sel"></div>
      <div class="hint">Drag to snip &#183; Esc to cancel</div>
    </div>`
  document.documentElement.append(el)

  const cover = shadow.querySelector<HTMLElement>('.cover')
  const dim = shadow.querySelector<HTMLElement>('.dim')
  const sel = shadow.querySelector<HTMLElement>('.sel')
  const hint = shadow.querySelector<HTMLElement>('.hint')
  if (!cover || !dim || !sel || !hint) return

  let start: { x: number; y: number } | null = null
  let rect: SnipRect | null = null

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') cancel()
  }
  const cancel = () => {
    document.removeEventListener('keydown', onKey, true)
    el.remove()
  }
  document.addEventListener('keydown', onKey, true)

  cover.addEventListener('pointerdown', (ev) => {
    start = { x: ev.clientX, y: ev.clientY }
    dim.style.display = 'none'
    hint.style.display = 'none'
    sel.style.display = 'block'
    cover.setPointerCapture(ev.pointerId)
  })
  cover.addEventListener('pointermove', (ev) => {
    if (!start) return
    rect = normalize(start, ev.clientX, ev.clientY)
    sel.style.left = `${rect.x}px`
    sel.style.top = `${rect.y}px`
    sel.style.width = `${rect.w}px`
    sel.style.height = `${rect.h}px`
  })
  cover.addEventListener('pointerup', () => {
    const done = rect
    cancel()
    if (!done || done.w < 4 || done.h < 4) return
    requestCapture(done)
  })
}

function normalize(start: { x: number; y: number }, x: number, y: number): SnipRect {
  return {
    x: Math.min(start.x, x),
    y: Math.min(start.y, y),
    w: Math.abs(x - start.x),
    h: Math.abs(y - start.y),
  }
}

function requestCapture(rect: SnipRect): void {
  // Two frames so the overlay is gone before the tab is captured — raced
  // against a timeout because rAF stalls completely in occluded/background
  // windows and would silently swallow the capture.
  let fired = false
  const go = () => {
    if (fired) return
    fired = true
    sendCapture(rect)
  }
  requestAnimationFrame(() => requestAnimationFrame(go))
  setTimeout(go, 150)
}

function sendCapture(rect: SnipRect): void {
  const msg: Msg = { type: 'snip-capture', rect, dpr: window.devicePixelRatio }
  chrome.runtime.sendMessage(msg).then(
    (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) {
        toast(res?.error ?? 'Capture failed — try again')
        return
      }
      copyCurrentCapture().then(
        () => toast('Captured ✓ copied — paste anywhere, or pick an app on the bar'),
        () => toast('Captured ✓ — pick an app on the bar to send it'),
      )
    },
    () => toast('Capture failed — try again'),
  )
}
