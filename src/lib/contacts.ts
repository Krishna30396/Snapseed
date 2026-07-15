// Contact store — chrome.storage.local ONLY. Contacts never leave the device.

export type Channel = 'whatsapp' | 'telegram'

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

export interface Contact {
  id: string
  name: string
  phone: string // digits with country code, no + or spaces
  channel: Channel
  pinned: boolean
  lastUsed: number
}

const KEY = 'ss.contacts'

export async function listContacts(): Promise<Contact[]> {
  const found = await chrome.storage.local.get(KEY)
  const all = (found[KEY] as Contact[] | undefined) ?? []
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastUsed - a.lastUsed)
}

export async function addContact(name: string, phone: string, channel: Channel): Promise<Contact> {
  const contact: Contact = {
    id: crypto.randomUUID(),
    name: name.trim(),
    phone: normalizePhone(phone),
    channel,
    pinned: false,
    lastUsed: 0,
  }
  const all = await listContacts()
  await save([contact, ...all])
  return contact
}

export async function updateContact(id: string, patch: Partial<Contact>): Promise<void> {
  const all = await listContacts()
  await save(all.map((c) => (c.id === id ? { ...c, ...patch } : c)))
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

function save(all: Contact[]): Promise<void> {
  return chrome.storage.local.set({ [KEY]: all })
}
