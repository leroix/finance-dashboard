import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { openBackup, sealBackup, type BackupPayload } from '../lib/backup.ts'
import { b64ToBytes, bytesToB64, randomBytes } from '../lib/bytes.ts'
import { transactionsToCsv } from '../lib/csv.ts'
import { decryptString, deriveAesKeyFromPassphrase, deriveAesKeyFromPrf, encryptString } from '../lib/crypto.ts'
import { eraseDatabase, loadBundle, persistBundle, type Bundle } from '../lib/db.ts'
import { todayISO, unixNow } from '../lib/dates.ts'
import { downloadText } from '../lib/download.ts'
import { snapshotKey, transactionKey, applySync } from '../lib/merge.ts'
import { normalizeIncludePercent } from '../lib/networth.ts'
import { createPrfCredential, detectPrfSupport, getPrfAssertion, passkeyErrorMessage, type PrfSupport } from '../lib/passkey.ts'
import { publicErrorMessage } from '../lib/sanitize.ts'
import { getAccessUrl, hasAccessUrl, setAccessUrl } from '../lib/session.ts'
import {
  DEMO_SETUP_TOKEN,
  PUBLIC_DEMO_ACCESS_URL,
  SimpleFINError,
  fetchAccountSet,
  fetchHistory,
  inferAccountType,
  isDemoMaterial,
  obtainAccessUrl,
  splitAccessUrl,
  type ParsedSet,
} from '../lib/simplefin.ts'
import {
  DEFAULT_META,
  DEFAULT_SETTINGS,
  type AccountRecord,
  type AccountType,
  type Books,
  type FlowClass,
  type Meta,
  type SecretRecord,
  type Settings,
  type TransactionRecord,
} from '../lib/types.ts'

export interface ManualInput {
  name: string
  institution: string
  type: AccountType
  balance: number
}

interface AppState {
  ready: boolean
  bootError: string | null
  accounts: AccountRecord[]
  transactions: TransactionRecord[]
  snapshots: Books['snapshots']
  secret: SecretRecord | null
  settings: Settings
  meta: Meta
  hasAccess: boolean
  syncing: boolean
  syncLabel: string
  banner: string | null
  bannerTone: 'info' | 'bad'
  prf: PrfSupport
}

export interface Store extends AppState {
  connectPaste: (text: string) => Promise<boolean>
  connectDemo: () => Promise<boolean>
  refreshBalances: () => Promise<boolean>
  syncHistory: () => Promise<boolean>
  lockPasskey: () => Promise<boolean>
  lockPassphrase: (passphrase: string) => Promise<boolean>
  unlockPasskey: () => Promise<boolean>
  unlockPassphrase: (passphrase: string) => Promise<boolean>
  forgetKey: () => Promise<boolean>
  eraseAll: () => Promise<boolean>
  addManual: (input: ManualInput) => Promise<boolean>
  updateManual: (id: string, input: ManualInput) => Promise<boolean>
  deleteManual: (id: string) => Promise<boolean>
  setType: (id: string, type: AccountType | null) => Promise<boolean>
  setInvert: (id: string, invert: boolean | null) => Promise<boolean>
  setIncludePercent: (id: string, percent: number) => Promise<boolean>
  setFlow: (key: string, flow: FlowClass | null) => Promise<boolean>
  setLookback: (days: number) => Promise<boolean>
  setForecast: (settings: Settings) => Promise<boolean>
  exportBackup: (passphrase: string, includeAccess: boolean) => Promise<boolean>
  importBackup: (text: string, passphrase: string) => Promise<boolean>
  exportCsv: () => void
  dismissBanner: () => void
  dismissErrors: () => Promise<boolean>
}

const StoreContext = createContext<Store | null>(null)

const initial: AppState = {
  ready: false,
  bootError: null,
  accounts: [],
  transactions: [],
  snapshots: [],
  secret: null,
  settings: DEFAULT_SETTINGS,
  meta: DEFAULT_META,
  hasAccess: false,
  syncing: false,
  syncLabel: '',
  banner: null,
  bannerTone: 'info',
  prf: 'unknown',
}

