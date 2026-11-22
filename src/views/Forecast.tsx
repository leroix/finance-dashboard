import { useMemo, useState } from 'react'
import { MultiLineChart } from '../components/Charts.tsx'
import { Button, Field, Money, controlClass } from '../components/ui.tsx'
import { todayISO } from '../lib/dates.ts'
import { projectNetWorth } from '../lib/forecast.ts'
import { formatMoney } from '../lib/money.ts'
import { computeTotals } from '../lib/networth.ts'
import { useStore } from '../state/store.tsx'

export function Forecast() {
  const store = useStore()
  const totals = computeTotals(store.accounts)
  const [savings, setSavings] = useState(String(store.settings.monthlySavings))
  const [rate, setRate] = useState(String(Math.round(store.settings.annualReturn * 1000) / 10))
  const [inflation, setInflation] = useState(String(Math.round(store.settings.inflation * 1000) / 10))
  const [years, setYears] = useState(String(store.settings.years))

  const parsed = {
    monthlySavings: Number(savings),
    annualReturn: Number(rate) / 100,
    inflation: Number(inflation) / 100,
    years: Number(years),
  }
  const valid = [parsed.monthlySavings, parsed.annualReturn, parsed.inflation, parsed.years].every(Number.isFinite) && parsed.years >= 1
  const points = useMemo(
    () =>
      projectNetWorth({
        current: totals.netWorth,
        monthlySavings: valid ? parsed.monthlySavings : store.settings.monthlySavings,
        annualReturn: valid ? parsed.annualReturn : store.settings.annualReturn,
        inflation: valid ? parsed.inflation : store.settings.inflation,
        years: valid ? parsed.years : store.settings.years,
        startIso: todayISO(),
      }),
    [totals.netWorth, valid, parsed.monthlySavings, parsed.annualReturn, parsed.inflation, parsed.years, store.settings],
  )
  const end = points.at(-1)

  return (
    <div className="space-y-6 pb-10">
      <div>
        <p className="text-sm tracking-[0.16em] text-brass uppercase">Projection</p>
        <h1 className="num mt-2 text-4xl md:text-5xl">If these assumptions hold</h1>
        <p className="mt-3 max-w-2xl text-muted">
          This is a projection, not a prediction. It compounds the return you type, adds the monthly savings, and then
          restates the result in today’s dollars using your inflation assumption. Taxes, crashes, and the gap between
          accounts are not in the model.
        </p>
      </div>
      <section className="card p-5 md:p-7">
        <p className="text-sm text-muted">Starting net worth</p>
        <p className="num text-4xl">
          <Money value={totals.netWorth} currency={totals.currency} />
        </p>
        <div className="mt-6">
          <MultiLineChart
            labels={points.map((point) => point.label)}
            currency={totals.currency}
            series={[
              { name: 'Nominal', color: '#e2b45c', values: points.map((point) => point.nominal) },
              { name: 'Today’s dollars', color: '#b7d39c', values: points.map((point) => point.real) },
            ]}
          />
        </div>
        {end ? (
          <p className="mt-4 text-sm text-muted">
            In {parsed.years || store.settings.years} years the nominal figure is {formatMoney(end.nominal, totals.currency)}. In
            today’s dollars that is {formatMoney(end.real, totals.currency)}.
          </p>
        ) : null}
      </section>
      <form
        className="card grid gap-4 p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          void store.setForecast(parsed)
        }}
      >
        <Field label="Monthly savings" hint="Use a negative number to model a drawdown.">
          <input className={controlClass} inputMode="decimal" value={savings} onChange={(event) => setSavings(event.target.value)} />
        </Field>
        <Field label="Expected return" hint="Nominal, percent per year.">
          <input className={controlClass} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
        </Field>
        <Field label="Inflation" hint="Percent per year, used only to show today’s dollars.">
          <input className={controlClass} inputMode="decimal" value={inflation} onChange={(event) => setInflation(event.target.value)} />
        </Field>
        <Field label="Years">
          <input className={controlClass} inputMode="numeric" value={years} onChange={(event) => setYears(event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" variant="primary" disabled={!valid}>
            Save assumptions
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="text-faint">
            <tr>
              <th className="py-2 font-normal">Year</th>
              <th className="py-2 font-normal">Nominal</th>
              <th className="py-2 font-normal">Today’s dollars</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((point) => point.months === 0 || point.months % 60 === 0 || point === end)
              .map((point) => (
                <tr key={point.iso} className="border-t border-line">
                  <td className="py-2">{point.label}</td>
                  <td className="py-2">{formatMoney(point.nominal, totals.currency)}</td>
                  <td className="py-2">{formatMoney(point.real, totals.currency)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
