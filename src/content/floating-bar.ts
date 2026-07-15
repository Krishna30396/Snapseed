import { type BarState, getBarState, setBarState } from '../lib/storage'
import { startSnip } from './snip-overlay'

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
.collapsed .btn, .collapsed .hide { display: none; }
.collapsed .pill { padding: 4px; }
@media (prefers-reduced-motion: reduce) { .pill, .lens { transition: none; } }
`

const HTML = `
<div class="wrap" part="wrap">
  <div class="pill">
    <button class="lens" title="Collapse SnapSend"></button>
    <button class="btn snip" title="Snip a region (Alt+Shift+S)">Snip</button>
    <button class="btn" disabled title="Recording arrives in a later update">Record</button>
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
  wireDrag(wrap, host, state)
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
}

function wireDrag(wrap: HTMLElement, host: string, state: BarState): void {
  const pill = wrap.querySelector<HTMLElement>('.pill')
  if (!pill) return
  let start: { px: number; py: number; x: number; y: number } | null = null
  let dragged = false

  pill.addEventListener('pointerdown', (ev) => {
    const r = wrap.getBoundingClientRect()
    start = { px: ev.clientX, py: ev.clientY, x: r.left, y: r.top }
    dragged = false
    pill.setPointerCapture(ev.pointerId)
  })
  pill.addEventListener('pointermove', (ev) => {
    if (!start) return
    const dx = ev.clientX - start.px
    const dy = ev.clientY - start.py
    if (!dragged && Math.hypot(dx, dy) < 4) return
    dragged = true
    wrap.classList.add('placed')
    moveTo(wrap, start.x + dx, start.y + dy)
  })
  pill.addEventListener('pointerup', () => {
    if (!start) return
    start = null
    if (!dragged) return
    const r = wrap.getBoundingClientRect()
    state.x = r.left
    state.y = r.top
    persist(host, state)
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
