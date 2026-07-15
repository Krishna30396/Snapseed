// Service worker: capture orchestration, commands, tab management.
// MV3 workers sleep aggressively — keep all state in chrome.storage, never in memory.

import { saveToHistory } from '../lib/history'
import {
  CURRENT_CAPTURE_KEY,
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
  if (msg.type === 'send-whatsapp') {
    sendToWhatsApp(msg.phone, msg.caption).then(
      (result) => sendResponse(result),
      (err: unknown) => {
        console.error('[SnapSend] WhatsApp send failed', err)
        sendResponse({
          ok: false,
          error: 'Could not reach WhatsApp Web — image copied, press Ctrl+V in the chat',
        } satisfies SendResult)
      },
    )
    return true
  }
  return
})

async function sendToWhatsApp(phone: string, caption: string): Promise<SendResult> {
  const found = await chrome.storage.session.get(CURRENT_CAPTURE_KEY)
  const record = found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined
  if (!record) return { ok: false, error: 'No capture to send — snip something first' }

  const url = `https://web.whatsapp.com/send?phone=${phone}`
  const existing = (await chrome.tabs.query({ url: '*://web.whatsapp.com/*' }))[0]
  const tab = existing?.id !== undefined
    ? await chrome.tabs.update(existing.id, { url, active: true })
    : await chrome.tabs.create({ url })
  if (tab?.id === undefined) return { ok: false, error: 'Could not open WhatsApp Web' }
  await chrome.windows.update(tab.windowId, { focused: true })

  const inject: Msg = { type: 'wa-inject', dataUrl: record.dataUrl, caption }
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
        return { ok: false, error: 'WhatsApp Web did not load — image copied, press Ctrl+V' }
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
  await chrome.sidePanel.open({ tabId })
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
