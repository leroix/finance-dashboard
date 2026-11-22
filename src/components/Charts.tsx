import { useState } from 'react'
import { formatMediumDate } from '../lib/dates.ts'
import { formatMoney } from '../lib/money.ts'
import type { DailyPoint } from '../lib/networth.ts'

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function LineChart({
  points,
  currency,
  label,
}: {
  points: DailyPoint[]
  currency: string
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) {
    return <p className="text-sm text-muted">No balance history yet. Refresh to save today’s snapshot.</p>
  }
  const width = 640
  const height = 260
  const left = 52
  const right = 12
  const top = 16
  const bottom = 28
  const values = points.map((point) => point.balance)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  const innerW = width - left - right
  const innerH = height - top - bottom
  const xAt = (index: number) => left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yAt = (value: number) => top + ((max - value) / span) * innerH
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(point.balance).toFixed(1)}`).join(' ')
  const area = `${line} L ${xAt(points.length - 1).toFixed(1)} ${(top + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(top + innerH).toFixed(1)} Z`
  const ticks = [max, min + span / 2, min]
  const active = hover == null ? points.length - 1 : hover
  const activePoint = points[active]
  const estimated = points.some((point) => point.estimated)

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="h-64 w-full touch-none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const vx = ((event.clientX - rect.left) / rect.width) * width
          const ratio = Math.min(1, Math.max(0, (vx - left) / innerW))
          setHover(Math.round(ratio * (points.length - 1)))
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yAt(tick)} y2={yAt(tick)} stroke="#353a2c" strokeDasharray="3 4" />
            <text x={left - 8} y={yAt(tick) + 4} textAnchor="end" fill="#847e70" fontSize="11">
              {compact(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill="rgb(226 180 92 / 0.16)" />
        <path d={line} fill="none" stroke="#e2b45c" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {activePoint ? (
          <>
            <line x1={xAt(active)} x2={xAt(active)} y1={top} y2={top + innerH} stroke="#f3efe4" strokeOpacity="0.25" />
            <circle cx={xAt(active)} cy={yAt(activePoint.balance)} r="4" fill="#f3efe4" />
          </>
        ) : null}
        <text x={left} y={height - 8} fill="#847e70" fontSize="11">
          {formatMediumDate(points[0]?.date ?? '')}
        </text>
        <text x={width - right} y={height - 8} textAnchor="end" fill="#847e70" fontSize="11">
          {formatMediumDate(points[points.length - 1]?.date ?? '')}
        </text>
      </svg>
      {activePoint ? (
        <p className="mt-1 text-sm text-muted">
          <span className="text-paper">{formatMediumDate(activePoint.date)}</span>
          {' · '}
          {formatMoney(activePoint.balance, currency)}
          {activePoint.estimated ? ' · reconstructed' : ' · saved that day'}
        </p>
      ) : null}
      {estimated ? (
        <p className="mt-1 text-xs text-faint">
          Days without a saved snapshot are reconstructed from transactions and can miss anything the feed did not return.
        </p>
      ) : null}
    </div>
  )
}

export function MultiLineChart({
  labels,
  series,
  currency,
}: {
  labels: string[]
  series: { name: string; color: string; values: number[] }[]
  currency: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 260
  const left = 56
  const right = 12
  const top = 16
  const bottom = 28
  const values = series.flatMap((item) => item.values)
  let min = Math.min(...values, 0)
  let max = Math.max(...values, 1)
  if (min === max) max = min + 1
  const span = max - min
  const innerW = width - left - right
  const innerH = height - top - bottom
  const n = Math.max(labels.length, 1)
  const xAt = (index: number) => left + (n === 1 ? innerW / 2 : (index / (n - 1)) * innerW)
  const yAt = (value: number) => top + ((max - value) / span) * innerH
  const active = hover == null ? n - 1 : hover

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Projected net worth"
        className="h-64 w-full touch-none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const vx = ((event.clientX - rect.left) / rect.width) * width
          const ratio = Math.min(1, Math.max(0, (vx - left) / innerW))
          setHover(Math.round(ratio * (n - 1)))
        }}
      >
        {[max, (max + min) / 2, min].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yAt(tick)} y2={yAt(tick)} stroke="#353a2c" strokeDasharray="3 4" />
            <text x={left - 8} y={yAt(tick) + 4} textAnchor="end" fill="#847e70" fontSize="11">
              {compact(tick)}
            </text>
          </g>
        ))}
        {series.map((item) => {
          const d = item.values
            .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`)
            .join(' ')
          return <path key={item.name} d={d} fill="none" stroke={item.color} strokeWidth="2.25" strokeLinejoin="round" />
        })}
        <line x1={xAt(active)} x2={xAt(active)} y1={top} y2={top + innerH} stroke="#f3efe4" strokeOpacity="0.25" />
        <text x={left} y={height - 8} fill="#847e70" fontSize="11">
          {labels[0]}
        </text>
        <text x={width - right} y={height - 8} textAnchor="end" fill="#847e70" fontSize="11">
          {labels[labels.length - 1]}
        </text>
      </svg>
      <p className="mt-1 text-sm text-muted">
        <span className="text-paper">{labels[active]}</span>
        {series.map((item) => (
          <span key={item.name}>
            {' · '}
            {item.name} {formatMoney(item.values[active] ?? 0, currency)}
          </span>
        ))}
      </p>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Bars({
  rows,
  currency,
}: {
  rows: { label: string; value: number }[]
  currency: string
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nothing in this currency yet.</p>
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1)
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span className={row.value < 0 ? 'text-bad' : 'text-paper'}>{formatMoney(row.value, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink">
            <div
              className={row.value < 0 ? 'h-full bg-bad' : 'h-full bg-brass'}
              style={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 80
      const y = 22 - ((value - min) / span) * 18
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const up = values[values.length - 1]! >= values[0]!
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? '#b7d39c' : '#f0a394'} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
