// Service worker: capture orchestration, commands, tab management.
// MV3 workers sleep aggressively — keep all state in chrome.storage, never in memory.

import { saveToHistory } from '../lib/history'
import {
  AUTO_SEND,
  CURRENT_CAPTURE_KEY,
  PASTE_HINT_KEY,
  RECENT_CACHE_KEY,
  RECORD_REQUEST_KEY,
  type CaptureRecord,
  type ChatTarget,
  type DraftPlatform,
  type Msg,
  type RecentResult,
  type SendResult,
  type SnipRect,
} from '../lib/messages'
import { getSelectors, refreshRemoteSelectors } from '../lib/selectors'

refreshRemoteSelectors().catch(() => {
  // offline or remote config not published yet — bundled selectors apply
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => {
      console.error('[SnapSend] sidePanel behavior setup failed', err)
    })
})

// Let the floating bar (content script) see the current capture so it can show
// the send strip. Session storage holds only this device-local capture state.
chrome.storage.session
  .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  .catch((err: unknown) => {
    console.error('[SnapSend] session access level failed', err)
  })

/** Open the side panel; if the browser refuses (gesture rules differ across
 *  browsers), fall back to a popup window so the user always SEES a response. */
async function openPanel(tabId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ tabId })
  } catch {
    await chrome.windows.create({
      url: chrome.runtime.getURL('src/sidepanel/index.html'),
      type: 'popup',
      width: 420,
      height: 640,
    })
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'snip-region' || tab?.id === undefined) return
  const msg: Msg = { type: 'snip-start' }
  chrome.tabs.sendMessage(tab.id, msg).catch(() => {
    // No content script on this page (chrome://, store) — nothing to snip.
  })
})

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  if (msg.type === 'snip-capture') {
    const tab = sender.tab
    if (tab?.windowId === undefined) return
    captureAndShow(tab.windowId, msg.rect, msg.dpr).then(
      () => sendResponse({ ok: true }),
      (err: unknown) => {
        console.error('[SnapSend] capture failed', err)
        sendResponse({ ok: false, error: 'Capture failed — try again' })
      },
    )
    return true // async sendResponse
  }
  if (msg.type === 'record-start') {
    const tabId = sender.tab?.id
    if (tabId === undefined) return
    Promise.all([
      chrome.storage.session.set({ [RECORD_REQUEST_KEY]: Date.now() }),
      openPanel(tabId),
    ]).then(
      () => sendResponse({ ok: true }),
      (err: unknown) => {
        console.error('[SnapSend] record-start failed', err)
        sendResponse({ ok: false, error: 'Could not open the panel — click the SnapSend icon' })
      },
    )
    return true
  }
  if (msg.type === 'open-platform') {
    openPlatform(msg.platform).then(
      (result) => sendResponse(result),
      (err: unknown) => {
        console.error('[SnapSend] open-platform failed', err)
        sendResponse({ ok: false, error: 'Could not open the app tab' } satisfies SendResult)
      },
    )
    return true
  }
  if (msg.type === 'list-recent') {
    listRecent(msg.platform).then(
      (result) => sendResponse(result),
      (err: unknown) => {
        console.error(`[SnapSend] ${msg.platform} list-recent failed`, err)
        sendResponse({ ok: false, contacts: [], error: 'Could not read recent chats' } satisfies RecentResult)
      },
    )
    return true
  }
  if (msg.type === 'send-to-contact') {
    sendToContact(msg.platform, msg.target, msg.caption).then(
      (result) => sendResponse(result),
      (err: unknown) => {
        console.error(`[SnapSend] ${msg.platform} send-to-contact failed`, err)
        sendResponse({
          ok: false,
          error: 'Could not reach the chat — image copied, press Ctrl+V there',
        } satisfies SendResult)
      },
    )
    return true
  }
  return
})

const TAB_PATTERN: Record<DraftPlatform, string> = {
  whatsapp: '*://web.whatsapp.com/*',
  telegram: '*://web.telegram.org/*',
}

const APP_URL: Record<DraftPlatform, string> = {
  whatsapp: 'https://web.whatsapp.com/',
  telegram: 'https://web.telegram.org/a/',
}

async function ensureAppTab(platform: DraftPlatform): Promise<chrome.tabs.Tab> {
  const existing = (await chrome.tabs.query({ url: TAB_PATTERN[platform] }))[0]
  if (existing?.id !== undefined) return existing
  return chrome.tabs.create({ url: APP_URL[platform], active: false })
}

/** Read the app tab's recent-chat list. Uses chrome.scripting.executeScript
 *  rather than messaging a content script — content scripts are NOT injected
 *  into tabs that were already open when the extension loaded, which is the
 *  common case (the user opened WhatsApp before installing). executeScript runs
 *  regardless, so recent chats load without the user refreshing the tab. */
