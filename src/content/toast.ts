// Page-level toast — every failed async path must end here, never in silence.

const TOAST_ID = 'snapsend-toast-host'

export function toast(message: string): void {
  document.getElementById(TOAST_ID)?.remove()
  const el = document.createElement('div')
  el.id = TOAST_ID
  const shadow = el.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .t {
      position: fixed; left: 50%; bottom: 64px; transform: translate(-50%, 8px);
      z-index: 2147483647; opacity: 0;
      background: #1A1C22; color: #F5F6F8;
      border: 1px solid rgba(255,255,255,.14); border-radius: 8px;
      padding: 10px 16px; font: 400 13px/1.4 system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,.28);
      transition: opacity .2s ease-out, transform .2s ease-out;
    }
    .t.in { opacity: 1; transform: translate(-50%, 0); }
    @media (prefers-reduced-motion: reduce) { .t { transition: none; } }
  </style><div class="t"></div>`
  const box = shadow.querySelector('.t')
  if (box) box.textContent = message
  document.documentElement.append(el)
  requestAnimationFrame(() => box?.classList.add('in'))
  setTimeout(() => box?.classList.remove('in'), 3200)
  setTimeout(() => el.remove(), 3600)
}
