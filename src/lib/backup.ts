import { b64ToBytes, bytesToB64, randomBytes } from './bytes.ts'
import { decryptString, deriveAesKeyFromPassphrase, encryptString, PBKDF2_ITERATIONS } from './crypto.ts'
import type { AccountRecord, Meta, Settings, SnapshotRecord, TransactionRecord } from './types.ts'
import { DEFAULT_META, DEFAULT_SETTINGS } from './types.ts'

export interface BackupEnvelope {
  format: 'sable-backup'
  version: 1
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

export interface BackupPayload {
  exportedAt: string
  accounts: AccountRecord[]
  transactions: TransactionRecord[]
  snapshots: SnapshotRecord[]
  settings: Settings
  meta: Meta
  accessUrl?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export async function sealBackup(
  payload: BackupPayload,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<BackupEnvelope> {
  if (passphrase.length < 10) throw new Error('Use a passphrase of at least 10 characters.')
  const salt = randomBytes(16)
  const key = await deriveAesKeyFromPassphrase(passphrase, salt, iterations)
  const packed = await encryptString(key, JSON.stringify(payload))
  return {
    format: 'sable-backup',
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToB64(salt),
    iv: packed.iv,
    ciphertext: packed.ciphertext,
  }
}

export function normalizeBackup(value: unknown): BackupPayload {
  const root = asRecord(value)
  if (!root) throw new Error('That backup did not contain Sable data.')
  const accounts = Array.isArray(root.accounts) ? root.accounts.filter(isAccount).map(completeAccount) : []
  const transactions = Array.isArray(root.transactions) ? root.transactions.filter(isTransaction).map(completeTransaction) : []
  const snapshots = Array.isArray(root.snapshots) ? root.snapshots.filter(isSnapshot).map(completeSnapshot) : []
  const settings = asRecord(root.settings)
  const meta = asRecord(root.meta)
  const accessUrl = typeof root.accessUrl === 'string' ? root.accessUrl : undefined
  return {
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : new Date().toISOString(),
    accounts,
    transactions,
    snapshots,
    settings: {
      monthlySavings: numberOr(settings?.monthlySavings, DEFAULT_SETTINGS.monthlySavings),
      annualReturn: numberOr(settings?.annualReturn, DEFAULT_SETTINGS.annualReturn),
      inflation: numberOr(settings?.inflation, DEFAULT_SETTINGS.inflation),
      years: numberOr(settings?.years, DEFAULT_SETTINGS.years),
    },
    meta: {
      lastSyncAt: typeof meta?.lastSyncAt === 'number' ? meta.lastSyncAt : null,
      usingDemo: meta?.usingDemo === true,
      lookbackDays: numberOr(meta?.lookbackDays, DEFAULT_META.lookbackDays),
      lastErrors: Array.isArray(meta?.lastErrors) ? meta.lastErrors.filter((item) => typeof item === 'string') : [],
    },
    accessUrl,
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isAccount(value: unknown): value is AccountRecord {
  const row = asRecord(value)
  return !!row && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.balance === 'number'
}

function isTransaction(value: unknown): value is TransactionRecord {
  const row = asRecord(value)
  return !!row && typeof row.key === 'string' && typeof row.accountId === 'string' && typeof row.amount === 'number'
}

function isSnapshot(value: unknown): value is SnapshotRecord {
  const row = asRecord(value)
  return !!row && typeof row.key === 'string' && typeof row.accountId === 'string' && typeof row.date === 'string'
}

function completeAccount(account: AccountRecord): AccountRecord {
  return {
    ...account,
    source: account.source === 'manual' ? 'manual' : 'simplefin',
    institution: account.institution || 'Unknown',
    currency: account.currency || 'USD',
    availableBalance: account.availableBalance ?? null,
    balanceDate: account.balanceDate ?? null,
    inferredType: account.inferredType ?? 'other',
    typeOverride: account.typeOverride ?? null,
    invertOwed: account.invertOwed ?? null,
    holdings: account.holdings ?? [],
    updatedAt: account.updatedAt ?? Date.now(),
  }
}

function completeTransaction(tx: TransactionRecord): TransactionRecord {
  return {
    ...tx,
    id: tx.id || tx.key,
    posted: tx.posted ?? 0,
    description: tx.description || 'Transaction',
    pending: tx.pending === true,
    flowOverride: tx.flowOverride ?? null,
  }
}

function completeSnapshot(snap: SnapshotRecord): SnapshotRecord {
  return { ...snap, balance: snap.balance ?? 0, source: snap.source === 'manual' ? 'manual' : 'observed' }
}

export async function openBackup(raw: unknown, passphrase: string): Promise<BackupPayload> {
  const envelope = asRecord(raw)
  if (!envelope || envelope.format !== 'sable-backup' || envelope.version !== 1) {
    throw new Error('That file is not a Sable backup.')
  }
  if (envelope.kdf !== 'PBKDF2-SHA-256') throw new Error('Unsupported backup encryption.')
  if (
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    typeof envelope.iterations !== 'number'
  ) {
    throw new Error('That backup file is incomplete.')
  }
  if (envelope.iterations < 10_000 || envelope.iterations > 5_000_000) {
    throw new Error('That backup uses an unexpected key derivation cost.')
  }
  const key = await deriveAesKeyFromPassphrase(passphrase, b64ToBytes(envelope.salt), envelope.iterations)
  try {
    const json = await decryptString(key, { iv: envelope.iv, ciphertext: envelope.ciphertext })
    return normalizeBackup(JSON.parse(json) as unknown)
  } catch (err) {
    if (err instanceof Error && err.message === 'Could not decrypt.') {
      throw new Error('Could not decrypt the backup. Check the passphrase.')
    }
    throw err
  }
}
