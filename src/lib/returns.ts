import { addDays, parseLocalISODate } from './dates.ts'
import { roundCents } from './money.ts'

export type PeriodKey = '1M' | '3M' | 'YTD' | '1Y' | 'ALL'

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'All' },
]

export function periodStart(period: PeriodKey, today: string): string | null {
  if (period === '1M') return addDays(today, -30)
  if (period === '3M') return addDays(today, -91)
  if (period === '1Y') return addDays(today, -365)
  if (period === 'YTD') return `${today.slice(0, 4)}-01-01`
  return null
}

export interface DietzResult {
  startBalance: number
  endBalance: number
  change: number
  netFlow: number
  marketChange: number
  /** Modified Dietz estimate. Null when capital is near zero or negative. */
  dietz: number | null
}

/**
 * Modified Dietz: market gain divided by starting value plus time-weighted flows.
 * Flows are positive when they increase the measured value.
 */
export function modifiedDietz(
  startBalance: number,
  endBalance: number,
  startMs: number,
  endMs: number,
  flows: { atMs: number; amount: number }[],
): DietzResult {
  const netFlow = roundCents(flows.reduce((sum, flow) => sum + flow.amount, 0))
  const change = roundCents(endBalance - startBalance)
  const marketChange = roundCents(change - netFlow)
  const span = endMs - startMs
  if (span <= 0) {
    return { startBalance, endBalance, change, netFlow, marketChange, dietz: null }
  }
  let weighted = 0
  for (const flow of flows) {
    const at = Math.min(Math.max(flow.atMs, startMs), endMs)
    weighted += flow.amount * ((endMs - at) / span)
  }
  const denom = startBalance + weighted
  const dietz = denom >= 1 ? marketChange / denom : null
  return {
    startBalance: roundCents(startBalance),
    endBalance: roundCents(endBalance),
    change,
    netFlow,
    marketChange,
    dietz,
  }
}

export function periodBounds(from: string, to: string): { startMs: number; endMs: number } {
  return {
    startMs: parseLocalISODate(addDays(from, 1)),
    endMs: parseLocalISODate(addDays(to, 1)),
  }
}
