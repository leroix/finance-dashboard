import { useMemo, useState } from 'react'
import { LineChart } from '../components/Charts.tsx'
import { Button, Money, PeriodTabs, controlClass } from '../components/ui.tsx'
import { formatMediumDate, localISODate, todayISO } from '../lib/dates.ts'
import { formatPct, formatSignedMoney } from '../lib/money.ts'
import { accountPerformance } from '../lib/model.ts'
import { contribution, effectiveType } from '../lib/networth.ts'
import type { PeriodKey } from '../lib/returns.ts'
import { TYPE_LABEL, type AccountType, type FlowClass } from '../lib/types.ts'
import { useStore } from '../state/store.tsx'
import { ManualForm } from './Accounts.tsx'

const TYPES: AccountType[] = ['cash', 'liability', 'investment', 'other']

export function AccountDetail({ id }: { id: string }) {
  const store = useStore()
  const account = store.accounts.find((item) => item.id === id)
  const [period, setPeriod] = useState<PeriodKey>('1Y')
  const [editing, setEditing] = useState(false)
  const [limit, setLimit] = useState(80)
  const todayIso = todayISO()
  const view = useMemo(() => {
    if (!account) return null
    return accountPerformance(account, store.transactions, store.snapshots, period, todayIso)
  }, [account, store.transactions, store.snapshots, period, todayIso])

  if (!account || !view) {
    return (
      <div className="py-10">
        <h1 className="num text-4xl">Account not on this device</h1>
        <a href="#/accounts" className="mt-4 inline-block text-brass">
          Back to accounts
        </a>
      </div>
    )
  }

  const type = effectiveType(account)
  const txs = store.transactions
    .filter((tx) => tx.accountId === account.id)
    .sort((a, b) => b.posted - a.posted)
  const shown = txs.slice(0, limit)

  return (
    <div className="space-y-6 pb-10">
      <div>
        <a href="#/accounts" className="text-sm text-faint">
          Accounts
        </a>
        <h1 className="num mt-2 text-4xl md:text-5xl">{account.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {account.institution} · {account.source === 'manual' ? 'Manual' : 'SimpleFIN'} · {account.currency}
        </p>
      </div>
      <section className="card p-5 md:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Balance</p>
            <p className="num text-5xl">
              <Money value={account.balance} currency={account.currency} />
            </p>
            <p className="mt-2 text-sm text-muted">
              In net worth{' '}
              <Money value={contribution(account.balance, type, account.invertOwed)} currency={account.currency} />
              {' · '}
              {formatSignedMoney(view.perf.change, account.currency)} this period · est. {formatPct(view.perf.dietz)}
            </p>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Start" value={formatSignedMoney(view.perf.startBalance, account.currency)} />
          <Stat label="Flows" value={formatSignedMoney(view.perf.netFlow, account.currency)} />
          <Stat label="Market" value={formatSignedMoney(view.perf.marketChange, account.currency)} />
          <Stat label="Change" value={formatSignedMoney(view.perf.change, account.currency)} />
        </div>
        <div className="mt-4">
          <LineChart points={view.series.filter((point) => point.date >= view.perf.from)} currency={account.currency} label={`${account.name} balance history`} />
        </div>
      </section>

      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-muted">Type</span>
          <select
            className={controlClass}
            value={account.typeOverride ?? 'auto'}
            onChange={(event) => {
              const value = event.target.value
              void store.setType(account.id, value === 'auto' ? null : (value as AccountType))
            }}
          >
            <option value="auto">Automatic · {TYPE_LABEL[account.inferredType]}</option>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {TYPE_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={account.invertOwed === true}
            onChange={(event) => void store.setInvert(account.id, event.target.checked ? true : null)}
          />
          <span>
            <span className="block">Positive balance is the amount owed</span>
            <span className="text-faint">Turn this on for a credit card or loan that reports what you owe as a positive number.</span>
          </span>
        </label>
      </section>

      {account.holdings.length > 0 ? (
        <section className="card p-5">
          <h2 className="text-sm text-muted">Holdings</h2>
          <ul className="mt-3 divide-y divide-line">
            {account.holdings.map((holding) => (
              <li key={holding.label} className="flex justify-between py-2 text-sm">
                <span>{holding.label}</span>
                <span className="text-muted">
                  {holding.quantity ?? '—'}
                  {holding.marketValue != null ? ` · ${formatSignedMoney(holding.marketValue, account.currency)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {account.source === 'manual' ? (
        <section className="space-y-3">
          <Button variant="quiet" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Close editor' : 'Edit value'}
          </Button>
          {editing ? (
            <ManualForm
              accountId={account.id}
              submitLabel="Update value"
              initial={{
                name: account.name,
                institution: account.institution,
                type: account.inferredType,
                balance: account.balance,
              }}
              onDone={() => setEditing(false)}
            />
          ) : null}
          <Button variant="danger" onClick={() => void store.deleteManual(account.id).then(() => (location.hash = '#/accounts'))}>
            Delete manual account
          </Button>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm text-muted">Transactions</h2>
        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No transactions stored for this account. Sync history if it is a SimpleFIN account.</p>
        ) : (
          <ul className="card mt-3 divide-y divide-line">
            {shown.map((tx) => (
              <li key={tx.key} className="grid gap-2 px-4 py-3 md:grid-cols-[8rem_1fr_auto_auto] md:items-center">
                <span className="text-sm text-faint">{tx.posted > 0 ? formatMediumDate(localISODate(tx.posted * 1000)) : 'Pending date'}</span>
                <span>
                  {tx.description}
                  {tx.pending ? <span className="ml-2 text-xs text-brass">Pending</span> : null}
                </span>
                <span className={tx.amount < 0 ? 'text-bad' : 'text-good'}>{formatSignedMoney(tx.amount, account.currency)}</span>
                <select
                  aria-label={`How to treat ${tx.description}`}
                  className="rounded-lg border border-line bg-ink px-2 py-1 text-xs"
                  value={tx.flowOverride ?? 'auto'}
                  onChange={(event) => {
                    const value = event.target.value
                    void store.setFlow(tx.key, value === 'auto' ? null : (value as FlowClass))
                  }}
                >
                  <option value="auto">Auto</option>
                  <option value="flow">Flow</option>
                  <option value="market">Market</option>
                  <option value="ignore">Ignore</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        {txs.length > shown.length ? (
          <Button className="mt-3" variant="ghost" onClick={() => setLimit((value) => value + 80)}>
            Show more
          </Button>
        ) : null}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink px-3 py-2">
      <p className="text-xs text-faint">{label}</p>
      <p className="num text-lg">{value}</p>
    </div>
  )
}
