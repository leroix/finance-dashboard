import { useState } from 'react'
import { useStore } from '../state/store.tsx'
import { Button, Dialog, controlClass } from './ui.tsx'

export function SecurityActions({ intent }: { intent: 'lock' | 'unlock' }) {
  const store = useStore()
  const [open, setOpen] = useState<'passphrase' | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const locking = intent === 'lock'
  const prfOff = store.prf === 'no'

  async function submitPassphrase() {
    if (locking && passphrase.length < 10) {
      setLocalError('Use at least 10 characters.')
      return
    }
    if (locking && passphrase !== confirm) {
      setLocalError('Those passphrases do not match.')
      return
    }
    setLocalError(null)
    if (locking) await store.lockPassphrase(passphrase)
    else await store.unlockPassphrase(passphrase)
    setPassphrase('')
    setConfirm('')
    setOpen(null)
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {locking && store.prf !== 'no' ? (
        <Button variant="primary" disabled={store.syncing} onClick={() => void store.lockPasskey()}>
          Lock with passkey
        </Button>
      ) : null}
      {!locking && store.secret?.method === 'prf' ? (
        <Button variant="primary" disabled={store.syncing} onClick={() => void store.unlockPasskey()}>
          Unlock with passkey
        </Button>
      ) : null}
      {(locking || store.secret?.method === 'passphrase') && (
        <Button variant="quiet" disabled={store.syncing} onClick={() => setOpen('passphrase')}>
          {locking ? 'Lock with a passphrase' : 'Unlock with passphrase'}
        </Button>
      )}
      {locking && prfOff ? (
        <p className="w-full text-xs text-faint">
          This browser does not report support for the passkey PRF extension, so a passphrase or a fresh paste each session is the fallback.
        </p>
      ) : null}
      <Dialog
        open={open === 'passphrase'}
        title={locking ? 'Lock with a passphrase' : 'Unlock'}
        onClose={() => setOpen(null)}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submitPassphrase()
          }}
        >
          <input
            className={controlClass}
            type="password"
            autoComplete={locking ? 'new-password' : 'current-password'}
            placeholder="Passphrase"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          {locking ? (
            <input
              className={controlClass}
              type="password"
              autoComplete="new-password"
              placeholder="Repeat passphrase"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          ) : null}
          {localError ? <p className="text-sm text-bad">{localError}</p> : null}
          <p className="text-xs text-faint">
            {locking
              ? 'Sable stretches this with PBKDF2-SHA256, 600,000 rounds, then AES-GCM. The passphrase is not stored.'
              : 'This only decrypts the access URL saved on this device.'}
          </p>
          <Button type="submit" variant="primary" disabled={store.syncing}>
            {locking ? 'Encrypt and save' : 'Unlock'}
          </Button>
        </form>
      </Dialog>
    </div>
  )
}
