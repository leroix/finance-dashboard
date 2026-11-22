import { classifyTransaction } from './classify.ts'
import { localISODate, parseLocalISODate } from './dates.ts'
import {
  buildRawSeries,
  contribution,
  effectiveType,
  reportingCurrency,
  valueAt,
  type DailyPoint,
} from './networth.ts'
import { modifiedDietz, periodBounds, periodStart, type DietzResult, type PeriodKey } from './returns.ts'
import { TYPE_LABEL, type AccountRecord, type AccountType, type SnapshotRecord, type TransactionRecord } from './types.ts'

export interface Perf extends DietzResult {
  from: string
  to: string
  partial: boolean
}

export interface AccountRow {
  account: AccountRecord
  value: number
  series: DailyPoint[]
  perf: Perf
}

export interface DeskModel {
  currency: string
  netWorth: number
  byType: { type: AccountType; label: string; value: number }[]
  byInstitution: { name: string; value: number }[]
  excluded: AccountRecord[]
  series: DailyPoint[]
  performance: Perf
  rows: AccountRow[]
}

function emptyPerf(to: string, balance = 0): Perf {
  return {
    startBalance: balance,
    endBalance: balance,
    change: 0,
    netFlow: 0,
    marketChange: 0,
    dietz: null,
    from: to,
    to,
    partial: false,
  }
}

export function accountPerformance(
  account: AccountRecord,
  txs: TransactionRecord[],
  snaps: SnapshotRecord[],
  period: PeriodKey,
  today: string,
): { series: DailyPoint[]; perf: Perf; value: number } {
  const type = effectiveType(account)
  const series = buildRawSeries(
    account.balance,
    account.balanceDate,
    txs.filter((tx) => tx.accountId === account.id),
    snaps.filter((snap) => snap.accountId === account.id),
    today,
  )
  const value = contribution(account.balance, type, account.invertOwed)
  const sign = type === 'liability' && account.invertOwed ? -1 : 1
  const requested = periodStart(period, today)
  const first = series[0]
  const last = valueAt(series, today)
  if (!first || !last) return { series, perf: emptyPerf(today, value), value }

  const from = requested && requested > first.date ? requested : first.date
  const partial = requested !== null && requested < first.date
  const startPoint = valueAt(series, from) ?? first
  const endPoint = last
  const startBalance = contribution(startPoint.balance, type, account.invertOwed)
  const endBalance = contribution(endPoint.balance, type, account.invertOwed)
  const bounds = periodBounds(startPoint.date, today)
  const flows = txs
    .filter((tx) => tx.accountId === account.id && !tx.pending && tx.posted > 0)
    .filter((tx) => {
      const date = localISODate(tx.posted * 1000)
      return date > startPoint.date && date <= today
    })
    .filter((tx) => (tx.flowOverride ?? classifyTransaction(tx.description, type)) === 'flow')
    .map((tx) => ({ atMs: tx.posted * 1000, amount: sign * tx.amount }))
  const dietz = modifiedDietz(startBalance, endBalance, bounds.startMs, bounds.endMs, flows)
  return {
    series,
    value,
    perf: { ...dietz, from: startPoint.date, to: today, partial },
  }
}

export function buildDesk(
  accounts: AccountRecord[],
  txs: TransactionRecord[],
  snaps: SnapshotRecord[],
  period: PeriodKey,
  today: string,
): DeskModel {
  const currency = reportingCurrency(accounts) ?? 'USD'
  const included = accounts.filter((account) => account.currency === currency)
  const excluded = accounts.filter((account) => account.currency !== currency)
  const rows = included
    .map((account) => {
      const view = accountPerformance(account, txs, snaps, period, today)
      return { account, ...view }
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const byTypeMap: Record<AccountType, number> = { cash: 0, liability: 0, investment: 0, other: 0 }
  const institutions = new Map<string, number>()
  let netWorth = 0
  for (const row of rows) {
    netWorth += row.value
    byTypeMap[effectiveType(row.account)] += row.value
    const name = row.account.institution || 'Unknown'
    institutions.set(name, (institutions.get(name) ?? 0) + row.value)
  }

  const dates = new Set<string>()
  for (const row of rows) for (const point of row.series) dates.add(point.date)
  const fullSeries: DailyPoint[] = [...dates].sort().map((date) => {
    let balance = 0
    let estimated = false
    for (const row of rows) {
      const point = valueAt(row.series, date)
      if (!point) continue
      balance += contribution(point.balance, effectiveType(row.account), row.account.invertOwed)
      if (point.estimated) estimated = true
    }
    return { date, balance, estimated }
  })

  const requested = periodStart(period, today)
  const first = fullSeries[0]
  const from = !first ? today : requested && requested > first.date ? requested : first.date
  const partial = requested !== null && !!first && requested < first.date
  const startPoint = valueAt(fullSeries, from)
  const endPoint = valueAt(fullSeries, today)
  const startBalance = startPoint?.balance ?? 0
  const endBalance = endPoint?.balance ?? netWorth
  const flowFrom = startPoint?.date ?? from
  const flows: { atMs: number; amount: number }[] = []
  for (const row of rows) {
    const type = effectiveType(row.account)
    const sign = type === 'liability' && row.account.invertOwed ? -1 : 1
    const opened = row.series[0]
    if (opened && opened.date > flowFrom) {
      flows.push({
        atMs: parseLocalISODate(opened.date) + 12 * 60 * 60 * 1000,
        amount: contribution(opened.balance, type, row.account.invertOwed),
      })
    }
    for (const tx of txs) {
      if (tx.accountId !== row.account.id || tx.pending || tx.posted <= 0) continue
      const date = localISODate(tx.posted * 1000)
      if (date <= flowFrom || date > today) continue
      if ((tx.flowOverride ?? classifyTransaction(tx.description, type)) !== 'flow') continue
      flows.push({ atMs: tx.posted * 1000, amount: sign * tx.amount })
    }
  }
  const bounds = periodBounds(flowFrom, today)
  const dietz = modifiedDietz(startBalance, endBalance, bounds.startMs, bounds.endMs, flows)
  const visible = requested ? fullSeries.filter((point) => point.date >= requested) : fullSeries

  return {
    currency,
    netWorth,
    byType: (Object.keys(TYPE_LABEL) as AccountType[])
      .map((type) => ({ type, label: TYPE_LABEL[type], value: byTypeMap[type] }))
      .filter((item) => item.value !== 0),
    byInstitution: [...institutions.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    excluded,
    series: visible.length ? visible : fullSeries,
    performance: { ...dietz, from: flowFrom, to: today, partial },
    rows,
  }
}
