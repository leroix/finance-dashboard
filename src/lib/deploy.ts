/**
 * Vite `base`. Relative by default so a project site at
 * https://<user>.github.io/<repo>/ resolves ./assets without a rewrite.
 * Set SABLE_BASE=/repo-name/ for absolute asset URLs.
 */
export function resolveViteBase(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (value === '' || value === '.' || value === './') return './'
  let base = value
  if (!base.startsWith('/') && !base.startsWith('./') && !/^[a-z][a-z0-9+.-]*:/i.test(base)) {
    base = `/${base}`
  }
  if (!base.endsWith('/')) base += '/'
  return base
}

const IP_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$|^(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]*$/i

/**
 * WebAuthn relying party id for this page.
 * It must be the hostname itself. `github.io` is a public suffix, so a project
 * site at https://<user>.github.io/<repo>/ uses `<user>.github.io`, which
 * browsers accept. `github.io` alone is rejected.
 */
export function webAuthnRpId(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!host) throw new Error('Passkeys need a hostname.')
  if (host === 'github.io') {
    throw new Error(
      'github.io is a public suffix and cannot be a passkey relying party id. Publish on https://<user>.github.io/<repo>/ so the id is <user>.github.io.',
    )
  }
  if (IP_HOST.test(host)) {
    throw new Error(
      'Passkeys cannot use an IP address as the relying party id. Open http://localhost, or your https://<user>.github.io site.',
    )
  }
  return host
}
