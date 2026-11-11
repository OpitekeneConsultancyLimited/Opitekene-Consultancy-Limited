# TODO_VERIFY: items for the legal reviewer (Checkpoint C)

Nothing below has been approved. While it is unapproved:
- every deadline shows **"Provisional: rules pending legal review"**;
- penal tax and interest are checked only against the rate printed on URA's own notice;
- statute sections show as "section to be confirmed".

Code and seed data never set `approved_for_computation = true`. A reviewer with the `can_approve_law` flag does that in the app (Challenge an Assessment → Law and cases admin), and every approval is written to the audit log.

## A. Deadline and procedure rules (rule set `objections-2026.v1`)

| # | Item | Seeded value | Source given in the brief | To confirm |
|---|---|---|---|---|
| A1 | Objection period | 45 days from receipt of the assessment | URA Objections and Appeals page | The period and the provision, as amended by the TPC (Amendment) Act 2026 |
| A2 | Day of receipt counted? | Not counted (`exclude_trigger_day = 1`) | Not stated | Counting convention |
| A3 | Weekends and public holidays | Calendar days; a deadline on a weekend or holiday is not moved. Users are told to lodge by the working day before. | Not stated | Whether a deadline that falls on a weekend or holiday moves to the next working day. If it does, set the rules to `next_business_day`; only holidays confirmed in section F then extend a deadline. |
| A4 | "Urgent" threshold | 10 days or fewer | Brief (product choice) | None; this is a product choice |
| A5 | Late objection grounds | Absence from Uganda, sickness or another reasonable cause, without unreasonable delay | URA page | Wording, the provision, and the form of the application |
| A6 | URA's time to decide | 90 days after the objection is lodged | Daily Monitor article | The period, the provision, and **what happens if URA does not decide in time** (the app only alerts) |
| A7 | Tribunal application | 30 days after service of the objection decision | URA page | The period and the provision |
| A8 | Payment before the Tribunal | 30% of the tax assessed or the tax not in dispute, whichever is higher | URA page | The rule, the provision, and whether "tax assessed" includes penal tax and interest (the app uses principal only) |
| A9 | Grounds limited to those raised at objection | Pack lists every arguable ground | Daily Monitor article | The provision, or the case law behind it |
| A10 | ADR | Optional; never replaces filing on time | URA page | Current URA ADR procedure |

## B. Statutes (`law_statutes`)

