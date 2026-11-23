export type AccountType = 'cash' | 'liability' | 'investment' | 'other'

export type FlowClass = 'flow' | 'market' | 'ignore'

export interface Holding {
  label: string
  quantity: number | null
  marketValue: number | null
}

export interface AccountRecord {
  id: string
  source: 'simplefin' | 'manual'
  name: string
  institution: string
  currency: string
  balance: number
  availableBalance: number | null
  balanceDate: number | null
  inferredType: AccountType
  typeOverride: AccountType | null
  /** When true, a positive balance is an amount owed and net worth uses the opposite sign. */
  invertOwed: boolean | null
  /**
   * Share of this account that counts toward net worth, 0–100.
   * 100 is the full balance. 0 excludes the account. 50 keeps half.
   */
  includePercent: number
  holdings: Holding[]
  updatedAt: number
}

export interface TransactionRecord {
  key: string
  accountId: string
  id: string
  posted: number
  amount: number
  description: string
  pending: boolean
  flowOverride: FlowClass | null
}

export interface SnapshotRecord {
  key: string
  accountId: string
  date: string
  balance: number
  source: 'observed' | 'manual'
}

/**
 * Wrapper for the vault data-encryption key (kind `vault`), or legacy ciphertext of the
 * SimpleFIN access URL alone (kind `access` / omitted).
 */
export interface SecretRecord {
  kind?: 'access' | 'vault'
  method: 'prf' | 'passphrase'
  credentialId?: string
  prfSalt?: string
  kdfSalt: string
  iv: string
  ciphertext: string
  iterations?: number
}

export interface Settings {
  monthlySavings: number
  annualReturn: number
  inflation: number
  years: number
}

export interface Meta {
  lastSyncAt: number | null
  usingDemo: boolean
  lookbackDays: number
  lastErrors: string[]
}

export interface Books {
  accounts: AccountRecord[]
  transactions: TransactionRecord[]
  snapshots: SnapshotRecord[]
}

export const DEFAULT_SETTINGS: Settings = {
  monthlySavings: 2000,
  annualReturn: 0.07,
  inflation: 0.025,
  years: 20,
}

export const DEFAULT_META: Meta = {
  lastSyncAt: null,
  usingDemo: false,
  lookbackDays: 180,
  lastErrors: [],
}

export const TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Cash',
  liability: 'Credit & liabilities',
  investment: 'Investment & retirement',
  other: 'Other',
}
