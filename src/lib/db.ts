import type { AccountRecord, Books, Meta, SecretRecord, Settings, SnapshotRecord, TransactionRecord } from './types.ts'
import { DEFAULT_META, DEFAULT_SETTINGS } from './types.ts'

const DB_NAME = 'sable'
const DB_VERSION = 1

export interface Bundle extends Books {
  secret: SecretRecord | null
  settings: Settings
  meta: Meta
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('transactions')) db.createObjectStore('transactions', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not open.'))
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadBundle(): Promise<Bundle> {
  const db = await openDb()
  try {
    const tx = db.transaction(['accounts', 'transactions', 'snapshots', 'kv'], 'readonly')
    const accountsP = request(tx.objectStore('accounts').getAll() as IDBRequest<AccountRecord[]>)
    const transactionsP = request(tx.objectStore('transactions').getAll() as IDBRequest<TransactionRecord[]>)
    const snapshotsP = request(tx.objectStore('snapshots').getAll() as IDBRequest<SnapshotRecord[]>)
    const kvP = request(tx.objectStore('kv').getAll() as IDBRequest<{ id: string; value: unknown }[]>)
    const [accounts, transactions, snapshots, kv] = await Promise.all([accountsP, transactionsP, snapshotsP, kvP])
    const find = (id: string) => kv.find((row) => row.id === id)?.value
    const settings = { ...DEFAULT_SETTINGS, ...(find('settings') as Partial<Settings> | undefined) }
    const meta = { ...DEFAULT_META, ...(find('meta') as Partial<Meta> | undefined) }
    const secret = (find('secret') as SecretRecord | null | undefined) ?? null
    return { accounts, transactions, snapshots, settings, meta, secret }
  } finally {
    db.close()
  }
}

export async function persistBundle(bundle: Bundle): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['accounts', 'transactions', 'snapshots', 'kv'], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save local data.'))
      tx.onabort = () => reject(tx.error ?? new Error('Could not save local data.'))
      const write = (name: string, rows: unknown[]) => {
        const store = tx.objectStore(name)
        store.clear()
        for (const row of rows) store.put(row)
      }
      write('accounts', bundle.accounts)
      write('transactions', bundle.transactions)
      write('snapshots', bundle.snapshots)
      const kv = tx.objectStore('kv')
      kv.put({ id: 'settings', value: bundle.settings })
      kv.put({ id: 'meta', value: bundle.meta })
      if (bundle.secret) kv.put({ id: 'secret', value: bundle.secret })
      else kv.delete('secret')
    })
  } finally {
    db.close()
  }
}

export async function eraseDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
