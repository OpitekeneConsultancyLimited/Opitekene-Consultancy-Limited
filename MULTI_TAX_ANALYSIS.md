# Multi-tax analysis prototype

The Multi-tax analysis workspace is an early, non-persistent prototype. It accepts one structured transaction, maps preliminary tax-head candidates, identifies missing facts and calls existing deterministic calculators only for supported VAT, PAYE, annual rental-income and withholding estimates.

## Data handling

- The transaction form, analysis and temporary register remain in page memory only. They are not written to local storage, sent to an API or saved to a database. Refreshing or closing the page clears them.
- Do not enter client names, TINs, account numbers, contract text or other confidential information.
- The temporary register is not an audit trail, approvals workflow or durable transaction register.

## Interpretation limits

- Structured facts drive the tax-head mapping; the free-text description is not searched or sent to AI.
- A potential tax head is not a conclusion that tax is payable. Missing facts are explicitly marked for review.
- The existing calculation functions are reused only when their required inputs are available. VAT, withholding, PAYE and rental estimates remain distinct; no aggregate net payable is calculated.
- Disposal treatment is not assigned a universal capital-gains rate. Stamp Duty, customs/import taxes, industrial-building deductions and general/company income-tax adjustments are flagged for further assessment rather than invented.
- The EFRIS status field is user-reported. The prototype does not call URA, create invoices, or verify submission or fiscalisation.
- Tax event dates, periods, responsible parties, legal provisions, exemptions, review and approval require human verification. No assessment can be approved in this prototype.
- Existing calculator outputs are supplied through the legacy FY rules adapter and remain pending review, not approved for filing. The strict date-based registry does not activate unverified rules.
- The corporate computation returns its tax schedule, rule provenance, assumptions, and missing information separately. Simulation mode is provisional; filing mode requires verified rules for the entire period. The multi-tax analyser remains an independent preliminary screen and does not combine these liabilities.
- Capital-allowance schedules expose asset class, rule status, and pool workings; they do not infer a class or calculate initial allowances/balancing adjustments. The analyser remains a separate preliminary workflow.

## Verification

Run the focused assessment tests with:

```powershell
node --test multi-tax-analysis.test.js
```

The deployment workflow also runs these tests alongside the existing tax, Worker, EFRIS and app-installation suites.
