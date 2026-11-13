# Local development (offline, on Supabase)

Run the whole system on your own computer: the corporate site, the TaxComp app, the Worker and a local Supabase (Postgres, Auth, Storage, email capture). Nothing touches production. After a one-time setup, it works without internet.

## One-time setup (online)

1. **Node.js 22 or later** and `npm ci` in this folder (already done on this PC).
2. **Docker Desktop for Windows**, from <https://www.docker.com/products/docker-desktop/>. Install it with the WSL 2 option (WSL is already on this PC), restart if asked, then start Docker Desktop. Docker Desktop is free for small businesses (fewer than 250 employees and under USD 10 million revenue).
3. **First run:** `npm run dev`. This does three things:
   - saves supabase-js for offline use in `.local-data/vendor`;
   - downloads the Supabase images (a few GB, once);
   - creates the local database from `supabase/migrations`.

## Every day (offline)

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts local Supabase and TaxComp. Corporate site: <http://localhost:8788/>. TaxComp: <http://localhost:8788/taxcomp/>. |
| `npm run dev -- --reset` | Rebuilds the local database from the migrations (deletes local data). |
| `npm run dev -- --reviewer you@example.com` | Makes that local user a legal reviewer and approver, to test the verification workflows. Sign up first. |
| `npm run dev:lite` | No Docker: an in-memory database and a sign-in that accepts any email. Data is lost when it stops. Good for quick checks. |
| `npm run dev:stop` | Stops the local Supabase containers. Your local data is kept. |
| `npm test` and `node scripts/challenge-e2e.mjs` | The test suites, which also run offline. |

### Local Supabase addresses

| Service | Address | Use |
| --- | --- | --- |
| Studio | <http://127.0.0.1:54323> | Browse tables, run SQL |
| Emails | <http://127.0.0.1:54324> | Sign-up confirmations and password resets land here; nothing is sent |
| API | <http://127.0.0.1:54321> | Used by the app |
| Database | `127.0.0.1:54322` | Used by the Worker as `taxcomp_worker` |

## How it matches production

| | Production | Local (`npm run dev`) |
| --- | --- | --- |
| Database | Supabase Postgres through Hyperdrive, role `taxcomp_worker`, RLS | Local Supabase Postgres, same role and RLS, same migrations |
| Sign-in | Supabase Auth, ES256 keys, email confirmation, 12+ character passwords | The same, with a local key (`local/supabase/signing_keys.json`, never committed) |
| Files | Supabase Storage | Local Supabase Storage |
| Worker | Cloudflare | The same Worker code, run by `scripts/dev.mjs` |
| AI and payments | Claude or Gemini; Flutterwave | Not called (no keys). Answers come from TaxComp's guided answers, impact engine and legislation database |

The local project's settings are in `local/supabase/config.toml`, kept separate from `supabase/config.toml`, which holds the live project's settings. Local changes can never be pushed to production by mistake.

## Making changes

1. Edit the files.
2. Reload the browser. The local server never caches, and its service worker removes itself.
3. For a database change, add a migration in `supabase/migrations`. `npm run dev` applies new migrations on the next start. Use `--reset` to rebuild from scratch.
4. Run `npm test` and `node scripts/challenge-e2e.mjs`.
5. When you're back online, publish the change through a pull request as usual. The live site and database change only through that process.
