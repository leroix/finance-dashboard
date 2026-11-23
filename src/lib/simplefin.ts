import { bytesToB64, bytesToUtf8, b64ToBytes, utf8ToBytes } from './bytes.ts'
import { parseAmount, roundCents } from './money.ts'
import { sanitizeText } from './sanitize.ts'
import type { AccountType, Holding } from './types.ts'

export const BETA_HOST = 'beta-bridge.simplefin.org'
export const BRIDGE_HOST = 'bridge.simplefin.org'
const ALLOWED_HOSTS = new Set([BETA_HOST, BRIDGE_HOST])

/** Base64 of https://bridge.simplefin.org/simplefin/claim/demo — published, no longer reusable. */
export const DEMO_SETUP_TOKEN = 'aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw=='

/**
 * Public demo access URL documented by SimpleFIN Bridge.
 * This is not a user secret. The legacy claim token above now returns 403.
 */
export const PUBLIC_DEMO_ACCESS_URL = 'https://demo:demo@beta-bridge.simplefin.org/simplefin'

export const WINDOW_SECONDS = 40 * 86400

export class SimpleFINError extends Error {
  readonly status: number | null
  readonly claimRejected: boolean

  constructor(message: string, opts?: { status?: number; claimRejected?: boolean }) {
    super(message)
    this.name = 'SimpleFINError'
    this.status = opts?.status ?? null
    this.claimRejected = opts?.claimRejected ?? false
  }
}

export interface ParsedTransaction {
  id: string
  posted: number
  amount: number
  description: string
  pending: boolean
}

export interface ParsedAccount {
  id: string
  rawId: string
  name: string
  currency: string
  balance: number
  availableBalance: number | null
  balanceDate: number | null
  institution: string
  connId: string
  transactions: ParsedTransaction[]
  holdings: Holding[]
}

