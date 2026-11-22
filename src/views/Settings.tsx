import { useState } from 'react'
import { SecurityActions } from '../components/Security.tsx'
import { Banner, Button, Dialog, Field, controlClass } from '../components/ui.tsx'
import { useStore } from '../state/store.tsx'

const LOOKBACKS = [90, 180, 365, 730]

export function Settings() {
  const store = useStore()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [includeAccess, setIncludeAccess] = useState(true)
  const [importPass, setImportPass] = useState('')
  const [importText, setImportText] = useState<string | null>(null)
  const [importName, setImportName] = useState('')
  const [confirming, setConfirming] = useState<'forget' | 'erase' | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const lockLabel =
    store.secret?.method === 'prf'
      ? 'Passkey'
      : store.secret?.method === 'passphrase'
        ? 'Passphrase'
        : 'Not saved'

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <h1 className="num text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-muted">Keys, backups, and how far back a sync reaches.</p>
      </div>
      {store.banner ? <Banner tone={store.bannerTone}>{store.banner}</Banner> : null}

      <section className="card space-y-3 p-5">
        <h2 className="text-lg">Connection</h2>
        <p className="text-sm text-muted">
          Access URL in this tab: {store.hasAccess ? 'yes' : 'no'}. Saved lock: {lockLabel}.
          {store.prf === 'yes' ? ' Passkey PRF looks available.' : ''}
          {store.prf === 'no' ? ' Passkey PRF is not available in this browser.' : ''}
          {store.prf === 'unknown' ? ' Passkey PRF support is unknown until you try.' : ''}
        </p>
        <Field label="History to request">
          <select
            className={controlClass}
            value={store.meta.lookbackDays}
            onChange={(event) => void store.setLookback(Number(event.target.value))}
          >
            {LOOKBACKS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" disabled={!store.hasAccess || store.syncing} onClick={() => void store.syncHistory()}>
            Sync history
          </Button>
          <a href="#/connect" className="inline-flex min-h-11 items-center text-sm text-brass">
            Paste a different token
          </a>
        </div>
        <p className="text-xs text-faint">
          SimpleFIN caps a single request near 90 days and warns past about 45. Sable asks in 40-day windows. The access
          URL itself is never shown here.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Lock</h2>
        <p className="mt-2 text-sm text-muted">
          A passkey uses the WebAuthn PRF extension. The PRF output is stretched with HKDF into an AES-GCM key, and only
          the ciphertext, credential id, and salts are stored. If PRF is missing, use a passphrase or paste the access
          URL each session. Keep a copy in your password manager either way.
        </p>
        {store.hasAccess ? <SecurityActions intent="lock" /> : null}
        {store.secret && !store.hasAccess ? <SecurityActions intent="unlock" /> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="quiet" disabled={!store.secret} onClick={() => setConfirming('forget')}>
            Forget saved key
          </Button>
          <Button variant="danger" onClick={() => setConfirming('erase')}>
            Erase all local data
          </Button>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg">Encrypted backup</h2>
        <p className="text-sm text-muted">
          A JSON file encrypted with a passphrase, so the books can move to another browser. Passkeys are tied to this
          site’s origin and will not unlock a different hostname.
        </p>
        <Field label="Backup passphrase">
          <input className={controlClass} type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
        </Field>
        <Field label="Repeat passphrase">
          <input className={controlClass} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeAccess} onChange={(event) => setIncludeAccess(event.target.checked)} />
          Include the access URL inside the encrypted file
        </label>
        {localError ? <p className="text-sm text-bad">{localError}</p> : null}
        <Button
          variant="primary"
          disabled={store.syncing}
          onClick={() => {
            if (passphrase.length < 10) {
              setLocalError('Use at least 10 characters.')
              return
            }
            if (passphrase !== confirm) {
              setLocalError('Those passphrases do not match.')
              return
            }
            setLocalError(null)
            void store.exportBackup(passphrase, includeAccess)
          }}
        >
          Download backup
        </Button>
        <div className="border-t border-line pt-4">
          <Field label="Import a backup">
            <input
              className="block text-sm"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setImportName(file.name)
                void file.text().then(setImportText)
              }}
            />
          </Field>
          <Field label="Passphrase for this file">
            <input className={controlClass} type="password" autoComplete="current-password" value={importPass} onChange={(event) => setImportPass(event.target.value)} />
          </Field>
          <Button
            variant="quiet"
            disabled={!importText || store.syncing}
            onClick={() => {
              if (!importText) return
              void store.importBackup(importText, importPass)
            }}
          >
            Replace local data{importName ? ` with ${importName}` : ''}
          </Button>
          <p className="text-xs text-faint">Import replaces accounts, transactions, and snapshots on this device.</p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Transactions CSV</h2>
        <p className="mt-2 text-sm text-muted">A plain spreadsheet of transactions already stored here. It is not encrypted.</p>
        <Button className="mt-3" variant="quiet" onClick={store.exportCsv}>
          Download CSV
        </Button>
      </section>

      <section className="text-sm leading-6 text-faint">
        <p>
          Sable does not have an account, analytics, or a backend. The only network requests are to
          beta-bridge.simplefin.org (bridge.simplefin.org is rewritten there because the public host redirects without
          CORS headers and drops the path). On GitHub Pages the passkey and the books belong to
          https://&lt;user&gt;.github.io, which is shared by every project site on that host. A custom domain is a
          different origin.
        </p>
      </section>

      <Dialog
        open={confirming !== null}
        title={confirming === 'erase' ? 'Erase everything stored here?' : 'Forget the saved key?'}
        onClose={() => setConfirming(null)}
      >
        <p className="text-sm text-muted">
          {confirming === 'erase'
            ? 'This deletes accounts, transactions, snapshots, settings, and the encrypted access URL from this browser.'
            : 'This deletes only the encrypted access URL. Balances stay. You will need the access URL from your password manager to refresh.'}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              const action = confirming === 'erase' ? store.eraseAll() : store.forgetKey()
              void action.then(() => setConfirming(null))
            }}
          >
            {confirming === 'erase' ? 'Erase' : 'Forget key'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