| # | Item | Seeded | To confirm |
|---|---|---|---|
| B1 | Income Tax Act | Cap. 338 | Chapter in the Laws of Uganda 2024 Revised Edition; exact ULII link (ULII's sitemap lists `/en/akn/ug/act/1997/11/…`, but its pages could not be opened automatically) |
| B2 | Value Added Tax Act | Cap. 344 | The same |
| B3 | Tax Procedures Code Act | Cap. 343 | The same (sitemap lists `/en/akn/ug/act/2014/14/…`) |
| B4 | Tax Appeals Tribunals Act | Cap. 341 (changed from Cap. 345, its 2000 edition number, on the evidence of a FY 2024/25 compendium of the 2024 revised laws) | The same |
| B5 | VAT (Amendment) Act 2026 | Assented 18 May 2026; commenced 1 July 2026 (from the owner's brief) | Act number, Gazette reference and ULII link |
| B6 | Tax Procedures Code (Amendment) Act 2026 | Same dates as B5 | The same |
| B7 | Income Tax (Amendment) Act 2026 | Bill returned 14 July 2026; assented 20 August 2026; applied by URA from 1 July 2026 | The same, plus the retrospective application. The app tells the user a professional should consider whether applying it before assent can be questioned. |
| B8 | Excise Duty Act | Cap. 336 (as stated by Parliament's Bill Tracker, bill 561) | Chapter in the Laws of Uganda 2024 Revised Edition; exact ULII link |
| B9 | Excise Duty (Amendment) Act 2026 | Seeded as **passed, not assented** (never applied). Parliament's Bill Tracker (https://bills.parliament.ug/user_bill_stage.php?billid=561) shows third reading on 21 April 2026 and no assent date. | Assent and commencement dates, Act number, Gazette reference. Statutes are owner-managed: once confirmed, run in the Supabase SQL editor, for example `UPDATE taxcomp.law_statutes SET bill_status = 'in_force', assent_date = 'YYYY-MM-DD', commencement_date = 'YYYY-MM-DD', applies_from_period = 'YYYY-MM-DD' WHERE id = 'eda-amendment-2026';` |
| B10 | Stamp Duty Act | Cap. 339; commenced 1 July 2014 (as printed in a FY 2024/25 compendium) | Chapter in the 2024 Revised Edition; exact ULII link |
| B11 | Lotteries and Gaming Act | Cap. 334; commenced 8 April 2016 (same source) | The same |
| B12 | Convention on Mutual Administrative Assistance in Tax Matters (Implementation) Act | Cap. 335; commenced 1 July 2023 (same source) | The same |
| B13 | East African Crude Oil Pipeline (Special Provisions) Act | Cap. 156; commenced 24 December 2021 (same source) | The same |
| B14 | National Social Security Fund Act | Cap. 230 (same source) | The same |
| B15 | Section structure of 18 Acts and regulations (`law-index.json`, 701 section headings) | Taken from the Arrangement of Sections printed in the compendium, as at FY 2024/25 | Check each Act's Parts, section numbers and headings against the ULRC edition, then mark its `ug.law.*` knowledge record verified. Later amendments (2025, 2026) are not reflected. Inserted sections with pre-revision numbers: Income Tax Act 118I, Tax Procedures Code Act 40E. |

Evidence found 2026-11-11 (to help, not to replace, the check): Parliament's Bill Tracker describes the 2026 amendment Bills as amending the Income Tax Act **Cap. 338** (bill 564), the VAT Act **Cap. 344** (bill 562) and the Tax Procedures Code Act **Cap. 343** (bill 563), matching B1 to B3. It records third readings on 21 April (VAT, TPC, Excise) and 23 April 2026 (Income Tax), and no assent dates. TaxComp's legislative watch (Law and cases admin) now follows the tracker daily.

## C. Provision versions (`law_provision_versions`)

Each row needs: the official text pasted from ULII, the section number, and confirmation of whether the 2026 amendment changed it. Two rows also need a formula.

| Topic | Rows | Extra |
|---|---|---|
| Expense deductibility (ITA) | `ita.deductions.pre-2026`, `ita.deductions.2026` | |
| Penal tax (ITA) | `ita.penal-tax.pre-2026`, `ita.penal-tax.2026` | **Rate and base**: formula `{"kind":"percent-of-principal","percent":?}` |
| Input VAT credit (VAT Act) | `vata.input-credit.pre-2026`, `vata.input-credit.2026` | |
| Objection procedure (TPCA) | `tpca.objection.pre-2026`, `tpca.objection.2026` | |
| Interest on unpaid tax (TPCA) | `tpca.interest.pre-2026`, `tpca.interest.2026` | **Rate, and whether it compounds**: formula `{"kind":"simple-monthly","ratePercentPerMonth":?}` (only simple monthly interest is coded) |
| Burden of proof (TPCA) | `tpca.burden-of-proof` | Whether it sits in the TPCA or the TAT Act |
| Tribunal application (TAT Act) | `tata.review-application` | |
| PAYE: employment income (ITA) | `ita.paye-employment-income.pre-2026`, `ita.paye-employment-income.2026` | How allowances, benefits in kind and reimbursements are treated |
| PAYE: employer's duty to withhold (ITA) | `ita.paye-employer-duty.pre-2026`, `ita.paye-employer-duty.2026` | Whether the employer's liability for tax not withheld is in the ITA or the TPCA |
| WHT: payments, rates and exemptions (ITA) | `ita.wht-payments.pre-2026`, `ita.wht-payments.2026` | Rates, thresholds and exemption certificates. TaxComp never applies a withholding rate itself. |
| WHT: withholding agent's liability (ITA) | `ita.wht-agent-liability.pre-2026`, `ita.wht-agent-liability.2026` | Whether it is in the ITA or the TPCA; any right to recover from the payee |

## D. Case repository

| # | Item |
|---|---|
| D1 | Enter TAT decisions, aiming for 50, tagged by issue. ULII does not allow automated collection (decision D-21): use the reviewer form, or the CSV import (`scripts/ulii-ingest.mjs import`). Alternatively, ask ULII for permission or a data feed. |
| D2 | `[2023] UGTAT 2` (Quickway Property Services v URA): its summary is marked "Staff summary, unreviewed"; approve it or correct it. Its appeal status is **unverified**. |
| D3 | For each decision: appeal status (never inferred by code) and summary approval. |

## F. Public holidays (`public_holidays`, migration `20261111000000`)

The seeded holidays are unverified. They cover the fixed-date holidays and Good Friday and Easter Monday for 2026 to 2028; the Easter dates are computed.

| # | Item |
|---|---|
| F1 | Confirm each fixed date and name against the Public Holidays Act. Confirm each one in Law and cases admin → Public holidays, with a link to the source. |
| F2 | Whether a holiday that falls on a Sunday is observed on the Monday. Nothing is seeded for this. |
| F3 | Eid al-Fitr and Eid al-Adha are gazetted each year. A reviewer adds them once announced. |
| F4 | Any one-off holidays, such as election days. |

While a holiday is unverified it can only make TaxComp warn users to lodge earlier; it never moves a deadline later.

## E. Product and policy (owner)

| # | Item |
|---|---|
| E1 | Review threshold: UGX 50,000,000 of disputed principal (`CHALLENGE_REVIEW_THRESHOLD_UGX`) |
| E2 | **Decided 2026-11-11:** Reviewed pack UGX 250,000 per case (online through Flutterwave once its keys are set; WhatsApp until then). Managed dispute quoted per case and recorded by a legal approver. |
| E3 | Retention period for cases (privacy notes) |
| E4 | Whether the Gemini key is a paid tier (privacy notes) |
