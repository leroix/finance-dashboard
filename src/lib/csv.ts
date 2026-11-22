import { localISODate } from './dates.ts'
import type { AccountRecord, TransactionRecord } from './types.ts'

function cell(value: string): string {
  let safe = value.replaceAll('"', '""')
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`
  return `"${safe}"`
}

export function transactionsToCsv(accounts: AccountRecord[], txs: TransactionRecord[]): string {
  const names = new Map(accounts.map((account) => [account.id, account]))
  const header = ['date', 'account', 'institution', 'currency', 'amount', 'description', 'pending', 'id']
  const lines = [header.join(',')]
  const sorted = [...txs].sort((a, b) => b.posted - a.posted || a.key.localeCompare(b.key))
  for (const tx of sorted) {
    const account = names.get(tx.accountId)
    const date = tx.posted > 0 ? localISODate(tx.posted * 1000) : ''
    lines.push(
      [
        cell(date),
        cell(account?.name ?? ''),
        cell(account?.institution ?? ''),
        cell(account?.currency ?? ''),
        cell(tx.amount.toFixed(2)),
        cell(tx.description),
        cell(tx.pending ? 'yes' : 'no'),
        cell(tx.id),
      ].join(','),
    )
  }
  return `\uFEFF${lines.join('\n')}\n`
}
