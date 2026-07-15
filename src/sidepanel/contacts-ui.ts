// Contacts section of the send screen: pinned favorites, search, list,
// add-contact form, new-number quick send, and the mis-send confirm sheet.
// Channel memory (3.5): each contact carries their default channel; right-click
// a row to switch it; sending through a channel makes it the new default.

import {
  addContact,
  CHANNEL_LABEL,
  listContacts,
  normalizePhone,
  updateContact,
  type Channel,
  type Contact,
} from '../lib/contacts'

export interface PickedTarget {
  name: string
  phone: string
  channel: Channel
  contactId?: string
}

const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABEL) as Channel[])
  .map((c) => `<option value="${c}">${CHANNEL_LABEL[c]}</option>`)
  .join('')

export function mountContactsUI(
  host: HTMLElement,
  onSend: (target: PickedTarget) => void,
): void {
  host.innerHTML = `
    <p class="hint">Send to</p>
    <div class="favs"></div>
    <input class="search" type="search" placeholder="Search contacts" />
    <div class="list"></div>
    <div class="row-actions">
      <button class="tool add-toggle">Add contact</button>
    </div>
    <form class="add-form" hidden>
      <input name="name" placeholder="Name" required />
      <input name="phone" placeholder="Phone with country code" required />
      <select name="channel" class="channel-select">${CHANNEL_OPTIONS}</select>
      <button class="tool" type="submit">Save contact</button>
    </form>
    <div class="quick">
      <input class="quick-phone" placeholder="New number (with country code)" />
      <select class="quick-channel channel-select">${CHANNEL_OPTIONS}</select>
      <button class="tool quick-send">Send</button>
    </div>`

  const refresh = () => renderLists(host, confirmThenSend)
  const confirmThenSend = (target: PickedTarget) => {
    showConfirmSheet(host, target, () => {
      if (target.contactId) {
        // channel memory: sending via a channel makes it that contact's default
        updateContact(target.contactId, { lastUsed: Date.now(), channel: target.channel }).catch(
          () => {
            // memory is cosmetic; sending continues regardless
          },
        )
      }
      onSend(target)
    })
  }

  host.querySelector<HTMLInputElement>('.search')?.addEventListener('input', refresh)
  wireAddForm(host, refresh)
  wireQuickSend(host, confirmThenSend)
  refresh()
}

function renderLists(host: HTMLElement, pick: (t: PickedTarget) => void): void {
  const favs = host.querySelector<HTMLElement>('.favs')
  const list = host.querySelector<HTMLElement>('.list')
  const term = host.querySelector<HTMLInputElement>('.search')?.value.trim().toLowerCase() ?? ''
  if (!favs || !list) return
  listContacts().then(
    (all) => {
      favs.replaceChildren(...all.filter((c) => c.pinned).map((c) => favChip(c, pick)))
      const shown = term
        ? all.filter((c) => c.name.toLowerCase().includes(term) || c.phone.includes(term))
        : all
      list.replaceChildren(...shown.map((c) => contactRow(c, pick, () => renderLists(host, pick))))
      if (!all.length) {
        list.innerHTML = `<p class="hint">No contacts yet — add one below or use a new number.</p>`
      }
    },
    () => {
      list.innerHTML = `<p class="hint">Could not load contacts.</p>`
    },
  )
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}

function asTarget(c: Contact): PickedTarget {
  return { name: c.name, phone: c.phone, channel: c.channel, contactId: c.id }
}

function favChip(c: Contact, pick: (t: PickedTarget) => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'fav'
  btn.title = `${c.name} — ${CHANNEL_LABEL[c.channel]}`
  btn.innerHTML = `<span class="avatar"></span><span class="fav-name"></span>`
  btn.querySelector('.avatar')!.textContent = initial(c.name)
  btn.querySelector('.fav-name')!.textContent = c.name
  btn.addEventListener('click', () => pick(asTarget(c)))
  return btn
}

