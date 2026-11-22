import { describe, expect, it } from 'vitest'
import { resolveViteBase, webAuthnRpId } from './deploy.ts'

describe('GitHub Pages base', () => {
  it('defaults to a relative base', () => {
    expect(resolveViteBase(undefined)).toBe('./')
    expect(resolveViteBase('')).toBe('./')
    expect(resolveViteBase('./')).toBe('./')
    expect(resolveViteBase('.')).toBe('./')
  })

  it('normalizes a project-site subpath', () => {
    expect(resolveViteBase('sable')).toBe('/sable/')
    expect(resolveViteBase('/sable')).toBe('/sable/')
    expect(resolveViteBase('/my-name/sable/')).toBe('/my-name/sable/')
  })
})

describe('WebAuthn rpId on github.io', () => {
  it('uses the user subdomain, which is the registrable domain', () => {
    expect(webAuthnRpId('ada.github.io')).toBe('ada.github.io')
    expect(webAuthnRpId('Ada.GitHub.io.')).toBe('ada.github.io')
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
