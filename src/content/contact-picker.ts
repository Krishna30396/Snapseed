// In-bar contact picker. Clicking WhatsApp/Telegram on the send strip opens
// this popover above the bar: the capture preview, a caption field, and the
// recent chats read from the open app tab (merged with saved contacts).
//
// Default view is a compact GRID of profile-icon avatars (no scrollbar). The
// searchable, scrollable full list + number entry appear only under "More".
// Pick a contact, type a caption, press Enter → it goes to that person's chat
// (Telegram auto-sends; WhatsApp is left as a draft for the human to send).

import { listContacts, normalizePhone } from '../lib/contacts'
import {
  AUTO_SEND,
  CURRENT_CAPTURE_KEY,
  RECENT_CACHE_KEY,
  type CaptureRecord,
  type ChatTarget,
  type DraftPlatform,
  type RecentResult,
  type SendResult,
} from '../lib/messages'

const LABEL: Record<DraftPlatform, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram' }
const GRID_COUNT = 4

interface PickerState {
  selected: ChatTarget | null
  all: ChatTarget[]
}

export function openContactPicker(shadow: ShadowRoot, platform: DraftPlatform): void {
  shadow.querySelector('.picker')?.remove()
  const el = document.createElement('div')
  el.className = 'picker'
  el.innerHTML = `
    <div class="pk-card">
      <div class="pk-head">
        <span class="pk-title">Send via ${LABEL[platform]}</span>
        <button class="pk-close" title="Close">&#10005;</button>
      </div>
      <div class="pk-preview"><img alt="Capture to send" /></div>
      <input class="pk-caption" placeholder="Add a caption…" />
      <div class="pk-grid"><p class="pk-hint">Loading your chats…</p></div>
      <button class="pk-more">More contacts &#9662;</button>
      <div class="pk-expand" hidden>
        <input class="pk-search" placeholder="Search, or type a number" />
        <div class="pk-list"></div>
      </div>
      <p class="pk-status" role="status"></p>
    </div>`
  shadow.querySelector('.wrap')?.append(el)

  const state: PickerState = { selected: null, all: [] }
  loadPreview(el)
  wireClose(el)
  wireMore(el, state)
  wireCaptionEnter(el, platform, state)
  wireSearch(el, platform, state)
  loadContacts(el, state)
}

function loadPreview(el: HTMLElement): void {
  chrome.storage.session.get(CURRENT_CAPTURE_KEY).then((found) => {
    const record = found[CURRENT_CAPTURE_KEY] as CaptureRecord | undefined
    const img = el.querySelector<HTMLImageElement>('.pk-preview img')
    if (img && record) img.src = record.dataUrl
    else el.querySelector('.pk-preview')?.replaceChildren(hint('Snip something first'))
  })
}

function wireClose(el: HTMLElement): void {
  el.querySelector('.pk-close')?.addEventListener('click', () => el.remove())
}

/** "More" reveals the search box + full scrollable list (built lazily). */
function wireMore(el: HTMLElement, state: PickerState): void {
  el.querySelector('.pk-more')?.addEventListener('click', () => {
    const expand = el.querySelector<HTMLElement>('.pk-expand')
    const more = el.querySelector<HTMLElement>('.pk-more')
    if (!expand || !more) return
    const show = expand.hidden
    expand.hidden = !show
    more.innerHTML = show ? 'Fewer contacts &#9652;' : 'More contacts &#9662;'
    if (show) {
      renderList(el, state.all, state)
      el.querySelector<HTMLInputElement>('.pk-search')?.focus()
    }
  })
}

function loadContacts(el: HTMLElement, state: PickerState): void {
  const platform = currentPlatform(el)
  // Cached recent + saved contacts render instantly; the live scrape merges in.
  Promise.all([cachedRecent(platform), savedTargets(platform)]).then(([cached, saved]) => {
    state.all = dedupe([...state.all, ...cached, ...saved])
    renderGrid(el, state)
    if (!state.all.length) el.querySelector('.pk-grid')?.replaceChildren(hint('Loading your chats…'))
  })
  ;(chrome.runtime.sendMessage({ type: 'list-recent', platform }) as Promise<RecentResult>).then(
    (recent) => {
      if (recent.ok && recent.contacts.length) {
        state.all = dedupe([...recent.contacts, ...state.all])
        renderGrid(el, state)
        if (!el.querySelector<HTMLElement>('.pk-expand')?.hidden) renderList(el, state.all, state)
      } else if (!state.all.length) {
        el.querySelector('.pk-grid')?.replaceChildren(
          hint('No chats yet — is the app open? Use More to search or type a number.'),
        )
      }
    },
    () => {
      if (!state.all.length) setStatus(el, 'Could not read recent chats')
    },
  )
}

function currentPlatform(el: HTMLElement): DraftPlatform {
  return el.querySelector('.pk-title')?.textContent?.includes('Telegram') ? 'telegram' : 'whatsapp'
}

async function cachedRecent(platform: DraftPlatform): Promise<ChatTarget[]> {
  try {
    const found = await chrome.storage.session.get(RECENT_CACHE_KEY)
    const cache = found[RECENT_CACHE_KEY] as Partial<Record<DraftPlatform, ChatTarget[]>> | undefined
    return cache?.[platform] ?? []
  } catch {
    return []
  }
}

