import { useEffect, useState } from 'react'

export type Route =
  | { name: 'desk' }
  | { name: 'accounts' }
  | { name: 'account'; id: string }
  | { name: 'forecast' }
  | { name: 'settings' }
  | { name: 'connect' }

export function parseHash(hash: string): Route {
  const path = (hash || '#/').replace(/^#/, '').split('?')[0] || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'accounts' && parts[1]) return { name: 'account', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'accounts') return { name: 'accounts' }
  if (parts[0] === 'forecast') return { name: 'forecast' }
  if (parts[0] === 'settings') return { name: 'settings' }
  if (parts[0] === 'connect') return { name: 'connect' }
  return { name: 'desk' }
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseHash(hash)
}

export function accountHref(id: string): string {
  return `#/accounts/${encodeURIComponent(id)}`
}
