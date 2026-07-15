// In-bar contact picker. Clicking WhatsApp/Telegram on the send strip opens
// this popover above the bar: the capture preview, a caption field, and the
// recent chats read from the open app tab (merged with saved contacts). Pick a
// contact, type a caption, press Enter → it goes to that person's chat
// (Telegram auto-sends; WhatsApp is left as a draft for the human to send).

import { listContacts } from '../lib/contacts'
import {
  AUTO_SEND,
  CURRENT_CAPTURE_KEY,
  type CaptureRecord,
  type ChatTarget,
  type DraftPlatform,
  type RecentResult,
  type SendResult,
} from '../lib/messages'

const LABEL: Record<DraftPlatform, string> = { whatsapp: 'WhatsApp', telegram: 'Telegram' }

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
      <input class="pk-caption" placeholder="Add a caption, then pick a contact + Enter" />
      <input class="pk-search" placeholder="Search recent chats & contacts" />
      <div class="pk-list"><p class="pk-hint">Loading recent chats…</p></div>
      <p class="pk-status" role="status"></p>
    </div>`
  shadow.querySelector('.wrap')?.append(el)

  loadPreview(el)
  wireClose(el)
  const state = { selected: null as ChatTarget | null, all: [] as ChatTarget[] }
  wireCaptionEnter(el, platform, state)
  wireSearch(el, state)
  loadContacts(el, platform, state)
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

function loadContacts(
  el: HTMLElement,
  platform: DraftPlatform,
  state: { selected: ChatTarget | null; all: ChatTarget[] },
): void {
  // Saved contacts render immediately; recent chats from the app tab merge in
  // when they arrive (the scrape can take a few seconds on a cold tab).
  listContacts().then(
    (saved) => {
      state.all = dedupe(
        saved.filter((c) => c.channel === platform).map((c) => ({ name: c.name, phone: c.phone })),
      )
      renderList(el, state.all, state)
      if (!state.all.length) el.querySelector('.pk-list')?.replaceChildren(hint('Loading recent chats…'))
    },
    () => undefined,
  )
  ;(chrome.runtime.sendMessage({ type: 'list-recent', platform }) as Promise<RecentResult>).then(
    (recent) => {
      if (recent.ok && recent.contacts.length) {
        state.all = dedupe([...recent.contacts, ...state.all])
        applyFilter(el, state)
      } else if (!state.all.length) {
        setStatus(el, recent.error ?? 'Open the app, then reopen this to see recent chats')
        el.querySelector('.pk-list')?.replaceChildren(hint('No contacts yet — add saved contacts in the panel'))
      }
    },
    () => {
      if (!state.all.length) setStatus(el, 'Could not read recent chats')
    },
  )
}

function applyFilter(el: HTMLElement, state: { selected: ChatTarget | null; all: ChatTarget[] }): void {
  const term = el.querySelector<HTMLInputElement>('.pk-search')?.value.trim().toLowerCase() ?? ''
  const shown = term
    ? state.all.filter((c) => c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term))
    : state.all
  renderList(el, shown, state)
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

function wireSearch(
  el: HTMLElement,
  state: { selected: ChatTarget | null; all: ChatTarget[] },
): void {
  el.querySelector<HTMLInputElement>('.pk-search')?.addEventListener('input', () => applyFilter(el, state))
}

function renderList(
  el: HTMLElement,
  contacts: ChatTarget[],
  state: { selected: ChatTarget | null; all: ChatTarget[] },
): void {
  const list = el.querySelector<HTMLElement>('.pk-list')
  if (!list) return
  if (!contacts.length) {
    list.replaceChildren(hint('No matches — type a name to search in the app'))
    return
  }
  list.replaceChildren(
    ...contacts.map((c) => {
      const row = document.createElement('button')
      row.className = 'pk-row'
      row.innerHTML = `<span class="pk-avatar"></span><span class="pk-name"></span>`
      row.querySelector('.pk-avatar')!.textContent = (c.name[0] ?? '?').toUpperCase()
      row.querySelector('.pk-name')!.textContent = c.name
      if (state.selected?.name === c.name) row.classList.add('sel')
      row.addEventListener('click', () => {
        state.selected = c
        list.querySelectorAll('.pk-row').forEach((r) => r.classList.remove('sel'))
        row.classList.add('sel')
        setStatus(el, `${c.name} selected — press Enter to send`)
      })
      return row
    }),
  )
}

function wireCaptionEnter(
  el: HTMLElement,
  platform: DraftPlatform,
  state: { selected: ChatTarget | null; all: ChatTarget[] },
): void {
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
          setStatus(
            el,
            AUTO_SEND[platform]
              ? `Sent to ${target.name} ✓`
              : `Draft ready in ${target.name}'s chat — press Send`,
          )
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
