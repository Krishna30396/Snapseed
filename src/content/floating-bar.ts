import { CURRENT_CAPTURE_KEY, type DraftPlatform, type PlatformId } from '../lib/messages'
import { type BarState, getBarState, setBarState } from '../lib/storage'
import { copyCurrentCapture } from './clipboard'
import { openContactPicker } from './contact-picker'
import { startSnip } from './snip-overlay'
import { toast } from './toast'

const PLATFORMS: { id: PlatformId; label: string; short: string; color: string; picker: boolean }[] = [
  { id: 'whatsapp', label: 'WhatsApp', short: 'W', color: '#25D366', picker: true },
  { id: 'telegram', label: 'Telegram', short: 'T', color: '#2AABEE', picker: true },
  { id: 'gmail', label: 'Gmail', short: 'G', color: '#EA4335', picker: false },
  { id: 'slack', label: 'Slack', short: 'S', color: '#611F69', picker: false },
]

const HOST_ID = 'snapsend-bar-host'

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; z-index: 2147483646;
  left: 50%; bottom: 16px; transform: translateX(-50%);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  user-select: none; touch-action: none;
}
.wrap.placed { transform: none; }
.pill {
  display: flex; align-items: center; gap: 4px;
  background: #1A1C22; color: #F5F6F8;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 999px; padding: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,.28);
  cursor: grab; transition: opacity .2s ease-out;
}
.pill:active { cursor: grabbing; }
.lens {
  width: 24px; height: 24px; border-radius: 50%;
  background: #FFB020; border: none; cursor: pointer; flex: none;
  box-shadow: inset 0 0 0 6px #1A1C22, inset 0 0 0 8px #FFB020;
  transition: box-shadow .2s ease-out;
}
.lens:hover { box-shadow: inset 0 0 0 4px #1A1C22, inset 0 0 0 8px #FFB020; }
.btn {
  border: none; background: none; color: inherit; cursor: pointer;
  font: 500 12px/1 system-ui, sans-serif;
  padding: 8px 12px; border-radius: 999px;
}
.btn:hover { background: rgba(255,255,255,.10) }
.btn:disabled { opacity: .38; cursor: default; }
.btn:disabled:hover { background: none; }
.hide {
  border: none; background: none; color: rgba(245,246,248,.5);
  cursor: pointer; font-size: 12px; padding: 8px 10px; border-radius: 999px;
}
.hide:hover { color: #F5F6F8; background: rgba(255,255,255,.10); }
.send-strip {
  display: flex; align-items: center; gap: 4px;
}
.send-strip[hidden] { display: none; }
.sep { width: 1px; height: 18px; background: rgba(255,255,255,.18); margin: 0 2px; }
.plat {
  width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
  color: #fff; font: 700 12px/1 system-ui, sans-serif; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform .15s ease-out;
}
.plat:hover { transform: scale(1.12); }
.collapsed .btn, .collapsed .hide, .collapsed .send-strip { display: none; }
.collapsed .pill { padding: 4px; }

.picker {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  width: 300px; max-width: 92vw;
}
.pk-card {
  background: #1A1C22; color: #F5F6F8;
  border: 1px solid rgba(255,255,255,.14); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,.4); padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.pk-head { display: flex; align-items: center; justify-content: space-between; }
.pk-title { font: 600 13px/1 system-ui, sans-serif; }
.pk-close { background: none; border: none; color: rgba(245,246,248,.6); cursor: pointer; font-size: 13px; padding: 2px 6px; }
.pk-close:hover { color: #F5F6F8; }
.pk-preview { border: 1px solid rgba(255,255,255,.12); border-radius: 8px; overflow: hidden; height: 74px; display: flex; align-items: center; justify-content: center; background: #0e0f13; }
.pk-preview img { max-width: 100%; max-height: 74px; display: block; }
.pk-caption, .pk-search {
  width: 100%; box-sizing: border-box; background: #0e0f13; color: #F5F6F8;
  border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 8px;
  font: 400 13px/1.2 system-ui, sans-serif;
}
.pk-caption:focus, .pk-search:focus { outline: none; border-color: #FFB020; }
.pk-grid {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px 4px;
}
.pk-tile {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: none; color: inherit; cursor: pointer;
  padding: 6px 2px; border-radius: 10px;
}
.pk-tile:hover { background: rgba(255,255,255,.08); }
.pk-tile.sel { background: rgba(255,176,32,.18); box-shadow: inset 0 0 0 1px #FFB020; }
.pk-tile-name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font: 500 10px/1.2 system-ui, sans-serif; text-align: center;
}
.pk-more {
  background: none; border: none; color: #FFB020; cursor: pointer;
  font: 600 12px/1 system-ui, sans-serif; padding: 6px; align-self: center;
}
.pk-more:hover { text-decoration: underline; }
.pk-expand { display: flex; flex-direction: column; gap: 8px; }
.pk-expand[hidden] { display: none; }
.pk-list { max-height: 168px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.pk-row {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  background: none; border: none; color: inherit; cursor: pointer;
  padding: 6px; border-radius: 8px; font: 500 13px/1.2 system-ui, sans-serif;
}
.pk-row:hover { background: rgba(255,255,255,.08); }
.pk-row.sel { background: rgba(255,176,32,.18); box-shadow: inset 0 0 0 1px #FFB020; }
.pk-avatar {
  border-radius: 50%; flex: none;
  background: #FFB020; color: #1A1C22; font: 600 15px/1 system-ui, sans-serif;
  text-align: center; display: inline-block;
}
.pk-avatar-img { object-fit: cover; background: #0e0f13; }
.pk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-hint { margin: 6px 2px; font: 400 12px/1.4 system-ui, sans-serif; color: rgba(245,246,248,.6); grid-column: 1 / -1; }
.pk-status { margin: 0; min-height: 15px; font: 500 12px/1.3 system-ui, sans-serif; color: #FFB020; }
.collapsed .picker { display: none; }
@media (prefers-reduced-motion: reduce) { .pill, .lens, .plat { transition: none; } }
`

const HTML = `
<div class="wrap" part="wrap">
  <div class="pill">
    <button class="lens" title="Collapse SnapSend"></button>
    <button class="btn snip" title="Snip a region (Alt+Shift+S)">Snip</button>
    <button class="btn record" title="Record your screen (up to 3 min)">Record</button>
    <span class="send-strip" hidden><span class="sep"></span></span>
    <button class="hide" title="Hide SnapSend on this site">&#10005;</button>
  </div>
</div>`

export async function mountFloatingBar(): Promise<void> {
  const host = location.host
  const state = await getBarState(host)
  if (state.hidden || document.getElementById(HOST_ID)) return

  const el = document.createElement('div')
  el.id = HOST_ID
  const shadow = el.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>${HTML}`
  document.documentElement.append(el)

  const wrap = shadow.querySelector<HTMLElement>('.wrap')
  if (!wrap) return
  applyState(wrap, state)
  wireLens(wrap, host, state)
  wireHide(el, wrap, host, state)
  wireSnip(wrap)
  wireSendStrip(wrap)
  wireDrag(wrap, host, state)
}

/** Platform icons appear on the bar as soon as a capture exists — click one
 *  and SnapSend takes you there with the image ready to paste/draft. */
function wireSendStrip(wrap: HTMLElement): void {
  const strip = wrap.querySelector<HTMLElement>('.send-strip')
  if (!strip) return
  for (const p of PLATFORMS) {
    const btn = document.createElement('button')
    btn.className = 'plat'
    btn.style.background = p.color
    btn.textContent = p.short
    btn.title = `Send via ${p.label}`
    btn.addEventListener('click', () => {
      // Copy NOW, while the page has focus from this click — the most reliable
      // moment to put the image on the clipboard for the paste on the far side.
      copyCurrentCapture().catch(() => undefined)
      if (p.picker) {
        const root = wrap.getRootNode()
        if (root instanceof ShadowRoot) openContactPicker(root, p.id as DraftPlatform)
        return
      }
      toast(`Opening ${p.label}…`)
      chrome.runtime.sendMessage({ type: 'open-platform', platform: p.id }).then(
        (res: { ok: boolean; error?: string }) => {
          if (!res?.ok) toast(res?.error ?? `Could not open ${p.label}`)
        },
        () => toast(`Could not open ${p.label}`),
      )
    })
    strip.append(btn)
  }
  const sync = () => {
    chrome.storage.session.get(CURRENT_CAPTURE_KEY).then(
      (found) => {
        strip.hidden = !found[CURRENT_CAPTURE_KEY]
      },
      () => undefined,
    )
  }
  sync()
  chrome.storage.session.onChanged.addListener((changes) => {
    if (CURRENT_CAPTURE_KEY in changes) sync()
  })
}

function applyState(wrap: HTMLElement, state: BarState): void {
  wrap.classList.toggle('collapsed', state.collapsed)
  if (state.x !== null && state.y !== null) {
    wrap.classList.add('placed')
    moveTo(wrap, state.x, state.y)
  }
}

function moveTo(wrap: HTMLElement, x: number, y: number): void {
  const r = wrap.getBoundingClientRect()
  const cx = Math.min(Math.max(x, 4), window.innerWidth - r.width - 4)
  const cy = Math.min(Math.max(y, 4), window.innerHeight - r.height - 4)
  wrap.style.left = `${cx}px`
  wrap.style.top = `${cy}px`
  wrap.style.bottom = 'auto'
}

function persist(host: string, state: BarState): void {
  setBarState(host, state).catch(() => {
    // storage failures are non-fatal for the bar; position just won't stick
  })
}

function wireLens(wrap: HTMLElement, host: string, state: BarState): void {
  wrap.querySelector('.lens')?.addEventListener('click', () => {
    state.collapsed = !state.collapsed
    wrap.classList.toggle('collapsed', state.collapsed)
    persist(host, state)
  })
}

function wireHide(el: HTMLElement, wrap: HTMLElement, host: string, state: BarState): void {
  wrap.querySelector('.hide')?.addEventListener('click', () => {
    state.hidden = true
    persist(host, state)
    el.remove()
  })
}

function wireSnip(wrap: HTMLElement): void {
  wrap.querySelector('.snip')?.addEventListener('click', () => startSnip())
  wrap.querySelector('.record')?.addEventListener('click', () => {
    toast('Opening the recorder…')
    chrome.runtime.sendMessage({ type: 'record-start' }).then(
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) toast(res?.error ?? 'Could not open the panel — click the SnapSend icon')
      },
      () => toast('Could not open the panel — click the SnapSend icon'),
    )
  })
}

function wireDrag(wrap: HTMLElement, host: string, state: BarState): void {
  const pill = wrap.querySelector<HTMLElement>('.pill')
  if (!pill) return
  let start: { px: number; py: number; x: number; y: number } | null = null
  let dragged = false

  // Window-level move/up tracking: pointer capture on the pill would retarget
  // the release and swallow every button's click, and pill-level listeners
  // lose the pointer the moment it leaves the pill. This keeps clicks intact
  // AND follows the drag anywhere on the page.
  const onMove = (ev: PointerEvent) => {
    if (!start) return
    const dx = ev.clientX - start.px
    const dy = ev.clientY - start.py
    if (!dragged && Math.hypot(dx, dy) < 4) return
    dragged = true
    wrap.classList.add('placed')
    moveTo(wrap, start.x + dx, start.y + dy)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    if (!start) return
    start = null
    if (!dragged) return
    const r = wrap.getBoundingClientRect()
    state.x = r.left
    state.y = r.top
    persist(host, state)
  }
  pill.addEventListener('pointerdown', (ev) => {
    const r = wrap.getBoundingClientRect()
    start = { px: ev.clientX, py: ev.clientY, x: r.left, y: r.top }
    dragged = false
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
  })
  // A drag must not fire the button underneath the release point.
  pill.addEventListener(
    'click',
    (ev) => {
      if (!dragged) return
      ev.stopPropagation()
      ev.preventDefault()
      dragged = false
    },
    { capture: true },
  )
}
