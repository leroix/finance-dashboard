import { useState } from 'react'
import { useStore } from '../state/store.tsx'
import { SecurityActions } from './Security.tsx'
import { Button, Dialog } from './ui.tsx'

export function UnlockGate() {
  const store = useStore()
  const [confirmErase, setConfirmErase] = useState(false)
  const method = store.secret?.method === 'prf' ? 'passkey' : 'passphrase'

  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 py-12">
      <div className="w-full">
        <p className="num text-5xl text-paper">Sable</p>
        <h1 className="mt-6 text-2xl text-paper">Unlock to open your books</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Accounts, balances, and the SimpleFIN access URL are encrypted on this device. Unlock with your {method} before
          anyone else can read them. Nothing financial is shown until then.
        </p>
        {store.banner ? (
          <p className={`mt-4 text-sm ${store.bannerTone === 'bad' ? 'text-bad' : 'text-muted'}`}>{store.banner}</p>
        ) : null}
        {store.syncing ? <p className="mt-3 text-sm text-faint">{store.syncLabel}</p> : null}
        <SecurityActions intent="unlock" />
        <div className="mt-10 border-t border-line pt-6">
          <p className="text-xs leading-5 text-faint">
            Shared device? Use Lock this session from Settings after you are done. Erase removes the encrypted vault from
            this browser permanently.
          </p>
          <Button className="mt-3" variant="danger" onClick={() => setConfirmErase(true)}>
            Erase all local data
          </Button>
        </div>
      </div>
      <Dialog open={confirmErase} title="Erase everything stored here?" onClose={() => setConfirmErase(false)}>
        <p className="text-sm text-muted">
          This deletes the encrypted vault, accounts, and any saved lock from this browser. You will need a backup or a
          fresh SimpleFIN connection to continue.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              void store.eraseAll().then(() => setConfirmErase(false))
            }}
          >
            Erase
          </Button>
          <Button variant="ghost" onClick={() => setConfirmErase(false)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </main>
  )
}
