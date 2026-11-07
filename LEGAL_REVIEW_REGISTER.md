# Uganda tax rule verification register

Date prepared: 2026-11-07  
Purpose: identify current executable rule records requiring official-source verification. This is a work register, **not legal advice or an approval record**.

## Interpretation of the register

The code registry contains 43 rule records for FY 2026/27. Each is `pending-review`; `effectiveFrom`/`effectiveTo` are configured code dates only and `effectiveDatesVerified` is false. The listed interval must not be interpreted as a verified statutory effective period.

For **every row below**:

- **Official source / provision:** not mapped to an official Gazette, legislation, URA, or court record; exact provision not identified. Some code records carry secondary-source references, which are not official verification.
- **Amendments:** verified amendment/commencement history not established.
- **Verification status:** pending primary-source verification; not approved for filing.
- **Qualified reviewer / review date:** none recorded.
- **Applicable tax year:** code metadata says FY 2026/27 only; legal applicability unverified.
- **Computation impact:** the configured calculator/rule input identified by the record's tax head and category; correctness and legal scope remain unverified.

Do not transition any row to verified based on this document. A reviewer must add the official source URI/document, exact provision, relevant effective dates and amendments, taxpayer/transaction scope, computation methodology, reviewer identity/date and rationale through the governed approval workflow.

| Requirement | Status | Evidence |
|---|---|---|
| Current rule inventory | **PASSED** | Register covers all 43 records returned by `tax-rules.js` at preparation time. |
| Official source, provision, dates and amendment verification | **BLOCKED** | No official source/provision mapping or verified amendment history is recorded for these rules. |
| Qualified review and filing approval | **AWAITING EXTERNAL APPROVAL** | A qualified Ugandan tax/legal reviewer must verify each rule and record identity, date and rationale. |

## Rule-by-rule register

