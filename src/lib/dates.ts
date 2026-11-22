export function localISODate(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalISODate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
}

export function todayISO(now = Date.now()): string {
  return localISODate(now)
}

export function addDays(iso: string, days: number): string {
  const dt = new Date(parseLocalISODate(iso))
  dt.setDate(dt.getDate() + days)
  return localISODate(dt.getTime())
}

export function eachDate(startIso: string, endIso: string): string[] {
  if (endIso < startIso) return []
  const out: string[] = []
  let cursor = startIso
  while (cursor <= endIso) {
    out.push(cursor)
    cursor = addDays(cursor, 1)
    if (out.length > 20000) break
  }
  return out
}

export function formatMediumDate(iso: string): string {
  const ms = parseLocalISODate(iso)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(ms)
}

export function formatMonthYear(iso: string): string {
  const ms = parseLocalISODate(iso.length === 7 ? `${iso}-01` : iso)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(ms)
}

export function formatRelative(ms: number, now = Date.now()): string {
  const delta = now - ms
  if (delta < 60_000) return 'just now'
  const minutes = Math.round(delta / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function unixNow(now = Date.now()): number {
  return Math.floor(now / 1000)
}