async function savedTargets(platform: DraftPlatform): Promise<ChatTarget[]> {
  try {
    const saved = await listContacts()
    return saved.filter((c) => c.channel === platform).map((c) => ({ name: c.name, phone: c.phone }))
  } catch {
    return []
  }
}

function dedupe(list: ChatTarget[]): ChatTarget[] {
  const seen = new Set<string>()
  const out: ChatTarget[] = []
  for (const c of list) {
    const key = c.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

/** Compact avatar-icon grid (top GRID_COUNT), no scrollbar. */
function renderGrid(el: HTMLElement, state: PickerState): void {
  const grid = el.querySelector<HTMLElement>('.pk-grid')
  if (!grid) return
  const shown = state.all.slice(0, GRID_COUNT)
  if (!shown.length) return
  grid.replaceChildren(...shown.map((c) => gridTile(el, c, state)))
}

function gridTile(el: HTMLElement, c: ChatTarget, state: PickerState): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'pk-tile'
  btn.title = c.name
  if (state.selected?.name === c.name) btn.classList.add('sel')
  btn.append(avatarEl(c, 40), tileName(c.name))
  btn.addEventListener('click', () => select(el, c, state))
  return btn
}

function tileName(name: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'pk-tile-name'
  span.textContent = name
  return span
}

/** Full scrollable list (rows), shown only under "More". */
function renderList(el: HTMLElement, contacts: ChatTarget[], state: PickerState): void {
  const list = el.querySelector<HTMLElement>('.pk-list')
  if (!list) return
  if (!contacts.length) {
    list.replaceChildren(hint('No matches — type a full number to send to a new contact'))
    return
  }
  list.replaceChildren(
    ...contacts.map((c) => {
      const row = document.createElement('button')
      row.className = 'pk-row'
      row.append(avatarEl(c, 28), nameEl(c.name))
      if (state.selected?.name === c.name) row.classList.add('sel')
      row.addEventListener('click', () => select(el, c, state))
      return row
    }),
  )
}

function select(el: HTMLElement, c: ChatTarget, state: PickerState): void {
  state.selected = c
  el.querySelectorAll('.pk-tile, .pk-row').forEach((r) => r.classList.remove('sel'))
  el.querySelectorAll('.pk-tile, .pk-row').forEach((r) => {
    if (r.getAttribute('title') === c.name || r.textContent?.trim() === c.name) r.classList.add('sel')
  })
  setStatus(el, `${c.name} — press Enter to send`)
}

function wireSearch(el: HTMLElement, _platform: DraftPlatform, state: PickerState): void {
  el.querySelector<HTMLInputElement>('.pk-search')?.addEventListener('input', (ev) => {
    const raw = (ev.target as HTMLInputElement).value.trim()
    const term = raw.toLowerCase()
    // a bare number becomes a send-to-number target
    if (/^[+\d][\d\s-]{5,}$/.test(raw)) {
      const phone = normalizePhone(raw)
      state.selected = { name: `+${phone}`, phone }
      renderList(el, [state.selected], state)
      setStatus(el, `New number +${phone} — press Enter to send`)
      return
    }
    const shown = term ? state.all.filter((c) => c.name.toLowerCase().includes(term)) : state.all
    renderList(el, shown, state)
  })
}

function wireCaptionEnter(el: HTMLElement, platform: DraftPlatform, state: PickerState): void {
  const send = () => {
    if (!state.selected) {
      setStatus(el, 'Pick a contact first')
      return
    }
    const caption = el.querySelector<HTMLInputElement>('.pk-caption')?.value.trim() ?? ''
    const target = state.selected
    setStatus(el, `Sending to ${target.name} on ${LABEL[platform]}…`)
    chrome.runtime.sendMessage({ type: 'send-to-contact', platform, target, caption }).then(
      (res: SendResult) => {
        if (res.ok) {
          setStatus(el, AUTO_SEND[platform] ? `Sent to ${target.name} ✓` : `Draft ready in ${target.name}'s chat`)
          setTimeout(() => el.remove(), 1600)
        } else {
          setStatus(el, res.error ?? 'Send failed')
        }
      },
      () => setStatus(el, 'Send failed — image copied, paste it in the chat'),
    )
  }
  for (const sel of ['.pk-caption', '.pk-search']) {
    el.querySelector<HTMLInputElement>(sel)?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        send()
      }
    })
  }
}

function avatarEl(c: ChatTarget, size: number): HTMLElement {
  if (c.avatar) {
    const img = document.createElement('img')
    img.className = 'pk-avatar pk-avatar-img'
    img.style.width = `${size}px`
    img.style.height = `${size}px`
    img.src = c.avatar
    img.alt = ''
    return img
  }
  const span = document.createElement('span')
  span.className = 'pk-avatar'
  span.style.width = `${size}px`
  span.style.height = `${size}px`
  span.style.lineHeight = `${size}px`
  span.textContent = (c.name.trim()[0] ?? '?').toUpperCase()
  return span
}

function nameEl(name: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'pk-name'
  span.textContent = name
  return span
}

function hint(text: string): HTMLElement {
  const p = document.createElement('p')
  p.className = 'pk-hint'
  p.textContent = text
  return p
}

function setStatus(el: HTMLElement, text: string): void {
  const s = el.querySelector<HTMLElement>('.pk-status')
  if (s) s.textContent = text
}