| Rule ID | Tax head / category / taxpayer | Code period (unverified) | Computation impact in code | Official source / provision | Amendment history | Status / qualified reviewer |
|---|---|---|---|---|---|---|
| `ug-income-tax-individual-resident-fy2026-27` | income-tax / individual-resident / individual | FY 2026/27; 2026-07-01–2027-06-30, unverified | Resident individual income-tax band input | Not identified / not identified | Not established | pending-review / none |
| `ug-income-tax-individual-nonresident-fy2026-27` | income-tax / individual-nonresident / individual | FY 2026/27; dates unverified | Non-resident individual income-tax band input | Not identified / not identified | Not established | pending-review / none |
| `ug-paye-secondary-employment-fy2026-27` | pay-as-you-earn / secondary-employment-withholding / employee | FY 2026/27; dates unverified | Secondary-employment withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-income-tax-company-resident-fy2026-27` | income-tax / company-resident-standard / company | FY 2026/27; dates unverified | Resident company income-tax rate input | Not identified / not identified | Not established | pending-review / none |
| `ug-capital-allowance-class-1-fy2026-27` | income-tax / wear-and-tear-class-1 / business-taxpayer | FY 2026/27; dates unverified | Capital allowance class 1 input | Not identified / not identified | Not established | pending-review / none |
| `ug-capital-allowance-class-2-fy2026-27` | income-tax / wear-and-tear-class-2 / business-taxpayer | FY 2026/27; dates unverified | Capital allowance class 2 input | Not identified / not identified | Not established | pending-review / none |
| `ug-capital-allowance-class-3-fy2026-27` | income-tax / wear-and-tear-class-3 / business-taxpayer | FY 2026/27; dates unverified | Capital allowance class 3 input | Not identified / not identified | Not established | pending-review / none |
| `ug-vat-standard-rate-fy2026-27` | value-added-tax / standard-rate / taxable-person | FY 2026/27; dates unverified | VAT rate input | Not identified / not identified | Not established | pending-review / none |
| `ug-vat-registration-thresholds-fy2026-27` | value-added-tax / registration-thresholds / taxable-person | FY 2026/27; dates unverified | VAT registration threshold inputs | Not identified / not identified | Not established | pending-review / none |
| `ug-vat-input-recovery-apportionment-fy2026-27` | value-added-tax / input-recovery-apportionment / taxable-person | FY 2026/27; dates unverified | Input VAT recovery/apportionment inputs | Not identified / not identified | Not established | pending-review / none |
| `ug-nssf-employee-contribution-fy2026-27` | social-security-contribution / employee-contribution / employee | FY 2026/27; dates unverified | Employee contribution input | Not identified / not identified | Not established | pending-review / none |
| `ug-nssf-employer-contribution-fy2026-27` | social-security-contribution / employer-contribution / employer | FY 2026/27; dates unverified | Employer contribution input | Not identified / not identified | Not established | pending-review / none |
| `ug-rental-income-individual-fy2026-27` | income-tax / rental-individual / individual | FY 2026/27; dates unverified | Individual rental-income tax inputs | Not identified / not identified | Not established | pending-review / none |
| `ug-rental-income-nonresident-fy2026-27` | withholding-tax / rental-nonresident / nonresident-landlord | FY 2026/27; dates unverified | Non-resident rental withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-presumptive-tax-turnover-limit-fy2026-27` | income-tax / presumptive-turnover-limit / resident-business | FY 2026/27; dates unverified | Presumptive-regime turnover threshold input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-supply-fy2026-27` | withholding-tax / resident-supply / classification-required | FY 2026/27; dates unverified | Resident supply withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-dividend-fy2026-27` | withholding-tax / resident-dividend / classification-required | FY 2026/27; dates unverified | Resident dividend withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-listed-dividend-fy2026-27` | withholding-tax / listed-dividend / classification-required | FY 2026/27; dates unverified | Listed dividend withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-interest-fy2026-27` | withholding-tax / resident-interest / classification-required | FY 2026/27; dates unverified | Resident interest withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-government-interest-fy2026-27` | withholding-tax / government-interest / classification-required | FY 2026/27; dates unverified | Government securities interest input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-long-government-interest-fy2026-27` | withholding-tax / long-government-interest / classification-required | FY 2026/27; dates unverified | Long-term government securities interest input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-related-company-dividend-fy2026-27` | withholding-tax / related-company-dividend / classification-required | FY 2026/27; dates unverified | Related-company dividend withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-payment-fy2026-27` | withholding-tax / nonresident-payment / classification-required | FY 2026/27; dates unverified | Non-resident payment withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-government-interest-fy2026-27` | withholding-tax / nonresident-government-interest / classification-required | FY 2026/27; dates unverified | Non-resident government interest input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-long-government-interest-fy2026-27` | withholding-tax / nonresident-long-government-interest / classification-required | FY 2026/27; dates unverified | Non-resident long-term government interest input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-imported-goods-fy2026-27` | withholding-tax / imported-goods / classification-required | FY 2026/27; dates unverified | Imported goods withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-reinsurance-fy2026-27` | withholding-tax / nonresident-reinsurance / classification-required | FY 2026/27; dates unverified | Non-resident reinsurance withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-transport-fy2026-27` | withholding-tax / nonresident-transport / classification-required | FY 2026/27; dates unverified | Non-resident transport withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-telecom-fy2026-27` | withholding-tax / nonresident-telecom / classification-required | FY 2026/27; dates unverified | Non-resident telecom withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-entertainer-fy2026-27` | withholding-tax / resident-entertainer / classification-required | FY 2026/27; dates unverified | Resident entertainer withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-betting-winnings-fy2026-27` | withholding-tax / betting-winnings / classification-required | FY 2026/27; dates unverified | Betting/gaming winnings withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-telecom-commission-fy2026-27` | withholding-tax / resident-telecom-commission / classification-required | FY 2026/27; dates unverified | Telecom commission withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-payment-service-commission-fy2026-27` | withholding-tax / payment-service-commission / classification-required | FY 2026/27; dates unverified | Payment-service commission withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-insurance-agent-commission-fy2026-27` | withholding-tax / insurance-agent-commission / classification-required | FY 2026/27; dates unverified | Insurance-agent commission withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-advertising-agent-commission-fy2026-27` | withholding-tax / advertising-agent-commission / classification-required | FY 2026/27; dates unverified | Advertising-agent commission withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-mobile-money-commission-fy2026-27` | withholding-tax / mobile-money-commission / classification-required | FY 2026/27; dates unverified | Mobile-money commission withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-vat-withholding-fy2026-27` | withholding-tax / vat-withholding / classification-required | FY 2026/27; dates unverified | VAT withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-nonresident-debenture-interest-fy2026-27` | withholding-tax / nonresident-debenture-interest / classification-required | FY 2026/27; dates unverified | Non-resident debenture interest withholding input | Not identified / not identified | Not established | pending-review / none |
| `ug-withholding-resident-supply-threshold-fy2026-27` | withholding-tax / resident-supply-threshold / payer | FY 2026/27; dates unverified | Resident supply threshold input | Not identified / not identified | Not established | pending-review / none |
| `ug-industrial-building-deduction-individual-fy2026-27` | income-tax / industrial-building-deduction / individual | FY 2026/27; dates unverified | Industrial building deduction input | Not identified / not identified | Not established | pending-review / none |
| `ug-capital-gains-individual-fy2026-27` | income-tax / capital-gains / individual | FY 2026/27; dates unverified | Individual capital gains computation input | Not identified / not identified | Not established | pending-review / none |
| `ug-industrial-building-deduction-company-fy2026-27` | income-tax / industrial-building-deduction / company | FY 2026/27; dates unverified | Company industrial building deduction input | Not identified / not identified | Not established | pending-review / none |
| `ug-capital-gains-company-fy2026-27` | income-tax / capital-gains / company | FY 2026/27; dates unverified | Company capital gains computation input | Not identified / not identified | Not established | pending-review / none |

## AI and unverified references

| Material | Status | Treatment |
|---|---|---|
| Verified legislation and verified rule mappings | None established | No listed computation rule is filing-approved. |
| Existing source references | Unverified references | Secondary summaries and reported administrative references are leads only, not official verification. Existing historical case references also require judgment-level review. |
| AI interpretation | Not legal authority | AI may summarize reviewed evidence but cannot establish a source, effective date, legal holding or rule status. |

Secondary summaries and historical case references remain unverified until matched to primary official records and reviewed. Keep filing approval false for all listed rules until each entry has a complete evidence trail and qualified approval.
