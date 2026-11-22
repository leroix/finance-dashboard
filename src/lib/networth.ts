import { addDays, eachDate, localISODate, todayISO } from './dates.ts'
import { roundCents } from './money.ts'
import type { AccountRecord, AccountType, SnapshotRecord } from './types.ts'

export interface DailyPoint {
  date: string
  balance: number
  estimated: boolean
}

export function effectiveType(account: Pick<AccountRecord, 'inferredType' | 'typeOverride'>): AccountType {
  return account.typeOverride ?? account.inferredType
}

export function contribution(balance: number, type: AccountType, invertOwed: boolean | null): number {
  if (type === 'liability' && invertOwed) return roundCents(-balance)
  return roundCents(balance)
}

export function isSummableCurrency(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency)
}

/** US dashboard: sum a single ISO currency. Prefer USD when several are present. */
export function reportingCurrency(accounts: AccountRecord[]): string | null {
  const codes = [...new Set(accounts.map((account) => account.currency).filter(isSummableCurrency))]
  if (codes.length === 0) return null
  if (codes.length === 1) return codes[0] ?? null
  if (codes.includes('USD')) return 'USD'
  return 'USD'
}

export interface Totals {
  currency: string
  netWorth: number
  byType: Record<AccountType, number>
  byInstitution: { name: string; value: number }[]
  included: AccountRecord[]
  excluded: AccountRecord[]
}

export function computeTotals(accounts: AccountRecord[]): Totals {
  const currency = reportingCurrency(accounts) ?? 'USD'
  const included = accounts.filter((account) => account.currency === currency)
  const excluded = accounts.filter((account) => account.currency !== currency)
  const byType: Record<AccountType, number> = { cash: 0, liability: 0, investment: 0, other: 0 }
  const institutions = new Map<string, number>()
  let netWorth = 0
  for (const account of included) {
    const value = contribution(account.balance, effectiveType(account), account.invertOwed)
    netWorth += value
    byType[effectiveType(account)] += value
    const name = account.institution || 'Unknown'
    institutions.set(name, (institutions.get(name) ?? 0) + value)
  }
  return {
    currency,
    netWorth: roundCents(netWorth),
    byType: {
      cash: roundCents(byType.cash),
      liability: roundCents(byType.liability),
      investment: roundCents(byType.investment),
      other: roundCents(byType.other),
    },
    byInstitution: [...institutions.entries()]
      .map(([name, value]) => ({ name, value: roundCents(value) }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    included,
    excluded,
  }
}

function anchorDate(balanceDateSec: number | null, today: string): string {
  if (!balanceDateSec) return today
  const date = localISODate(balanceDateSec * 1000)
  return date <= today ? date : today
}

/**
 * Daily end-of-day balances. Days before the first refresh are reconstructed by
 * walking backward from the known balance through settled transactions.
 * A snapshot taken on a refresh wins for that date.
 */
export function buildRawSeries(
  balance: number,
  balanceDateSec: number | null,
  txs: { posted: number; amount: number; pending: boolean }[],
  snapshots: Pick<SnapshotRecord, 'date' | 'balance'>[],
  today = todayISO(),
): DailyPoint[] {
  const anchor = anchorDate(balanceDateSec, today)
  const grouped = new Map<string, number>()
  for (const tx of txs) {
    if (tx.pending || tx.posted <= 0) continue
    const date = localISODate(tx.posted * 1000)
    if (date > anchor) continue
    grouped.set(date, roundCents((grouped.get(date) ?? 0) + tx.amount))
  }
  const reconstructed = new Map<string, number>()
  const txDates = [...grouped.keys()].sort()
  const earliestTx = txDates[0]
  let cursor = balance
  let date = anchor
  const stop = earliestTx && earliestTx < anchor ? earliestTx : anchor
  while (reconstructed.size < 20000) {
    reconstructed.set(date, roundCents(cursor))
    if (date === stop) break
    cursor = roundCents(cursor - (grouped.get(date) ?? 0))
    date = addDays(date, -1)
  }
  if (earliestTx && reconstructed.has(earliestTx)) {
    const openDate = addDays(earliestTx, -1)
    const open = roundCents((reconstructed.get(earliestTx) ?? balance) - (grouped.get(earliestTx) ?? 0))
    if (!reconstructed.has(openDate)) reconstructed.set(openDate, open)
  }

  const snaps = new Map<string, number>()
  for (const snap of snapshots) {
    if (snap.date <= today) snaps.set(snap.date, snap.balance)
  }
  const starts = [...reconstructed.keys(), ...snaps.keys()].sort()
  const start = starts[0]
  if (!start) return []

  const points: DailyPoint[] = []
  let last: DailyPoint | null = null
  for (const day of eachDate(start, today)) {
    if (snaps.has(day)) {
      last = { date: day, balance: snaps.get(day) ?? 0, estimated: false }
    } else if (reconstructed.has(day)) {
      last = { date: day, balance: reconstructed.get(day) ?? 0, estimated: true }
    } else if (last) {
      last = { date: day, balance: last.balance, estimated: last.estimated }
    } else {
      continue
    }
    points.push(last)
  }
  return points
}

export function valueAt(series: DailyPoint[], date: string): DailyPoint | null {
  let lo = 0
  let hi = series.length - 1
  let answer: DailyPoint | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const point = series[mid]
    if (!point) break
    if (point.date <= date) {
      answer = point
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return answer
}
