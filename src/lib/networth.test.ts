import { describe, expect, it } from 'vitest'
import { applySync } from './merge.ts'
import { buildDesk } from './model.ts'
import { buildRawSeries, computeTotals, contribution } from './networth.ts'
import type { AccountRecord, TransactionRecord } from './types.ts'

function account(partial: Partial<AccountRecord> & Pick<AccountRecord, 'id' | 'balance'>): AccountRecord {
  return {
    source: 'simplefin',
    name: partial.id,
    institution: 'Bank',
    currency: 'USD',
    availableBalance: null,
    balanceDate: null,
    inferredType: 'cash',
    typeOverride: null,
    invertOwed: null,
    includePercent: 100,
    holdings: [],
    updatedAt: 0,
    ...partial,
  }
}

function tx(partial: Partial<TransactionRecord> & Pick<TransactionRecord, 'id' | 'amount' | 'posted'>): TransactionRecord {
  return {
    key: `acct\t${partial.id}`,
    accountId: 'acct',
    description: 'Pay',
    pending: false,
    flowOverride: null,
    ...partial,
  }
}

describe('net worth', () => {
  it('subtracts liabilities and ignores other currencies', () => {
    expect(contribution(40, 'liability', true)).toBe(-40)
    expect(contribution(-25, 'liability', null)).toBe(-25)
    const totals = computeTotals([
      account({ id: 'cash', balance: 100, inferredType: 'cash' }),
      account({ id: 'inv', balance: 50, inferredType: 'investment', institution: 'Vanguard' }),
      account({ id: 'card', balance: 40, inferredType: 'liability', invertOwed: true, institution: 'Discover' }),
      account({ id: 'house', balance: 10, inferredType: 'other', source: 'manual', institution: 'Manual' }),
      account({ id: 'eur', balance: 999, currency: 'EUR' }),
    ])
    expect(totals.netWorth).toBe(120)
    expect(totals.byType.cash).toBe(100)
    expect(totals.byType.liability).toBe(-40)
    expect(totals.excluded.map((item) => item.id)).toEqual(['eur'])
  })

  it('excludes an account or keeps only a percentage of it', () => {
    expect(contribution(200, 'cash', null, 50)).toBe(100)
    expect(contribution(200, 'cash', null, 0)).toBe(0)
    const totals = computeTotals([
      account({ id: 'cash', balance: 100, inferredType: 'cash' }),
      account({ id: 'joint', balance: 200, inferredType: 'cash', includePercent: 50 }),
      account({ id: 'old', balance: 500, inferredType: 'investment', includePercent: 0 }),
    ])
    expect(totals.netWorth).toBe(200)
    expect(totals.included.map((item) => item.id).sort()).toEqual(['cash', 'joint'])
    expect(totals.excluded.map((item) => item.id)).toEqual(['old'])
  })

  it('reconstructs past balances from transactions and lets a snapshot win', () => {
    const day = (y: number, m: number, d: number, hour = 12) => Math.floor(new Date(y, m - 1, d, hour).getTime() / 1000)
    const anchor = day(2026, 11, 22, 18)
    const series = buildRawSeries(
      100,
      anchor,
      [
        { posted: day(2026, 11, 22), amount: -30, pending: false },
        { posted: day(2026, 11, 21), amount: 10, pending: false },
        { posted: day(2026, 11, 22), amount: -5, pending: true },
      ],
      [{ date: '2026-11-22', balance: 100 }],
      '2026-11-22',
    )
    const byDate = Object.fromEntries(series.map((point) => [point.date, point]))
    expect(byDate['2026-11-20']?.balance).toBe(120)
    expect(byDate['2026-11-21']?.balance).toBe(130)
    expect(byDate['2026-11-22']?.balance).toBe(100)
    expect(byDate['2026-11-22']?.estimated).toBe(false)
    expect(byDate['2026-11-21']?.estimated).toBe(true)
  })

  it('preserves manual accounts, flow overrides, and drops a replaced link', () => {
    const manual = account({ id: 'house', balance: 10, source: 'manual', institution: 'Manual' })
    const oldBank = account({ id: 'old', balance: 5, typeOverride: 'investment' })
    const checking = account({ id: 'acct', balance: 80, typeOverride: 'cash' })
    const books = applySync(
      {
        accounts: [manual, oldBank, checking],
        transactions: [tx({ id: 't', amount: 20, posted: 10, flowOverride: 'market', description: 'Pay day' })],
        snapshots: [],
      },
      {
        accounts: [account({ id: 'acct', balance: 90 })],
        transactions: [tx({ id: 't', amount: 20, posted: 10, description: 'Pay day' })],
        snapshots: [{ key: 'acct\t2026-11-22', accountId: 'acct', date: '2026-11-22', balance: 90, source: 'observed' }],
      },
      'replace',
    )
    expect(books.accounts.map((item) => item.id).sort()).toEqual(['acct', 'house'])
    expect(books.accounts.find((item) => item.id === 'acct')?.typeOverride).toBe('cash')
    expect(books.accounts.find((item) => item.id === 'acct')?.balance).toBe(90)
    expect(books.accounts.find((item) => item.id === 'acct')?.includePercent).toBe(100)
    expect(books.transactions[0]?.flowOverride).toBe('market')
  })

  it('keeps includePercent across a SimpleFIN refresh', () => {
    const books = applySync(
      {
        accounts: [account({ id: 'acct', balance: 80, includePercent: 40 })],
        transactions: [],
        snapshots: [],
      },
      {
        accounts: [account({ id: 'acct', balance: 90 })],
        transactions: [],
        snapshots: [],
      },
      'replace',
    )
    expect(books.accounts.find((item) => item.id === 'acct')?.includePercent).toBe(40)
    expect(books.accounts.find((item) => item.id === 'acct')?.balance).toBe(90)
  })

  it('builds a desk where flows explain a cash balance change', () => {
    const posted = (iso: string) => Math.floor(new Date(`${iso}T12:00:00`).getTime() / 1000)
    const desk = buildDesk(
      [account({ id: 'acct', name: 'Checking', balance: 100, balanceDate: posted('2026-11-22'), institution: 'Demo' })],
      [
        tx({ id: 'a', amount: -30, posted: posted('2026-11-22'), description: 'Grocery store' }),
        tx({ id: 'b', amount: 10, posted: posted('2026-11-21'), description: 'Pay day' }),
      ],
      [{ key: 'acct\t2026-11-22', accountId: 'acct', date: '2026-11-22', balance: 100, source: 'observed' }],
      'ALL',
      '2026-11-22',
    )
    expect(desk.netWorth).toBe(100)
    expect(desk.performance.startBalance).toBe(120)
    expect(desk.performance.change).toBe(-20)
    expect(desk.performance.netFlow).toBe(-20)
    expect(desk.performance.marketChange).toBe(0)
    expect(desk.performance.dietz).toBe(0)
  })
})
