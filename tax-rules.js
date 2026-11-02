(function (root, factory) {
  const rules = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = rules;
  } else {
    root.ugandaTaxRules = rules;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const currentFinancialYear = "2026/27";
  const financialYears = {
    "2026/27": {
      id: "UG-FY2026-27-v1",
      financialYear: "2026/27",
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      currency: "UGX",
      approvalStatus: "pending-primary-source-verification",
      approvedForFiling: false,
      individualIncomeTax: {
        sources: [
          {
            label: "TaxComp FY 2026/27 rule notes",
            url: "./tax-law-notes.md#rules-represented-in-the-calculators",
            sourceType: "curated-secondary-summary",
          },
          {
            label: "PwC Uganda individual income tax summary",
            url: "https://taxsummaries.pwc.com/uganda/individual/taxes-on-personal-income",
            sourceType: "secondary-summary",
          },
        ],
        residentBands: [
          { label: "UGX 0 – 4,020,000", lower: 0, upper: 4_020_000, rate: 0 },
          { label: "UGX 4,020,001 – 4,920,000", lower: 4_020_000, upper: 4_920_000, rate: 0.2 },
          { label: "UGX 4,920,001 – 5,820,000", lower: 4_920_000, upper: 5_820_000, rate: 0.25 },
          { label: "UGX 5,820,001 – 120,000,000", lower: 5_820_000, upper: 120_000_000, rate: 0.3 },
          { label: "Above UGX 120,000,000", lower: 120_000_000, upper: Infinity, rate: 0.4 },
        ],
        nonResidentBands: [
          { label: "UGX 0 – 4,020,000", lower: 0, upper: 4_020_000, rate: 0.1 },
          { label: "UGX 4,020,001 – 4,920,000", lower: 4_020_000, upper: 4_920_000, rate: 0.2 },
          { label: "UGX 4,920,001 – 120,000,000", lower: 4_920_000, upper: 120_000_000, rate: 0.3 },
          { label: "Above UGX 120,000,000", lower: 120_000_000, upper: Infinity, rate: 0.4 },
        ],
      },
      companyIncomeTax: {
        sources: [
          {
            label: "TaxComp FY 2026/27 rule notes",
            url: "./tax-law-notes.md#rules-represented-in-the-calculators",
            sourceType: "curated-secondary-summary",
          },
          {
            label: "PwC Uganda corporate income tax summary",
            url: "https://taxsummaries.pwc.com/uganda/corporate/taxes-on-corporate-income",
            sourceType: "secondary-summary",
          },
        ],
        standardResidentRate: 0.3,
      },
      capitalAllowances: {
        wearAndTearSources: [
          {
            label: "TaxComp FY 2026/27 rule notes",
            url: "./tax-law-notes.md#rules-represented-in-the-calculators",
            sourceType: "curated-secondary-summary",
          },
          {
            label: "PwC Uganda corporate deductions summary",
            url: "https://taxsummaries.pwc.com/uganda/corporate/deductions",
            sourceType: "secondary-summary",
          },
        ],
        wearAndTearClasses: [
          {
            id: "class-1",
            label: "Class 1 — computers and data-handling equipment",
            rate: 0.4,
          },
          {
            id: "class-2",
            label: "Class 2 — plant and machinery used in farming, manufacturing or mining",
            rate: 0.3,
          },
          {
            id: "class-3",
            label: "Class 3 — vehicles, other specified equipment and assets not in Classes 1 or 2",
            rate: 0.2,
          },
        ],
      },
    },
  };

  function deepFreeze(value) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      if (child && typeof child === "object" && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
    return value;
  }

  deepFreeze(financialYears);

  function getRulesForFinancialYear(financialYear) {
    if (!Object.hasOwn(financialYears, financialYear)) {
      throw new RangeError(`No configured Uganda tax rules for FY ${financialYear}.`);
    }
    const rules = financialYears[financialYear];
    return rules;
  }

  return Object.freeze({
    currentFinancialYear,
    getRulesForFinancialYear,
  });
});
