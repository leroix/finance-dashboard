import { b64ToBytes, bytesToB64, exactBuffer, randomBytes } from './bytes.ts'
import { decryptString, encryptString, type CipherPack } from './crypto.ts'
import type { AccountRecord, Meta, Settings, SnapshotRecord, TransactionRecord } from './types.ts'
import { DEFAULT_META, DEFAULT_SETTINGS } from './types.ts'

export interface VaultPayload {
  accounts: AccountRecord[]
  transactions: TransactionRecord[]
  snapshots: SnapshotRecord[]
  settings: Settings
  meta: Meta
  accessUrl: string | null
}

export interface VaultSeal {
  version: 1
  iv: string
  ciphertext: string
}

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle) {
    throw new Error('Encryption needs a secure context (HTTPS or localhost).')
  }
  return cryptoObj.subtle
}

export async function generateVaultKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const raw = randomBytes(32)
  const key = await subtle().importKey('raw', exactBuffer(raw), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  return { key, raw }
}

export async function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== 32) throw new Error('Vault key must be 256 bits.')
  return subtle().importKey('raw', exactBuffer(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function wrapVaultKey(kek: CryptoKey, raw: Uint8Array): Promise<CipherPack> {
  return encryptString(kek, bytesToB64(raw))
}

export async function unwrapVaultKey(kek: CryptoKey, pack: CipherPack): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const b64 = await decryptString(kek, pack)
  const raw = b64ToBytes(b64)
  const key = await importVaultKey(raw)
  return { key, raw }
}

export async function sealVault(key: CryptoKey, payload: VaultPayload): Promise<VaultSeal> {
  const packed = await encryptString(key, JSON.stringify(payload))
  return { version: 1, iv: packed.iv, ciphertext: packed.ciphertext }
}

export async function openVault(key: CryptoKey, seal: VaultSeal): Promise<VaultPayload> {
  if (seal.version !== 1) throw new Error('Unsupported vault format.')
  const json = await decryptString(key, { iv: seal.iv, ciphertext: seal.ciphertext })
  return normalizeVaultPayload(JSON.parse(json) as unknown)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeVaultPayload(value: unknown): VaultPayload {
  const root = asRecord(value)
  if (!root) throw new Error('Vault contents were not valid.')
  const settings = asRecord(root.settings)
  const meta = asRecord(root.meta)
  return {
    accounts: Array.isArray(root.accounts) ? (root.accounts as AccountRecord[]) : [],
    transactions: Array.isArray(root.transactions) ? (root.transactions as TransactionRecord[]) : [],
    snapshots: Array.isArray(root.snapshots) ? (root.snapshots as SnapshotRecord[]) : [],
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
    accessUrl: typeof root.accessUrl === 'string' ? root.accessUrl : null,
  }
}

export function isVaultSeal(value: unknown): value is VaultSeal {
  const row = asRecord(value)
  return (
    !!row &&
    row.version === 1 &&
    typeof row.iv === 'string' &&
    typeof row.ciphertext === 'string' &&
    row.iv.length > 0 &&
    row.ciphertext.length > 0
  )
}
