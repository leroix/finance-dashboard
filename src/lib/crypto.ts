import { b64ToBytes, bytesToB64, bytesToUtf8, exactBuffer, randomBytes, utf8ToBytes } from './bytes.ts'

/** OWASP-aligned PBKDF2-HMAC-SHA256 iteration count. WebCrypto, no extra wasm. */
export const PBKDF2_ITERATIONS = 600_000

/** Legacy HKDF info when the passkey only wrapped the SimpleFIN access URL. */
export const HKDF_INFO_ACCESS = utf8ToBytes('sable-access-url-v1')
/** HKDF info when the passkey wraps the vault data-encryption key. */
export const HKDF_INFO_VAULT = utf8ToBytes('sable-vault-dek-v1')

export interface CipherPack {
  iv: string
  ciphertext: string
}

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle) {
    throw new Error('Encryption needs a secure context (HTTPS or localhost).')
  }
  return cryptoObj.subtle
}

export async function deriveAesKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (iterations < 10_000) throw new Error('Key derivation cost is too low.')
  const material = await subtle().importKey('raw', exactBuffer(utf8ToBytes(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: exactBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function deriveAesKeyFromPrf(
  prf: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array = HKDF_INFO_VAULT,
): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', exactBuffer(prf), 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: exactBuffer(salt), info: exactBuffer(info) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<CipherPack> {
  const iv = randomBytes(12)
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: exactBuffer(iv) },
    key,
    exactBuffer(utf8ToBytes(plaintext)),
  )
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(ciphertext)) }
}

export async function decryptString(key: CryptoKey, pack: CipherPack): Promise<string> {
  try {
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: exactBuffer(b64ToBytes(pack.iv)) },
      key,
      exactBuffer(b64ToBytes(pack.ciphertext)),
    )
    return bytesToUtf8(new Uint8Array(plain))
  } catch {
    throw new Error('Could not decrypt.')
  }
}
