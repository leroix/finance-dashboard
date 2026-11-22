import { b64ToBytes, bytesToB64, exactBuffer, randomBytes } from './bytes.ts'

export type PrfSupport = 'yes' | 'no' | 'unknown'

interface PrfResults {
  prf?: { results?: { first?: ArrayBuffer } }
}

export async function detectPrfSupport(): Promise<PrfSupport> {
  if (typeof window === 'undefined' || typeof PublicKeyCredential === 'undefined') return 'no'
  const capabilities = PublicKeyCredential as unknown as {
    getClientCapabilities?: () => Promise<Record<string, boolean>>
  }
  if (!capabilities.getClientCapabilities) return 'unknown'
  try {
    const caps = await capabilities.getClientCapabilities()
    if (caps['extension:prf'] === true) return 'yes'
    if (caps['extension:prf'] === false) return 'no'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function readPrf(credential: PublicKeyCredential): Uint8Array | null {
  const results = credential.getClientExtensionResults() as PrfResults
  const first = results.prf?.results?.first
  if (!first || first.byteLength < 32) return null
  return new Uint8Array(first.slice(0, 32))
}

export interface FreshPasskey {
  credentialId: string
  prfSalt: string
  prf: Uint8Array
}

export async function createPrfCredential(): Promise<FreshPasskey> {
  if (!navigator.credentials?.create) throw new Error('This browser cannot create a passkey.')
  const prfSalt = randomBytes(32)
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: exactBuffer(randomBytes(32)),
      rp: { name: 'Sable', id: location.hostname },
      user: {
        id: exactBuffer(randomBytes(16)),
        name: 'owner',
        displayName: 'Sable owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
      extensions: { prf: { eval: { first: exactBuffer(prfSalt) } } },
    } as PublicKeyCredentialCreationOptions,
  })
  if (!cred || cred.type !== 'public-key') throw new Error('No passkey was created.')
  const pk = cred as PublicKeyCredential
  const prf = readPrf(pk)
  if (!prf) {
    throw new Error('This passkey did not return a PRF secret. Lock with a passphrase instead, or try another authenticator.')
  }
  return { credentialId: bytesToB64(new Uint8Array(pk.rawId)), prfSalt: bytesToB64(prfSalt), prf }
}

export async function getPrfAssertion(credentialId: string, prfSalt: string): Promise<Uint8Array> {
  if (!navigator.credentials?.get) throw new Error('This browser cannot use a passkey.')
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: exactBuffer(randomBytes(32)),
      rpId: location.hostname,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: exactBuffer(b64ToBytes(credentialId)) }],
      timeout: 60_000,
      extensions: { prf: { eval: { first: exactBuffer(b64ToBytes(prfSalt)) } } },
    } as PublicKeyCredentialRequestOptions,
  })
  if (!cred || cred.type !== 'public-key') throw new Error('The passkey prompt was dismissed.')
  const prf = readPrf(cred as PublicKeyCredential)
  if (!prf) throw new Error('The passkey did not return a PRF secret, so the saved key stays locked.')
  return prf
}

export function passkeyErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'The passkey prompt was dismissed.'
    if (err.name === 'SecurityError') return 'Passkeys need a stable HTTPS origin, or localhost.'
    if (err.name === 'AbortError') return 'The passkey prompt was cancelled.'
    if (err.name === 'NotSupportedError') return 'This browser does not support the passkey PRF extension.'
  }
  return err instanceof Error ? err.message : 'The passkey could not be used.'
}
