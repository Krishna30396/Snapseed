// Send screen: capture preview + annotation (1.4), clipboard copy (1.5),
// caption + last-5 history (1.6).

import { createAnnotator, type Annotator, type Tool } from '../lib/annotate'
import { getHistory, type HistoryEntry } from '../lib/history'
import { CURRENT_CAPTURE_KEY, type CaptureRecord } from '../lib/messages'

const app = document.getElementById('app')
let annotator: Annotator | null = null
let copyTimer: ReturnType<typeof setTimeout> | undefined

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: 'arrow', label: 'Arrow' },
  { tool: 'rect', label: 'Box' },
  { tool: 'text', label: 'Text' },
  { tool: 'blur', label: 'Blur' },
]

function render(record: CaptureRecord | undefined): void {
  if (!app) return
  annotator = null
  if (!record) {
    app.innerHTML = `<h1>SnapSend</h1>
      <p class="hint">Snip something to get started &#8212; click Snip on the bar or press Alt+Shift+S.</p>
      <div class="history"></div>`
    renderHistory()
    return
  }
  app.innerHTML = `<h1>SnapSend</h1>
    <div class="tools"></div>
    <div class="shot"></div>
    <textarea class="caption" rows="2" placeholder="Caption (e.g. change this to green)"></textarea>
    <div class="actions">
      <button class="primary copy-img">Copy image</button>
      <button class="copy-cap">Copy with caption</button>
    </div>
    <p class="status" role="status"></p>
    <div class="history"></div>`
  const img = new Image()
  img.onload = () => mountEditor(img)
  img.onerror = () => setStatus('Could not load the capture.')
  img.src = record.dataUrl
  renderHistory()
}

function mountEditor(img: HTMLImageElement): void {
  const shot = app?.querySelector<HTMLElement>('.shot')
  const tools = app?.querySelector<HTMLElement>('.tools')
  if (!shot || !tools) return
  annotator = createAnnotator(img)
  shot.append(annotator.canvas)
  buildToolbar(tools)
  wireCopy()
  annotator.onChange = () => scheduleCopy()
  scheduleCopy() // fresh snip: image should already be on the clipboard
}

function buildToolbar(tools: HTMLElement): void {
  for (const { tool, label } of TOOLS) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.className = 'tool'
    if (tool === 'arrow') btn.classList.add('active')
    btn.addEventListener('click', () => {
      annotator?.setTool(tool)
      tools.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
    tools.append(btn)
  }
  const undo = document.createElement('button')
  undo.textContent = 'Undo'
  undo.className = 'tool undo'
  undo.addEventListener('click', () => annotator?.undo())
  tools.append(undo)
}

function wireCopy(): void {
  app?.querySelector('.copy-img')?.addEventListener('click', () => {
    copyImage().then(
      () => setStatus('Copied — paste anywhere'),
      () => setStatus('Copy failed — click the panel, then try again'),
    )
  })
  app?.querySelector('.copy-cap')?.addEventListener('click', () => {
    const caption = app?.querySelector<HTMLTextAreaElement>('.caption')?.value.trim() ?? ''
    if (!caption) {
      setStatus('Type a caption first')
      return
    }
    navigator.clipboard.writeText(caption).then(
      () => setStatus('Caption copied — paste it after the image'),
      () => setStatus('Copy failed — click the panel, then try again'),
    )
  })
}

function scheduleCopy(): void {
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyImage().then(
      () => setStatus('Copied — paste anywhere'),
      () => setStatus('Auto-copy needs focus — click Copy image'),
    )
  }, 350)
}

async function copyImage(): Promise<void> {
  const canvas = annotator?.canvas
  if (!canvas) throw new Error('nothing to copy')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

function setStatus(text: string): void {
  const el = app?.querySelector<HTMLElement>('.status')
  if (!el) return
  el.textContent = text
  el.classList.add('in')
  setTimeout(() => el.classList.remove('in'), 2600)
}

function renderHistory(): void {
  const host = app?.querySelector<HTMLElement>('.history')
  if (!host) return
  getHistory().then(
    (entries) => {
      host.innerHTML = entries.length ? '<p class="hint">Recent snips</p>' : ''
      for (const entry of entries) host.append(historyThumb(entry))
    },
    () => setStatus('Could not load recent snips'),
  )
}

function historyThumb(entry: HistoryEntry): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'thumb'
  btn.title = new Date(entry.createdAt).toLocaleString()
  const img = new Image()
  img.src = URL.createObjectURL(entry.blob)
  img.onload = () => URL.revokeObjectURL(img.src)
  btn.append(img)
  btn.addEventListener('click', () => {
    reopen(entry).catch(() => setStatus('Could not reopen that snip'))
  })
  return btn
}

async function reopen(entry: HistoryEntry): Promise<void> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(entry.blob)
  })
  const record: CaptureRecord = {
    id: entry.id,
    dataUrl,
    width: entry.width,
    height: entry.height,
    createdAt: entry.createdAt,
  }
  await chrome.storage.session.set({ [CURRENT_CAPTURE_KEY]: record })
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
