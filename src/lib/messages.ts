// Typed runtime messages. One discriminated union, shared by all contexts.

export interface SnipRect {
  x: number
  y: number
  w: number
  h: number
}

export type DraftChannel = 'whatsapp' | 'telegram'
export type PlatformId = 'whatsapp' | 'telegram' | 'gmail' | 'slack'

export type DraftPlatform = 'whatsapp' | 'telegram'

/** A chat the user can send to: a saved contact (phone) or a recent chat
 *  scraped from the open app tab (name only, opened via in-app search). */
export interface ChatTarget {
  name: string
  phone?: string
}

export type Msg =
  | { type: 'snip-start' }
  | { type: 'snip-capture'; rect: SnipRect; dpr: number }
  | { type: 'record-start' }
  | { type: 'open-platform'; platform: PlatformId }
  | { type: 'paste-hint' }
  // bar → background
  | { type: 'list-recent'; platform: DraftPlatform }
  | { type: 'send-to-contact'; platform: DraftPlatform; target: ChatTarget; caption: string }
  // background → app-tab injector
  | { type: 'scrape-recent' }
  | { type: 'open-inject'; target: ChatTarget; dataUrl: string; caption: string; autoSend: boolean }

export interface SendResult {
  ok: boolean
  /** user-facing failure text; the image is already on the clipboard */
  error?: string
}

export interface RecentResult {
  ok: boolean
  contacts: ChatTarget[]
  error?: string
}

/** WhatsApp drafts (human presses Send — ToS survival); Telegram auto-sends. */
export const AUTO_SEND: Record<DraftPlatform, boolean> = {
  whatsapp: false,
  telegram: true,
}

export interface CaptureRecord {
  id: string
  dataUrl: string
  width: number
  height: number
  createdAt: number
}

export const CURRENT_CAPTURE_KEY = 'ss.current'
export const RECORD_REQUEST_KEY = 'ss.recordRequest'
/** {platform, ts} — set when the user jumps to a platform from the bar; any
 *  fresh page-load on that platform shows the paste hint (redirect-proof). */
export const PASTE_HINT_KEY = 'ss.pasteHint'

export const PLATFORM_HOSTS: Record<PlatformId, string> = {
  whatsapp: 'web.whatsapp.com',
  telegram: 'web.telegram.org',
  gmail: 'mail.google.com',
  slack: 'app.slack.com',
}
