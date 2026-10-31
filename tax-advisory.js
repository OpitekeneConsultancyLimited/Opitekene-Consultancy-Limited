(function (root, factory) {
  const advisory = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = advisory;
  } else {
    root.ugandaTaxAdvisory = advisory;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const sources = {
    ura: {
      label: "Uganda Revenue Authority (official)",
      url: "https://www.ura.go.ug/",
    },
    individual: {
      label: "PwC Uganda individual income tax (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/individual/taxes-on-personal-income",
    },
    corporate: {
      label: "PwC Uganda corporate income tax (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/taxes-on-corporate-income",
    },
    vat: {
      label: "PwC Uganda VAT and other taxes (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/other-taxes",
    },
    withholding: {
      label: "PwC Uganda withholding taxes (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/withholding-taxes",
    },
    eac: {
      label: "East African Community Common External Tariff resources",
      url: "https://www.eac.int/documents/category/eac-common-external-tariff",
    },
    singleWindow: {
      label: "URA Electronic Single Window",
      url: "https://singlewindow.go.ug/stp/#/",
    },
    uliiJudgments: {
      label: "Uganda Legal Information Institute (ULII) judgments",
      url: "https://ulii.org/en/judgments/",
    },
  };

  const taxCases = [
    {
      id: "quickway-property-services-ura-2023",
      topic: "Input VAT",
      court: "Tax Appeals Tribunal (Uganda)",
      name: "Quickway Property Services Limited v Uganda Revenue Authority",
      citation: "Application No. TAT 105 of 2021 · [2023] UGTAT 2",
      date: "21 February 2023",
      keywords: [
        "input VAT input tax payments evidence invoices proof claim disallowance burden",
      ],
      issue: "Whether Quickway established the input VAT payments it claimed in its tax dispute.",
      summary: "ULII's published case summary says the applicant failed to prove the input VAT payments. The Tribunal upheld URA's disallowance and dismissed the application with costs.",
      significance: "The decision is a reminder to retain and present adequate evidence for disputed input VAT claims. Its result turns on the record in that case; it does not mean every input VAT claim without a particular document automatically fails.",
      sourceUrl: "https://ulii.org/en/akn/ug/judgment/ugtat/2023/2/eng@2023-02-21",
    },
    {
      id: "multiple-icd-ura-2026",
      topic: "VAT",
      court: "Court of Appeal of Uganda",
      name: "Multiple ICD Limited v Uganda Revenue Authority",
      citation: "Civil Application No. 1062 of 2026 · [2026] UGCA 329",
      date: "28 October 2026",
      keywords: [
        "vat lease time of supply moratorium assessment recovery stay appeal security section 14",
      ],
      issue: "The ULII case listing identifies the dispute as concerning the time of supply under a lease, the effect of a contractual moratorium, and section 14 of the Value Added Tax Act.",
      summary: "According to ULII's published case summary, the Court of Appeal stayed recovery of the VAT assessment pending appeal. It found an arguable statutory issue and noted that adequate security had been paid.",
      significance: "This was an interim stay application. The published summary does not establish that the Court finally decided the VAT time-of-supply question or the taxpayer's ultimate liability.",
      sourceUrl: "https://ulii.org/en/akn/ug/judgment/ugca/2026/329/eng@2026-10-28",
    },
  ];

  const guidance = [
    {
      id: "individual-residence",
      topic: "individual",
      title: "Which income is in scope for a resident or non-resident individual?",
      keywords: ["residency resident nonresident non-resident foreign source worldwide income"],
      summary: "The general distinction is that a resident person is assessed on income from all geographical sources, while a non-resident person is generally assessed on Uganda-source income. Residence and source are legal tests; do not decide them from citizenship or a mailing address alone.",
      nextStep: "Establish tax residence, source, income type, treaty position and any exemption before applying the individual calculator.",
      sourceKeys: ["individual", "ura"],
      calculator: "individual",
    },
    {
      id: "individual-bands",
      topic: "individual",
      title: "How is individual income tax calculated?",
      keywords: ["individual personal income chargeable bands resident nonresident threshold rates"],
      summary: "The calculator applies progressive FY 2026/27 bands to chargeable income and distinguishes resident and non-resident individuals. The amount you enter should already reflect the correct income classification and only deductions you have established are allowable.",
      nextStep: "Review the band breakdown and confirm deductions, exemptions, reliefs, foreign income and treaty treatment against the current law.",
      sourceKeys: ["individual", "ura"],
      calculator: "individual",
    },
    {
      id: "employment-benefits",
      topic: "employment",
      title: "Which employment benefits can affect PAYE?",
      keywords: ["paye salary cash remuneration benefit allowance medical school fees house housing motor vehicle loan gifts spouse dependents gratuity overtime bonus terminal termination share scheme"],
      summary: "Employment income can include salary, allowances and the taxable value of benefits such as housing, a vehicle, a low-interest loan, school fees, domestic assistance and certain reimbursements or termination-related amounts. Statutory exceptions and valuation rules can apply. The PAYE tool asks for amounts you have assessed; it does not value benefits or decide that an item is taxable.",
      nextStep: "Use the benefit valuation rules and evidence for the relevant year. Keep payroll records and do not include an amount twice.",
      sourceKeys: ["individual", "ura"],
      calculator: "paye",
    },
    {
      id: "company-income",
      topic: "business",
      title: "How do I move from accounting profit to company chargeable income?",
      keywords: ["company corporate profit loss tax reconciliation addbacks disallowable deductions depreciation capital allowance assessed losses"],
      summary: "Start from accounting profit or loss, add back confirmed non-deductible amounts, remove exempt income included in profit where the law permits, and subtract confirmed allowable deductions and eligible loss relief. The calculator displays this reconciliation and applies the standard 30% company rate to positive chargeable income; special regimes and taxpayer-specific rules can change the result.",
      nextStep: "Use a tax reconciliation supported by accounts, schedules and records. Avoid duplicating adjustments in both itemized fields and grouped totals.",
      sourceKeys: ["corporate", "ura"],
      calculator: "company",
    },
    {
      id: "capital-allowances",
      topic: "business",
      title: "Can I use book depreciation as a tax deduction?",
      keywords: ["capital allowance depreciation wear tear industrial building tax asset class rate pool"],
      summary: "Book depreciation and tax capital allowances are not automatically the same. Tax relief depends on qualifying cost, asset class, allowance method, timing, disposals and applicable restrictions. The site's rate-based tool is arithmetic only; it does not classify assets or generate an asset-pool schedule.",
      nextStep: "Prepare or obtain an asset-by-asset tax schedule and transfer only the supported allowance into the company reconciliation.",
      sourceKeys: ["corporate", "ura"],
      calculator: "capital-allowances",
    },
    {
      id: "rental-individual",
      topic: "rental",
      title: "How is rental income taxed for a resident individual?",
      keywords: ["rental rent landlord individual resident gross threshold expenses deductions monthly filing"],
      summary: "The current individual rental estimate applies 12% to annual gross rental income above UGX 2,820,000 and does not deduct rental expenses. Monthly filing and payment requirements are represented as applying from 1 July 2026; this annual tool does not calculate monthly instalments.",
      nextStep: "Check whether the person meets the residence and rental rules, reconcile gross rent, and confirm monthly filing obligations with URA.",
      sourceKeys: ["individual", "ura"],
      calculator: "rental",
    },
    {
      id: "rental-company",
      topic: "rental",
      title: "Can a resident company deduct rental-property expenses?",
      keywords: ["rental rent landlord company resident expenses deductions losses chargeable"],
      summary: "A resident company is generally assessed under the company income-tax rules, not the resident individual's special rental formula. The rental estimate applies the standard 30% rate after user-entered allowable expenses and eligible losses. It does not determine whether an expense is deductible or whether losses may be used.",
      nextStep: "Confirm the business purpose, supporting evidence, expense allocation, loss availability and any special property rules. Do not double count rental income or expenses in the company calculator.",
      sourceKeys: ["corporate", "ura"],
      calculator: "rental",
    },
    {
      id: "rental-nonresident",
      topic: "rental",
      title: "What if the landlord is a non-resident?",
      keywords: ["nonresident non-resident landlord rent rental withholding source gross 15 treaty section 83"],
      summary: "The standard domestic rule summarized for Uganda-source rent paid to a non-resident is 15% withholding on gross rent. The site estimates that gross-basis amount for both individual and company landlords; it does not calculate treaty relief, decide final-tax treatment in a specific case, or establish all filing duties.",
      nextStep: "Confirm the withholding agent, beneficial ownership, treaty eligibility, documentation and any filing obligation with URA or a qualified adviser.",
      sourceKeys: ["withholding", "ura"],
      calculator: "rental",
    },
    {
      id: "vat-threshold",
      topic: "vat",
      title: "When might VAT registration be required?",
      keywords: ["vat threshold registration annual quarterly 300 million 75 million taxable supplies remote electronic services"],
      summary: "The FY 2026/27 guide represents standard registration thresholds of UGX 300 million in annual taxable supplies or more than UGX 75 million in a three-month period. Special rules, including some remote-service cases, may apply independently. Meeting a threshold is a prompt to confirm registration with URA, not a registration decision by this site.",
      nextStep: "Review taxable supplies and the relevant periods, exemptions and special registration rules with URA.",
      sourceKeys: ["vat", "ura"],
      calculator: "vat",
    },
    {
      id: "vat-input-credits",
      topic: "vat",
      title: "Can I claim input VAT?",
      keywords: ["vat input credit claim efris invoice receipt exempt supplies six months"],
      summary: "Input VAT recovery depends on the purchase's business use, valid EFRIS evidence, timing, exempt-supply restrictions and other statutory conditions. The calculator applies only a simplified exempt-supply restriction and does not approve a claim.",
      nextStep: "Check each invoice, business purpose, claim period and restriction before filing a VAT return.",
      sourceKeys: ["vat", "ura"],
      calculator: "vat",
    },
    {
      id: "vat-changes",
      topic: "vat",
      title: "What VAT changes are represented for FY 2026/27?",
      keywords: ["2026 amendment amendments vat changes efris withholding exemption nuclear energy threshold"],
      summary: "The guide reflects the FY 2026/27 VAT registration thresholds, EFRIS-related conditions for VAT withholding and input-credit evidence, and a targeted exemption for specified supplies to nuclear-energy contractors and subcontractors. Those targeted conditions are narrow; do not classify a supply as exempt based only on a sector label.",
      nextStep: "Check the transaction against the amended VAT law and current URA guidance before applying a rate or exemption.",
      sourceKeys: ["vat", "ura"],
      calculator: "vat",
    },
    {
      id: "withholding-changes",
      topic: "withholding",
      title: "Which new withholding rules are represented from 1 July 2026?",
      keywords: ["withholding wht tax 2026 changes amendment entertainer betting gaming insurance agent debenture interest"],
      summary: "The current guide represents a 6% withholding category for resident public entertainers, 15% on betting or gaming winnings, final-tax treatment for specified 10% insurance-agent commission withholding, and a conditional 5% rate for qualifying non-resident debenture interest. Conditions and exceptions matter; these are not universal rates for all payments in those sectors.",
      nextStep: "Verify payer, recipient, payment type, statutory conditions, treaty position and whether withholding is creditable or final.",
      sourceKeys: ["withholding", "ura"],
      calculator: "withholding",
    },
    {
      id: "wht-rent",
      topic: "withholding",
      title: "Does rent paid to a non-resident have withholding tax?",
      keywords: ["withholding rent nonresident landlord section 83 15% gross property"],
      summary: "A resident payer of Uganda-source rent to a non-resident landlord may have a withholding obligation. The standard domestic rate summarized is 15% of gross rent; treaty relief or other facts may affect the outcome.",
      nextStep: "Confirm the payer's withholding-agent status, treaty documents, payment date and reporting duties. The rental estimate is not a withholding return.",
      sourceKeys: ["withholding", "ura"],
      calculator: "rental",
    },
    {
      id: "presumptive",
      topic: "business",
      title: "Can a small business use presumptive tax?",
      keywords: ["presumptive small business turnover 150 million resident threshold schedule eligibility professional services"],
      summary: "The guide represents the general resident small-business turnover ceiling of UGX 150 million, subject to eligibility and exclusions. Presumptive tax uses statutory schedules; the calculator applies only the rate you enter and does not select the schedule or decide eligibility.",
      nextStep: "Confirm business activity, turnover, accounting records, exclusions and the applicable URA schedule before relying on an estimate.",
      sourceKeys: ["corporate", "ura"],
      calculator: "presumptive",
    },
    {
      id: "customs-import",
      topic: "customs",
      title: "What taxes may apply when importing goods into Uganda?",
      keywords: ["import customs goods duty excise vat withholding hs code origin tariff customs value eac"],
      summary: "Depending on the goods and facts, an import estimate may include customs duty, excise, import VAT, withholding and other assessed charges. Rates and tax bases depend on correct tariff classification, customs value, origin, exemptions and current EAC/URA treatment. TaxComp does not classify products or look up a tariff rate.",
      nextStep: "Use the official customs assessment or confirm HS code, origin and applicable charges with URA or a licensed customs agent.",
      sourceKeys: ["singleWindow", "eac", "ura"],
      calculator: "customs",
    },
    {
      id: "customs-export",
      topic: "customs",
      title: "What should I check before exporting goods?",
      keywords: ["export goods customs levy excise vat zero rated evidence origin destination"],
      summary: "Export treatment depends on the product, destination, evidence and current tariff. Zero-rated export VAT requires qualifying facts and evidence; export duties or levies apply only to specified goods. The calculator uses rates and charges you provide.",
      nextStep: "Confirm HS classification, origin, export documentation, levy and VAT treatment with URA or a licensed customs agent.",
      sourceKeys: ["singleWindow", "eac", "ura"],
      calculator: "customs",
    },
    {
      id: "filing-due-dates",
      topic: "individual",
      title: "Where can I confirm a tax filing deadline or respond to a URA notice?",
      keywords: ["deadline due date filing return payment penalty objection notice audit dispute appeal"],
      summary: "Deadlines and response periods depend on the tax type, taxpayer, return period, notice and current procedure rules. This guide deliberately does not guess due dates, penalty amounts or objection periods.",
      nextStep: "Read the notice and verify its issue date and response deadline immediately. Contact URA or a qualified tax professional promptly; keep the notice, returns, receipts and supporting records.",
      sourceKeys: ["ura"],
      calculator: null,
    },
  ];

  function searchGuidance(query = "", topic = "all") {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return guidance.filter((item) => {
      if (topic !== "all" && item.topic !== topic) return false;
      if (terms.length === 0) return true;

      const searchable = [
        item.title,
        item.keywords,
        item.summary,
        item.nextStep,
        item.topic,
      ].join(" ").toLowerCase();

      return terms.every((term) => searchable.includes(term));
    });
  }

  function getSources(sourceKeys) {
    return sourceKeys.map((key) => sources[key]);
  }

  function searchTaxCases(query = "", topic = "all") {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return taxCases.filter((item) => {
      if (topic !== "all" && item.topic.toLowerCase() !== topic.toLowerCase()) return false;
      if (terms.length === 0) return true;

      const searchable = [
        item.name,
        item.citation,
        item.topic,
        item.keywords,
        item.issue,
        item.summary,
        item.significance,
      ].join(" ").toLowerCase();

      return terms.every((term) => searchable.includes(term));
    });
  }

  return {
    reviewedOn: "31 October 2026",
    guidance,
    getSources,
    searchGuidance,
    searchTaxCases,
    taxCases,
  };
});
