// Service worker: capture orchestration, commands, tab management.
// MV3 workers sleep aggressively — keep all state in chrome.storage, never in memory.

import { saveToHistory } from '../lib/history'
import {
  CURRENT_CAPTURE_KEY,
  PASTE_HINT_KEY,
  RECORD_REQUEST_KEY,
  type CaptureRecord,
  type Msg,
  type SendResult,
  type SnipRect,
} from '../lib/messages'
import { refreshRemoteSelectors } from '../lib/selectors'

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
    if (tab?.id === undefined || tab.windowId === undefined) return
    captureAndShow(tab.id, tab.windowId, msg.rect, msg.dpr).then(
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
  if (msg.type === 'send-draft') {
    sendDraft(msg.channel, msg.phone, msg.caption).then(
      (result) => sendResponse(result),
      (err: unknown) => {
        console.error(`[SnapSend] ${msg.channel} send failed`, err)
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

const CHANNELS = {
  whatsapp: {
    chatUrl: (phone: string) => `https://web.whatsapp.com/send?phone=${phone}`,
    tabPattern: '*://web.whatsapp.com/*',
  },
  telegram: {
    chatUrl: (phone: string) =>
      `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(`tg://resolve?phone=${phone}`)}`,
    tabPattern: '*://web.telegram.org/*',
  },
} as const

async function sendDraft(
  channel: keyof typeof CHANNELS,
  phone: string,
  caption: string,
): Promise<SendResult> {
  const found = await chrome.storage.session.get(CURRENT_CAPTURE_KEY)
  const record = found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined
  if (!record) return { ok: false, error: 'No capture to send — snip something first' }

  const site = CHANNELS[channel]
  const url = site.chatUrl(phone)
  const existing = (await chrome.tabs.query({ url: site.tabPattern }))[0]
  const tab = existing?.id !== undefined
    ? await chrome.tabs.update(existing.id, { url, active: true })
    : await chrome.tabs.create({ url })
  if (tab?.id === undefined) return { ok: false, error: 'Could not open the chat tab' }
  await chrome.windows.update(tab.windowId, { focused: true })

  const inject: Msg = { type: 'inject', dataUrl: record.dataUrl, caption }
  return relayWhenReady(tab.id, inject)
}

/** The injector script may not be alive yet on a cold tab — retry the message
 *  until it answers or the budget runs out. The injector itself then polls the
 *  composer, so total cold-start budget ≈ 30s message + 20s composer. */
async function relayWhenReady(tabId: number, msg: Msg): Promise<SendResult> {
  const deadline = Date.now() + 30000
  for (;;) {
    try {
      return (await chrome.tabs.sendMessage(tabId, msg)) as SendResult
    } catch {
      if (Date.now() > deadline) {
        return { ok: false, error: 'The chat did not load — image copied, press Ctrl+V there' }
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

async function captureAndShow(tabId: number, windowId: number, rect: SnipRect, dpr: number): Promise<void> {
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
  // A failed panel open must not fail the capture — the bar's send strip and
  // the clipboard copy already give the user a working result.
  await openPanel(tabId).catch((err: unknown) => {
    console.warn('[SnapSend] panel did not open after snip', err)
  })
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
