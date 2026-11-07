(function (root, factory) {
  const rules = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = rules;
  } else {
    root.ugandaTaxRules = rules;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const currentFinancialYear = "2026/27";
  const ruleStatuses = Object.freeze([
    "verified",
    "pending-review",
    "superseded",
    "withdrawn",
  ]);
  const sourceHierarchy = Object.freeze([
    Object.freeze({ type: "uganda-legislation", priority: 1 }),
    Object.freeze({ type: "uganda-gazette", priority: 2 }),
    Object.freeze({ type: "ura-publication", priority: 3 }),
    Object.freeze({ type: "official-judicial-decision", priority: 4 }),
  ]);
  const financialYears = {
    "2026/27": {
      id: "UG-FY2026-27-v1",
      financialYear: "2026/27",
      effectiveFrom: "2026-07-01",
      effectiveTo: "2027-06-30",
      currency: "UGX",
      approvalStatus: "pending-primary-source-verification",
      approvedForFiling: false,
      ruleStatus: "pending-review",
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
          {
            label: "URA clarification on multiple employers (reported by Uganda Radio Network)",
            url: "https://ugandaradionetwork.com/s/ura-clarifies-paye-rules-for-employees-with-multiple-employers/",
            sourceType: "secondary-report-of-official-clarification",
          },
        ],
        secondaryEmploymentWithholdingRate: 0.4,
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
      valueAddedTax: {
        standardRate: 0.18,
        annualRegistrationThreshold: 300_000_000,
        threeMonthRegistrationThreshold: 75_000_000,
        fullInputVatRecoveryExemptShareThreshold: 0.05,
        noInputVatRecoveryExemptShareThreshold: 0.95,
      },
      payrollContributions: {
        employeeNssfRate: 0.05,
        employerNssfRate: 0.1,
      },
      rentalIncomeTax: {
        individualRate: 0.12,
        individualThreshold: 2_820_000,
        nonresidentGrossRate: 0.15,
      },
      presumptiveTax: {
        maximumTurnover: 150_000_000,
      },
      withholdingTax: {
        residentSupplyThreshold: 1_000_000,
        categories: {
          "resident-supply": { label: "Resident supply / contract payment", rate: 0.06 },
          "resident-dividend": { label: "Resident dividend", rate: 0.15 },
          "listed-dividend": { label: "Listed company dividend to individual", rate: 0.1 },
          "resident-interest": { label: "Resident interest", rate: 0.15 },
          "government-interest": { label: "Government securities interest, under 10 years", rate: 0.2 },
          "long-government-interest": { label: "Government securities interest, 10 years or more", rate: 0.1 },
          "related-company-dividend": { label: "Dividend to resident company holding at least 25% voting power", rate: 0 },
          "nonresident-payment": { label: "Non-resident dividend, interest, royalty, rent or management fee", rate: 0.15 },
          "nonresident-government-interest": { label: "Non-resident government securities interest, under 10 years", rate: 0.2 },
          "nonresident-long-government-interest": { label: "Non-resident government securities interest, 10 years or more", rate: 0.1 },
          "imported-goods": { label: "Import of goods withholding tax", rate: 0.06 },
          "nonresident-reinsurance": { label: "Non-resident reinsurance premium", rate: 0.1 },
          "nonresident-transport": { label: "Non-resident air, sea or road transport operator", rate: 0.02 },
          "nonresident-telecom": { label: "Non-resident telecommunications or direct-to-home TV income", rate: 0.05 },
          "resident-entertainer": { label: "Resident public entertainer payment", rate: 0.06 },
          "betting-winnings": { label: "Betting or gaming winnings", rate: 0.15 },
          "resident-telecom-commission": { label: "Telecommunications, mobile-network or mobile-money commission", rate: 0.1 },
          "payment-service-commission": { label: "Payment service provider commission", rate: 0.1 },
          "insurance-agent-commission": { label: "Insurance agent commission", rate: 0.1 },
          "advertising-agent-commission": { label: "Advertising agent commission", rate: 0.1 },
          "mobile-money-commission": { label: "Airtime distribution commission", rate: 0.1 },
          "vat-withholding": { label: "VAT withholding on taxable supply without e-invoice", rate: 0.06 },
          "nonresident-debenture-interest": { label: "Qualifying non-resident debenture interest", rate: 0.05 },
        },
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

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, cloneValue(child)]),
      );
    }
    return value;
  }

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function verificationGaps(rule) {
    const gaps = [];
    let officialUrlValid = false;
    try {
      const officialUrl = new URL(rule.officialSourceUrl);
      officialUrlValid = officialUrl.protocol === "https:" &&
        Boolean(officialUrl.hostname) && !officialUrl.username && !officialUrl.password;
    } catch {
      officialUrlValid = false;
    }
    if (!rule.legislation) gaps.push("legislation");
    if (!rule.provision) gaps.push("statutory provision");
    if (!rule.officialSourceType || !sourceHierarchy.some(({ type }) => type === rule.officialSourceType)) {
      gaps.push("official source type");
    }
    if (!officialUrlValid) {
      gaps.push("official source URL");
    }
    if (!isDate(rule.effectiveFrom) || !isDate(rule.effectiveTo) ||
        rule.effectiveTo < rule.effectiveFrom || rule.effectiveDatesVerified !== true) {
      gaps.push("verified effective dates");
    }
    if (!rule.calculationMethodology) gaps.push("calculation methodology");
    if (rule.value === null || rule.value === undefined) gaps.push("rule value or method");
    if (!rule.reviewer) gaps.push("reviewer");
    if (!isDate(rule.reviewDate)) gaps.push("review date");
    if (!isDate(rule.verifiedOn)) gaps.push("verification date");
    if (!rule.version) gaps.push("version");
    return gaps;
  }

  function createTaxRulesRegistry(records) {
    if (!Array.isArray(records)) {
      throw new TypeError("Tax rule records must be an array.");
    }

    const ids = new Set();
    const frozenRecords = records.map((record) => {
      const copy = cloneValue(record);
      const requiredFields = [
        "ruleId", "taxHead", "category", "taxpayerType", "jurisdiction",
        "status", "effectiveFrom", "effectiveTo", "version", "calculationMethodology",
        "legislation", "provision", "officialSourceType", "officialSourceUrl",
        "effectiveDatesVerified", "value", "reviewer", "reviewDate", "verifiedOn",
        "sourceReferences", "reviewHistory",
      ];
      if (requiredFields.some((field) => copy[field] === undefined || copy[field] === "")) {
        throw new TypeError("A tax rule record is missing a required registry field.");
      }
      if (!ruleStatuses.includes(copy.status)) {
        throw new RangeError(`Unsupported tax rule status: ${copy.status}`);
      }
      if (typeof copy.effectiveDatesVerified !== "boolean" ||
          !Array.isArray(copy.sourceReferences) || !Array.isArray(copy.reviewHistory)) {
        throw new TypeError(`Tax rule ${copy.ruleId} has invalid verification metadata.`);
      }
      if (!isDate(copy.effectiveFrom) ||
          (copy.effectiveTo !== null && !isDate(copy.effectiveTo)) ||
          (copy.effectiveTo !== null && copy.effectiveTo < copy.effectiveFrom)) {
        throw new RangeError(`Tax rule ${copy.ruleId} has invalid effective dates.`);
      }
      if (ids.has(copy.ruleId)) {
        throw new RangeError(`Duplicate tax rule ID: ${copy.ruleId}`);
      }
      ids.add(copy.ruleId);
      if (copy.status === "verified" && verificationGaps(copy).length > 0) {
        throw new RangeError(
          `Tax rule ${copy.ruleId} cannot be verified; missing ${verificationGaps(copy).join(", ")}.`,
        );
      }
      if (copy.status === "superseded" &&
          (!isDate(copy.verifiedOn) || !isDate(copy.supersededOn) || !copy.supersededBy)) {
        throw new RangeError(`Superseded tax rule ${copy.ruleId} needs verified history and a successor.`);
      }
      if (copy.status === "superseded" && verificationGaps(copy).length > 0) {
        throw new RangeError(
          `Superseded tax rule ${copy.ruleId} has incomplete verification metadata: ${verificationGaps(copy).join(", ")}.`,
        );
      }
      return deepFreeze(copy);
    });

    function resolveRuleForDate({
      taxHead,
      category,
      taxpayerType,
      jurisdiction = "UG",
      date,
    }) {
      if (!isDate(date)) throw new RangeError("A valid YYYY-MM-DD transaction date is required.");
      const candidates = frozenRecords.filter((rule) => (
        rule.taxHead === taxHead &&
        rule.category === category &&
        rule.taxpayerType === taxpayerType &&
        rule.jurisdiction === jurisdiction &&
        rule.effectiveFrom <= date &&
        (rule.effectiveTo === null || date <= rule.effectiveTo)
      ));

      if (candidates.length === 0) return Object.freeze({ status: "missing", rule: null });
      if (candidates.length > 1) {
        return Object.freeze({ status: "overlap", rule: null, candidates: Object.freeze(candidates) });
      }

      const [rule] = candidates;
      if (rule.status === "verified") {
        return Object.freeze({ status: "verified", rule, historical: false });
      }
      if (rule.status === "superseded") {
        return Object.freeze({ status: "superseded", rule, historical: true });
      }
      return Object.freeze({ status: rule.status, rule: null, candidate: rule });
    }

    function resolveRulesForPeriod({
      taxHead,
      category,
      taxpayerType,
      jurisdiction = "UG",
      periodStart,
      periodEnd,
    }) {
      if (!isDate(periodStart) || !isDate(periodEnd) || periodEnd < periodStart) {
        throw new RangeError("A valid tax period start and end date are required.");
      }

      const candidates = frozenRecords
        .filter((rule) => (
          rule.taxHead === taxHead &&
          rule.category === category &&
          rule.taxpayerType === taxpayerType &&
          rule.jurisdiction === jurisdiction &&
          rule.effectiveFrom <= periodEnd &&
          (rule.effectiveTo === null || rule.effectiveTo >= periodStart)
        ))
        .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

      if (candidates.length === 0) {
        return Object.freeze({ status: "missing", rules: Object.freeze([]) });
      }

      for (let index = 0; index < candidates.length - 1; index += 1) {
        const left = candidates[index];
        const right = candidates[index + 1];
        const overlapStart = [periodStart, left.effectiveFrom, right.effectiveFrom]
          .sort()
          .at(-1);
        const overlapEnd = [
          periodEnd,
          left.effectiveTo || periodEnd,
          right.effectiveTo || periodEnd,
        ].sort()[0];
        if (overlapStart <= overlapEnd) {
          return Object.freeze({
            status: "overlap",
            rules: Object.freeze([]),
            candidates: Object.freeze(candidates),
          });
        }
      }

      let nextRequiredDate = periodStart;
      const selectedRules = [];
      for (const rule of candidates) {
        if (rule.effectiveFrom > nextRequiredDate) break;
        if (rule.effectiveTo !== null && rule.effectiveTo < nextRequiredDate) continue;
        selectedRules.push(rule);
        if (rule.effectiveTo === null || rule.effectiveTo >= periodEnd) {
          nextRequiredDate = null;
          break;
        }
        const nextDate = new Date(`${rule.effectiveTo}T00:00:00.000Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        nextRequiredDate = nextDate.toISOString().slice(0, 10);
      }

      if (nextRequiredDate !== null) {
        return Object.freeze({
          status: "missing",
          rules: Object.freeze([]),
          candidates: Object.freeze(candidates),
        });
      }
      if (selectedRules.length > 1) {
        return Object.freeze({
          status: "rule-change-in-period",
          rules: Object.freeze(selectedRules),
        });
      }

      const [rule] = selectedRules;
      if (rule.status === "verified") {
        return Object.freeze({
          status: "verified",
          rule,
          rules: Object.freeze([rule]),
          historical: false,
        });
      }
      if (rule.status === "superseded") {
        return Object.freeze({
          status: "superseded",
          rule,
          rules: Object.freeze([rule]),
          historical: true,
        });
      }
      return Object.freeze({
        status: rule.status,
        rule: null,
        candidate: rule,
        rules: Object.freeze([]),
      });
    }

    function getApplicableRule(criteria) {
      const result = resolveRuleForDate(criteria);
      return Object.freeze({
        status: result.status,
        rule: result.status === "verified" ? result.rule : null,
      });
    }

    return Object.freeze({
      records: Object.freeze(frozenRecords),
      resolveRuleForDate,
      resolveRulesForPeriod,
      getApplicableRule,
    });
  }

  function createLegacyRuleRecords() {
    const rules = financialYears[currentFinancialYear];
    const records = [];
    const addRecord = (ruleId, taxHead, category, taxpayerType, value, methodology, sources = []) => {
      records.push({
        ruleId,
        ruleFamilyId: ruleId,
        taxHead,
        category,
        taxpayerType,
        jurisdiction: "UG",
        legislation: null,
        provision: null,
        officialSourceType: null,
        officialSourceUrl: null,
        effectiveFrom: rules.effectiveFrom,
        effectiveTo: rules.effectiveTo,
        effectiveDatesVerified: false,
        value,
        calculationMethodology: methodology,
        status: "pending-review",
        reviewer: null,
        reviewDate: null,
        verifiedOn: null,
        version: "legacy-UG-FY2026-27-v1",
        sourceReferences: sources,
        reviewHistory: [],
      });
    };

    addRecord(
      "ug-income-tax-individual-resident-fy2026-27",
      "income-tax", "individual-resident", "individual", rules.individualIncomeTax.residentBands,
      "Progressive annual bands applied to chargeable income; legal conditions require review.",
      rules.individualIncomeTax.sources,
    );
    addRecord(
      "ug-income-tax-individual-nonresident-fy2026-27",
      "income-tax", "individual-nonresident", "individual", rules.individualIncomeTax.nonResidentBands,
      "Progressive annual bands applied to chargeable income; legal conditions require review.",
      rules.individualIncomeTax.sources,
    );
    addRecord(
      "ug-paye-secondary-employment-fy2026-27",
      "pay-as-you-earn", "secondary-employment-withholding", "employee",
      rules.individualIncomeTax.secondaryEmploymentWithholdingRate,
      "Entered secondary employment taxable pay multiplied by the configured withholding rate.",
      rules.individualIncomeTax.sources,
    );
    addRecord(
      "ug-income-tax-company-resident-fy2026-27",
      "income-tax", "company-resident-standard", "company",
      rules.companyIncomeTax.standardResidentRate,
      "Chargeable company income multiplied by the configured resident-company rate.",
      rules.companyIncomeTax.sources,
    );
    for (const assetClass of rules.capitalAllowances.wearAndTearClasses) {
      addRecord(
        `ug-capital-allowance-${assetClass.id}-fy2026-27`,
        "income-tax", `wear-and-tear-${assetClass.id}`, "business-taxpayer", assetClass,
        "Reducing-balance allowance applied to the configured asset-class pool.",
        rules.capitalAllowances.wearAndTearSources,
      );
    }
    addRecord(
      "ug-vat-standard-rate-fy2026-27", "value-added-tax", "standard-rate", "taxable-person",
      rules.valueAddedTax.standardRate, "Output VAT computed as taxable value multiplied by the configured rate.",
    );
    addRecord(
      "ug-vat-registration-thresholds-fy2026-27", "value-added-tax", "registration-thresholds", "taxable-person",
      {
        annual: rules.valueAddedTax.annualRegistrationThreshold,
        threeMonth: rules.valueAddedTax.threeMonthRegistrationThreshold,
      }, "Compare entered taxable turnover with the configured annual and three-month thresholds.",
    );
    addRecord(
      "ug-vat-input-recovery-apportionment-fy2026-27", "value-added-tax", "input-recovery-apportionment", "taxable-person",
      {
        fullRecoveryExemptShareAtOrBelow: rules.valueAddedTax.fullInputVatRecoveryExemptShareThreshold,
        noRecoveryExemptShareAbove: rules.valueAddedTax.noInputVatRecoveryExemptShareThreshold,
      }, "Apply the legacy input VAT apportionment boundaries; legal method requires review.",
    );
    addRecord(
      "ug-nssf-employee-contribution-fy2026-27", "social-security-contribution", "employee-contribution", "employee",
      rules.payrollContributions.employeeNssfRate, "Multiply gross monthly earnings by the configured employee contribution rate.",
    );
    addRecord(
      "ug-nssf-employer-contribution-fy2026-27", "social-security-contribution", "employer-contribution", "employer",
      rules.payrollContributions.employerNssfRate, "Multiply gross monthly earnings by the configured employer contribution rate.",
    );
    addRecord(
      "ug-rental-income-individual-fy2026-27", "income-tax", "rental-individual", "individual",
      { rate: rules.rentalIncomeTax.individualRate, threshold: rules.rentalIncomeTax.individualThreshold },
      "Apply the configured rate to gross annual rent above the entered threshold.",
    );
    addRecord(
      "ug-rental-income-nonresident-fy2026-27", "withholding-tax", "rental-nonresident", "nonresident-landlord",
      rules.rentalIncomeTax.nonresidentGrossRate, "Apply the configured rate to gross Uganda-source rent.",
    );
    addRecord(
      "ug-presumptive-tax-turnover-limit-fy2026-27", "income-tax", "presumptive-turnover-limit", "resident-business",
      rules.presumptiveTax.maximumTurnover, "Reject this estimate above the configured turnover limit; the rate is user-entered.",
    );
    for (const [category, rule] of Object.entries(rules.withholdingTax.categories)) {
      addRecord(
        `ug-withholding-${category}-fy2026-27`, "withholding-tax", category,
        "classification-required", rule, "Entered gross payment multiplied by the category rate, subject to calculator conditions.",
      );
    }
    addRecord(
      "ug-withholding-resident-supply-threshold-fy2026-27", "withholding-tax", "resident-supply-threshold",
      "payer", rules.withholdingTax.residentSupplyThreshold,
      "Apply the threshold condition implemented by the legacy resident-supply calculator.",
    );
    for (const taxpayerType of ["individual", "company"]) {
      addRecord(
        `ug-industrial-building-deduction-${taxpayerType}-fy2026-27`,
        "income-tax", "industrial-building-deduction", taxpayerType, null,
        "No verified statutory qualification criteria, rate, or deduction method configured; legal review required.",
      );
      addRecord(
        `ug-capital-gains-${taxpayerType}-fy2026-27`,
        "income-tax", "capital-gains", taxpayerType, null,
        "No verified statutory asset treatment, rate, exemption, or computation method configured; legal review required.",
      );
    }
    return records;
  }

  const registry = createTaxRulesRegistry(createLegacyRuleRecords());

  function getRulesForFinancialYear(financialYear) {
    if (!Object.hasOwn(financialYears, financialYear)) {
      throw new RangeError(`No configured Uganda tax rules for FY ${financialYear}.`);
    }
    const rules = financialYears[financialYear];
    return rules;
  }

  function getLegacyEstimateRulesForFinancialYear(financialYear) {
    return getRulesForFinancialYear(financialYear);
  }

  function transitionRuleStatus(rule, decision) {
    const allowedTransitions = {
      "pending-review": ["verified", "withdrawn"],
      verified: ["superseded", "withdrawn"],
      superseded: [],
      withdrawn: [],
    };
    if (!rule || !decision || !allowedTransitions[rule.status]?.includes(decision.status)) {
      throw new RangeError("This tax rule status transition is not permitted.");
    }

    const next = cloneValue(rule);
    const reviewFields = [
      "legislation", "provision", "officialSourceType", "officialSourceUrl",
      "effectiveFrom", "effectiveTo", "effectiveDatesVerified", "value",
      "calculationMethodology", "reviewer", "reviewDate", "version",
      "supersededBy", "supersededOn", "withdrawnReason",
    ];
    for (const field of reviewFields) {
      if (decision[field] !== undefined) next[field] = cloneValue(decision[field]);
    }
    if (!next.reviewer || !isDate(next.reviewDate)) {
      throw new RangeError("A reviewer and valid review date are required for a rule decision.");
    }
    if (decision.status === "verified") {
      next.verifiedOn = next.reviewDate;
      const gaps = verificationGaps(next);
      if (gaps.length > 0) {
        throw new RangeError(`Tax rule ${rule.ruleId} cannot be verified; missing ${gaps.join(", ")}.`);
      }
    }
    if (decision.status === "superseded" &&
        (!next.supersededBy || !isDate(next.supersededOn) ||
         !isDate(next.effectiveTo) || next.effectiveTo >= next.supersededOn)) {
      throw new RangeError("A superseded rule needs a successor and non-overlapping effective dates.");
    }
    if (decision.status === "withdrawn" && !next.withdrawnReason) {
      throw new RangeError("A withdrawn rule needs a documented reason.");
    }

    next.status = decision.status;
    next.reviewHistory = [
      ...(next.reviewHistory || []),
      {
        fromStatus: rule.status,
        toStatus: decision.status,
        reviewer: next.reviewer,
        reviewDate: next.reviewDate,
        notes: decision.notes || "",
      },
    ];
    return deepFreeze(next);
  }

  const legalSourceRegistryApi = typeof require === "function" ? require("./legal-source-registry.js") : null;

  return Object.freeze({
    currentFinancialYear,
    ruleStatuses,
    sourceHierarchy,
    createTaxRulesRegistry,
    createLegalSourceRegistry: legalSourceRegistryApi ? legalSourceRegistryApi.createLegalSourceRegistry : null,
    legalSourceTypes: legalSourceRegistryApi ? legalSourceRegistryApi.allowedSourceTypes : null,
    registryRecords: registry.records,
    resolveRuleForDate: registry.resolveRuleForDate,
    resolveRulesForPeriod: registry.resolveRulesForPeriod,
    getApplicableRule: registry.getApplicableRule,
    transitionRuleStatus,
    getLegacyEstimateRulesForFinancialYear,
    getRulesForFinancialYear,
  });
});