export interface ParsedSet {
  accounts: ParsedAccount[]
  errors: string[]
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const LIABILITY = /\b(credit|card|visa|mastercard|amex|charge|loan|mortgage|heloc|line of credit|liability)\b/i
const INVEST = /\b(brokerage|invest|retirement|401\(k\)|401k|403b|457b|ira|roth|pension|hsa|529|mutual|etf|vanguard|fidelity|betterment|schwab|etrade)\b/i
const CASH = /\b(checking|savings|cash|debit|money market|mmda|certificate of deposit|\bcd\b)\b/i

export function inferAccountType(name: string, institution = ''): AccountType {
  if (LIABILITY.test(name)) return 'liability'
  if (INVEST.test(name) && !CASH.test(name)) return 'investment'
  if (CASH.test(name)) return 'cash'
  if (LIABILITY.test(institution) && !CASH.test(name)) return 'liability'
  if (INVEST.test(institution) && !CASH.test(name)) return 'investment'
  return 'other'
}

export function historyWindows(
  endExclusive: number,
  lookbackSeconds: number,
  windowSeconds = WINDOW_SECONDS,
): { start: number; end: number }[] {
  const earliest = endExclusive - Math.max(0, lookbackSeconds)
  const out: { start: number; end: number }[] = []
  let end = endExclusive
  while (end > earliest) {
    const start = Math.max(earliest, end - windowSeconds)
    out.push({ start, end })
    if (start === earliest) break
    end = start
  }
  return out
}

export function decodeSetupToken(token: string): string {
  const compact = token.trim().replace(/\s+/g, '')
  let decoded = ''
  try {
    decoded = bytesToUtf8(b64ToBytes(compact)).trim()
  } catch {
    throw new SimpleFINError('That setup token is not valid base64.')
  }
  if (!decoded.startsWith('https://')) {
    throw new SimpleFINError('That setup token does not decode to an HTTPS claim URL.')
  }
  return decoded
}

export function isDemoMaterial(text: string): boolean {
  const compact = text.trim().replace(/\s+/g, '')
  if (compact === DEMO_SETUP_TOKEN) return true
  if (compact === PUBLIC_DEMO_ACCESS_URL) return true
  try {
    const decoded = /^https:\/\//i.test(compact) ? compact : decodeSetupToken(compact)
    const url = new URL(decoded)
    return /\/claim\/demo\/?$/i.test(url.pathname)
  } catch {
    return false
  }
}

export function rewriteBridgeHost(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new SimpleFINError('That is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new SimpleFINError('Only HTTPS SimpleFIN URLs are allowed.')
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new SimpleFINError('Only the SimpleFIN Bridge host is allowed.')
  if (url.hostname === BRIDGE_HOST) url.hostname = BETA_HOST
  return url
}

export function splitAccessUrl(accessUrl: string): { username: string; password: string; base: string } {
  const url = rewriteBridgeHost(accessUrl)
  const username = safeDecode(url.username)
  const password = safeDecode(url.password)
  if (!username || !password) throw new SimpleFINError('That access URL is missing its credentials.')
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  const base = url.toString().replace(/\/$/, '')
  return { username, password, base }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function basicAuthorization(username: string, password: string): string {
  return `Basic ${bytesToB64(utf8ToBytes(`${username}:${password}`))}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Accept numeric or numeric-string UNIX timestamps from Bridge payloads. */
export function parseUnixSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

function collectErrors(data: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string') out.push(sanitizeText(value))
    else if (value && typeof value === 'object' && 'msg' in value) {
      out.push(sanitizeText((value as { msg?: unknown }).msg))
    }
  }
  if (Array.isArray(data.errors)) data.errors.forEach(push)
  if (Array.isArray(data.errlist)) data.errlist.forEach(push)
  return [...new Set(out.filter(Boolean))]
}

function parseHolding(value: unknown): Holding | null {
  const obj = asRecord(value)
  if (!obj) return null
  const label = sanitizeText(firstString(obj, ['symbol', 'ticker', 'name', 'description', 'security']), 80)
  const quantity = parseAmount(obj.quantity ?? obj.shares ?? obj.units)
  const marketValue = parseAmount(obj.market_value ?? obj.marketValue ?? obj.value ?? obj.amount)
  if (!label && quantity === null && marketValue === null) return null
  return { label: label || 'Holding', quantity, marketValue }
}

function connectionName(connections: Record<string, unknown>[], connId: string): string {
  const match = connections.find((item) => item.conn_id === connId)
  if (!match) return ''
  return sanitizeText(firstString(match, ['name', 'org_name']), 120)
}

function parseTransactions(value: unknown, accountId: string): ParsedTransaction[] {
  if (!Array.isArray(value)) return []
  const seen = new Map<string, number>()
  const out: ParsedTransaction[] = []
  for (const item of value) {
    const tx = asRecord(item)
    if (!tx) continue
    const amount = parseAmount(tx.amount)
    if (amount === null) continue
    const posted = typeof tx.posted === 'number' && Number.isFinite(tx.posted) ? Math.trunc(tx.posted) : 0
    const description = sanitizeText(
      [tx.payee, tx.description, tx.memo]
        .filter((part) => typeof part === 'string' && part.trim())
        .map((part) => String(part).trim())
        .filter((part, index, all) => all.indexOf(part) === index)
        .join(' · '),
      240,
    )
    let id = sanitizeText(tx.id ?? '', 120)
    if (!id) id = `${accountId}:${posted}:${amount}:${description.slice(0, 40)}`
    const count = (seen.get(id) ?? 0) + 1
    seen.set(id, count)
    if (count > 1) id = `${id}#${count}`
    out.push({
      id,
      posted,
      amount,
      description: description || 'Transaction',
      pending: tx.pending === true,
    })
  }
  return out
}

export function parseAccountSet(data: unknown): ParsedSet {
  const root = asRecord(data)
  if (!root || !Array.isArray(root.accounts)) {
    throw new SimpleFINError('SimpleFIN returned an account list this app could not read.')
  }
  const connections = Array.isArray(root.connections)
    ? root.connections.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : []
  const accounts: ParsedAccount[] = []
  for (const item of root.accounts) {
    const account = asRecord(item)
    if (!account) continue
    const rawId = sanitizeText(account.id ?? '', 160)
    const name = sanitizeText(account.name ?? 'Account', 160) || 'Account'
    if (!rawId) continue
    const balance = parseAmount(account.balance)
    if (balance === null) continue
    const org = asRecord(account.org)
    const connId = sanitizeText(account.conn_id ?? org?.id ?? org?.domain ?? 'default', 160) || 'default'
    const institution =
      (org ? sanitizeText(firstString(org, ['name']), 120) : '') ||
      connectionName(connections, String(account.conn_id ?? '')) ||
      'Unknown institution'
    const currencyRaw = typeof account.currency === 'string' ? account.currency.trim() : 'USD'
    const currency = currencyRaw.startsWith('http') ? currencyRaw : currencyRaw.toUpperCase() || 'USD'
    const available = parseAmount(account['available-balance'])
    const balanceDate = parseUnixSeconds(account['balance-date'])
    const holdings = Array.isArray(account.holdings)
      ? account.holdings.map(parseHolding).filter((item): item is Holding => item !== null)
      : []
    accounts.push({
      id: `${connId}:${rawId}`,
      rawId,
      name,
      currency,
      balance: roundCents(balance),
      availableBalance: available === null ? null : roundCents(available),
      balanceDate,
      institution,
      connId,
      transactions: parseTransactions(account.transactions, rawId),
      holdings,
    })
  }
  return { accounts, errors: collectErrors(root) }
}

export function mergeParsedSets(sets: ParsedSet[]): ParsedSet {
  const accounts = new Map<string, ParsedAccount>()
  const txSeen = new Map<string, Set<string>>()
  const errors: string[] = []
  for (const set of sets) {
    for (const message of set.errors) if (!errors.includes(message)) errors.push(message)
    for (const account of set.accounts) {
      const prior = accounts.get(account.id)
      const seen = txSeen.get(account.id) ?? new Set<string>()
      const transactions = prior ? [...prior.transactions] : []
      for (const tx of account.transactions) {
        if (seen.has(tx.id)) continue
        seen.add(tx.id)
        transactions.push(tx)
      }
      txSeen.set(account.id, seen)
      if (!prior) {
        accounts.set(account.id, { ...account, transactions })
        continue
      }
      const priorDate = prior.balanceDate ?? 0
      const nextDate = account.balanceDate ?? 0
      const fresher = nextDate >= priorDate ? account : prior
      accounts.set(account.id, { ...fresher, transactions })
    }
  }
  return { accounts: [...accounts.values()], errors }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    throw new SimpleFINError('SimpleFIN returned a response that was not JSON.')
  }
}

async function postClaim(claimUrl: URL, fetchImpl: FetchLike): Promise<string> {
  if (!claimUrl.pathname.includes('/claim/')) {
    throw new SimpleFINError('That setup token does not point at a claim URL.')
  }
  claimUrl.username = ''
  claimUrl.password = ''
  claimUrl.search = ''
  claimUrl.hash = ''
  let res: Response
  try {
    res = await fetchImpl(claimUrl.toString(), {
      method: 'POST',
      body: '',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw new SimpleFINError(
      'The browser could not reach SimpleFIN Bridge. Claims have to go to beta-bridge.simplefin.org.',
    )
  }
  if (res.type === 'opaqueredirect' || res.status === 0) {
    throw new SimpleFINError(
      'SimpleFIN Bridge redirected this claim in a way the browser cannot follow. Paste an access URL instead.',
    )
  }
  if (res.status === 403) {
    throw new SimpleFINError(
      'SimpleFIN rejected that setup token (403). If you have not used it yet, treat it as compromised: revoke it in SimpleFIN Bridge and create a new one. Do not retry the same token.',
      { status: 403, claimRejected: true },
    )
  }
  if (!res.ok) throw new SimpleFINError(`SimpleFIN could not claim that token (status ${res.status}).`, { status: res.status })
  const text = (await res.text()).trim()
  splitAccessUrl(text)
  return rewriteBridgeHost(text).toString()
}

export async function claimSetupToken(token: string, fetchImpl: FetchLike = fetch): Promise<string> {
  return postClaim(rewriteBridgeHost(decodeSetupToken(token)), fetchImpl)
}

/** Accept a setup token, a claim URL, or an access URL. Never returns a value that was logged. */
export async function obtainAccessUrl(text: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) throw new SimpleFINError('Paste a setup token or an access URL.')
  if (/^https:\/\//i.test(trimmed)) {
    const url = rewriteBridgeHost(trimmed)
    if (url.username && url.password) return url.toString()
    if (url.pathname.includes('/claim/')) return postClaim(url, fetchImpl)
    throw new SimpleFINError('That URL is not a SimpleFIN access URL or claim URL.')
  }
  return claimSetupToken(trimmed, fetchImpl)
}

export interface AccountQuery {
  startDate?: number
  endDate?: number
  balancesOnly?: boolean
  pending?: boolean
}

export async function fetchAccountSet(
  accessUrl: string,
  query: AccountQuery = {},
  fetchImpl: FetchLike = fetch,
): Promise<ParsedSet> {
  const { username, password, base } = splitAccessUrl(accessUrl)
  const url = new URL(`${base}/accounts`)
  url.searchParams.set('version', '2')
  if (query.balancesOnly) url.searchParams.set('balances-only', '1')
  if (query.pending) url.searchParams.set('pending', '1')
  if (query.startDate != null) url.searchParams.set('start-date', String(query.startDate))
  if (query.endDate != null) url.searchParams.set('end-date', String(query.endDate))
  let res: Response
  try {
    res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: basicAuthorization(username, password),
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw new SimpleFINError(
      'The browser could not reach SimpleFIN Bridge. Check the connection, or that this site is allowed to call beta-bridge.simplefin.org.',
    )
  }
  if (res.type === 'opaqueredirect' || res.status === 0) {
    throw new SimpleFINError(
      'SimpleFIN Bridge redirected this request in a way the browser cannot follow. Try Refresh again, or reconnect.',
    )
  }
  if (res.status === 403) {
    throw new SimpleFINError(
      'SimpleFIN refused this access URL (403). It may have been revoked. Create a new setup token and connect again.',
      { status: 403 },
    )
  }
  if (res.status === 402) throw new SimpleFINError('SimpleFIN returned 402 Payment Required.', { status: 402 })
  if (!res.ok) throw new SimpleFINError(`SimpleFIN returned status ${res.status}.`, { status: res.status })
  return parseAccountSet(await readJson(res))
}

export async function fetchHistory(
  accessUrl: string,
  opts: {
    lookbackDays: number
    now?: number
    onProgress?: (index: number, total: number) => void
    signal?: AbortSignal
    fetchImpl?: FetchLike
    pauseMs?: number
  },
): Promise<ParsedSet> {
  const endExclusive = (opts.now ?? Math.floor(Date.now() / 1000)) + 1
  const lookback = Math.min(Math.max(opts.lookbackDays, 1), 3650) * 86400
  const windows = historyWindows(endExclusive, lookback)
  const sets: ParsedSet[] = []
  for (let i = 0; i < windows.length; i++) {
    if (opts.signal?.aborted) throw new SimpleFINError('Sync cancelled.')
    opts.onProgress?.(i + 1, windows.length)
    const window = windows[i]
    if (!window) continue
    sets.push(
      await fetchAccountSet(
        accessUrl,
        { startDate: window.start, endDate: window.end, pending: true },
        opts.fetchImpl,
      ),
    )
    if (i < windows.length - 1 && (opts.pauseMs ?? 120) > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.pauseMs ?? 120))
    }
  }
  return mergeParsedSets(sets)
}
