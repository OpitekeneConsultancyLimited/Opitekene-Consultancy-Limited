# Phase 3 Tax Accuracy and Functionality Review

Date: 2026-11-03
Project scope: TaxComp-Prototype

## Executive summary

Phase 3 is functionally complete for the implemented provisional tax modules and integrated into the prototype UI. The calculators are rule-gated, fail closed, and explicitly label provisional outputs as not approved for filing.

The crucial legal limitation remains unchanged: the underlying rule registry is a pending-review legacy snapshot, not a verified Ugandan legal source set. No rule is marked verified in the registry; all registered values remain pending legal verification. The code therefore behaves conservatively and refuses filing-ready output unless a verified rule is selected and a reviewer/date is recorded.

Overall verdict:
- Functional implementation status: pass
- UI integration: pass
- Rule integrity: pass with legal-review warnings
- Filing approval status: pass (blocked unless verified + reviewed)
- Legal verification status: pending primary-source confirmation

## Registry and legal basis

Primary source files:
- tax-rules.js
- tax-calculator.js
- corporate-tax.js
- capital-allowances.js
- industrial-building.js
- capital-gains.js

Rule status gate:
- The registry is built from a FY 2026/27 legacy snapshot and is intentionally not legal proof.
- The rule set remains `pending-review` and not approved for filing.
- `tax-rules.js` contains a verification gate that rejects a record as `verified` unless it has legislation, provision, official source metadata, review metadata, and verified effective dates.
- The actual calculators do not silently fall back to unverified rates; they either use a selected pending-review rule only in explicit simulation mode or block the result.

## General compliance checks

- No silent fallback to unverified rates: pass
- No provisional result is mislabelled as filing-approved: pass
- Tax consequences are not automatically double-counted: pass, because each calculator computes its own schedule and no cross-module aggregator auto-adds tax consequences
- Historical computations select the correct rule version: pass, as covered in tests for superseded/historical periods
- Existing features remain operational: pass, as confirmed by the final full JS and Python test runs

## Calculator review by calculator

### 1) Corporate income tax

Implementation status: implemented and integrated; provisional, rule-gated, and reviewer-gated.

Source files and functions:
- corporate-tax.js — `calculateCorporateIncomeTax()`
- tax-calculator.js — `calculateCompanyTaxBase()`, `calculateCompanyIncomeTax()`
- tax-rules.js — registry and FY 2026/27 rule snapshot
- app.js — `showCompanyTax()`

Actual calculation methodology:
1. User inputs: accounting profit, add-backs, exempt income, allowable deductions, capital allowances, carry-forward losses, provisional tax, withholding credits.
2. The engine computes the adjusted company tax base using `calculateCompanyTaxBase()`.
3. It resolves the rule set for the taxpayer and period through `registry.resolveRulesForPeriod()`.
4. If the calculation is simulation mode and the rule is pending-review, it may apply the pending rule only with explicit simulation selection.
5. If the calculation is filing mode, it requires a verified rule and a completed reviewer/date sign-off.
6. The tax is computed as: chargeable income x company rate, less tax already paid and credits.
7. The result returns a schedule, rule provenance, missing information, and the provisional warning.

Tax rules and rule IDs used:
- Rule category: company-resident-standard
- Legacy resident-company snapshot: `ug-income-tax-company-resident-fy2026-27`
- Rule status: pending-review in the registry, not approved for filing
- The public result object returns the applied rule ID and version when a rate is used.

Legal provisions and official sources:
- No verified legislative provision is populated in the live registry.
- The `tax-rules.js` metadata points to curated secondary summaries and public summaries rather than primary Ugandan legal texts.
- Filing output is intentionally blocked unless the legal rule is verified and reviewer sign-off is recorded.

Effective dates supported:
- Legacy FY 2026/27 snapshot: 2026-07-01 to 2027-06-30
- Historical superseded support is available only if a historical rule matches the exact closed period.

Verified or pending-review:
- Verified rules are not used for filing unless they are explicitly present in the registry and reviewer sign-off is captured.
- The prototype uses pending-review values only in explicit simulation mode.

Historical tax calculations:
- Yes, historical rule selection is supported using superseded/historical registry logic and is covered by tests.

