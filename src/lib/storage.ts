// Typed chrome.storage.local helpers. All state lives here, never in memory (MV3).

export interface BarState {
  x: number | null // null = default bottom-center
  y: number | null
  collapsed: boolean
  hidden: boolean
}

export const defaultBarState: BarState = { x: null, y: null, collapsed: false, hidden: false }

const barKey = (host: string) => `ss.bar.${host}`

export async function getBarState(host: string): Promise<BarState> {
  const key = barKey(host)
  const found = await chrome.storage.local.get(key)
  return { ...defaultBarState, ...(found[key] as Partial<BarState> | undefined) }
}

export async function setBarState(host: string, state: BarState): Promise<void> {
  await chrome.storage.local.set({ [barKey(host)]: state })
}
