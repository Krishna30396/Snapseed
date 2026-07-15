// Shared injector machinery for WhatsApp Web / Telegram Web. Site injectors
// stay thin: they only name their platform. Everything else — reading the
// recent-chat list, opening a chat by name, pasting the image, setting the
// caption, and (Telegram only) clicking Send — lives here, driven entirely by
// selectors.json. On ANY failure the image is already on the clipboard, so we
// focus the composer and toast the Ctrl+V fallback.

import type { ChatTarget, Msg, RecentResult, SendResult } from '../../lib/messages'
import { getSelectors, type SelectorConfig } from '../../lib/selectors'
import { toast } from '../toast'

type Site = 'whatsapp' | 'telegram'
const FALLBACK_TEXT = 'Image copied — press Ctrl+V to paste it here'

export function registerInjector(site: Site): void {
  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    if (msg.type === 'scrape-recent') {
      scrapeRecent(site).then(
        (contacts) => sendResponse({ ok: true, contacts } satisfies RecentResult),
        (err: unknown) => {
          console.warn(`[SnapSend] ${site} scrape failed`, err)
          sendResponse({ ok: false, contacts: [], error: 'Could not read recent chats' } satisfies RecentResult)
        },
      )
      return true
    }
    if (msg.type === 'open-inject') {
      openAndInject(site, msg.target, msg.dataUrl, msg.caption, msg.autoSend).then(
        () => sendResponse({ ok: true } satisfies SendResult),
        (err: unknown) => {
          console.warn(`[SnapSend] ${site} open/inject fell back to clipboard`, err)
          fallback(site).finally(() => sendResponse({ ok: false, error: FALLBACK_TEXT } satisfies SendResult))
        },
      )
      return true
    }
    return
  })
}

async function scrapeRecent(site: Site): Promise<ChatTarget[]> {
  const sel = (await getSelectors())[site]
  const rows = document.querySelectorAll<HTMLElement>((sel['chatListRow'] ?? []).join(','))
  const out: ChatTarget[] = []
  const seen = new Set<string>()
  for (const row of Array.from(rows).slice(0, 30)) {
    const name = firstText(row, sel['chatRowName'])
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push({ name })
    }
    if (out.length >= 12) break
  }
  return out
}

async function openAndInject(
  site: Site,
  target: ChatTarget,
  dataUrl: string,
  caption: string,
  autoSend: boolean,
): Promise<void> {
  const sel = (await getSelectors())[site]
  await openChat(sel, target)
  const composer = await waitFor(sel['composer'], 20000)
  composer.focus()
  pasteFile(composer, await toFile(dataUrl))
  if (caption) {
    const captionBox = await waitFor(sel['captionInput'], 8000).catch(() => composer)
    captionBox.focus()
    document.execCommand('insertText', false, caption)
  } else {
    await waitFor(sel['mediaPreview'], 8000).catch(() => undefined)
  }
  if (autoSend) {
    const send = await waitFor(sel['sendButton'], 6000)
    send.click()
  }
  // WhatsApp path leaves the draft staged with Send visible — the human clicks.
}

/** Opens the target chat: by in-app search on the scraped name, or (saved
 *  contacts) by the phone number typed into the same search box. */
async function openChat(sel: Record<string, string[]>, target: ChatTarget): Promise<void> {
  const search = await waitFor(sel['search'], 10000)
  search.focus()
  selectAll(search)
  const query = target.phone ?? target.name
  document.execCommand('insertText', false, query)
  await delay(1200) // let results populate
  const row = await waitFor(sel['chatListRow'], 6000)
  row.click()
  await delay(600)
}

async function fallback(site: Site): Promise<void> {
  try {
    const sel = (await getSelectors())[site]
    querySelectorAny(sel['composer'])?.focus()
  } catch {
    // even selector loading failed — the toast still tells the user what to do
  }
  toast(FALLBACK_TEXT)
}

function firstText(root: HTMLElement, candidates: string[] | undefined): string {
  for (const s of candidates ?? []) {
    const el = root.querySelector<HTMLElement>(s)
    const text = (el?.getAttribute('title') ?? el?.textContent ?? '').trim()
    if (text) return text
  }
  return ''
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
      if (el) return resolve(el)
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`selector timeout: ${(candidates ?? []).join(' | ')}`))
      }
      setTimeout(tick, 300)
    }
    tick()
  })
}

function selectAll(el: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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

export type { SelectorConfig }
