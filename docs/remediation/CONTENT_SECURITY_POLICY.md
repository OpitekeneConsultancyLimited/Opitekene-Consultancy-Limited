# Content Security Policy

Audit finding **L2**. Generator and checker: `scripts/site-csp.mjs`. Tests: `worker/site-csp.test.mjs` and the browser test (`scripts/challenge-e2e.mjs` records every CSP violation).

## Source inventory (14 Nov 2026)

| Page | Inline code | Third-party sources | Talks to |
|---|---|---|---|
| `index.html` (corporate) | 1 inline script (forwards old app links to `taxcomp/`) | Google Fonts CSS and font files | nothing (the PAYE estimate runs in the page) |
| `taxcomp/index.html` (app) | 1 inline `<style>` (hides the app until sign-in, so nothing flashes) | Google Fonts; supabase-js 2.118.0 from jsdelivr, which imports only `@supabase/*`, `tslib@2.8.1` and `iceberg-js@0.8.1` | the Worker (`taxcomp-uganda-chat…workers.dev`) and Supabase (`xbooviddjkikcbccfcnw.supabase.co`) |

Neither page has inline event handlers, `style=""` attributes, `eval`, `new Function` or frames. Downloads use `blob:` links. The authenticator QR code is a `data:` image.

## The policy

App page (the corporate page is the same, but with its script hash, no jsdelivr and `connect-src 'self'`):

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net/npm/@supabase/ https://cdn.jsdelivr.net/npm/tslib@2.8.1/ https://cdn.jsdelivr.net/npm/iceberg-js@0.8.1/;
style-src 'self' 'sha256-…' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:; connect-src 'self' <Worker> <Supabase>;
manifest-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none';
base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

* The policy has no `'unsafe-inline'` and no `'unsafe-eval'`. Inline blocks are allowed only by their SHA-256 hash.
* `connect-src` origins are read from the page's own endpoint meta tags. Changing an endpoint without regenerating the CSP fails CI (`node scripts/site-csp.mjs --check`).
* `npm run dev` rebuilds the same policy for the local Worker and Supabase.
* The Worker's admin pages send a real CSP header with a fresh script nonce per response, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

## Rollout

The brief suggests starting report-only. That is not possible with a `<meta>` policy: browsers ignore `Content-Security-Policy-Report-Only` in meta tags, and GitHub Pages cannot send headers. The policy was rolled out as follows instead:

1. Inventoried every source (table above).
2. Ran it **enforced** in the full browser test, which records every violation on the corporate page, the app (all screens exercised) and the admin pages. It found one problem, in the test tool itself: axe-core fetching the font stylesheet. The test was fixed; the policy was not loosened.
3. Ships enforced. If a violation appears in production, browsers report it in the console, and the fix is to regenerate or adjust `scripts/site-csp.mjs`.

## Limits of a meta-tag policy (GitHub Pages)

Pages cannot send these, and a meta tag cannot carry them:
- `frame-ancestors` (clickjacking);
- `report-to` / `report-uri`;
- HSTS;
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

**Residual risk:** another site could still frame the GitHub Pages site (clickjacking). Rated low to medium, not closed: payments complete on Flutterwave's own page, but staff actions in the app (for example approving a register request) are single clicks and could in principle be clicked through a disguised frame. This is a reason to fix it before public launch (security gate). Full header-based protection needs one of these, each a management decision:

* a custom domain served through Cloudflare, adding the headers with a Transform Rule (no extra cost on the Free plan); or
* moving the static site to Cloudflare Pages, which supports a `_headers` file.

Either change would also allow CSP violation reporting.

## Maintaining it

* After editing an inline script or style, or an endpoint meta tag, run `node scripts/site-csp.mjs` and commit the result. CI fails otherwise.
* Upgrading supabase-js: check the new version's `+esm` imports (`.local-data/vendor` after `npm run dev`), update `SUPABASE_JS_SOURCES`, then run the browser test.
* The uncommitted local edit of `index.html` (finding N16) has no CSP. If it is ever committed, regenerate the policy first.
