// Typed runtime messages. One discriminated union, shared by all contexts.

export interface SnipRect {
  x: number
  y: number
  w: number
  h: number
}

export type Msg =
  | { type: 'snip-start' }
  | { type: 'snip-capture'; rect: SnipRect; dpr: number }

export interface CaptureRecord {
  id: string
  dataUrl: string
  width: number
  height: number
  createdAt: number
}

export const CURRENT_CAPTURE_KEY = 'ss.current'
