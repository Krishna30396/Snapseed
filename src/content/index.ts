import type { Msg } from '../lib/messages'
import { mountFloatingBar } from './floating-bar'
import { startSnip } from './snip-overlay'

// Restricted surfaces: browser pages never run content scripts, but guard the
// store domains too (also excluded in the manifest).
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'microsoftedge.microsoft.com']

if (!BLOCKED_HOSTS.includes(location.host)) {
  mountFloatingBar().catch((err: unknown) => {
    console.error('[SnapSend] floating bar failed to mount', err)
  })
  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if (msg.type === 'snip-start') startSnip()
  })
}
