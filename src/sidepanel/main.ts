// Send screen: shows the current capture. Annotation (1.4), clipboard (1.5),
// caption + history (1.6) build on top of this.

import { CURRENT_CAPTURE_KEY, type CaptureRecord } from '../lib/messages'

const app = document.getElementById('app')

function render(record: CaptureRecord | undefined): void {
  if (!app) return
  if (!record) {
    app.innerHTML = `<h1>SnapSend</h1>
      <p class="hint">Snip something to get started &#8212; click Snip on the bar or press Alt+Shift+S.</p>`
    return
  }
  app.innerHTML = `<h1>SnapSend</h1><figure class="shot"></figure>
    <p class="hint">${record.width}&#215;${record.height}px</p>`
  const img = new Image()
  img.src = record.dataUrl
  img.alt = 'Latest capture'
  app.querySelector('.shot')?.append(img)
}

async function load(): Promise<void> {
  const found = await chrome.storage.session.get(CURRENT_CAPTURE_KEY)
  render(found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined)
}

chrome.storage.session.onChanged.addListener((changes) => {
  if (CURRENT_CAPTURE_KEY in changes) {
    render(changes[CURRENT_CAPTURE_KEY]?.newValue as CaptureRecord | undefined)
  }
})

load().catch(() => {
  if (app) app.innerHTML = `<h1>SnapSend</h1><p class="hint">Could not load the last capture.</p>`
})