async function listRecent(platform: DraftPlatform): Promise<RecentResult> {
  const tab = await ensureAppTab(platform)
  if (tab.id === undefined) return { ok: false, contacts: [], error: 'Open the app first' }
  const sel = (await getSelectors())[platform]
  const deadline = Date.now() + 6000
  for (;;) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapePage,
        args: [sel['chatListRow'] ?? [], sel['chatRowName'] ?? [], sel['rowAvatar'] ?? []],
      })
      const contacts = (res?.result ?? []) as ChatTarget[]
      if (contacts.length) {
        await cacheRecent(platform, contacts)
        return { ok: true, contacts }
      }
    } catch {
      // tab still loading / not scriptable yet — retry until the deadline
    }
    if (Date.now() > deadline) {
      return { ok: false, contacts: [], error: 'Open the app tab and let it finish loading, then reopen' }
    }
    await new Promise((r) => setTimeout(r, 600))
  }
}

/** Runs INSIDE the app tab (serialized by executeScript — no outside refs).
 *  Returns recent chats as {name, avatar?}. Profile pics are cross-origin
 *  (pps.whatsapp.net / Telegram blobs) so the already-loaded <img> taints the
 *  canvas — we re-load each pic with crossOrigin='anonymous' (which the CDNs
 *  allow) before drawing, and skip 1×1 lazy-load placeholders. */
async function scrapePage(rowSel: string[], nameSel: string[], avatarSel: string[]): Promise<ChatTarget[]> {
  const queryAll = (cands: string[]): HTMLElement[] => {
    for (const s of cands) {
      try {
        const f = document.querySelectorAll<HTMLElement>(s)
        if (f.length) return Array.from(f)
      } catch {
        /* invalid selector on this DOM */
      }
    }
    return []
  }
  const firstText = (row: HTMLElement, cands: string[]): string => {
    for (const s of cands) {
      const el = row.querySelector(s)
      const t = (el?.getAttribute('title') ?? el?.textContent ?? '').trim()
      if (t) return t
    }
    return ''
  }
  const avatarSrc = (row: HTMLElement, cands: string[]): string | undefined => {
    for (const s of cands) {
      const img = row.querySelector<HTMLImageElement>(s)
      // naturalWidth <= 1 ⇒ lazy-load placeholder, not the real pic yet
      if (img?.src && img.naturalWidth > 1) return img.src
    }
    return undefined
  }
  const toDataUrl = (src: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      if (src.startsWith('data:')) return resolve(src)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = 40
          canvas.height = 40
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(undefined)
          ctx.drawImage(img, 0, 0, 40, 40)
          resolve(canvas.toDataURL('image/jpeg', 0.75))
        } catch {
          resolve(undefined)
        }
      }
      img.onerror = () => resolve(undefined)
      img.src = src
      setTimeout(() => resolve(undefined), 4000)
    })

  const picked: { name: string; src?: string }[] = []
  const seen = new Set<string>()
  for (const row of queryAll(rowSel).slice(0, 30)) {
    const name = firstText(row, nameSel)
    if (!name || seen.has(name)) continue
    seen.add(name)
    picked.push({ name, src: avatarSrc(row, avatarSel) })
    if (picked.length >= 12) break
  }
  const avatars = await Promise.all(picked.map((p) => (p.src ? toDataUrl(p.src) : Promise.resolve(undefined))))
  return picked.map((p, i) => ({ name: p.name, avatar: avatars[i] }))
}

async function cacheRecent(platform: DraftPlatform, contacts: ChatTarget[]): Promise<void> {
  const found = await chrome.storage.session.get(RECENT_CACHE_KEY)
  const cache = (found[RECENT_CACHE_KEY] as Partial<Record<DraftPlatform, ChatTarget[]>>) ?? {}
  cache[platform] = contacts
  await chrome.storage.session.set({ [RECENT_CACHE_KEY]: cache })
}

/** Open the chosen chat in the app tab, inject the capture + caption, and
 *  (Telegram) auto-send or (WhatsApp) leave the draft for the human to send. */
async function sendToContact(
  platform: DraftPlatform,
  target: ChatTarget,
  caption: string,
): Promise<SendResult> {
  const found = await chrome.storage.session.get(CURRENT_CAPTURE_KEY)
  const record = found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined
  if (!record) return { ok: false, error: 'No capture to send — snip something first' }

  const tab = await ensureAppTab(platform)
  if (tab.id === undefined) return { ok: false, error: 'Could not open the chat tab' }
  await chrome.tabs.update(tab.id, { active: true })
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })

  const inject: Msg = {
    type: 'open-inject',
    target,
    dataUrl: record.dataUrl,
    caption,
    autoSend: AUTO_SEND[platform],
  }
  return relayWhenReady(tab.id, inject, platform)
}

