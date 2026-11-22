import { describe, expect, it } from 'vitest'
import { bytesToB64, randomBytes } from './bytes.ts'
import { openBackup, sealBackup } from './backup.ts'
import {
  decryptString,
  deriveAesKeyFromPassphrase,
  deriveAesKeyFromPrf,
  encryptString,
  PBKDF2_ITERATIONS,
} from './crypto.ts'
import { DEFAULT_META, DEFAULT_SETTINGS } from './types.ts'

describe('crypto round trip', () => {
  it('uses a strong PBKDF2 iteration count', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })

  it('encrypts and decrypts with a passphrase', async () => {
    const salt = randomBytes(16)
    const key = await deriveAesKeyFromPassphrase('correct horse', salt, 20_000)
    const packed = await encryptString(key, 'https://user:secret@beta-bridge.simplefin.org/simplefin')
    expect(packed.ciphertext).not.toContain('secret')
    const plain = await decryptString(key, packed)
    expect(plain).toBe('https://user:secret@beta-bridge.simplefin.org/simplefin')
    const other = await deriveAesKeyFromPassphrase('wrong horse!!', salt, 20_000)
    await expect(decryptString(other, packed)).rejects.toThrow(/decrypt/i)
  })

  it('derives an AES key from PRF bytes via HKDF', async () => {
    const prf = randomBytes(32)
    const salt = randomBytes(16)
    const key = await deriveAesKeyFromPrf(prf, salt)
    const packed = await encryptString(key, 'access-url')
    expect(await decryptString(key, packed)).toBe('access-url')
    const again = await deriveAesKeyFromPrf(prf, salt)
    expect(await decryptString(again, packed)).toBe('access-url')
    const otherSalt = await deriveAesKeyFromPrf(prf, randomBytes(16))
    await expect(decryptString(otherSalt, packed)).rejects.toThrow(/decrypt/i)
  })

  it('seals a backup so the payload is not readable without the passphrase', async () => {
    const payload = {
      exportedAt: '2026-11-22T00:00:00.000Z',
      accounts: [],
      transactions: [],
      snapshots: [],
      settings: DEFAULT_SETTINGS,
      meta: DEFAULT_META,
      accessUrl: 'https://demo:demo@beta-bridge.simplefin.org/simplefin',
    }
    const envelope = await sealBackup(payload, 'long-passphrase', 20_000)
    expect(envelope.format).toBe('sable-backup')
    expect(JSON.stringify(envelope)).not.toContain('demo:demo')
    expect(envelope.salt).toBe(bytesToB64(Uint8Array.from(atob(envelope.salt), (c) => c.charCodeAt(0))))
    const opened = await openBackup(envelope, 'long-passphrase')
    expect(opened.accessUrl).toBe(payload.accessUrl)
    await expect(openBackup(envelope, 'wrong-passphrase')).rejects.toThrow(/passphrase/i)
  })
})