function toBundle(state: AppState): Bundle {
  return {
    accounts: state.accounts,
    transactions: state.transactions,
    snapshots: state.snapshots,
    settings: state.settings,
    meta: state.meta,
    secret: state.secret,
  }
}

function booksFromParsed(parsed: ParsedSet, today: string): Books {
  const updatedAt = Date.now()
  const accounts: AccountRecord[] = parsed.accounts.map((account) => ({
    id: account.id,
    source: 'simplefin',
    name: account.name,
    institution: account.institution,
    currency: account.currency,
    balance: account.balance,
    availableBalance: account.availableBalance,
    balanceDate: account.balanceDate,
    inferredType: inferAccountType(account.name, account.institution),
    typeOverride: null,
    invertOwed: null,
    includePercent: 100,
    holdings: account.holdings,
    updatedAt,
  }))
  const transactions = parsed.accounts.flatMap((account) =>
    account.transactions.map((tx) => ({
      key: transactionKey(account.id, tx.id),
      accountId: account.id,
      id: tx.id,
      posted: tx.posted,
      amount: tx.amount,
      description: tx.description,
      pending: tx.pending,
      flowOverride: null,
    })),
  )
  const snapshots = accounts.map((account) => ({
    key: snapshotKey(account.id, today),
    accountId: account.id,
    date: today,
    balance: account.balance,
    source: 'observed' as const,
  }))
  return { accounts, transactions, snapshots }
}

