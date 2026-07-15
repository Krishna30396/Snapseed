// Last-5 capture history. Blobs live in IndexedDB (works in both the service
// worker and the side panel); metadata rides along in the same record.

export interface HistoryEntry {
  id: string
  blob: Blob
  width: number
  height: number
  createdAt: number
}

const DB = 'snapsend'
const STORE = 'captures'
const KEEP = 5

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'))
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB tx aborted'))
  })
}

export async function saveToHistory(entry: HistoryEntry): Promise<void> {
  const db = await openDb()
  const all = await listHistory(db)
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(entry)
  for (const old of all.slice(KEEP - 1)) tx.objectStore(STORE).delete(old.id)
  await done(tx)
  db.close()
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const db = await openDb()
  const all = await listHistory(db)
  db.close()
  return all
}

function listHistory(db: IDBDatabase): Promise<HistoryEntry[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll()
    req.onsuccess = () =>
      resolve((req.result as HistoryEntry[]).sort((a, b) => b.createdAt - a.createdAt))
    req.onerror = () => reject(req.error ?? new Error('indexedDB read failed'))
  })
}
