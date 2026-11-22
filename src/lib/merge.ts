import type { AccountRecord, Books, SnapshotRecord, TransactionRecord } from './types.ts'

function withOverrides(incoming: AccountRecord, prev?: AccountRecord): AccountRecord {
  if (!prev) return incoming
  return { ...incoming, typeOverride: prev.typeOverride, invertOwed: prev.invertOwed }
}

export function applySync(
  books: Books,
  incoming: Books,
  mode: 'replace' | 'merge',
): Books {
  const prevAccounts = new Map(books.accounts.map((account) => [account.id, account]))
  const synced = incoming.accounts.map((account) => withOverrides(account, prevAccounts.get(account.id)))
  const incomingIds = new Set(synced.map((account) => account.id))
  const manuals = books.accounts.filter((account) => account.source === 'manual')
  const keptSynced =
    mode === 'merge'
      ? books.accounts.filter((account) => account.source === 'simplefin' && !incomingIds.has(account.id))
      : []
  const accounts = [...manuals, ...keptSynced, ...synced]
  const accountIds = new Set(accounts.map((account) => account.id))

  const txMap = new Map<string, TransactionRecord>()
  for (const tx of books.transactions) {
    const account = prevAccounts.get(tx.accountId)
    if (!account) continue
    if (account.source === 'manual' || mode === 'merge' || incomingIds.has(tx.accountId)) {
      txMap.set(tx.key, tx)
    }
  }
  for (const tx of incoming.transactions) {
    const prev = txMap.get(tx.key)
    txMap.set(tx.key, prev ? { ...tx, flowOverride: prev.flowOverride } : tx)
  }

  const snapMap = new Map<string, SnapshotRecord>()
  for (const snap of books.snapshots) {
    const account = prevAccounts.get(snap.accountId)
    if (!account) continue
    if (account.source === 'manual' || mode === 'merge' || incomingIds.has(snap.accountId)) {
      snapMap.set(snap.key, snap)
    }
  }
  for (const snap of incoming.snapshots) snapMap.set(snap.key, snap)

  return {
    accounts,
    transactions: [...txMap.values()].filter((tx) => accountIds.has(tx.accountId)),
    snapshots: [...snapMap.values()].filter((snap) => accountIds.has(snap.accountId)),
  }
}

export function transactionKey(accountId: string, id: string): string {
  return `${accountId}\t${id}`
}

export function snapshotKey(accountId: string, date: string): string {
  return `${accountId}\t${date}`
}
