import { useMemo, useState } from 'react'
import { Bars, LineChart, Spark } from '../components/Charts.tsx'
import { SecurityActions } from '../components/Security.tsx'
import { Banner, Button, Money, PeriodTabs } from '../components/ui.tsx'
import { formatPct, formatSignedMoney } from '../lib/money.ts'
import { buildDesk } from '../lib/model.ts'
import { todayISO } from '../lib/dates.ts'
import { effectiveType, normalizeIncludePercent, ownershipWeight } from '../lib/networth.ts'
import type { PeriodKey } from '../lib/returns.ts'
import { TYPE_LABEL } from '../lib/types.ts'
import { accountHref } from '../router.ts'
import { useStore } from '../state/store.tsx'

export function Desk() {
  const store = useStore()
  const [period, setPeriod] = useState<PeriodKey>('1Y')
  const today = todayISO()
  const desk = useMemo(
    () => buildDesk(store.accounts, store.transactions, store.snapshots, period, today),
    [store.accounts, store.transactions, store.snapshots, period, today],
  )
  const perf = desk.performance

  return (
    <div className="space-y-6 pb-8">
      {store.banner ? (
        <Banner tone={store.bannerTone}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p>{store.banner}</p>
            <button type="button" className="text-xs text-muted" onClick={store.dismissBanner}>
              Dismiss
            </button>
          </div>
          {store.hasAccess && !store.secret ? <SecurityActions intent="lock" /> : null}
          {store.secret && !store.hasAccess ? <SecurityActions intent="unlock" /> : null}
        </Banner>
      ) : null}
      {store.meta.lastErrors.length > 0 ? (
        <Banner tone="bad">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">SimpleFIN reported</p>
              <ul className="mt-1 list-disc pl-4">
                {store.meta.lastErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
            <button type="button" className="text-xs text-muted" onClick={() => void store.dismissErrors()}>
              Dismiss
            </button>
          </div>
        </Banner>
      ) : null}
      {!store.hasAccess && store.secret ? (
        <Banner>
          <p>The access URL is locked. Balances already saved on this device are shown below. Unlock to refresh.</p>
          <SecurityActions intent="unlock" />
        </Banner>
      ) : null}

      <section className="card p-5 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Net worth{store.meta.usingDemo ? ' · demo' : ''}</p>
            <p className="num mt-1 text-5xl text-paper md:text-7xl">
              <Money value={desk.netWorth} currency={desk.currency} />
            </p>
            <p className={`mt-3 text-sm ${perf.change < 0 ? 'text-bad' : 'text-good'}`}>
              {formatSignedMoney(perf.change, desk.currency)}
              <span className="text-muted"> balance · </span>
              {formatPct(perf.dietz)}
              <span className="text-muted"> est. return</span>
              {perf.partial ? <span className="text-faint"> · partial history</span> : null}
            </p>
            <p className="mt-1 text-sm text-muted">
              Flows {formatSignedMoney(perf.netFlow, desk.currency)} · Market {formatSignedMoney(perf.marketChange, desk.currency)}
            </p>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
        <div className="mt-6">
          {store.accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
              <p className="text-lg">No accounts on this device yet.</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Connect SimpleFIN for banks and brokerages, or add a house, a car, or a loan by hand. Either way the
                numbers stay in this browser.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <a href="#/connect" className="inline-flex min-h-11 items-center rounded-full bg-brass px-4 text-sm font-medium text-ink">
                  Connect SimpleFIN
                </a>
                <a href="#/accounts" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
                  Add a manual account
                </a>
              </div>
            </div>
          ) : (
            <LineChart
              points={desk.series}
              currency={desk.currency}
              label={`Net worth from ${formatSignedMoney(perf.startBalance, desk.currency)} to ${formatSignedMoney(perf.endBalance, desk.currency)}`}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-faint">
          Return is an estimate: modified Dietz. Pay, spending, and transfers count as flows. Interest, dividends, and
          fees stay in the market result. This is not a brokerage performance report.
        </p>
      </section>

      {store.accounts.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-sm text-muted">By institution</h2>
            <div className="mt-4">
              <Bars rows={desk.byInstitution.map((row) => ({ label: row.name, value: row.value }))} currency={desk.currency} />
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-sm text-muted">By account type</h2>
            <div className="mt-4">
              <Bars rows={desk.byType.map((row) => ({ label: row.label, value: row.value }))} currency={desk.currency} />
            </div>
          </div>
        </section>
      ) : null}

      {desk.omitted.length > 0 ? (
        <p className="text-sm text-muted">
          {desk.omitted.length} account{desk.omitted.length === 1 ? '' : 's'} {desk.omitted.length === 1 ? 'is' : 'are'}{' '}
          excluded from net worth. Open an account to include a percentage of it again.
        </p>
      ) : null}
      {desk.excluded.length > 0 ? (
        <p className="text-sm text-muted">
          {desk.excluded.length} account{desk.excluded.length === 1 ? '' : 's'} use another currency and {desk.excluded.length === 1 ? 'is' : 'are'} listed
          but not added into the {desk.currency} total.
        </p>
      ) : null}

      {desk.rows.length > 0 ? (
        <section className="card divide-y divide-line">
          {desk.rows.map((row) => {
            const includePercent = normalizeIncludePercent(row.account.includePercent)
            const weight = ownershipWeight(includePercent)
            return (
              <a key={row.account.id} href={accountHref(row.account.id)} className="flex items-center gap-4 px-5 py-4 hover:bg-panel-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{row.account.name}</p>
                  <p className="truncate text-sm text-faint">
                    {row.account.institution} · {TYPE_LABEL[effectiveType(row.account)]}
                    {weight === 0 ? ' · excluded' : weight < 1 ? ` · ${includePercent}%` : ''}
                  </p>
                </div>
                <Spark values={row.series.filter((point) => point.date >= row.perf.from).map((point) => point.balance)} />
                <div className="text-right">
                  <p className="num text-xl">
                    <Money value={row.account.balance} currency={row.account.currency} />
                  </p>
                  <p className={`text-sm ${row.perf.change < 0 ? 'text-bad' : 'text-good'}`}>
                    {formatSignedMoney(row.perf.change, desk.currency)}
                    <span className="text-faint"> · {formatPct(row.perf.dietz)}</span>
                  </p>
                </div>
              </a>
            )
          })}
        </section>
      ) : null}

      {store.hasAccess ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" disabled={store.syncing} onClick={() => void store.syncHistory()}>
            {store.syncing ? store.syncLabel : 'Sync history'}
          </Button>
          <a href="#/forecast" className="inline-flex min-h-11 items-center text-sm text-brass">
            Project this forward
          </a>
        </div>
      ) : null}
    </div>
  )
}