Worked test scenarios with expected outputs:
1. Scenario A: accounting profit UGX 60,000,000; no deductions; no credits; simulation mode with explicit pending rule; expected output: provisional status, company rate = 30%, gross tax = UGX 18,000,000.
2. Scenario B: filing mode with same inputs but no reviewer/date; expected: blocked, no filing liability returned.
3. Scenario C: period with rule overlap or change in effective period; expected: blocked and `rule-change-in-period`/overlap message.

Reconciliation:
- Yes, the formula is reproducible and matches the independent arithmetic defined in the schedule; however it is still provisional because the legal basis is not verified.

Schedule export:
- Yes. The result includes a `schedule` array that lists the tax-base reconciliation and tax-credit steps.

UI integration:
- Yes. The company tax module is connected through `showCompanyTax()` in the web UI and includes the reviewer/date controls.

### 2) Capital allowances

Implementation status: implemented and integrated; provisional, rule-gated with asset-register logic.

Source files and functions:
- capital-allowances.js — `calculateCapitalAllowanceSchedule()`
- tax-calculator.js — `calculateWearAndTear()`
- tax-rules.js — wear-and-tear rate records and registry selection
- app.js — `showCapitalAllowance()`

Actual calculation methodology:
1. Asset records are grouped by asset class.
2. The calculation segregates opening tax written-down value, qualifying additions, business-use apportionment, and disposal proceeds in the business-use fraction.
3. Pool before allowance is computed as opening value + additions - disposal proceeds.
4. Wear-and-tear allowance = pool available x selected rate.
5. Closing value = opening pool after disposal & allowance.
6. A separate accounting-depreciation total remains outside the tax allowance schedule and is reported separately.

Tax rules and rule IDs used:
- Rule categories are asset-class-based values such as `wear-and-tear-class-1` and the legacy IDs `ug-capital-allowance-class-1-fy2026-27` etc.
- The rule set remains pending-review and is not filing-approved.

Legal provisions and official sources:
- No primary legal source or verified provision is attached in the registry.
- The source metadata remains secondary summary references. The engine will not return filing-ready output without a verified rule and reviewer sign-off.

Effective dates supported:
- Legacy FY 2026/27 snapshot and historical superseded/closed-period handling.

Verified or pending-review:
- Pending-review in the registry; simulation-only use is allowed, filing use is blocked unless verified and reviewed.

Historical tax calculations:
- Yes, historical class rates are selected only for their valid closed period.

Worked test scenarios with expected outputs:
1. Scenario A: opening TWDV = 100,000,000; additions = 40,000,000; business use = 100%; disposal = 0; rate = 40%; expected allowance = 56,000,000.
2. Scenario B: same asset becomes disposal-heavy with excess proceeds; expected blocked filing result and balancing-adjustment warning.
3. Scenario C: unconfirmed asset classification or missing reviewer/date; expected blocked result.

Reconciliation:
- Yes; the schedule reconciles opening value, additions, disposal proceeds, allowance, and closing value.

Schedule export:
- Yes; each class schedule includes `allowance`, `closingTaxWrittenDownValue`, `excessDisposalProceeds`, and a full per-class row set.

UI integration:
- Yes. The asset register form and result panel are connected to the website UI.

### 3) Industrial-building deductions

Implementation status: implemented and integrated; provisional and review-only.

Source files and functions:
- industrial-building.js — `calculateIndustrialBuildingDeduction()`
- tax-rules.js — historical registry and pending-review records
- app.js — `showIndustrialBuilding()`

Actual calculation methodology:
1. Determine qualifying construction costs after prior deductions.
2. Require valid construction dates and first-use dates.
3. If not in development mode, require explicit qualification confirmation and simulation parameters.
4. The engine computes: remaining qualifying cost x rate x period-use fraction.
5. It blocks filing-ready output when disposal/change-of-use occurs during the period or legal qualification is not confirmed.
6. It never decides legal qualification itself; the checkbox and review note are simulation-only assumptions.

Tax rules and rule IDs used:
- Legacy rule set in the registry: `ug-industrial-building-deduction-company-fy2026-27`
- Rule version: `legacy-UG-FY2026-27-v1`
- Status: pending-review and not approved for filing

