# Test guide: Challenge an Assessment

## Run everything

```
npm ci
npm test                                   # 388 tests: unit, API on real Postgres (PGlite), site structure
npm run typecheck                          # tsc --strict --noEmit over worker/challenge/*.mts
node scripts/check-dom-contract.mjs        # every id a script needs exists exactly once
node scripts/challenge-e2e.mjs <shots-dir> # Edge end-to-end (needs Microsoft Edge installed)
node scripts/ext1-harness.mjs score text   # EXT-1 on the 20 synthetic notices (text)
```

CI (`release-candidate.yml`, `deploy-pages.yml`) runs `npm test` and the type check. The e2e and the EXT-1 PDF/photo runs need Edge or an AI key, so they are run by hand.

## Where each acceptance test lives

| ID | Automated in | How |
|---|---|---|
| EXT-1 | `worker/challenge-ext1.test.mjs` (text); `scripts/ext1-harness.mjs` (PDF, photo) | Text runs in CI. For PDFs and photos: run `node scripts/ext1-harness.mjs render`, then `$env:ANTHROPIC_API_KEY = "<key>"` and `node scripts/ext1-harness.mjs score pdf` (and `score photo`). This costs a few US cents. Put real assessments in `docs/challenge-assessment/samples/real/` with a matching `.json` of the true figures; they are scored too. |
| DL-1, DL-2, DL-3 | `worker/challenge-logic.test.mjs`, `worker/challenge-api.test.mjs`, e2e | |
| LAW-1 | the same three | Uses the seeded dates from the brief |
| CLS-1, CLS-2 | the same three | |
| CASE-1 | `worker/challenge-api.test.mjs` (harness with synthetic records) | The real pass needs at least 3 real decisions entered by a reviewer (see `todo-verify.md` D1) |
| SAFE-1 | `worker/challenge-logic.test.mjs` (filter and variants); `pack.mts` `assertSafe` on every pack; e2e checks the downloaded pack | |
| REV-1 | `worker/challenge-api.test.mjs`, e2e | |
| PLAIN-1 | `plain-1-script.md` | Run by the owner with five people |

## Security tests (required fix 2)

`worker/challenge-api.test.mjs` covers:
- signed-out access, forged tokens and foreign origins;
- a second user against every case route;
- an unassigned reviewer;
- the `anon` / `authenticated` roles against new and existing tables;
- private buckets.

`worker/supabase-postgres.test.mjs` checks RLS and the grants on all 49 tables.

## Manual checks before going live

1. Apply the migrations to a Supabase **branch** first (Checkpoint B). Sign in, run one case end to end, and download a document.
2. Use a screen reader (NVDA or TalkBack) on the steps; the e2e checks only labels, button names, contrast and focus.
3. On a real phone: take a photo of a notice and upload it.
