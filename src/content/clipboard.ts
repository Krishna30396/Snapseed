// Copies the current capture to the clipboard from the page context, right
// after the snip — the page still has focus, so the write is allowed. This is
// what makes "paste anywhere" true even if the side panel never opens.

import { CURRENT_CAPTURE_KEY, type CaptureRecord } from '../lib/messages'

export async function copyCurrentCapture(): Promise<void> {
  const found = await chrome.storage.session.get(CURRENT_CAPTURE_KEY)
  const record = found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined
  if (!record) throw new Error('no capture in session')
  const blob = await (await fetch(record.dataUrl)).blob()
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
