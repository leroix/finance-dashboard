let accessUrl: string | null = null
let vaultKey: CryptoKey | null = null

/** In-memory only. Never written to the URL, logs, or React state. */
export function setAccessUrl(next: string | null): void {
  accessUrl = next
}

export function getAccessUrl(): string | null {
  return accessUrl
}

export function hasAccessUrl(): boolean {
  return accessUrl !== null
}

/** AES-GCM data key for the sealed vault. Cleared when the session locks. */
export function setVaultKey(next: CryptoKey | null): void {
  vaultKey = next
}

export function getVaultKey(): CryptoKey | null {
  return vaultKey
}

export function clearSessionSecrets(): void {
  accessUrl = null
  vaultKey = null
}