function explain(err: unknown): string {
  if (err instanceof DOMException) return passkeyErrorMessage(err)
  return publicErrorMessage(err)
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initial)
  const stateRef = useRef(state)

  useEffect(() => {
    let cancelled = false
    loadBundle()
      .then((bundle) => {
        if (cancelled) return
        const accounts = bundle.accounts.map((account) => ({
          ...account,
          includePercent: normalizeIncludePercent(account.includePercent),
        }))
        const next = { ...stateRef.current, ...bundle, accounts, ready: true, bootError: null }
        stateRef.current = next
        setState(next)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const next = {
          ...stateRef.current,
          ready: true,
          bootError: explain(err) || 'This browser could not open the local database.',
        }
        stateRef.current = next
        setState(next)
      })
    detectPrfSupport()
      .then((prf) => {
        if (cancelled) return
        stateRef.current = { ...stateRef.current, prf }
        setState((current) => ({ ...current, prf }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  async function commit(patch: Partial<AppState>): Promise<void> {
    const next = { ...stateRef.current, ...patch }
    stateRef.current = next
    setState(next)
    try {
      await persistBundle(toBundle(next))
    } catch (err) {
      const message = explain(err)
      const failed = { ...next, banner: message, bannerTone: 'bad' as const, syncing: false }
      stateRef.current = failed
      setState(failed)
      throw err
    }
  }

  function patchLocal(patch: Partial<AppState>) {
    const next = { ...stateRef.current, ...patch }
    stateRef.current = next
    setState(next)
  }

  async function requireAccess(): Promise<string> {
    const access = getAccessUrl()
    if (!access) throw new SimpleFINError('Unlock the saved key, or paste the access URL, before refreshing.')
    return access
  }

  async function ingest(parsed: ParsedSet, mode: 'replace' | 'merge', usingDemo?: boolean) {
    const today = todayISO()
    const incoming = booksFromParsed(parsed, today)
    const current = stateRef.current
    const books = applySync(current, incoming, mode)
    await commit({
      ...books,
      meta: {
        ...current.meta,
        lastSyncAt: Date.now(),
        usingDemo: usingDemo ?? current.meta.usingDemo,
        lastErrors: parsed.errors,
      },
      syncing: false,
      syncLabel: '',
    })
  }

  async function connectFrom(text: string, demoButton: boolean) {
    patchLocal({ syncing: true, syncLabel: 'Claiming access…', banner: null })
    let accessUrl: string
    let fallback = false
    try {
      accessUrl = await obtainAccessUrl(text)
    } catch (err) {
      const demo = demoButton || isDemoMaterial(text)
      if (demo && err instanceof SimpleFINError && err.claimRejected) {
        accessUrl = PUBLIC_DEMO_ACCESS_URL
        fallback = true
      } else {
        throw err
      }
    }
    splitAccessUrl(accessUrl)
    setAccessUrl(accessUrl)
    patchLocal({ hasAccess: true, syncLabel: 'Fetching history…' })
    const parsed = await fetchHistory(accessUrl, {
      lookbackDays: stateRef.current.meta.lookbackDays,
      onProgress: (index, total) => patchLocal({ syncLabel: `Fetching window ${index} of ${total}…` }),
    })
    await ingest(parsed, 'replace', isDemoMaterial(text) || fallback || isDemoMaterial(accessUrl))
    const note = fallback
      ? 'The legacy demo claim token is already claimed, so Sable used the public demo access URL. '
      : ''
    patchLocal({
      banner: `${note}Connected. The access URL is in this tab’s memory only. Lock it with a passkey, and keep a copy in your password manager.`,
      bannerTone: 'info',
    })
  }

  async function run(work: () => Promise<void>): Promise<boolean> {
    try {
      await work()
      return stateRef.current.bannerTone !== 'bad'
    } catch (err) {
      patchLocal({ syncing: false, syncLabel: '', banner: explain(err), bannerTone: 'bad' })
      return false
    }
  }

  const api: Store = {
    ...state,
    connectPaste: (text) => run(() => connectFrom(text, false)),
    connectDemo: () => run(() => connectFrom(DEMO_SETUP_TOKEN, true)),
    refreshBalances: () =>
      run(async () => {
        patchLocal({ syncing: true, syncLabel: 'Refreshing balances…', banner: null })
        const parsed = await fetchAccountSet(await requireAccess(), { balancesOnly: true, pending: true })
        await ingest(parsed, 'merge')
      }),
    syncHistory: () =>
      run(async () => {
        patchLocal({ syncing: true, syncLabel: 'Fetching history…', banner: null })
        const parsed = await fetchHistory(await requireAccess(), {
          lookbackDays: stateRef.current.meta.lookbackDays,
          onProgress: (index, total) => patchLocal({ syncLabel: `Fetching window ${index} of ${total}…` }),
        })
        await ingest(parsed, 'merge')
      }),
    lockPasskey: () =>
      run(async () => {
        const access = await requireAccess()
        patchLocal({ syncing: true, syncLabel: 'Waiting for the passkey…' })
        const fresh = await createPrfCredential()
        const salt = randomBytes(16)
        const key = await deriveAesKeyFromPrf(fresh.prf, salt)
        const packed = await encryptString(key, access)
        await commit({
          secret: {
            method: 'prf',
            credentialId: fresh.credentialId,
            prfSalt: fresh.prfSalt,
            kdfSalt: bytesToB64(salt),
            iv: packed.iv,
            ciphertext: packed.ciphertext,
          },
          syncing: false,
          syncLabel: '',
          banner: 'Locked with a passkey. This browser can unlock it on this site. Keep the access URL in your password manager.',
          bannerTone: 'info',
        })
      }),
    lockPassphrase: (passphrase) =>
      run(async () => {
        const access = await requireAccess()
        if (passphrase.length < 10) throw new Error('Use a passphrase of at least 10 characters.')
        patchLocal({ syncing: true, syncLabel: 'Deriving a key…' })
        const salt = randomBytes(16)
        const key = await deriveAesKeyFromPassphrase(passphrase, salt)
        const packed = await encryptString(key, access)
        await commit({
          secret: {
            method: 'passphrase',
            kdfSalt: bytesToB64(salt),
            iv: packed.iv,
            ciphertext: packed.ciphertext,
          },
          syncing: false,
          syncLabel: '',
          banner: 'Locked with a passphrase. It is not saved. Keep the access URL in your password manager too.',
          bannerTone: 'info',
        })
      }),
    unlockPasskey: () =>
      run(async () => {
        const secret = stateRef.current.secret
        if (!secret || secret.method !== 'prf' || !secret.credentialId || !secret.prfSalt) {
          throw new Error('There is no passkey lock on this device.')
        }
        patchLocal({ syncing: true, syncLabel: 'Waiting for the passkey…' })
        const prf = await getPrfAssertion(secret.credentialId, secret.prfSalt)
        const key = await deriveAesKeyFromPrf(prf, b64ToBytes(secret.kdfSalt))
        const access = await decryptString(key, secret)
        splitAccessUrl(access)
        setAccessUrl(access)
        patchLocal({ hasAccess: true, syncing: false, syncLabel: '', banner: 'Unlocked. You can refresh from SimpleFIN.', bannerTone: 'info' })
      }),
    unlockPassphrase: (passphrase) =>
      run(async () => {
        const secret = stateRef.current.secret
        if (!secret || secret.method !== 'passphrase') throw new Error('There is no passphrase lock on this device.')
        patchLocal({ syncing: true, syncLabel: 'Checking the passphrase…' })
        const key = await deriveAesKeyFromPassphrase(passphrase, b64ToBytes(secret.kdfSalt), secret.iterations)
        const access = await decryptString(key, secret)
        splitAccessUrl(access)
        setAccessUrl(access)
        patchLocal({
          hasAccess: true,
          syncing: false,
          syncLabel: '',
          banner: 'Unlocked. You can refresh from SimpleFIN.',
          bannerTone: 'info',
        })
      }),
    forgetKey: () =>
      run(async () => {
        setAccessUrl(null)
        await commit({
          secret: null,
          hasAccess: false,
          banner: 'The saved key is gone. Balances already on this device stay. Paste the access URL from your password manager to refresh again.',
          bannerTone: 'info',
        })
      }),
    eraseAll: () =>
      run(async () => {
        setAccessUrl(null)
        await eraseDatabase()
        const next: AppState = {
          ...initial,
          ready: true,
          prf: stateRef.current.prf,
          banner: 'Everything stored by Sable on this device was deleted.',
          bannerTone: 'info',
        }
        stateRef.current = next
        setState(next)
      }),
    addManual: (input) =>
      run(async () => {
        const today = todayISO()
        const id = `manual:${crypto.randomUUID()}`
        const account: AccountRecord = {
          id,
          source: 'manual',
          name: input.name.trim(),
          institution: input.institution.trim() || 'Manual',
          currency: 'USD',
          balance: input.balance,
          availableBalance: null,
          balanceDate: unixNow(),
          inferredType: input.type,
          typeOverride: null,
          invertOwed: input.type === 'liability' ? true : null,
          includePercent: 100,
          holdings: [],
          updatedAt: Date.now(),
        }
        const current = stateRef.current
        await commit({
          accounts: [...current.accounts, account],
          snapshots: [
            ...current.snapshots,
            { key: snapshotKey(id, today), accountId: id, date: today, balance: input.balance, source: 'manual' },
          ],
          banner: null,
        })
      }),
    updateManual: (id, input) =>
      run(async () => {
        const today = todayISO()
        const current = stateRef.current
        const accounts = current.accounts.map((account) =>
          account.id === id && account.source === 'manual'
            ? {
                ...account,
                name: input.name.trim(),
                institution: input.institution.trim() || 'Manual',
                inferredType: input.type,
                balance: input.balance,
                invertOwed: input.type === 'liability' ? (account.invertOwed ?? true) : account.invertOwed,
                balanceDate: unixNow(),
                updatedAt: Date.now(),
              }
            : account,
        )
        const snap = {
          key: snapshotKey(id, today),
          accountId: id,
          date: today,
          balance: input.balance,
          source: 'manual' as const,
        }
        await commit({
          accounts,
          snapshots: [...current.snapshots.filter((item) => item.key !== snap.key), snap],
        })
      }),
    deleteManual: (id) =>
      run(async () => {
        const current = stateRef.current
        await commit({
          accounts: current.accounts.filter((account) => account.id !== id),
          transactions: current.transactions.filter((tx) => tx.accountId !== id),
          snapshots: current.snapshots.filter((snap) => snap.accountId !== id),
        })
      }),
    setType: (id, type) =>
      run(async () => {
        await commit({
          accounts: stateRef.current.accounts.map((account) =>
            account.id === id ? { ...account, typeOverride: type } : account,
          ),
        })
      }),
    setInvert: (id, invert) =>
      run(async () => {
        await commit({
          accounts: stateRef.current.accounts.map((account) =>
            account.id === id ? { ...account, invertOwed: invert } : account,
          ),
        })
      }),
    setIncludePercent: (id, percent) =>
      run(async () => {
        const includePercent = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 100))
        await commit({
          accounts: stateRef.current.accounts.map((account) =>
            account.id === id ? { ...account, includePercent } : account,
          ),
        })
      }),
    setFlow: (key, flow) =>
      run(async () => {
        await commit({
          transactions: stateRef.current.transactions.map((tx) => (tx.key === key ? { ...tx, flowOverride: flow } : tx)),
        })
      }),
    setLookback: (days) =>
      run(async () => {
        await commit({ meta: { ...stateRef.current.meta, lookbackDays: days } })
      }),
    setForecast: (settings) => run(async () => commit({ settings })),
    exportBackup: (passphrase, includeAccess) =>
      run(async () => {
        const current = stateRef.current
        const payload: BackupPayload = {
          exportedAt: new Date().toISOString(),
          accounts: current.accounts,
          transactions: current.transactions,
          snapshots: current.snapshots,
          settings: current.settings,
          meta: current.meta,
          accessUrl: includeAccess ? (getAccessUrl() ?? undefined) : undefined,
        }
        if (includeAccess && !payload.accessUrl) {
          throw new Error('Unlock or connect first if you want the access URL inside the backup.')
        }
        patchLocal({ syncing: true, syncLabel: 'Encrypting the backup…' })
        const envelope = await sealBackup(payload, passphrase)
        downloadText(`sable-backup-${todayISO()}.json`, JSON.stringify(envelope, null, 2), 'application/json')
        patchLocal({
          syncing: false,
          syncLabel: '',
          banner: payload.accessUrl
            ? 'Backup downloaded. The access URL is inside the file, encrypted with the passphrase you just chose.'
            : 'Backup downloaded. It does not include the access URL.',
          bannerTone: 'info',
        })
      }),
    importBackup: (text, passphrase) =>
      run(async () => {
        patchLocal({ syncing: true, syncLabel: 'Decrypting the backup…' })
        const payload = await openBackup(JSON.parse(text) as unknown, passphrase)
        let accessNote = 'The backup did not include an access URL.'
        if (payload.accessUrl) {
          try {
            const parts = splitAccessUrl(payload.accessUrl)
            const restored = new URL(parts.base)
            restored.username = parts.username
            restored.password = parts.password
            setAccessUrl(restored.toString())
            accessNote = 'The access URL from the backup is in this tab’s memory. Lock it again on this device.'
          } catch {
            setAccessUrl(null)
            accessNote = 'The backup’s access URL was not usable, so it was not kept.'
          }
        } else {
          setAccessUrl(null)
        }
        await commit({
          accounts: payload.accounts,
          transactions: payload.transactions,
          snapshots: payload.snapshots,
          settings: payload.settings,
          meta: payload.meta,
          hasAccess: hasAccessUrl(),
          syncing: false,
          syncLabel: '',
          banner: `Backup restored. ${accessNote}`,
          bannerTone: 'info',
        })
      }),
    exportCsv: () => {
      const current = stateRef.current
      downloadText(
        `sable-transactions-${todayISO()}.csv`,
        transactionsToCsv(current.accounts, current.transactions),
        'text/csv;charset=utf-8',
      )
    },
    dismissBanner: () => patchLocal({ banner: null }),
    dismissErrors: () =>
      run(async () => {
        await commit({ meta: { ...stateRef.current.meta, lastErrors: [] } })
      }),
  }

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('Sable store is missing.')
  return store
}
