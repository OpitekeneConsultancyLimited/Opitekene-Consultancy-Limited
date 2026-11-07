(function (root, factory) {
  const taxRules = typeof module === "object" && module.exports
    ? require("./tax-rules.js")
    : root.ugandaTaxRules;
  const taxCalculator = typeof module === "object" && module.exports
    ? require("./tax-calculator.js")
    : root.ugandaTax;
  const engine = factory(taxRules, taxCalculator);

  if (typeof module === "object" && module.exports) {
    module.exports = engine;
  } else {
    root.ugandaCorporateTax = engine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (taxRules, taxCalculator) {
  const PROVISIONAL_NOTICE =
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.";

  function requireNonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative number.`);
    }
  }

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function normalizeItems(items, label) {
    if (items === undefined) return [];
    if (!Array.isArray(items)) throw new TypeError(`${label} must be a list of described amounts.`);
    return items.map((item, index) => {
      if (!item || typeof item.description !== "string" || !item.description.trim()) {
        throw new RangeError(`${label} item ${index + 1} needs a description.`);
      }
      requireNonNegative(item.amount, `${label} item ${index + 1}`);
      return { description: item.description.trim(), amount: item.amount };
    });
  }

  function sumItems(items) {
    return items.reduce((total, item) => total + item.amount, 0);
  }

  function rateFromRule(rule) {
    const value = typeof rule?.value === "number" ? rule.value : rule?.value?.rate;
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  }

  function corporateRuleSet(rule, filingReady = false) {
    if (!rule) return null;
    return Object.freeze({
      id: rule.ruleFamilyId || rule.ruleId,
      financialYear: rule.ruleId.match(/fy(\d{4})-(\d{2})/i)
        ? `${rule.ruleId.match(/fy(\d{4})-(\d{2})/i)[1]}/${rule.ruleId.match(/fy(\d{4})-(\d{2})/i)[2]}`
        : null,
      status: rule.status,
      approvedForFiling: filingReady,
      legacyEstimate: !filingReady,
      ruleIds: Object.freeze([rule.ruleId]),
      versions: Object.freeze([rule.version]),
      sourceReferences: Object.freeze([...(rule.sourceReferences || [])]),
    });
  }

  function calculateCorporateIncomeTax(input, registry = taxRules, calculator = taxCalculator) {
    if (!input || typeof input !== "object") {
      throw new TypeError("Corporate tax inputs are required.");
    }
    if (!calculator || typeof calculator.calculateCompanyTaxBase !== "function") {
      throw new TypeError("The existing company tax-base calculator is required.");
    }

    const calculationMode = input.calculationMode;
    if (!["development", "simulation", "filing"].includes(calculationMode)) {
      throw new RangeError("Choose development, simulation, or filing calculation mode.");
    }
    if (!Number.isFinite(input.accountingProfit)) {
      throw new RangeError("Accounting profit or loss must be a finite number.");
    }
    const calculationReviewComplete = typeof input.reviewer === "string" &&
      Boolean(input.reviewer.trim()) && isDate(input.reviewDate);

    const taxpayerCategory = input.taxpayerCategory || "resident-company";
    const ruleCategory = taxpayerCategory === "resident-company"
      ? "company-resident-standard"
      : `company-${taxpayerCategory}`;
    const addBacks = normalizeItems(input.addBacks, "Add-backs");
    const exemptIncome = normalizeItems(input.exemptIncome, "Exempt income");
    const allowableDeductions = normalizeItems(input.allowableDeductions, "Allowable deductions");
    const capitalAllowances = normalizeItems(input.capitalAllowances, "Capital allowances");
    const carriedForwardLosses = input.carriedForwardLosses ?? 0;
    const provisionalTaxPaid = input.provisionalTaxPaid ?? 0;
    const withholdingTaxCredits = input.withholdingTaxCredits ?? 0;
    requireNonNegative(carriedForwardLosses, "Carried-forward tax losses");
    requireNonNegative(provisionalTaxPaid, "Provisional tax paid");
    requireNonNegative(withholdingTaxCredits, "Creditable withholding tax");

    const totalAddBacks = sumItems(addBacks);
    const totalExemptIncome = sumItems(exemptIncome);
    const totalAllowableDeductions = sumItems(allowableDeductions);
    const totalCapitalAllowances = sumItems(capitalAllowances);
    const totalDeductions = totalExemptIncome + totalAllowableDeductions + totalCapitalAllowances;
    const taxBase = calculator.calculateCompanyTaxBase(
      input.accountingProfit,
      totalAddBacks,
      totalDeductions,
      carriedForwardLosses,
    );
    const ruleResolution = registry.resolveRulesForPeriod({
      taxHead: "income-tax",
      category: ruleCategory,
      taxpayerType: "company",
      jurisdiction: "UG",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    const sourceRule = ruleResolution.rule || ruleResolution.candidate ||
      (ruleResolution.rules?.length === 1 ? ruleResolution.rules[0] : null);
    const canUseVerifiedRule = sourceRule?.status === "verified" &&
      ruleResolution.status === "verified" ||
      sourceRule?.status === "superseded" &&
      ruleResolution.status === "superseded" && ruleResolution.historical === true;
    const canUsePendingSimulationRule = calculationMode === "simulation" &&
      ruleResolution.status === "pending-review" &&
      sourceRule?.status === "pending-review";
    const appliedRule = calculationMode !== "development" &&
      (calculationMode === "simulation" && canUsePendingSimulationRule ||
        calculationMode === "filing" && canUseVerifiedRule && calculationReviewComplete)
      ? sourceRule
      : null;
    const taxRate = rateFromRule(appliedRule);
    const rateAvailable = appliedRule !== null && taxRate !== null;
    const grossTaxLiability = rateAvailable ? taxBase.chargeableIncome * taxRate : null;
    const totalTaxCredits = provisionalTaxPaid + withholdingTaxCredits;
    const finalTaxPayable = rateAvailable ? grossTaxLiability - totalTaxCredits : null;
    const calculationStatus = calculationMode === "development"
      ? "development-only"
      : !rateAvailable
        ? "blocked"
        : calculationMode === "filing" && canUseVerifiedRule && calculationReviewComplete
          ? "filing-ready"
          : "provisional";
    const provisionalNotice = calculationStatus !== "filing-ready" &&
      calculationMode !== "development"
      ? PROVISIONAL_NOTICE
      : null;
    const missingInformation = Array.isArray(input.missingInformation)
      ? input.missingInformation.filter((item) => typeof item === "string" && item.trim())
      : [];

    if (ruleResolution.status === "pending-review") {
      missingInformation.push(
        "Verify the company rate, legislation, provision, effective period, and calculation method before filing.",
      );
    } else if (ruleResolution.status === "missing") {
      missingInformation.push("No registered company income-tax rule covers the full period and taxpayer category.");
    } else if (ruleResolution.status === "rule-change-in-period") {
      missingInformation.push("The period contains multiple tax-rule versions; split the computation at each effective-date boundary.");
    } else if (ruleResolution.status === "overlap") {
      missingInformation.push("Overlapping company tax rules prevent an unambiguous rate selection.");
    } else if (ruleResolution.status === "superseded") {
      if (!ruleResolution.historical) {
        missingInformation.push("The superseded rule does not cover this historical period and cannot be used.");
      }
    }
    if (calculationMode === "filing" && canUseVerifiedRule && !calculationReviewComplete) {
      missingInformation.push("Independent computation reviewer name and valid review date are required for filing-ready status.");
    }
    if (!rateAvailable && calculationMode !== "development" &&
        !missingInformation.some((item) => item.includes("rule"))) {
      missingInformation.push("A verified company income-tax rule is required for a filing-ready liability.");
    }

    const schedule = [
      { label: "Accounting profit or (loss) before tax", amount: input.accountingProfit, rate: null },
      ...addBacks.map((item) => ({ label: `Add: ${item.description}`, amount: item.amount, rate: null })),
      { label: "Profit/(loss) after add-backs", amount: taxBase.incomeAfterAdditions, rate: null },
      ...exemptIncome.map((item) => ({ label: `Less: exempt income - ${item.description}`, amount: -item.amount, rate: null })),
      ...allowableDeductions.map((item) => ({ label: `Less: allowable deduction - ${item.description}`, amount: -item.amount, rate: null })),
      ...capitalAllowances.map((item) => ({ label: `Less: capital allowance - ${item.description}`, amount: -item.amount, rate: null })),
      {
        label: "Adjusted profit before carried-forward losses",
        amount: taxBase.adjustedProfitBeforeLosses,
        rate: null,
      },
      ...(carriedForwardLosses > 0
        ? [{ label: "Less: carried-forward tax losses entered", amount: -carriedForwardLosses, rate: null }]
        : []),
      { label: "Estimated taxable income", amount: taxBase.chargeableIncome, rate: null },
      ...(taxBase.currentYearLoss > 0
        ? [{ label: "Current-year loss (availability not determined)", amount: taxBase.currentYearLoss, rate: null }]
        : []),
      ...(rateAvailable
        ? [
            { label: "Applicable company tax rate", amount: null, rate: taxRate },
            { label: "Gross company income tax", amount: grossTaxLiability, rate: taxRate },
            { label: "Less: provisional tax paid", amount: -provisionalTaxPaid, rate: null },
            { label: "Less: creditable withholding tax entered", amount: -withholdingTaxCredits, rate: null },
            { label: "Net tax payable / (overpayment)", amount: finalTaxPayable, rate: null },
          ]
        : []),
    ];

    const assumptions = [
      ...(Array.isArray(input.assumptions)
        ? input.assumptions.filter((item) => typeof item === "string" && item.trim())
        : []),
      "Adjustment descriptions and tax treatments are user supplied and have not been independently classified.",
      "Capital allowances are entered amounts; this module does not validate asset eligibility or compute an allowance schedule.",
      ...(calculationStatus === "provisional"
        ? ["A pending-review rule was applied only because simulation mode was explicitly selected."]
        : []),
    ];

    return {
      calculationMode,
      calculationStatus,
      filingReady: calculationStatus === "filing-ready",
      verificationStatus: ruleResolution.status,
      taxpayerCategory,
      period: { start: input.periodStart, end: input.periodEnd },
      reviewer: calculationReviewComplete ? input.reviewer.trim() : null,
      reviewDate: calculationReviewComplete ? input.reviewDate : null,
      inputSummary: {
        accountingProfit: input.accountingProfit,
        totalAddBacks,
        totalExemptIncome,
        totalAllowableDeductions,
        totalCapitalAllowances,
        carriedForwardLosses,
        provisionalTaxPaid,
        withholdingTaxCredits,
      },
      adjustedProfitBeforeLosses: taxBase.adjustedProfitBeforeLosses,
      currentYearLoss: taxBase.currentYearLoss,
      taxableIncome: taxBase.chargeableIncome,
      taxRate,
      grossTaxLiability,
      totalTaxCredits,
      finalTaxPayable,
      refundableCredit: finalTaxPayable === null ? null : Math.max(0, -finalTaxPayable),
      ruleIdsUsed: rateAvailable ? [appliedRule.ruleId] : [],
      ruleVersionsUsed: rateAvailable ? [appliedRule.version] : [],
      candidateRuleIds: sourceRule ? [sourceRule.ruleId] :
        (ruleResolution.candidates || ruleResolution.rules || []).map((rule) => rule.ruleId),
      taxRuleSet: corporateRuleSet(
        appliedRule || sourceRule,
        calculationMode === "filing" && canUseVerifiedRule && rateAvailable,
      ),
      sourceReferences: appliedRule?.sourceReferences || sourceRule?.sourceReferences || [],
      legalReferences: appliedRule
        ? [{
            legislation: appliedRule.legislation,
            provision: appliedRule.provision,
            sourceUrl: appliedRule.officialSourceUrl,
            effectiveFrom: appliedRule.effectiveFrom,
            effectiveTo: appliedRule.effectiveTo,
          }]
        : [],
      schedule,
      assumptions,
      missingInformation: [...new Set(missingInformation)],
      provisionalNotice,
    };
  }

  return Object.freeze({
    PROVISIONAL_NOTICE,
    calculateCorporateIncomeTax,
  });
});