import { describe, expect, it } from 'vitest'
import { projectNetWorth } from './forecast.ts'
import { modifiedDietz, periodStart } from './returns.ts'

describe('returns', () => {
  it('computes a modified Dietz return', () => {
    const day = 86_400_000
    const result = modifiedDietz(1000, 1200, 0, 30 * day, [{ atMs: 10 * day, amount: 100 }])
    expect(result.netFlow).toBe(100)
    expect(result.marketChange).toBe(100)
    expect(result.change).toBe(200)
    expect(result.dietz).toBeCloseTo(0.09375, 8)
  })

  it('returns null when starting capital is not positive enough', () => {
    const result = modifiedDietz(0, 10, 0, 1000, [])
    expect(result.dietz).toBeNull()
    expect(result.marketChange).toBe(10)
  })

  it('anchors YTD at the start of the local year', () => {
    expect(periodStart('YTD', '2026-11-22')).toBe('2026-01-01')
    expect(periodStart('1M', '2026-11-22')).toBe('2026-10-23')
    expect(periodStart('ALL', '2026-11-22')).toBeNull()
  })
})

describe('forecast', () => {
  it('compounds a nominal return and discounts it for inflation', () => {
    const flat = projectNetWorth({
      current: 1000,
      monthlySavings: 100,
      annualReturn: 0,
      inflation: 0,
      years: 1,
      startIso: '2026-11-01',
    })
    expect(flat.at(-1)?.nominal).toBeCloseTo(2200, 6)
    expect(flat.at(-1)?.real).toBeCloseTo(2200, 6)

    const grown = projectNetWorth({
      current: 1000,
      monthlySavings: 0,
      annualReturn: 0.12,
      inflation: 0,
      years: 1,
      startIso: '2026-11-01',
    })
    expect(grown.at(-1)?.nominal).toBeCloseTo(1120, 6)

    const inflated = projectNetWorth({
      current: 1000,
      monthlySavings: 0,
      annualReturn: 0,
      inflation: 0.1,
      years: 1,
      startIso: '2026-11-01',
    })
    expect(inflated.at(-1)?.nominal).toBeCloseTo(1000, 6)
    expect(inflated.at(-1)?.real).toBeCloseTo(1000 / 1.1, 6)
  })
})
