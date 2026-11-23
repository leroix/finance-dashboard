import { useState } from 'react'
import { Button, Field, Money, controlClass } from '../components/ui.tsx'
import { formatBalanceAsOf } from '../lib/dates.ts'
import { contribution, effectiveType, normalizeIncludePercent, ownershipWeight } from '../lib/networth.ts'
import { TYPE_LABEL, type AccountType } from '../lib/types.ts'
import { accountHref } from '../router.ts'
import { useStore, type ManualInput } from '../state/store.tsx'

const TYPES: AccountType[] = ['cash', 'liability', 'investment', 'other']

export function Accounts() {
  const store = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="num text-4xl">Accounts</h1>
          <p className="mt-1 text-sm text-muted">Synced balances and anything you track by hand.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen((value) => !value)}>
          {open ? 'Close' : 'Add manual account'}
        </Button>
      </div>
      {open ? <ManualForm onDone={() => setOpen(false)} /> : null}
      {store.accounts.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <p>Nothing here yet.</p>
          <p className="mt-2 text-sm text-muted">A manual account is enough to start a net-worth line. A house or a loan both count.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {store.accounts.map((account) => {
            const includePercent = normalizeIncludePercent(account.includePercent)
            const weight = ownershipWeight(includePercent)
            const asOf = formatBalanceAsOf(account.balanceDate)
            const available = account.availableBalance
            const availableDiffers = available != null && available !== account.balance
            return (
              <li key={account.id}>
                <a href={accountHref(account.id)} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-panel-2">
                  <span>
                    <span className="block">{account.name}</span>
                    <span className="block text-sm text-faint">
                      {account.institution} · {TYPE_LABEL[effectiveType(account)]}
                      {account.source === 'manual' ? ' · manual' : ''}
                      {weight === 0 ? ' · excluded' : weight < 1 ? ` · ${includePercent}%` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-xl">
                      <Money value={account.balance} currency={account.currency} />
                    </span>
                    <span className="block text-xs text-faint">
                      {availableDiffers && available != null ? (
                        <>
                          Available <Money value={available} currency={account.currency} />
                          {' · '}
                        </>
                      ) : null}
                      {asOf ? `${asOf} · ` : ''}
                      In net worth{' '}
                      <Money
                        value={contribution(
                          account.balance,
                          effectiveType(account),
                          account.invertOwed,
                          account.includePercent,
                        )}
                        currency={account.currency}
                      />
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ManualForm({
  accountId,
  initial,
  onDone,
  submitLabel = 'Save account',
}: {
  accountId?: string
  initial?: ManualInput
  onDone?: () => void
  submitLabel?: string
}) {
  const store = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? 'other')
  const [balance, setBalance] = useState(initial ? String(initial.balance) : '')
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="card grid gap-4 p-5 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        const amount = Number(balance)
        if (!name.trim() || !Number.isFinite(amount)) {
          setError('Name and a numeric balance are required.')
          return
        }
        const input = { name, institution, type, balance: amount }
        const action = accountId ? store.updateManual(accountId, input) : store.addManual(input)
        void action.then((ok) => {
          if (ok) onDone?.()
        })
      }}
    >
      <Field label="Name">
        <input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="House on Pine St" />
      </Field>
      <Field label="Institution" hint="Optional. Shown as Manual if you leave it blank.">
        <input className={controlClass} value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Manual" />
      </Field>
      <Field label="Type">
        <select className={controlClass} value={type} onChange={(event) => setType(event.target.value as AccountType)}>
          {TYPES.map((item) => (
            <option key={item} value={item}>
              {TYPE_LABEL[item]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={type === 'liability' ? 'Amount you owe' : 'Value'} hint={type === 'liability' ? 'Enter a positive amount. Net worth subtracts it.' : 'USD'}>
        <input className={controlClass} inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" />
      </Field>
      {error ? <p className="text-sm text-bad md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <Button type="submit" variant="primary" disabled={store.syncing}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
