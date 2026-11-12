# Technical debt register

| # | Debt | Impact | Proposed fix | Priority |
| --- | --- | --- | --- | --- |
| D1 | **Two overlapping stylesheets** (`styles.css` and `design.css`) from successive redesigns | Hard to change safely: the PR #29 corruption of `styles.css` went unnoticed because `design.css` covered it | Add a visual regression check (screenshots compared in CI); then merge into one token-based stylesheet, page by page | High |
| D2 | **App page loads 29 global scripts in a fixed order** and has no build step | Load order bugs; no tree-shaking; harder testing | Keep plain JS (GitHub Pages, offline), but move shared logic into the Worker (`/api/calculate`, `/api/impact`) and load page scripts per view | Medium |
| D3 | **`worker/index.mjs` is 1,733 lines** (chat, advisor, search, admin, routing) | Risky edits | Split into route modules like `worker/challenge/*.mts`, with no change in behaviour, guarded by the existing tests | Medium |
| D4 | **Calculations run in the browser** (and in the Worker for impact) from the same file | Fine today; a risk if two copies ever diverge | Expose `/api/calculate` from the same `tax-calculator.js`, so saved records and AI answers use server results (roadmap R3) | Medium |
| D5 | **Only PAYE has a tax-year switch.** There is no full FY 2025/26 rule set | Historical questions for other taxes cannot be answered | A per-year rule-set registry for every head (roadmap R2) | High |
| D6 | **Legacy D1 binding and `worker/migrations`**; the binding name `UNANSWERED_QUESTIONS` is reused for Postgres | Confusing | Rename to `DB` and remove the D1 binding after a release with both names | Low |
| D7 | **Python prototypes and `__pycache__` at the root**, plus an unrelated personal folder | Noise; CI time | Move the prototypes to `legacy/` (or delete them with the owner's approval); remove `__pycache__` from tracking | Low |
| D8 | **Phase flags spread across `wrangler.toml`** | Easy to misread | One launch-gate document that lists each flag with its sign-off | Low |
| D9 | **E2E runs only on Edge (Chromium)** at a phone-size viewport | Safari and Firefox differences untested | Add a WebKit run, plus desktop and tablet viewports | Medium |
| D10 | **The legislation database holds headings only**, with no wording | Answers cannot quote law | Ingest official wording, with review, when a permitted source is available (roadmap R4) | High (blocked on sources) |
