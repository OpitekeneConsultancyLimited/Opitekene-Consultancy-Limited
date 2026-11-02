# Uganda tax estimator: FY 2026/27

The site uses the Uganda year of income from 1 July 2026 through 30 June 2027.
It is a planning estimator and source-linked educational guide, not a
return-preparation, legal opinion or personalized tax-advice service. The
curated advisory guidance was reviewed on 31 October 2026. It is not connected
to a live legislation feed and will not automatically detect new laws,
amendments, regulations, URA practice or court decisions. Verify the effective
law and official URA guidance for the relevant transaction and period.
Court-case notes are a separate, manually curated collection based on public
case records. They are not updated automatically and may omit later appeals or
subsequent legal developments; read the full judgment and confirm its current
status before relying on it.

The individual income-tax/PAYE bands, standard resident company income-tax
rate, and wear-and-tear classes are loaded from the versioned
`UG-FY2026-27-v1` registry in `tax-rules.js`. They are pending verification
against primary legislation and are not approved for filing. Other tax rates
and thresholds elsewhere in the estimator are not yet part of this registry.
When a question names a financial year, chat uses only notes explicitly
covering that same year. No historical-year legal archive is currently
maintained, so an unmatched year requires further verification instead of
reusing current-year guidance.

## Rules represented in the calculators

- **Individual income tax and PAYE:** Resident annual bands are UGX 0–4,020,000
  at 0%, UGX 4,020,001–4,920,000 at 20%, UGX 4,920,001–5,820,000 at 25%,
  UGX 5,820,001–120,000,000 at 30%, and income above UGX 120,000,000 at 40%.
  Non-resident individual bands are different and can be selected. PAYE
  annualizes monthly taxable pay; for residents, UGX 335,000 per month is the
  zero-rate threshold. PAYE itemizes user-entered monthly salary and
  employment-pay/benefit categories, including allowances, housing, motor
  vehicle and loan benefits, reimbursements, share-scheme amounts, gifts and
  termination-related income. The user must establish each taxable value and
  whether the item is taxable. The estimate does not value benefits, determine
  exemptions, or calculate the special treatment that may apply to lump sums,
  share schemes or termination payments. Examples of possible exclusions are
  shown as reminders only; verify their statutory conditions before excluding
  anything. Employee and employer NSSF are shown separately from income tax.
- **Chargeable-income worksheet:** For individuals, the estimator subtracts
  user-entered deductions from annual assessable income. For companies, it
  starts with accounting profit, adds user-entered non-deductible expenses,
  then subtracts further allowable deductions. The arithmetic is shown in the
  result; the site does not decide whether a particular item is taxable,
  exempt, deductible, or subject to a capital-allowance or loss-relief rule.
  Do not enter adjustments already reflected in accounting profit, and verify
  each tax treatment against the applicable law and records.
- **Company income tax:** The standard resident company rate is 30% of
  chargeable income. The company reconciliation supports itemized
  user-confirmed additions and deductions, exempt income included in accounts,
  capital allowances, carried-forward losses, provisional-tax instalments,
  and entered creditable withholding tax. A current-year accounting/tax loss
  is displayed separately and is not automatically recognized as an assessed
  loss or carried forward. The user must confirm the treatment of every
  adjustment; the estimator does not validate deductibility, asset classes,
  loss restrictions, WHT certificates or creditability. The item list is an
  organizing workpaper based on the categories supplied for the site, not a
  statement that every listed expense is always disallowed or deductible.
  Some entries are specialized or conditional and should be left at zero
  unless supported by the taxpayer's records and current law. Targeted
  exemptions, incentives and presumptive treatment are not applied by this
  calculator.
