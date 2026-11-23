import { describe, expect, it } from 'vitest'
import { bytesToB64, randomBytes } from './bytes.ts'
import { deriveAesKeyFromPassphrase, deriveAesKeyFromPrf, HKDF_INFO_ACCESS, HKDF_INFO_VAULT } from './crypto.ts'
import { DEFAULT_META, DEFAULT_SETTINGS } from './types.ts'
import { generateVaultKey, openVault, sealVault, unwrapVaultKey, wrapVaultKey } from './vault.ts'

describe('vault', () => {
  it('round-trips books with a wrapped data key', async () => {
    const { key, raw } = await generateVaultKey()
    const salt = randomBytes(16)
    const kek = await deriveAesKeyFromPassphrase('correct horse battery', salt, 20_000)
    const wrapped = await wrapVaultKey(kek, raw)
    const payload = {
      accounts: [
        {
          id: 'a1',
          source: 'manual' as const,
          name: 'Checking',
          institution: 'Bank',
          currency: 'USD',
          balance: 1200,
          availableBalance: null,
          balanceDate: null,
          inferredType: 'cash' as const,
          typeOverride: null,
          invertOwed: null,
          includePercent: 100,
          holdings: [],
          updatedAt: 1,
        },
      ],
      transactions: [],
      snapshots: [],
      settings: DEFAULT_SETTINGS,
      meta: DEFAULT_META,
      accessUrl: 'https://user:secret@beta-bridge.simplefin.org/simplefin',
    }
    const seal = await sealVault(key, payload)
    expect(JSON.stringify(seal)).not.toContain('Checking')
    expect(JSON.stringify(seal)).not.toContain('secret')
    expect(JSON.stringify(wrapped)).not.toContain(bytesToB64(raw))

    const openedKey = await unwrapVaultKey(kek, wrapped)
    const opened = await openVault(openedKey.key, seal)
    expect(opened.accounts[0]?.name).toBe('Checking')
    expect(opened.accessUrl).toBe(payload.accessUrl)

    const wrong = await deriveAesKeyFromPassphrase('wrong horse battery!', salt, 20_000)
    await expect(unwrapVaultKey(wrong, wrapped)).rejects.toThrow(/decrypt/i)
  })

  it('keeps vault and legacy access HKDF domains separate', async () => {
    const prf = randomBytes(32)
    const salt = randomBytes(16)
    const accessKey = await deriveAesKeyFromPrf(prf, salt, HKDF_INFO_ACCESS)
    const vaultKey = await deriveAesKeyFromPrf(prf, salt, HKDF_INFO_VAULT)
    const { raw } = await generateVaultKey()
    const wrapped = await wrapVaultKey(vaultKey, raw)
    await expect(unwrapVaultKey(accessKey, wrapped)).rejects.toThrow(/decrypt/i)
    const ok = await unwrapVaultKey(vaultKey, wrapped)
    expect(ok.raw).toEqual(raw)
  })
})
