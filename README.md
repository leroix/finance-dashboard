# Sable

Sable is a private net-worth desk for one person. It reads accounts from [SimpleFIN Bridge](https://beta-bridge.simplefin.org) (Fidelity, Betterment, Vanguard, Discover, and anything else the bridge can see) and keeps the books in the browser. There is no backend, no analytics, and no third-party script or font host at runtime.

## Privacy model

- Accounts, transactions, daily balance snapshots, and settings live in IndexedDB on this device.
- The SimpleFIN access URL is a secret. After you connect, lock it with a passkey or a passphrase. Sable stores only ciphertext, a credential id, and salts. The URL is not written into the page address, source code, or logs.
- Keep a copy of the access URL in your password manager. **Forget saved key** deletes the encrypted copy in this browser and leaves the balances. **Erase all local data** deletes the balances too.
- The only network calls are HTTPS requests to SimpleFIN Bridge. A strict Content-Security-Policy allows `connect-src` only for `https://beta-bridge.simplefin.org` and `https://bridge.simplefin.org`. Scripts are `'self'` only. The production page has no inline script.
- `bridge.simplefin.org` currently answers with a 302 to `https://beta-bridge.simplefin.org/` that drops the path and sends no `Access-Control-Allow-Origin`. Sable rewrites that host to `beta-bridge.simplefin.org` before calling, and does not follow the broken redirect.
- Passwords for backups and for the passphrase lock are stretched with PBKDF2-HMAC-SHA256 (600,000 iterations) and encrypted with AES-GCM. A passkey uses the WebAuthn PRF extension, then HKDF-SHA256, then AES-GCM. Argon2 is not used because it is not in WebCrypto; the iteration count matches the current OWASP PBKDF2 guidance.
- Non-USD and custom (URL) currencies are listed and are not mixed into the dollar total. Sable does not call a foreign-exchange service.
- An encrypted backup can optionally carry the access URL inside the ciphertext so you can move browsers. A plain CSV of transactions does not.

## Run locally

```bash
npm install
npm test
npm run dev
```

The dev server is http://127.0.0.1:47321. Localhost is a secure context, so passkeys and WebCrypto work. `localhost` and `127.0.0.1` are different passkey origins.

```bash
npm run build    # static files in dist/
npm run preview  # serves dist/ with the production CSP
```

**Try demo data** on the Connect screen uses the published demo setup token (`base64` of `https://bridge.simplefin.org/simplefin/claim/demo`). That claim now returns 403. Sable then uses the public demo access URL (`demo` / `demo` on `beta-bridge.simplefin.org`). That password is the bridge’s published demo, not a personal secret, and it is the only credential in the source tree.

## What you can do

- Total net worth, split by institution and by type (cash, credit & liabilities, investment & retirement, other).
- Net-worth and per-account history. Each refresh stores that day’s balance. Earlier days are reconstructed from transactions and labeled as estimates.
- Change over 1M, 3M, YTD, 1Y, and all, with an estimated modified Dietz return. Spending, pay, and transfers are treated as flows. Interest, dividends, and fees stay in the market result. You can override any transaction.
- Manual accounts (a house, a car, a loan) with editable values.
- A projection from monthly savings, expected return, and inflation. It is marked as a projection.
- Passphrase-encrypted JSON backup, and a CSV of transactions.

SimpleFIN date ranges are limited (a warning past about 45 days, a hard cap near 90). Sable requests history in 40-day windows. Both the legacy `errors` string list and the newer `errlist` objects are sanitized and shown.

## Deploy

Passkeys are bound to the site origin. Pick one HTTPS hostname and keep it.

```bash
npm ci
npm test
npm run build
```

Upload the contents of `dist/` to any static host (Cloudflare Pages, Netlify, GitHub Pages, nginx, Caddy). The app uses hash routes (`#/accounts`), so the host does not need SPA rewrites. Asset URLs are relative.

The built `index.html` already sends the Content-Security-Policy in a meta tag. `frame-ancestors` is ignored in meta tags; if the host can set headers, repeat the policy there:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self' https://beta-bridge.simplefin.org https://bridge.simplefin.org;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
worker-src 'none'
```

`style-src` allows inline style attributes so chart bars can set a width. Scripts are not allowed inline or from any other host.

Serve over HTTPS. An origin change (including moving from localhost to the public host) means old passkeys will not decrypt the access URL. Use the password-manager copy or an encrypted backup, then lock it again on the new origin.

## Passkey PRF support

Sable asks for the WebAuthn `prf` extension when creating and using the passkey. If the authenticator does not return PRF output, the lock is refused and you can use a passphrase or keep the access URL in memory for the session.

Checked against public notes as of late 2026:

- A secure context is required (HTTPS, or localhost).
- Chromium 133+ generally. Windows Hello needs Windows 11 24H2/25H2 with the February 2026 update, and Chrome/Edge 147+ to return PRF while creating the passkey. Older Chrome on Windows 11 can use a security key that supports `hmac-secret`, but not Windows Hello.
- Safari 18+ supports PRF for iCloud Keychain passkeys on macOS 15+ and iOS 18+. Security-key PRF is much newer (Safari 26.4) and still has WebKit bugs on some keys, including results that do not match other browsers.
- Firefox 139+ supports platform PRF on macOS. Windows Hello support is newer (around Firefox 148). Firefox on macOS has not reliably returned PRF results for security keys.
- iOS browsers use WebKit, so they follow Safari’s support, not Chrome’s.

If `PublicKeyCredential.getClientCapabilities()` reports `extension:prf: false`, Sable hides the passkey button. “Unknown” still offers the button and falls back if the ceremony returns no PRF secret.

## CORS check (22 Nov 2026)

Verified from this environment against the public demo.

| Request | Result |
| --- | --- |
| `OPTIONS https://beta-bridge.simplefin.org/simplefin/accounts` with `Origin: http://127.0.0.1:47321`, method `GET`, header `authorization` | `200`. `access-control-allow-origin` reflected the origin, `access-control-allow-credentials: true`, `access-control-allow-headers: authorization`, `access-control-allow-methods: GET`. |
| `GET` the same resource with `Authorization` and an `Origin` | `200` and `access-control-allow-origin` reflected the origin (`http://127.0.0.1:47321` and `https://ledger.local`). Browser `fetch` from the app works. |
| `POST https://beta-bridge.simplefin.org/simplefin/claim/demo` (the legacy demo token) | `403` `text/plain`: `Forbidden (was it already claimed?)`. The 403 response includes the same CORS headers, so the page can read the failure. |
| `POST`/`GET`/`OPTIONS` on `bridge.simplefin.org` | `302` to `https://beta-bridge.simplefin.org/` with the path discarded. The 302 has **no** `Access-Control-Allow-Origin`. A browser `fetch` to the bridge host fails CORS and would not land on the claim or accounts path. |
| `GET /simplefin/info` on beta-bridge | `{"versions":["1.0"]}`. Account calls with `version=2` still return `errlist`, `connections`, and `conn_id`. Sable accepts both shapes. |
| Demo accounts | `https://demo:demo@beta-bridge.simplefin.org/simplefin/accounts` returns three USD accounts (savings, checking, empty). Ranges over 45 days add an `errors` / `errlist` warning. Ranges over 90 days are capped. |

No CORS failure on `beta-bridge.simplefin.org` itself. The failure mode is the legacy `bridge.simplefin.org` redirect, which the client avoids by rewriting the host.