Legal provisions and official sources:
- No primary legal provision is attached.
- The result explicitly records that user eligibility confirmation is a simulation assumption only.

Effective dates supported:
- Legacy FY 2026/27 snapshot and historical-period matching only when a superseded history rule is present.

Verified or pending-review:
- Pending-review. No default statutory rate or method is supplied.

Historical tax calculations:
- Yes, historical rule handling exists, but no verified Ugandan legal records are populated.

Worked test scenarios with expected outputs:
1. Scenario A: construction cost UGX 100,000,000; qualifying cost UGX 80,000,000; prior deductions UGX 5,000,000; rate 5%; use 100%; reviewer/date present for simulation; expected provisional deduction = UGX 3,750,000.
2. Scenario B: same facts but filing mode without reviewer/date; expected blocked result.
3. Scenario C: disposal/change-of-use occurs inside the period; expected blocked result regardless of simulation parameters.

Reconciliation:
- Yes, the schedule reconciles spend, qualifying costs, prior deductions, and remaining qualifying cost basis.

Schedule export:
- Yes. The result includes `schedule` rows and `ruleIdsUsed`/`ruleVersionsUsed` metadata.

UI integration:
- Yes. The HTML tab and form controls are connected to the app interface.

### 4) Capital gains tax

Implementation status: implemented and integrated; provisional and reviewer-gated.

Source files and functions:
- capital-gains.js — `calculateCapitalGains()`
- app.js — `showCapitalGains()`
- tax-rules.js — rule registry resolution

Actual calculation methodology:
1. Compute adjusted cost base = acquisition cost + incidental acquisition costs + improvement expenditure.
2. Compute net disposal proceeds = disposal proceeds - incidental disposal costs.
3. Gain before reliefs = net proceeds - cost base.
4. Chargeable gain = max(0, gross gain - exemptions - reliefs).
5. Tax liability = chargeable gain x selected rate, when allowed.
6. Filing mode requires reviewer sign-off and a verified rule for the period.

Tax rules and rule IDs used:
- Legacy rule IDs are generated under the registry; current implementation uses the pending-review capital-gains record as a controlled simulation fallback.
- The current live data does not provide a verified legal rule.

Legal provisions and official sources:
- No primary legal source or verified provision is populated. The output includes explicit provisional warnings and no legal approval tag.

Effective dates supported:
- Legacy FY 2026/27 and historical rule selection only if a superseded historical record is present.

Verified or pending-review:
- Pending-review by design; simulation use only when the user explicitly enters a rate.

Historical tax calculations:
- Yes, historical superseded/historical matching supported by the registry, with tests covering valid historical periods.

Worked test scenarios with expected outputs:
1. Scenario A: acquisition cost 10,000,000; incidental 500,000; improvement 2,000,000; proceeds 30,000,000; disposal costs 1,000,000; exemptions 1,000,000; reliefs 2,000,000; rate 10%; expected chargeable gain = 13,500,000; tax = 1,350,000; final tax after credits = 1,150,000.
2. Scenario B: filing mode without reviewer/date; expected blocked output and no tax liability.
3. Scenario C: loss asset (acquisition 20,000,000; proceeds 10,000,000); expected gross gain = 0 and tax liability = null.

Reconciliation:
- Yes, the schedule separately records cost base, disposal proceeds, reliefs, chargeable gain, tax, and credits.

Schedule export:
- Yes. The result includes a full `schedule` list and the applied version/rule metadata.

UI integration:
- Yes. The asset-disposal calculator is in the UI with dedicated form fields and tab selection.

### 5) VAT

Implementation status: existing system calculator remains operational and integrated; not legally verified.

Source files and functions:
- tax-calculator.js — `calculateVat()`, `calculateCustomsEstimate()`
- tax-rules.js — VAT rule batch (`valueAddedTaxRuleSet`)
- app.js — `showVat()`

Actual calculation methodology:
- Standard-rate output VAT = taxable sales x 18%.
- Zero-rated and exempt sales enter the supply calculation separately.
- Claimable input VAT is reduced by the exempt-supply proportion as configured by the legacy snapshot.
- The result includes `recoverableInputFraction` and `exemptShare`.

