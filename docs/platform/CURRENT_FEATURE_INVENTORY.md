# Current feature inventory

Status as of 12 November 2026. **Live** means deployed and checked on production. **Gated** means built and tested but switched off on purpose. **Blocked** means it waits on an owner action.

## Corporate website (`/`)

| Feature | Status | Notes |
| --- | --- | --- |
| Home, About Us, Services (8), Training (QuickBooks Online and Desktop, Zoho Books, Xero, Odoo and more), Insights, TaxComp, Contact Us | Live with this release | Uses the owner's own content and design; no invented claims |
| Quick tax estimate (PAYE, VAT, WHT, company tax) | Live | Uses the TaxComp engine, with no rates in the page code |
| Contact form | Live | Opens WhatsApp with the request; nothing is posted to a server |
| Public privacy policy and terms | Live with this release | |

## TaxComp (`/taxcomp/`)

| Area | Feature | Status |
| --- | --- | --- |
| Access | Sign-up, sign-in, password reset (Supabase Auth); the whole app sits behind sign-in | Live |
| Dashboard | Onboarding, Simple and Professional modes, "Changed in 2026", recommendations, saved assessments, Tax Companion | Live |
| Ask TaxComp | Advisor and chat: legislation retrieval, guided answers, impact follow-ups, citation check; live web research for Premium users | Live (Claude key **blocked**; Gemini used) |
| Tax Tools | 11 calculators with working; PAYE tax-year switch | Live |
| Tax Tools | Tax Impact Assessment (VAT threshold, PAYE, 2026 withholding), with what-if and save | Live |
| Tax Tools | Multi-tax transaction analysis; international tax (6 calculators, guided reasoning) | Live |
| Law & Knowledge | 18 Acts and regulations (701 section headings), the 2026 amendments register (53 changes), search, "Amended in 2026" marks | Live (all **unverified**) |
| Law & Knowledge | Guides, worked examples, reviewer-entered case law, legislative watch of Parliament's Bill Tracker | Live |
| Compliance | Obligation discovery with legal basis and progress; Challenge an Assessment (income tax, VAT, PAYE, WHT) | Live |
| Workspace | Practice workspace: clients, obligations, documents, reports, roles | **Gated** (503 until the Phase 6 sign-offs) |
| Workspace | Plans (Premium, Firm) and per-case payment | Sign-up live; checkout **blocked** (Flutterwave keys) |
| Admin | Reviewer workflows for legislation, amendments, knowledge and case law; admin pages | Live (reviewers and approvers are set in the database) |
| Offline | Installable app; calculators work offline | Live |

## Not built yet

See `IMPLEMENTATION_ROADMAP.md`:

- tax-year selection on calculators other than PAYE;
- stamp duty and excise calculators;
- a penalties and interest calculator (blocked until rates are verified);
- a knowledge ingestion pipeline for documents;
- a dedicated research view;
- an AI quality and prompt-injection suite;
- MFA;
- a CSP.
