// Typed runtime messages. One discriminated union, shared by all contexts.

export interface SnipRect {
  x: number
  y: number
  w: number
  h: number
}

export type DraftChannel = 'whatsapp' | 'telegram'
export type PlatformId = 'whatsapp' | 'telegram' | 'gmail' | 'slack'

export type Msg =
  | { type: 'snip-start' }
  | { type: 'snip-capture'; rect: SnipRect; dpr: number }
  | { type: 'record-start' }
  | { type: 'send-draft'; channel: DraftChannel; phone: string; caption: string }
  | { type: 'inject'; dataUrl: string; caption: string }
  | { type: 'open-platform'; platform: PlatformId }
  | { type: 'paste-hint' }

export interface SendResult {
  ok: boolean
  /** user-facing failure text; the image is already on the clipboard */
  error?: string
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
