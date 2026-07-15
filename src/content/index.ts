import { PASTE_HINT_KEY, PLATFORM_HOSTS, type Msg, type PlatformId } from '../lib/messages'
import { mountFloatingBar } from './floating-bar'
import { startSnip } from './snip-overlay'
import { toast } from './toast'

// Restricted surfaces: browser pages never run content scripts, but guard the
// store domains too (also excluded in the manifest).
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'microsoftedge.microsoft.com']

const HINT_TEXT = 'Image copied — open your chat or message and press Ctrl+V'

/** Shows the paste hint when this page belongs to the platform the user just
 *  jumped to from the bar. Runs on every load, so app redirects can't eat it. */
function checkPasteHint(): void {
  chrome.storage.session.get(PASTE_HINT_KEY).then(
    (found) => {
      const hint = found[PASTE_HINT_KEY] as { platform: PlatformId; ts: number } | undefined
      if (!hint || Date.now() - hint.ts > 60000) return
      if (!location.host.endsWith(PLATFORM_HOSTS[hint.platform])) return
      // The flag is NOT removed here — platform apps redirect through
      // short-lived documents (Telegram / -> /a/) that would consume it before
      // the real page loads. It just expires via its 60s TTL.
      toast(HINT_TEXT, 7000)
    },
    () => undefined,
  )
}

if (!BLOCKED_HOSTS.includes(location.host)) {
  mountFloatingBar().catch((err: unknown) => {
    console.error('[SnapSend] floating bar failed to mount', err)
  })
  checkPasteHint()
  chrome.runtime.onMessage.addListener((msg: Msg) => {
    if (msg.type === 'snip-start') startSnip()
    if (msg.type === 'paste-hint') toast(HINT_TEXT, 7000)
  })
}
