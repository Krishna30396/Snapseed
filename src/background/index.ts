// Service worker: capture orchestration, commands, tab management.
// MV3 workers sleep aggressively — keep all state in chrome.storage, never in memory.

import { saveToHistory } from '../lib/history'
import { CURRENT_CAPTURE_KEY, type CaptureRecord, type Msg, type SnipRect } from '../lib/messages'

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
  if (msg.type !== 'snip-capture') return
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
})

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