/** Inject the platform's content script into a tab that was open before the
 *  extension loaded (declared content scripts don't auto-inject into those).
 *  The injector self-guards against double-registration, so this is safe to
 *  call on an already-injected tab. */
async function ensureInjector(tabId: number, platform: DraftPlatform): Promise<void> {
  const host = platform === 'whatsapp' ? 'web.whatsapp.com' : 'web.telegram.org'
  const entry = (chrome.runtime.getManifest().content_scripts ?? []).find((cs) =>
    (cs.matches ?? []).some((m) => m.includes(host)),
  )
  const files = entry?.js
  if (!files?.length) return
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files })
  } catch (err) {
    console.warn('[SnapSend] injector executeScript failed (may already be present)', err)
  }
}

/** Relay a message to the app tab, injecting the content script only if the tab
 *  has no receiver yet (a tab open before install). Injecting unconditionally
 *  would double-register the injector and make one copy log a spurious
 *  clipboard fallback while the other succeeds. */
async function relayWhenReady(tabId: number, msg: Msg, platform?: DraftPlatform): Promise<SendResult> {
  const deadline = Date.now() + 30000
  let injected = false
  for (;;) {
    try {
      return (await chrome.tabs.sendMessage(tabId, msg)) as SendResult
    } catch {
      if (!injected && platform) {
        await ensureInjector(tabId, platform)
        injected = true
      }
      if (Date.now() > deadline) {
        return { ok: false, error: 'The chat did not load — image copied, press Ctrl+V there' }
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function captureAndShow(windowId: number, rect: SnipRect, dpr: number): Promise<void> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
  const { record, blob } = await cropToRecord(dataUrl, rect, dpr)
  await chrome.storage.session.set({ [CURRENT_CAPTURE_KEY]: record })
  await saveToHistory({
    id: record.id,
    blob,
    width: record.width,
    height: record.height,
    createdAt: record.createdAt,
  })
  // Deliberately do NOT open the side panel here — the user wants to stay on
  // their page and drive everything from the bar (snip → pick app → send). The
  // panel is still available from the toolbar icon for annotation.
}

const PLATFORM_TABS: Record<
  'whatsapp' | 'telegram' | 'gmail' | 'slack',
  { url: string; pattern: string }
> = {
  whatsapp: { url: 'https://web.whatsapp.com/', pattern: '*://web.whatsapp.com/*' },
  telegram: { url: 'https://web.telegram.org/', pattern: '*://web.telegram.org/*' },
  gmail: { url: 'https://mail.google.com/mail/?view=cm&fs=1', pattern: '*://mail.google.com/*' },
  slack: { url: 'https://app.slack.com/client', pattern: '*://app.slack.com/*' },
}

/** Bar send strip: jump to the platform (reuse its tab if one is open) and
 *  show the paste hint there. The image is already on the clipboard. */
async function openPlatform(platform: keyof typeof PLATFORM_TABS): Promise<SendResult> {
  const site = PLATFORM_TABS[platform]
  // redirect-proof hint: every fresh page-load on the platform checks this flag
  await chrome.storage.session.set({ [PASTE_HINT_KEY]: { platform, ts: Date.now() } })
  const existing = (await chrome.tabs.query({ url: site.pattern }))[0]
  const tab = existing?.id !== undefined
    ? await chrome.tabs.update(existing.id, { active: true })
    : await chrome.tabs.create({ url: site.url })
  if (tab?.id === undefined) return { ok: false, error: 'Could not open the app tab' }
  await chrome.windows.update(tab.windowId, { focused: true })
  const hint: Msg = { type: 'paste-hint' }
  relayWhenReady(tab.id, hint).catch(() => undefined)
  return { ok: true }
}

async function cropToRecord(
  dataUrl: string,
  rect: SnipRect,
  dpr: number,
): Promise<{ record: CaptureRecord; blob: Blob }> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const sx = Math.round(rect.x * dpr)
  const sy = Math.round(rect.y * dpr)
  const sw = Math.max(1, Math.min(Math.round(rect.w * dpr), bitmap.width - sx))
  const sh = Math.max(1, Math.min(Math.round(rect.h * dpr), bitmap.height - sy))
  const canvas = new OffscreenCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return {
    record: {
      id: crypto.randomUUID(),
      dataUrl: await blobToDataUrl(blob),
      width: sw,
      height: sh,
      createdAt: Date.now(),
    },
    blob,
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('blob read failed'))
    r.readAsDataURL(blob)
  })
}
