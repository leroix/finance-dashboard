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

The dev server is http://127.0.0.1:47321. WebCrypto works there. Passkeys do not: an IP address cannot be a relying party id. For a local passkey, open http://localhost:47321 instead. `localhost` and `127.0.0.1` are different origins from each other and from GitHub Pages.

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

## Deploy on GitHub Pages

The site is the project page [https://leroix.github.io/finance-dashboard/](https://leroix.github.io/finance-dashboard/). Create the GitHub repository as `finance-dashboard` under the user `leroix`. The Pages base path is `/finance-dashboard/`.

GitHub Pages cannot set response headers, so the Content-Security-Policy lives in a `<meta>` tag written into `dist/index.html` at build time. Navigation is hash-based (`#/accounts`), so Pages does not need a rewrite rule. The workflow sets `SABLE_BASE=/finance-dashboard/`, which makes asset URLs absolute from that path (`/finance-dashboard/assets/...`). If `SABLE_BASE` is unset, the build falls back to relative URLs (`./assets/...`).

### Steps

1. Create the GitHub repository `leroix/finance-dashboard` and push this project to its `main` branch. The workflow file is `.github/workflows/pages.yml`.
2. Open `https://github.com/leroix/finance-dashboard` and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, or open the **Actions** tab and run **Deploy GitHub Pages** with **Run workflow**.
5. Wait until the `deploy` job finishes. The job publishes the `dist/` artifact. The Pages settings page then shows `https://leroix.github.io/finance-dashboard/`.
6. Open [https://leroix.github.io/finance-dashboard/](https://leroix.github.io/finance-dashboard/) with the trailing slash. The first successful run also creates a `github-pages` environment. The workflow does not need any secrets.

The workflow runs `npm ci`, `npm test`, and `npm run build` with `SABLE_BASE=/finance-dashboard/` on Node 22, then `actions/upload-pages-artifact` and `actions/deploy-pages`. `public/.nojekyll` is copied into `dist/` so Pages does not run Jekyll on the bundle.

To build the same files yourself:

```bash
npm ci
npm test
SABLE_BASE=/finance-dashboard/ npm run build
```

`dist/` is what Pages serves. `SABLE_BASE` accepts `./` or a path such as `finance-dashboard` or `/finance-dashboard/`. A path is given a leading slash if it needs one, and a trailing slash always.

### Content-Security-Policy

The production meta policy is:

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

`'self'` is the origin `https://leroix.github.io`, so scripts and fonts loaded from `https://leroix.github.io/finance-dashboard/assets/` are allowed. `connect-src` still allows only that origin and the two SimpleFIN bridge hosts. There is no inline script in the production HTML. `style-src` allows inline style attributes so chart bars can set a width. Browsers ignore `frame-ancestors` inside a meta tag, and Pages cannot set it as a header. The other directives are enforced from the meta tag.

### Passkeys on `github.io`

The relying party id is the page hostname, not the repo path.

| Page | RP ID | Result |
| --- | --- | --- |
| `https://leroix.github.io/finance-dashboard/` | `leroix.github.io` | Valid. `github.io` is a public suffix, so `leroix.github.io` is the registrable domain and matches the origin. |
| `https://github.io/` | `github.io` | Refused. Browsers will not use a public suffix as an RP ID, and Sable throws before calling WebAuthn. |
| `http://localhost:47321` | `localhost` | Valid for local development. It is a different origin from the Pages site, so it will not unlock a passkey created there. |
| `http://127.0.0.1:47321` | — | Refused. An IP address is not a valid RP ID. |

The path `/finance-dashboard/` is not part of the origin. IndexedDB and the passkey are shared by every Pages site on `https://leroix.github.io`, including other repositories under that user. Do not publish another Pages project from `leroix`, or attach a custom domain so the origin is only this app. A custom domain changes the hostname, so lock the access URL again after DNS is serving the new name. The passkey created for `leroix.github.io` stays bound to that hostname.

Moving between `localhost` and Pages is an origin change. Take the access URL from your password manager, or restore an encrypted backup, and lock it again on the new host.

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