Tax rules and rule IDs used:
- `ug-vat-standard-rate-fy2026-27`
- `ug-vat-registration-thresholds-fy2026-27`
- `ug-vat-input-recovery-apportionment-fy2026-27`
- Status: pending-review snapshot

Legal provisions and official sources:
- None of these values are primary legal verification; they are baseline FY 2026/27 snapshot records, intentionally treated as pending-review.

Effective dates supported:
- Legacy FY 2026/27 snapshot only.

Verified or pending-review:
- Pending-review.

Historical tax calculations:
- Not independently supported beyond the legacy snapshot; historical rule change logic is not applied to VAT in the current Phase 3 scope.

Worked test scenarios with expected outputs:
1. Standard-rated sales UGX 50,000,000: output VAT = UGX 9,000,000.
2. Input VAT UGX 4,000,000, exempt share 10%: allowed input VAT = UGX 4,000,000.
3. High exempt share, e.g. 90% exempt; expected allowed input VAT reduced or zero depending on the configured threshold formula.

Reconciliation:
- Yes; the calculator returns the tax base and the input-vat apportionment.

Schedule export:
- Yes. `breakdown` returns the VAT reconciliation rows.

UI integration:
- Yes. The VAT form and results are connected in the app.

### 6) Withholding tax

Implementation status: implemented and integrated.

Source files and functions:
- tax-calculator.js — `calculateWithholdingTax()`
- tax-rules.js — withholding category rates and thresholds
- app.js — `showWithholdingTax()`

Actual calculation methodology:
- Applies the configured rate for each payment type to the gross payment, with threshold and exemption logic.
- Betting winnings are based on payout less stake.
- VAT withholding applies only in the designated-agent and invoice conditions defined by the code.

Tax rules and rule IDs used:
- Category-based rule IDs are generated as `ug-withholding-${paymentType}-fy2026-27` and threshold records for resident supply.
- Status: pending-review snapshot.

Legal provisions and official sources:
- Same legal constraint: source metadata is secondary and not verified primary law.

Effective dates supported:
- FY 2026/27 legacy snapshot.

Verified or pending-review:
- Pending-review.

Historical tax calculations:
- Not implemented as a historical rule engine at this stage.

Worked test scenarios with expected outputs:
1. Resident supply payment UGX 10,000,000, designated payer and invoice rules satisfied: withholding = 6% = UGX 600,000.
2. Betting winnings payout UGX 1,000,000, stake UGX 200,000: withholding = 15% x 800,000 = UGX 120,000.
3. VAT withholding with no invoice or non-designated payer: zero withholding result.

Reconciliation:
- Yes, via the `breakdown` rows that list gross payment, tax base, and rate.

Schedule export:
- Yes.

UI integration:
- Yes.

### 7) PAYE

Implementation status: implemented and integrated.

Source files and functions:
- tax-calculator.js — `calculatePaye()`, `calculatePayeWithSecondaryEmployment()`
- tax-rules.js — individual band structure, employee NSSF rate, employer NSSF rate
- app.js — `showPaye()`

Actual calculation methodology:
- Annual taxable income is taxed using the resident or non-resident individual bands.
- The monthly PAYE value is derived from the annual estimate divided by 12.
- Secondary employment uses the configured 40% withholding rate on secondary income and combines it with the primary monthly tax.
- NSSF employee/employer percentages are applied to gross earnings and reflected in the smart estimate.

Tax rules and rule IDs used:
- `ug-income-tax-individual-resident-fy2026-27`
- `ug-income-tax-individual-nonresident-fy2026-27`
- `ug-nssf-employee-contribution-fy2026-27`
- `ug-nssf-employer-contribution-fy2026-27`
- Status: pending-review snapshot

Legal provisions and official sources:
- Source references are secondary summaries, no verified primary legal source is in the registry.

Effective dates supported:
- FY 2026/27 legacy snapshot.

Verified or pending-review:
- Pending-review.

Historical tax calculations:
- Not implemented as a historical rule engine in the same way as the new Phase 3 modules.

