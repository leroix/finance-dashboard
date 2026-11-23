import { useState } from 'react'
import { useStore } from '../state/store.tsx'
import { Banner, Button, controlClass } from '../components/ui.tsx'

export function Connect() {
  const store = useStore()
  const [text, setText] = useState('')

  return (
    <div className="mx-auto max-w-xl py-4">
      <p className="text-sm tracking-[0.16em] text-brass uppercase">SimpleFIN</p>
      <h1 className="num mt-2 text-4xl md:text-5xl">Bring the accounts in. Leave them here.</h1>
      <p className="mt-4 text-muted">
        Paste a one-time setup token, or an access URL you already claimed. Sable exchanges it in the browser, then
        keeps balances in an encrypted vault in IndexedDB after you protect them. The access URL is never put in the page
        address.
      </p>
      <div className="mt-6">
        <Button
          variant="primary"
          disabled={store.syncing}
          onClick={() => {
            void store.connectDemo().then((ok) => {
              if (ok) location.hash = '#/'
            })
          }}
        >
          Try demo data
        </Button>
        <p className="mt-2 text-xs text-faint">
          Uses the published SimpleFIN demo. The old claim token is already used, so this falls back to the public demo
          access URL when the bridge returns 403.
        </p>
      </div>
      <form
        className="mt-8 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          const pasted = text
          void store.connectPaste(pasted).then((ok) => {
            if (!ok) return
            setText('')
            location.hash = '#/'
          })
        }}
      >
        <label className="block text-sm text-muted" htmlFor="token">
          Setup token or access URL
        </label>
        <textarea
          id="token"
          className={`${controlClass} min-h-28 resize-y`}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          placeholder="Paste a setup token or access URL"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" variant="quiet" disabled={store.syncing || text.trim() === ''}>
          {store.syncing ? store.syncLabel || 'Working…' : 'Connect'}
        </Button>
      </form>
      {store.banner ? (
        <div className="mt-4">
          <Banner tone={store.bannerTone}>{store.banner}</Banner>
        </div>
      ) : null}
      <p className="mt-8 text-sm text-muted">
        Create a token at{' '}
        <a className="text-brass underline" href="https://bridge.simplefin.org/simplefin/create" rel="noreferrer">
          SimpleFIN Bridge
        </a>
        . If a fresh token comes back 403, treat it as compromised and revoke it there. A 403 on the public demo token
        is expected.
      </p>
    </div>
  )
}
