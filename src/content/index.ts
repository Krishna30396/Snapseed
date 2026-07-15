import { mountFloatingBar } from './floating-bar'

// Restricted surfaces: browser pages never run content scripts, but guard the
// store domains too (also excluded in the manifest).
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'microsoftedge.microsoft.com']

if (!BLOCKED_HOSTS.includes(location.host)) {
  mountFloatingBar().catch((err: unknown) => {
    console.error('[SnapSend] floating bar failed to mount', err)
  })
}
