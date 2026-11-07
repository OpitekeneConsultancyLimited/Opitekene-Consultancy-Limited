# Install TaxComp as an app

TaxComp is an installable Progressive Web App (PWA). It uses the same site
code and calculators and does not require an app-store account or a separate
native mobile codebase.

## Install or download TaxComp

- Open the official TaxComp site: <https://opitekeneconsultancylimited.github.io/Opitekene-Consultancy-Limited/>.
- Select **Install TaxComp** on the home page to open the installation prompt or
  device-specific instructions.
- On a phone, a **Get TaxComp on your phone** bar stays at the bottom of the
  screen so people can install it at any time.
- **Android:** open the site in Chrome, tap the three-dot menu, then choose
  **Install app** or **Add to Home screen**. The **Install TaxComp** button
  opens these steps if Chrome does not offer a direct install prompt.
- **iPhone or iPad:** open the site in Safari, tap **Share**, scroll down, then
  choose **Add to Home Screen**. Other iPhone browsers may need you to open the
  page in Safari first.
- **Windows or Mac:** open the site in Chrome or Edge, open the browser menu,
  then choose **Install app**. Some browser versions also show an install icon
  in the address bar.
- **No APK download or app-store account is needed.** TaxComp is installed
  directly from its official HTTPS website. Installation and use are free.
- **Run the local copy:** from the project folder run `py run_taxcomp.py`, then
  use the browser's install menu at `http://127.0.0.1:8000/`. Keep the server
  running while using this local installation.

The app shell and tax calculators are cached for offline use after the first
successful visit. Open-ended AI chat requires an internet connection and a
configured Cloudflare Worker and Gemini API key. Case links and external tax
sources also require an internet connection.

The audit-readiness and tax health-check workspaces are available in the app.
Checklist statuses and the optional tax period are saved in browser storage on
the current device only. Avoid entering confidential details. Users can clear
each workspace, or download or print its checklist report. These educational
prompts do not assess legal compliance or replace current URA guidance or
professional advice.

The site also includes supplied year-of-income 2024 company-tax and withholding
worked examples. Their calculations check arithmetic only; the tax treatments
and cited historical law are not independently validated and are not current
filing advice.

Calculator values in the central FY 2026/27 rules snapshot remain pending
legal-source review and are not approved for filing. Existing calculators
preserve their estimate behavior through a backward-compatible adapter; the
date-based registry will not select a rule until its official source, provision,
effective dates, methodology, and review record are complete.

The company computation asks for a full tax period and calculation mode. Filing
mode requires a verified rule for the entire period; simulation mode is
provisional and not approved for filing. The corporate computation does not
verify the legal treatment of entered adjustments or capital allowances.

## Phase 6 practice workspace

Phase 6 client/practice APIs and UI are implemented in the source tree but are
not configured on the live site. The `taxcomp-phase6-api` meta endpoint is
blank and the Worker returns 503 unless `PHASE6_OPERATIONS_ENABLED=true` is
explicitly configured after security review. Do not enter real client data.

The API uses the existing Cloudflare Worker/D1 architecture. The additive
`worker/migrations/0005_phase6_operations.sql` migration has been tested with
local SQLite-compatible tests, but has not been applied to remote D1. Bootstrap
requires a Worker secret; user invitations require an email service binding;
document uploads require private R2 storage and a malware-scanner service.
Those bindings and backup/restore procedures are not configured here.

Before enabling operations, configure a production API origin that is
compatible with secure credential cookies, apply and verify the D1 migration
with a backup/restore plan, configure the required service bindings, and pass
the security review. Never place secrets in this static app or commit them.
Software tests do not verify Ugandan tax law. Tax rules, sources, deadlines,
and filing approvals remain subject to qualified evidence review.

The wear-and-tear workspace accepts a fixed-asset register and separates book
depreciation from tax allowances. Asset classes and expenditure are user
selected; a pending rate is only used in simulation mode. Initial allowances
and disposal balancing adjustments are not calculated.

## Phases 8-11 readiness

The local Phase 8 foundation catalogs legislation titles and resolves available
dated source records, but it does not contain a verified legal corpus. Missing
official documents, provisions, effective dates, and reviewer attestations
must be supplied and reviewed before any source can support filing-approved
calculations. Historical resolution explicitly reports that repository
completeness is not established.

Phase 9 keeps practice APIs fail-closed unless all required security flags and
core bindings are present. This does not substitute for remote D1 migration,
provider setup, verified backups/restores, or independent security and privacy
review. Phase 10 dashboard analytics are disabled by default and remain scoped
to the authenticated organization/client dashboard. Phase 11's
`/api/phase6/governance/readiness` endpoint is authenticated, administrator
scoped, and audited; all launch approvals default to false, and it does not
enable or implement billing.

These are local software foundations only. Do not treat any of Phases 8-11 as
live, legally verified, or commercially launched until their documented
external dependencies and reviews are completed.

## Extract a tax-law PDF

To extract text from a text-based PDF into searchable text, page-by-page JSON
Lines, and a source-hash manifest, install `pypdf` and run:

```powershell
py -3 -m pip install pypdf
py -3 capture_compendium.py "C:\path\to\laws-of-uganda.pdf"
```

By default, the script creates a `laws-of-uganda_extracted` folder beside the
PDF. Use `--output-dir "C:\path\to\output"` to choose another location. Pages
without extractable text may need OCR; the extraction does not preserve page
layout. The source PDF is read locally and is not uploaded.

The PWA is not published to Google Play or Apple's App Store. GitHub Pages
serves it over HTTPS, which is required for installation outside localhost.
