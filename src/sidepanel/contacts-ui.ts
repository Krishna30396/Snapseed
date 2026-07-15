// Contacts section of the send screen: pinned favorites, search, list,
// add-contact form, new-number quick send, and the mis-send confirm sheet.

import { addContact, listContacts, normalizePhone, updateContact, type Contact } from '../lib/contacts'

export interface PickedTarget {
  name: string
  phone: string
  contactId?: string
}

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
      <button class="tool" type="submit">Save contact</button>
    </form>
    <div class="quick">
      <input class="quick-phone" placeholder="New number (with country code)" />
      <button class="tool quick-send">Send</button>
    </div>`

  const refresh = () => renderLists(host, confirmThenSend)
  const confirmThenSend = (target: PickedTarget) => {
    showConfirmSheet(host, target, () => {
      if (target.contactId) {
        updateContact(target.contactId, { lastUsed: Date.now() }).catch(() => {
          // lastUsed is cosmetic; sending continues regardless
        })
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
      favs.replaceChildren(
        ...all.filter((c) => c.pinned).map((c) => favChip(c, pick)),
      )
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

function favChip(c: Contact, pick: (t: PickedTarget) => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'fav'
  btn.title = `${c.name} — WhatsApp`
  btn.innerHTML = `<span class="avatar"></span><span class="fav-name"></span>`
  btn.querySelector('.avatar')!.textContent = initial(c.name)
  btn.querySelector('.fav-name')!.textContent = c.name
  btn.addEventListener('click', () => pick({ name: c.name, phone: c.phone, contactId: c.id }))
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
    <button class="main"><span class="avatar"></span>
      <span class="who"><span class="name"></span><span class="phone hint"></span></span>
      <span class="badge">WhatsApp</span></button>
    <button class="pin" title="Pin to favorites">${c.pinned ? '&#9733;' : '&#9734;'}</button>`
  row.querySelector('.avatar')!.textContent = initial(c.name)
  row.querySelector('.name')!.textContent = c.name
  row.querySelector('.phone')!.textContent = `+${c.phone}`
  row.querySelector('.main')?.addEventListener('click', () =>
    pick({ name: c.name, phone: c.phone, contactId: c.id }),
  )
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
    if (!name.trim() || normalizePhone(phone).length < 7) return
    addContact(name, phone, 'whatsapp').then(
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
    const phone = normalizePhone(input?.value ?? '')
    if (phone.length < 7) {
      input?.focus()
      return
    }
    pick({ name: `+${phone}`, phone })
  })
}

/** Mis-send guard: full-name + avatar confirmation; confirm is dead for 700ms
 *  so a double-click cannot fire it. Nothing is sent by this sheet — it only
 *  opens a DRAFT in WhatsApp. */
function showConfirmSheet(host: HTMLElement, target: PickedTarget, go: () => void): void {
  host.querySelector('.sheet')?.remove()
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.innerHTML = `
    <div class="card">
      <span class="avatar big"></span>
      <p class="sending">Sending to <strong class="to"></strong> on WhatsApp</p>
      <p class="hint">Opens a draft — you press Send in WhatsApp.</p>
      <div class="actions">
        <button class="cancel">Cancel</button>
        <button class="primary confirm" disabled>Open draft</button>
      </div>
    </div>`
  sheet.querySelector('.avatar')!.textContent = initial(target.name)
  sheet.querySelector('.to')!.textContent = target.name
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
