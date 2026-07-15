// Shared injector machinery. Site injectors stay thin: selectors + URL shape
// live per-site; the paste/caption/fallback contract is identical everywhere.
// Contract: the image is ALREADY on the user's clipboard when inject runs —
// on ANY failure we focus the composer if we can and toast the Ctrl+V fallback.

import type { Msg, SendResult } from '../../lib/messages'
import { getSelectors, type SelectorConfig } from '../../lib/selectors'
import { toast } from '../toast'

const FALLBACK_TEXT = 'Image copied — press Ctrl+V to paste it here'

export function registerInjector(site: keyof Pick<SelectorConfig, 'whatsapp' | 'telegram'>): void {
  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    if (msg.type !== 'inject') return
    inject(site, msg.dataUrl, msg.caption).then(
      () => sendResponse({ ok: true } satisfies SendResult),
      (err: unknown) => {
        console.warn(`[SnapSend] ${site} injection fell back to clipboard`, err)
        fallback(site).finally(() =>
          sendResponse({ ok: false, error: FALLBACK_TEXT } satisfies SendResult),
        )
      },
    )
    return true
  })
}

async function inject(
  site: 'whatsapp' | 'telegram',
  dataUrl: string,
  caption: string,
): Promise<void> {
  const sel = (await getSelectors())[site]
  const composer = await waitFor(sel['composer'], 20000)
  composer.focus()
  pasteFile(composer, await toFile(dataUrl))
  // The media preview takes over; the caption box appears inside it.
  if (caption) {
    const captionBox = await waitFor(sel['captionInput'], 8000)
    captionBox.focus()
    document.execCommand('insertText', false, caption)
  } else {
    await waitFor(sel['mediaPreview'], 8000)
  }
  // Draft is staged. The human presses Send — never this code.
}

async function fallback(site: 'whatsapp' | 'telegram'): Promise<void> {
  try {
    const sel = (await getSelectors())[site]
    querySelectorAny(sel['composer'])?.focus()
  } catch {
    // even selector loading failed — the toast still tells the user what to do
  }
  toast(FALLBACK_TEXT)
}

function querySelectorAny(candidates: string[] | undefined): HTMLElement | null {
  for (const s of candidates ?? []) {
    const el = document.querySelector<HTMLElement>(s)
    if (el) return el
  }
  return null
}

function waitFor(candidates: string[] | undefined, timeoutMs: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const el = querySelectorAny(candidates)
      if (el) {
        resolve(el)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`selector timeout: ${(candidates ?? []).join(' | ')}`))
        return
      }
      setTimeout(tick, 400)
    }
    tick()
  })
}

async function toFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], 'snapsend.png', { type: 'image/png' })
}

function pasteFile(target: HTMLElement, file: File): void {
  const dt = new DataTransfer()
  dt.items.add(file)
  target.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  )
}
