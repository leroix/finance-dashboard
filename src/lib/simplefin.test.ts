import { describe, expect, it } from 'vitest'
import {
  DEMO_SETUP_TOKEN,
  SimpleFINError,
  claimSetupToken,
  decodeSetupToken,
  fetchAccountSet,
  fetchHistory,
  historyWindows,
  inferAccountType,
  isDemoMaterial,
  parseAccountSet,
  splitAccessUrl,
} from './simplefin.ts'

const v1 = {
  errors: ['<script>alert(1)</script> Bank needs attention', '  extra   spaces  '],
  accounts: [
    {
      id: 'Demo Checking',
      name: 'SimpleFIN Checking',
      currency: 'usd',
      balance: '10.10',
      'available-balance': '8.00',
      'balance-date': 1_700_000_000,
      transactions: [
        { id: 't1', posted: 1_700_000_100, amount: '-4.50', description: 'Grocery store', payee: 'Market' },
        { id: 't1', posted: 1_700_000_200, amount: '1.00', description: 'Duplicate id' },
      ],
      org: { domain: 'beta-bridge.simplefin.org', name: 'SimpleFIN Demo', id: 'simplefin.demoorg' },
    },
  ],
}

const v2 = {
  errlist: [{ code: 'gen.api', msg: 'Range capped <b>soon</b> https://evil.example/phish' }],
  connections: [{ conn_id: 'CON-1', name: 'Fidelity', org_name: 'FMR' }],
  accounts: [
    {
      id: 'acct',
      conn_id: 'CON-1',
      name: 'Roth IRA',
      currency: 'USD',
      balance: '50.00',
      'balance-date': 1_700_000_000,
      transactions: [],
      holdings: [{ symbol: 'VTI', quantity: '2', market_value: '40.00' }],
    },
  ],
}

describe('SimpleFIN parsing', () => {
  it('decodes the published demo token and rewrites the bridge host', () => {
    expect(decodeSetupToken(DEMO_SETUP_TOKEN)).toBe('https://bridge.simplefin.org/simplefin/claim/demo')
    expect(isDemoMaterial(DEMO_SETUP_TOKEN)).toBe(true)
    const split = splitAccessUrl('https://demo:p%40ss@bridge.simplefin.org/simplefin/')
    expect(split.username).toBe('demo')
    expect(split.password).toBe('p@ss')
    expect(split.base).toBe('https://beta-bridge.simplefin.org/simplefin')
    expect(split.base).not.toContain('p%40ss')
    expect(split.base).not.toContain('p@ss')
  })

  it('rejects non-bridge hosts and http', () => {
    expect(() => splitAccessUrl('http://beta-bridge.simplefin.org/simplefin')).toThrow(SimpleFINError)
    expect(() => splitAccessUrl('https://user:pw@evil.example/simplefin')).toThrow(/host/i)
  })

  it('parses v1 errors and v2 errlist, and sanitizes them', () => {
    const parsed = parseAccountSet(v1)
    expect(parsed.errors[0]).not.toContain('<')
    expect(parsed.errors[0]).toContain('Bank needs attention')
    expect(parsed.errors[1]).toBe('extra spaces')
    expect(parsed.accounts[0]?.institution).toBe('SimpleFIN Demo')
    expect(parsed.accounts[0]?.currency).toBe('USD')
    expect(parsed.accounts[0]?.transactions).toHaveLength(2)
    expect(parsed.accounts[0]?.transactions[1]?.id).toBe('t1#2')
    expect(parsed.accounts[0]?.transactions[0]?.description).toContain('Market')

    const next = parseAccountSet(v2)
    expect(next.errors[0]).toBe('Range capped soon')
    expect(next.errors[0]).not.toContain('http')
    expect(next.accounts[0]?.institution).toBe('Fidelity')
    expect(next.accounts[0]?.id).toBe('CON-1:acct')
    expect(next.accounts[0]?.holdings[0]).toEqual({ label: 'VTI', quantity: 2, marketValue: 40 })
  })

  it('infers account types from names', () => {
    expect(inferAccountType('SimpleFIN Checking')).toBe('cash')
    expect(inferAccountType('Visa Signature')).toBe('liability')
    expect(inferAccountType('Roth IRA')).toBe('investment')
    expect(inferAccountType('Individual', 'Vanguard')).toBe('investment')
    expect(inferAccountType('House')).toBe('other')
  })

  it('pages history in contiguous windows under the bridge cap', () => {
    expect(historyWindows(1000, 100, 40)).toEqual([
      { start: 960, end: 1000 },
      { start: 920, end: 960 },
      { start: 900, end: 920 },
    ])
  })

  it('sends Basic auth and keeps credentials out of the request URL', async () => {
    let seen = ''
    let auth = ''
    const parsed = await fetchAccountSet(
      'https://demo:secret@bridge.simplefin.org/simplefin',
      { balancesOnly: true },
      async (input, init) => {
        seen = String(input)
        auth = new Headers(init?.headers).get('authorization') ?? ''
        return new Response(JSON.stringify({ errors: ['<img src=x>ok'], accounts: [] }), { status: 200 })
      },
    )
    expect(seen.startsWith('https://beta-bridge.simplefin.org/simplefin/accounts?')).toBe(true)
    expect(seen).not.toContain('secret')
    expect(seen).not.toContain('demo:')
    expect(auth.startsWith('Basic ')).toBe(true)
    expect(parsed.errors).toEqual(['ok'])
  })

  it('warns on a 403 claim and does not echo the response body', async () => {
    await expect(
      claimSetupToken(DEMO_SETUP_TOKEN, async (input, init) => {
        expect(String(input)).toBe('https://beta-bridge.simplefin.org/simplefin/claim/demo')
        expect(init?.method).toBe('POST')
        return new Response('Forbidden (was it already claimed?)', { status: 403 })
      }),
    ).rejects.toMatchObject({ claimRejected: true, status: 403 })
  })

  it('merges paged history and dedupes transactions', async () => {
    const calls: string[] = []
    const set = await fetchHistory('https://demo:demo@beta-bridge.simplefin.org/simplefin', {
      lookbackDays: 80,
      now: 1_000_000,
      pauseMs: 0,
      fetchImpl: async (input) => {
        const url = new URL(String(input))
        calls.push(url.searchParams.get('start-date') ?? '')
        const start = url.searchParams.get('start-date')
        return new Response(
          JSON.stringify({
            errors: start === calls[0] ? ['Notice'] : ['Notice'],
            accounts: [
              {
                id: 'a',
                name: 'Checking',
                currency: 'USD',
                balance: '10',
                'balance-date': 1_000_000,
                org: { name: 'Demo', id: 'org' },
                transactions: [{ id: start, posted: Number(start), amount: '1.00', description: 'Pay day' }],
              },
            ],
          }),
          { status: 200 },
        )
      },
    })
    expect(calls.length).toBeGreaterThan(1)
    expect(set.accounts[0]?.transactions.length).toBe(calls.length)
    expect(set.errors).toEqual(['Notice'])
  })
})
