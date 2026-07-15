// Selector config: bundled copy ships with the extension; a remote copy can be
// fetched (CONFIG ONLY — never code) so WhatsApp breakage is fixed by a config
// push, not a store review. Highest version wins.

import bundled from '../config/selectors.json'

export interface SelectorConfig {
  version: number
  whatsapp: Record<string, string[]>
  telegram: Record<string, string[]>
}

const CACHE_KEY = 'ss.selectors.remote'
// Raw URL of the repo copy — update once the GitHub repo exists.
const REMOTE_URL =
  'https://raw.githubusercontent.com/snapsend/selectors/main/selectors.json'

export async function getSelectors(): Promise<SelectorConfig> {
  const base = bundled as SelectorConfig
  try {
    const found = await chrome.storage.local.get(CACHE_KEY)
    const remote = found[CACHE_KEY] as SelectorConfig | undefined
    if (remote && typeof remote.version === 'number' && remote.version > base.version) {
      return remote
    }
  } catch {
    // cache unreadable — bundled copy always works
  }
  return base
}

/** Called from the service worker on startup. Network failure is normal
 *  (offline, repo not live yet) — the bundled copy is the fallback. */
export async function refreshRemoteSelectors(): Promise<void> {
  const res = await fetch(REMOTE_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`selectors fetch ${res.status}`)
  const remote = (await res.json()) as SelectorConfig
  if (typeof remote.version !== 'number' || typeof remote.whatsapp !== 'object') {
    throw new Error('selectors payload malformed')
  }
  const base = bundled as SelectorConfig
  if (remote.version !== base.version) {
    console.info(`[SnapSend] remote selectors v${remote.version} (bundled v${base.version})`)
  }
  await chrome.storage.local.set({ [CACHE_KEY]: remote })
}
