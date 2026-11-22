import { describe, expect, it } from 'vitest'
import { resolveViteBase, webAuthnRpId } from './deploy.ts'

describe('GitHub Pages base', () => {
  it('defaults to a relative base', () => {
    expect(resolveViteBase(undefined)).toBe('./')
    expect(resolveViteBase('')).toBe('./')
    expect(resolveViteBase('./')).toBe('./')
    expect(resolveViteBase('.')).toBe('./')
  })

  it('normalizes the finance-dashboard project path', () => {
    expect(resolveViteBase('finance-dashboard')).toBe('/finance-dashboard/')
    expect(resolveViteBase('/finance-dashboard')).toBe('/finance-dashboard/')
    expect(resolveViteBase('/finance-dashboard/')).toBe('/finance-dashboard/')
  })
})

describe('WebAuthn rpId on github.io', () => {
  it('uses the user subdomain, which is the registrable domain', () => {
    expect(webAuthnRpId('leroix.github.io')).toBe('leroix.github.io')
    expect(webAuthnRpId('Leroix.GitHub.io.')).toBe('leroix.github.io')
  })

  it('refuses the public suffix and IP addresses', () => {
    expect(() => webAuthnRpId('github.io')).toThrow(/public suffix/)
    expect(() => webAuthnRpId('127.0.0.1')).toThrow(/IP address/)
  })

  it('keeps localhost and custom domains', () => {
    expect(webAuthnRpId('localhost')).toBe('localhost')
    expect(webAuthnRpId('money.example.com')).toBe('money.example.com')
  })
})
