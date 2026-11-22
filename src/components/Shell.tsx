import { useEffect, type ReactNode } from 'react'
import { useRoute } from '../router.ts'
import { useStore } from '../state/store.tsx'
import { formatRelative } from '../lib/dates.ts'
import { AccountDetail } from '../views/AccountDetail.tsx'
import { Accounts } from '../views/Accounts.tsx'
import { Connect } from '../views/Connect.tsx'
import { Desk } from '../views/Desk.tsx'
import { Forecast } from '../views/Forecast.tsx'
import { Settings } from '../views/Settings.tsx'
import { cx } from './ui.tsx'

const NAV = [
  { href: '#/', name: 'desk', label: 'Desk' },
  { href: '#/accounts', name: 'accounts', label: 'Accounts' },
  { href: '#/forecast', name: 'forecast', label: 'Forecast' },
  { href: '#/settings', name: 'settings', label: 'Settings' },
] as const

export function Shell() {
  const store = useStore()
  const route = useRoute()
  useEffect(() => {
    const titles = {
      desk: 'Desk',
      accounts: 'Accounts',
      account: 'Account',
      forecast: 'Forecast',
      settings: 'Settings',
      connect: 'Connect',
    } as const
    document.title = `Sable · ${titles[route.name]}`
  }, [route.name])

  if (!store.ready) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-muted">Opening the books on this device…</p>
      </main>
    )
  }
  if (store.bootError) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6">
        <div>
          <h1 className="num text-4xl">Sable can’t store data here</h1>
          <p className="mt-3 text-muted">{store.bootError}</p>
        </div>
      </main>
    )
  }

  let page: ReactNode
  if (route.name === 'accounts') page = <Accounts />
  else if (route.name === 'account') page = <AccountDetail id={route.id} />
  else if (route.name === 'forecast') page = <Forecast />
  else if (route.name === 'settings') page = <Settings />
  else if (route.name === 'connect') page = <Connect />
  else page = <Desk />

  const active = route.name === 'account' ? 'accounts' : route.name

  return (
    <div className="mx-auto min-h-dvh max-w-6xl md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r border-line px-5 py-7 md:flex md:flex-col">
        <a href="#/" className="num text-3xl text-paper">
          Sable
        </a>
        <p className="mt-1 text-sm text-faint">On this device only</p>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cx(
                'rounded-xl px-3 py-2 text-sm',
                active === item.name ? 'bg-panel-2 text-paper' : 'text-muted hover:text-paper',
              )}
              aria-current={active === item.name ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <p className="mt-auto text-xs leading-5 text-faint">
          Network calls go only to SimpleFIN Bridge. Nothing else leaves the browser.
        </p>
      </aside>
      <div className="flex min-w-0 flex-col pb-24 md:pb-10">
        <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
          <div>
            <a href="#/" className="num text-2xl md:hidden">
              Sable
            </a>
            <p className="text-xs text-faint">
              {store.meta.lastSyncAt ? `Synced ${formatRelative(store.meta.lastSyncAt)}` : 'Not synced yet'}
              {store.meta.usingDemo ? ' · demo data' : ''}
              {store.syncing ? ` · ${store.syncLabel}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="#/connect" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-muted">
              Connect
            </a>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full bg-brass px-4 text-sm font-medium text-ink disabled:opacity-50"
              disabled={store.syncing || !store.hasAccess}
              onClick={() => void store.refreshBalances()}
            >
              Refresh
            </button>
          </div>
        </header>
        <main className="min-w-0 px-4 md:px-8">{page}</main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-4">
          {NAV.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={cx(
                  'flex min-h-14 items-center justify-center text-sm',
                  active === item.name ? 'text-brass' : 'text-muted',
                )}
                aria-current={active === item.name ? 'page' : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