Worked test scenarios with expected outputs:
1. Monthly resident income UGX 600,000; expected PAYE based on annualized income and the resident band schedule.
2. Secondary employment monthly income UGX 250,000 with primary income UGX 500,000; expected combined monthly tax = primary monthly tax + 40% x secondary income (with the standard combined-income reconciliation).
3. Gross earnings = UGX 1,000,000 with employee NSSF 5% and employer NSSF 10%; expected monthly NSSF values UGX 50,000 and UGX 100,000.

Reconciliation:
- Yes; breakdown rows list the band tax elements and monthly totals.

Schedule export:
- Yes; the `breakdown` array is returned.

UI integration:
- Yes.

### 8) Rental income tax

Implementation status: implemented and integrated.

Source files and functions:
- tax-calculator.js — `calculateRentalIncomeTax()`
- tax-rules.js — rental tax rates and thresholds
- app.js — `showRentalTax()`

Actual calculation methodology:
- Resident individual calculation: annual gross rent above threshold x 12%.
- Non-resident rent: gross rent x 15% withholding estimate.
- Company rental: company tax base after allowable expenses and carried-forward losses, taxed at the resident-company rate.

Tax rules and rule IDs used:
- `ug-rental-income-individual-fy2026-27`
- `ug-rental-income-nonresident-fy2026-27`
- Status: pending-review snapshot

Legal provisions and official sources:
- No primary legal verification is attached; the business logic is intentionally conservative and flags the estimate as an estimate.

Effective dates supported:
- FY 2026/27 legacy snapshot.

Verified or pending-review:
- Pending-review.

Historical tax calculations:
- Not implemented beyond the retained legacy snapshot.

Worked test scenarios with expected outputs:
1. Resident individual gross rent UGX 25,000,000; threshold UGX 2,820,000; taxable rent UGX 22,180,000; tax = UGX 2,661,600.
2. Non-resident gross rent UGX 10,000,000; estimate = UGX 1,500,000.
3. Company rental with allowable expenses and credits; expected tax computed from company rate on chargeable rental income.

Reconciliation:
- Yes, via the `breakdown` rows and period-specific tax-base notes.

Schedule export:
- Yes.

UI integration:
- Yes.

## Overall review conclusion

The implemented Phase 3 calculators are functionally coherent, fail closed, and show clear provenance for the rates they use. They are operational inside the prototype UI and pass the full JavaScript and Python regression suites.

The single most important limitation is legal status, not arithmetic correctness:
- the registry remains a pending legacy snapshot, not a verified set of Ugandan law values
- no output is filing-approved unless verified rules are present and reviewer sign-off is recorded
- provisional outputs are deliberately marked not approved for filing

No defect was identified requiring logic changes during this review. The current Phase 3 implementation is therefore considered complete and reviewable as a controlled provisional engine, pending genuine primary-source verification before any legal or filing-level deployment.

## Evidence used for the review

- test command: `node --test --test-reporter=spec .\TaxComp-Prototype\app-install.test.js .\TaxComp-Prototype\audit-health.test.js .\TaxComp-Prototype\capital-allowances.test.js .\TaxComp-Prototype\capital-gains.test.js .\TaxComp-Prototype\corporate-tax.test.js .\TaxComp-Prototype\industrial-building.test.js .\TaxComp-Prototype\international-tax.test.js .\TaxComp-Prototype\multi-tax-analysis.test.js .\TaxComp-Prototype\tax-advisory.test.js .\TaxComp-Prototype\tax-calculator.test.js .\TaxComp-Prototype\tax-chat.test.js .\TaxComp-Prototype\tax-rules.test.js .\TaxComp-Prototype\tax-worked-examples.test.js .\TaxComp-Prototype\worker\efris.test.mjs .\TaxComp-Prototype\worker\index.test.mjs`
- result: 171 passed, 0 failed
- Python command: `py -m unittest discover -s .\TaxComp-Prototype -q`
- result: 7 passed, 0 failed

## Outstanding legal verification items

1. Confirm the authoritative Ugandan legal source for each rate and threshold in the FY 2026/27 snapshot.
2. Insert primary legal provisions for company tax, PAYE, VAT, rental, withholding, capital allowance, industrial-building and capital-gains rules.
3. Replace the pending-review snapshot with verified rule records before any filing or compliance workflow is promoted beyond prototype status.
4. Validate any historical legal rule set against official amendments and effective-date journals rather than the current registry snapshot.
