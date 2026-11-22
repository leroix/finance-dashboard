import { formatMonthYear } from './dates.ts'

export interface ForecastInput {
  current: number
  monthlySavings: number
  /** Nominal annual return, e.g. 0.07 */
  annualReturn: number
  /** Annual inflation, e.g. 0.025 */
  inflation: number
  years: number
  startIso: string
}

export interface ForecastPoint {
  iso: string
  label: string
  months: number
  nominal: number
  real: number
}

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number)
  const date = new Date(y ?? 2026, (m ?? 1) - 1 + months, 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

/** Project nominal wealth and the same path in today's dollars. This is a projection, not a forecast of markets. */
export function projectNetWorth(input: ForecastInput): ForecastPoint[] {
  const years = Math.min(Math.max(Math.round(input.years), 1), 60)
  const months = years * 12
  const monthlyNominal = (1 + input.annualReturn) ** (1 / 12) - 1
  const points: ForecastPoint[] = [
    {
      iso: input.startIso,
      label: 'Now',
      months: 0,
      nominal: input.current,
      real: input.current,
    },
  ]
  let nominal = input.current
  for (let month = 1; month <= months; month++) {
    nominal = nominal * (1 + monthlyNominal) + input.monthlySavings
    const real = nominal / (1 + input.inflation) ** (month / 12)
    if (month % 12 === 0 || month === months) {
      const iso = addMonths(input.startIso, month)
      points.push({
        iso,
        label: formatMonthYear(iso),
        months: month,
        nominal,
        real,
      })
    }
  }
  return points
}