- **Wear-and-tear allowances:** The calculator applies the reducing-balance
  method using the three asset classes and rates summarized for Uganda:
  Class 1, computers and data-handling equipment, 40%; Class 2, plant and
  machinery used in farming, manufacturing or mining, 30%; and Class 3, 20%,
  covering automobiles, buses/minibuses, construction and earth-moving
  equipment, specialised trucks/tractors/trailers, rail equipment, vessels,
  aircraft, specialised public-utility equipment, office furniture/fixtures/
  equipment, and other depreciable assets not included in another class. The
  pool calculation starts with opening tax written-down value, adds the
  business-use share of qualifying additions, subtracts the entered
  business-use share of disposal proceeds, and applies the class rate to the
  resulting pool balance. Opening values must already reflect prior tax
  adjustments. The tool flags but does not calculate balancing charges or
  allowances when proceeds exceed the pool balance. It does not determine
  asset eligibility, minor-asset expensing or special restrictions. The
  separate industrial-building allowance is not calculated here; confirm its
  qualifying conditions and 5% straight-line rate separately. The rates and
  method are summarized by [PwC Uganda](https://taxsummaries.pwc.com/uganda/corporate/deductions);
  verify the current Income Tax Act and URA guidance before filing.
- **VAT:** Standard-rated supplies use 18%; zero-rated supplies use 0%. The
  estimate subtracts input VAT after restricting recovery based on the exempt
  supply share. Actual credit eligibility depends on the law, EFRIS evidence,
  timing and business use. The 2026 amendments add an exemption for specified
  supplies to nuclear-energy contractors and subcontractors. The registration check uses the FY 2026/27
  UGX 300,000,000 annual and UGX 75,000,000 three-month thresholds, and includes
  a remote-services flag.
- **Rental income:** For a resident individual landlord, the estimate applies
  12% to annual gross rental income above UGX 2,820,000, without expense
  deductions. Resident company rental income is estimated at the standard 30%
  company rate on rental profit after user-entered allowable expenses and
  eligible carried-forward losses. For either an individual or company
  non-resident landlord, the worksheet instead estimates domestic withholding
  at 15% of gross rent from Uganda property, without expense deductions.
  Treaty relief and the withholding/final-tax and filing treatment depend on
  specific facts and must be confirmed; the tool does not calculate treaty
  rates or decide whether withholding is final. Individual rental
  filing/payment may be monthly from 1 July 2026; this annual estimate does
  not calculate monthly instalments. Avoid double counting rental income,
  expenses, losses or credits in the separate company computation.
- **Withholding tax:** The category list provides common domestic, cross-border
  and FY 2026/27 payment categories. Treaty benefits, exemptions, recipient
  status, final-tax treatment and special eligibility conditions can change a
  rate. The 5% non-resident debenture rate is conditional on the statutory
  criteria. The 6% resident public entertainer and 15% betting/gaming
  withholding categories apply from 1 July 2026. VAT withholding is only
  estimated for a designated agent where the supplier has not issued an EFRIS
  e-invoice or e-receipt.
- **International tax:** The site provides an issue checklist for residence
  and source, treaties and double-tax relief, non-resident withholding,
  permanent establishment, transfer pricing, foreign tax credits,
  cross-border employment, VAT on imported or digital services, customs and
  EAC trade, BEPS screening, foreign exchange, records and disputes. It does
  not maintain a verified treaty-rate matrix or determine treaty eligibility,
  a permanent establishment, transfer-pricing compliance, foreign-tax-credit
  entitlement or obligations outside Uganda. The workbench provides
  arithmetic scenarios for entered withholding rates, foreign-tax-credit
  ceilings, currency conversion, related-party price comparison, workday
  allocation, imported-service VAT and profit attribution. Rates, caps,
  comparable prices, exchange rates, day-count methods and allocations must
  be independently verified. The scenarios do not establish tax liability or
  legal entitlement and are not substitutes for country-specific advice.
- **Presumptive tax:** The estimate applies a rate entered by the user to
  turnover. It does not choose the statutory schedule, determine eligibility,
  or handle exclusions and record-keeping rules. The general small-business
  turnover ceiling represented is UGX 150,000,000.
- **Imports and exports:** The customs estimator calculates an indicative
  import duty from user-entered customs value and duty rate, import VAT on
  customs value plus entered duty and excise, and user-entered import
  withholding and other charges. For exports, it calculates the selected VAT
  treatment, entered export levy rate and other charges. It does not classify
  goods by HS code, retrieve tariff rates, determine preferential origin, or
  establish exemptions or zero-rating eligibility. Confirm the classification,
  rate, customs value and charges using the URA customs assessment, current
  EAC tariff, or a licensed customs agent. Import VAT may be recoverable by an
  eligible registered business; this estimate shows cash charges and does not
  subtract a later input-tax credit.
- **Accountant workpapers:** The company tax breakdown is a current-tax
  reconciliation, not a financial-reporting deferred-tax computation. Tax
  provision, deferred tax, transfer pricing, thin-capitalisation/interest
  restrictions, group relief and specialist incentive regimes require
  additional facts and are not calculated.

## Other obligations surfaced

Stamp duty depends on the instrument or transaction; Local Service Tax depends
on local-authority schedules. NSSF is a social-security contribution, not a tax.

## Uganda tax case summaries

- **Quickway Property Services Limited v Uganda Revenue Authority**,
  Application No. TAT 105 of 2021, [2023] UGTAT 2 (21 February 2023). ULII's
  published summary reports that the applicant failed to prove the input VAT
  payments it claimed; the Tribunal upheld URA's disallowance and dismissed
  the application with costs. This is a case-specific summary, not a blanket
  rule that any particular missing document automatically defeats an input
  VAT claim.
- **Multiple ICD Limited v Uganda Revenue Authority**, Civil Application No.
1062 of 2026, [2026] UGCA 329 (28 October 2026). ULII's published case
summary says the Court of Appeal stayed recovery of a VAT assessment pending
appeal, identifying an arguable statutory issue and adequate security paid.
The listed issue concerns time of supply under a lease, a contractual
moratorium and section 14 of the VAT Act. This was an interim stay
application, not a final decision of the VAT merits. The site summary is
based on ULII's public case listing; consult the full judgment for the
court's reasons and any subsequent appeal.

## References

Tax rates and changes should be checked against the applicable Acts and Uganda
Revenue Authority guidance before use. The advisory search contains curated
topic notes and does not generate an answer when a question is outside those
notes. Official URA material should be preferred; the PwC summaries below are
secondary references, not legislation.

- [Uganda Revenue Authority](https://www.ura.go.ug/)
- [Uganda Legal Information Institute judgments](https://ulii.org/en/judgments/)
- [Uganda Tax Appeals Tribunal decisions on ULII](https://ulii.org/en/judgments/UGTAT/)
- [Quickway Property Services Limited v Uganda Revenue Authority, [2023] UGTAT 2](https://ulii.org/en/akn/ug/judgment/ugtat/2023/2/eng@2023-02-21)
- [Multiple ICD Limited v Uganda Revenue Authority, [2026] UGCA 329](https://ulii.org/en/akn/ug/judgment/ugca/2026/329/eng@2026-10-28)
- [URA Electronic Single Window](https://singlewindow.go.ug/stp/#/)
- [East African Community Common External Tariff resources](https://www.eac.int/documents/category/eac-common-external-tariff)
- [PwC Uganda individual income and rental tax](https://taxsummaries.pwc.com/uganda/individual/taxes-on-personal-income)
- [PwC Uganda corporate income tax](https://taxsummaries.pwc.com/uganda/corporate/taxes-on-corporate-income)
- [PwC Uganda other taxes and VAT](https://taxsummaries.pwc.com/uganda/corporate/other-taxes)
- [PwC Uganda withholding taxes, including non-resident rent](https://taxsummaries.pwc.com/uganda/corporate/withholding-taxes)
- [PwC Uganda individual other taxes](https://taxsummaries.pwc.com/uganda/individual/other-taxes)
- [OECD Transfer Pricing Guidelines](https://www.oecd.org/tax/transfer-pricing/oecd-transfer-pricing-guidelines-for-multinational-enterprises-and-tax-administrations-20769717.htm)
- [OECD Base Erosion and Profit Shifting (BEPS)](https://www.oecd.org/tax/beps/)