function contactRow(
  c: Contact,
  pick: (t: PickedTarget) => void,
  changed: () => void,
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'contact'
  row.innerHTML = `
    <button class="main" title="Right-click to switch channel"><span class="avatar"></span>
      <span class="who"><span class="name"></span><span class="phone hint"></span></span>
      <span class="badge"></span></button>
    <button class="pin" title="Pin to favorites">${c.pinned ? '&#9733;' : '&#9734;'}</button>`
  row.querySelector('.avatar')!.textContent = initial(c.name)
  row.querySelector('.name')!.textContent = c.name
  row.querySelector('.phone')!.textContent = `+${c.phone}`
  row.querySelector('.badge')!.textContent = CHANNEL_LABEL[c.channel]
  row.querySelector('.main')?.addEventListener('click', () => pick(asTarget(c)))
  row.querySelector('.main')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault()
    const next: Channel = c.channel === 'whatsapp' ? 'telegram' : 'whatsapp'
    updateContact(c.id, { channel: next }).then(changed, changed)
  })
  row.querySelector('.pin')?.addEventListener('click', () => {
    updateContact(c.id, { pinned: !c.pinned }).then(changed, changed)
  })
  return row
}

function wireAddForm(host: HTMLElement, refresh: () => void): void {
  const form = host.querySelector<HTMLFormElement>('.add-form')
  host.querySelector('.add-toggle')?.addEventListener('click', () => {
    if (form) form.hidden = !form.hidden
  })
  form?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const phone = (form.elements.namedItem('phone') as HTMLInputElement).value
    const channel = (form.elements.namedItem('channel') as HTMLSelectElement).value as Channel
    if (!name.trim() || normalizePhone(phone).length < 7) return
    addContact(name, phone, channel).then(
      () => {
        form.reset()
        form.hidden = true
        refresh()
      },
      () => {
        form.querySelector('button')!.textContent = 'Could not save — retry'
      },
    )
  })
}

function wireQuickSend(host: HTMLElement, pick: (t: PickedTarget) => void): void {
  host.querySelector('.quick-send')?.addEventListener('click', () => {
    const input = host.querySelector<HTMLInputElement>('.quick-phone')
    const channel =
      (host.querySelector<HTMLSelectElement>('.quick-channel')?.value as Channel) ?? 'whatsapp'
    const phone = normalizePhone(input?.value ?? '')
    if (phone.length < 7) {
      input?.focus()
      return
    }
    pick({ name: `+${phone}`, phone, channel })
  })
}

/** Mis-send guard: full-name + avatar confirmation; confirm is dead for 700ms
 *  so a double-click cannot fire it. Nothing is sent by this sheet — it only
 *  opens a DRAFT in the chat app. */
function showConfirmSheet(host: HTMLElement, target: PickedTarget, go: () => void): void {
  host.querySelector('.sheet')?.remove()
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.innerHTML = `
    <div class="card">
      <span class="avatar big"></span>
      <p class="sending">Sending to <strong class="to"></strong> on <span class="via"></span></p>
      <p class="hint">Opens a draft — you press Send in the chat.</p>
      <div class="actions">
        <button class="cancel">Cancel</button>
        <button class="primary confirm" disabled>Open draft</button>
      </div>
    </div>`
  sheet.querySelector('.avatar')!.textContent = initial(target.name)
  sheet.querySelector('.to')!.textContent = target.name
  sheet.querySelector('.via')!.textContent = CHANNEL_LABEL[target.channel]
  sheet.querySelector('.cancel')?.addEventListener('click', () => sheet.remove())
  const confirm = sheet.querySelector<HTMLButtonElement>('.confirm')
  setTimeout(() => {
    if (confirm) confirm.disabled = false
  }, 700)
  confirm?.addEventListener('click', () => {
    sheet.remove()
    go()
  })
  host.append(sheet)
}
