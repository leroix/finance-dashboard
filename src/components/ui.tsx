import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { PERIODS, type PeriodKey } from '../lib/returns.ts'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const buttonStyles = {
  primary: 'bg-brass text-ink hover:bg-[#f0cb86]',
  quiet: 'border border-line bg-panel-2 text-paper hover:border-brass',
  danger: 'border border-bad/40 text-bad hover:bg-bad/10',
  ghost: 'text-muted hover:text-paper',
} as const

export function Button({
  variant = 'quiet',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-faint">{hint}</span> : null}
    </label>
  )
}

export const controlClass =
  'min-h-11 w-full rounded-xl border border-line bg-ink px-3 py-2 text-base outline-none placeholder:text-faint'

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 p-3 sm:place-items-center" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card max-h-[90dvh] w-full max-w-lg overflow-auto p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-medium">
            {title}
          </h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'bad'
  children: ReactNode
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border px-4 py-3 text-sm',
        tone === 'bad' ? 'border-bad/40 bg-bad/10 text-paper' : 'border-brass/30 bg-brass/10 text-paper',
      )}
    >
      {children}
    </div>
  )
}

export function PeriodTabs({ value, onChange }: { value: PeriodKey; onChange: (period: PeriodKey) => void }) {
  return (
    <div role="tablist" aria-label="Performance period" className="inline-flex rounded-full bg-ink p-1">
      {PERIODS.map((period) => (
        <button
          key={period.key}
          type="button"
          role="tab"
          aria-selected={value === period.key}
          className={cx(
            'min-h-9 rounded-full px-3 text-sm',
            value === period.key ? 'bg-paper text-ink' : 'text-muted hover:text-paper',
          )}
          onClick={() => onChange(period.key)}
        >
          {period.label}
        </button>
      ))}
    </div>
  )
}

export function Money({
  value,
  currency,
  signed = false,
  className,
}: {
  value: number
  currency: string
  signed?: boolean
  className?: string
}) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  const text = !signed ? (value < 0 ? `−${formatted}` : formatted) : value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted
  return <span className={className}>{text}</span>
}
