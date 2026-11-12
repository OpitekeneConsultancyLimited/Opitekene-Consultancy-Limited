# Target architecture

## Two products, one domain

```
https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/
├── /                 Corporate website (index.html): public, no sign-in
│                     Home · About Us · Services · Training · Insights · TaxComp · Contact Us
│                     Quick estimate (front-page.js → tax-calculator.js), privacy, terms
└── /taxcomp/         TaxComp app (taxcomp/index.html): sign-in first
                      Dashboard · Ask TaxComp · Tax Tools · Law & Knowledge · Compliance · Workspace
                      Assets are shared from the root (../*.js, ../*.css)
```

- **Why a sub-path, not a sub-domain.** GitHub Pages serves one site per repository. A sub-path keeps one deployment, one origin for the Worker's origin lock, and one service worker. A custom domain (`opitekene.co.ug` and `app.` …) can come later without code changes beyond `ALLOWED_ORIGIN`.
- **Forwarding.** The corporate page forwards app-style hashes, Supabase auth fragments and Flutterwave return parameters to `/taxcomp/` before anything renders.
- **Service worker** at the root covers both. The offline fallback page depends on the path.
- **Publishing.** `scripts/build-pages.mjs` builds `_site` from what the two pages reference. Nothing else is public.

## Back end (unchanged)

```
Browser ──HTTPS──► Cloudflare Worker (taxcomp-uganda-chat)
                     ├─ /chat, /advisor, /search        AI with legislation retrieval, guides, impact engine
                     ├─ /api/impact                       deterministic impact assessment (public, no storage)
                     ├─ /api/legislation/*                public read API (laws, sections, amendments)
                     ├─ /api/challenge/*                  signed-in: profile, dashboard, assessments, cases, reviewer workflows
                     ├─ /api/account, /api/billing/*      plans and payments
                     ├─ /api/phase6/*                     practice workspace (gated)
                     └─ /admin/*                          admin token
                   ──Hyperdrive──► Supabase Postgres (schema taxcomp, RLS, Worker-only)
                   ──► Supabase Auth, Storage · Anthropic / Gemini · Flutterwave
```

## Engine principles

1. **Figures come only from `tax-calculator.js`,** in the browser or in the Worker. AI never calculates.
2. **Law comes from the database with its status:** edition, verification, Bill or reported. A Bill is never presented as law.
3. **Every answer names its sources,** and says what is not verified.
4. **User data is server-side and per user or organisation,** with RLS and server authorisation.
