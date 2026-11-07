(function (root, factory) {
  const taxRules = typeof module === "object" && module.exports
    ? require("./tax-rules.js")
    : root.ugandaTaxRules;
  const engine = factory(taxRules);

  if (typeof module === "object" && module.exports) {
    module.exports = engine;
  } else {
    root.ugandaIndustrialBuilding = engine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (taxRules) {
  const PROVISIONAL_NOTICE =
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.";
  const METHODS = new Set(["straight-line", "reducing-balance"]);

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function requireAmount(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative number.`);
    }
  }

  function validOptionalDate(value, label) {
    if (value !== undefined && value !== null && value !== "" && !isDate(value)) {
      throw new RangeError(`${label} must be a valid date.`);
    }
    return value || null;
  }

  function calculateIndustrialBuildingDeduction(input, registry = taxRules) {
    if (!input || typeof input !== "object") {
      throw new TypeError("Industrial building inputs are required.");
    }
    if (!["development", "simulation", "filing"].includes(input.calculationMode)) {
      throw new RangeError("Choose development, simulation, or filing calculation mode.");
    }
    if (!isDate(input.periodStart) || !isDate(input.periodEnd) || input.periodEnd < input.periodStart) {
      throw new RangeError("Enter a valid building tax period.");
    }
    if (!input.buildingDescription?.trim() || !input.owner?.trim() ||
        !["individual", "company"].includes(input.taxpayerType)) {
      throw new RangeError("Building description, owner, and taxpayer category are required.");
    }
    for (const [field, label] of [
      ["constructionExpenditure", "Construction expenditure"],
      ["qualifyingConstructionCosts", "Qualifying construction costs"],
      ["previousDeductions", "Previous deductions"],
    ]) {
      requireAmount(input[field] ?? 0, label);
    }
    if (input.qualifyingConstructionCosts > input.constructionExpenditure) {
      throw new RangeError("Qualifying construction costs cannot exceed total construction expenditure.");
    }
    if (input.previousDeductions > input.qualifyingConstructionCosts) {
      throw new RangeError("Previous deductions cannot exceed qualifying construction costs.");
    }
    const constructionStarted = isDate(input.constructionStarted);
    const constructionCompleted = isDate(input.constructionCompleted);
    const firstUsed = isDate(input.firstUsed);
    if (!constructionStarted || !constructionCompleted || !firstUsed ||
        input.constructionCompleted < input.constructionStarted ||
        input.firstUsed < input.constructionStarted) {
      throw new RangeError("Valid construction start, completion, and first-use dates are required.");
    }
    const disposalDate = validOptionalDate(input.disposalDate, "Disposal date");
    const changeOfUseDate = validOptionalDate(input.changeOfUseDate, "Change-of-use date");
    if (input.simulationRatePercent !== undefined && input.simulationRatePercent !== null) {
      if (!Number.isFinite(input.simulationRatePercent) ||
          input.simulationRatePercent < 0 || input.simulationRatePercent > 100) {
        throw new RangeError("Simulation rate must be between 0 and 100 percent.");
      }
    }
    const periodUsePercent = input.periodUsePercent;
    if (periodUsePercent !== undefined && periodUsePercent !== null &&
        (!Number.isFinite(periodUsePercent) || periodUsePercent < 0 || periodUsePercent > 100)) {
      throw new RangeError("Period use must be between 0 and 100 percent.");
    }
    if (input.simulationMethod && !METHODS.has(input.simulationMethod)) {
      throw new RangeError("Choose a supported simulation method.");
    }
    const qualificationConfirmed = input.qualificationConfirmed === true;
    const calculationReviewComplete = typeof input.reviewer === "string" &&
      Boolean(input.reviewer.trim()) && isDate(input.reviewDate);

    const ruleResolution = registry.resolveRulesForPeriod({
      taxHead: "income-tax",
      category: "industrial-building-deduction",
      taxpayerType: input.taxpayerType,
      jurisdiction: "UG",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    const rule = ruleResolution.rule || ruleResolution.candidate ||
      (ruleResolution.rules?.length === 1 ? ruleResolution.rules[0] : null);
    const verifiedValue = rule?.status === "verified" ||
      rule?.status === "superseded" && ruleResolution.historical
      ? rule.value
      : null;
    const verifiedRatePercent = Number.isFinite(verifiedValue?.rate)
      ? verifiedValue.rate * 100
      : null;
    const verifiedMethod = METHODS.has(verifiedValue?.method) ? verifiedValue.method : null;
    const isVerifiedRule = ruleResolution.status === "verified" ||
      ruleResolution.status === "superseded" && ruleResolution.historical === true;
    const simulationParametersComplete = Number.isFinite(input.simulationRatePercent) &&
      METHODS.has(input.simulationMethod) && Number.isFinite(periodUsePercent);
    const useSimulationParameters = input.calculationMode === "simulation" &&
      ruleResolution.status === "pending-review" && simulationParametersComplete;
    const ratePercent = useSimulationParameters ? input.simulationRatePercent : verifiedRatePercent;
    const method = useSimulationParameters ? input.simulationMethod : verifiedMethod;
    const periodUseFraction = Number.isFinite(periodUsePercent) ? periodUsePercent / 100 : null;
    const remainingQualifyingCosts = Math.max(
      0,
      input.qualifyingConstructionCosts - (input.previousDeductions ?? 0),
    );
    const hasEventDuringPeriod = [disposalDate, changeOfUseDate].some((date) => (
      date && date >= input.periodStart && date <= input.periodEnd
    ));
    const canEstimate = input.calculationMode !== "development" &&
      qualificationConfirmed && ratePercent !== null && method !== null &&
      periodUseFraction !== null &&
      !(input.calculationMode === "filing" && !calculationReviewComplete) &&
      !(input.calculationMode === "filing" && hasEventDuringPeriod);
    const estimatedDeduction = canEstimate
      ? Math.min(remainingQualifyingCosts,
          remainingQualifyingCosts * ratePercent / 100 * periodUseFraction)
      : null;
    const filingReady = input.calculationMode === "filing" &&
      isVerifiedRule &&
      verifiedRatePercent !== null && verifiedMethod !== null &&
      qualificationConfirmed && calculationReviewComplete &&
      periodUseFraction !== null && !hasEventDuringPeriod;
    const calculationStatus = input.calculationMode === "development"
      ? "development-only"
      : filingReady
        ? "filing-ready"
        : estimatedDeduction === null ? "blocked" : "provisional";
    const qualificationStatus = qualificationConfirmed
      ? "user-confirmed-for-review-only"
      : "not-established";
    const missingInformation = [];
    if (!qualificationConfirmed) {
      missingInformation.push("Qualification has not been confirmed by a qualified legal review; commercial use alone is not enough.");
    }
    if (ruleResolution.status !== "verified") {
      missingInformation.push("No verified industrial-building qualification rule and statutory method cover this period.");
    }
    if (ruleResolution.status === "pending-review" && input.calculationMode === "simulation" &&
        !simulationParametersComplete) {
      missingInformation.push("Enter an explicit simulation rate, method, and period-use percentage; no statutory defaults are supplied.");
    }
    if (ruleResolution.status === "missing") {
      missingInformation.push("No industrial-building rule record covers the selected taxpayer and period.");
    }
    if (ruleResolution.status === "overlap" || ruleResolution.status === "rule-change-in-period") {
      missingInformation.push("Rule overlap or an effective-date change requires manual period segmentation and review.");
    }
    if (hasEventDuringPeriod) {
      missingInformation.push("Disposal or change of use occurs in this period; prior deductions and balancing treatment require review.");
    }
    if (input.calculationMode === "filing" && !calculationReviewComplete) {
      missingInformation.push("Independent computation reviewer name and valid review date are required for filing-ready status.");
    }
    if (input.qualifyingConstructionCosts === 0) {
      missingInformation.push("No qualifying construction expenditure has been entered.");
    }
    if (input.firstUsed > input.periodEnd) {
      missingInformation.push("The building was not first used by the end of the selected tax period.");
    }

    const ruleIdsUsed = estimatedDeduction !== null && rule ? [rule.ruleId] : [];
    const ruleVersionsUsed = estimatedDeduction !== null && rule ? [rule.version] : [];
    return {
      calculationMode: input.calculationMode,
      calculationStatus,
      filingReady,
      qualificationStatus,
      qualificationReason: qualificationConfirmed
        ? "User eligibility confirmation is recorded for simulation only; the engine does not determine legal qualification."
        : "No qualified review confirmed the building's industrial-building eligibility.",
      reviewer: calculationReviewComplete ? input.reviewer.trim() : null,
      reviewDate: calculationReviewComplete ? input.reviewDate : null,
      taxpayerType: input.taxpayerType,
      period: { start: input.periodStart, end: input.periodEnd },
      building: {
        description: input.buildingDescription.trim(),
        owner: input.owner.trim(),
        constructionExpenditure: input.constructionExpenditure,
        qualifyingConstructionCosts: input.qualifyingConstructionCosts,
        constructionStarted: input.constructionStarted,
        constructionCompleted: input.constructionCompleted,
        firstUsed: input.firstUsed,
        use: input.buildingUse || "not specified",
        previousDeductions: input.previousDeductions ?? 0,
        disposalDate,
        changeOfUseDate,
      },
      remainingQualifyingCosts,
      deductionRatePercent: ratePercent,
      deductionMethod: method,
      periodUsePercent,
      estimatedDeduction,
      ruleIdsUsed,
      ruleVersionsUsed,
      ruleStatus: ruleResolution.status,
      candidateRuleId: rule?.ruleId || null,
      candidateRuleVersion: rule?.version || null,
      legislation: rule?.legislation || null,
      provision: rule?.provision || null,
      officialSourceUrl: rule?.officialSourceUrl || null,
      effectiveFrom: rule?.effectiveFrom || null,
      effectiveTo: rule?.effectiveTo || null,
      assumptions: [
        "Industrial-building eligibility is not decided by this framework; user confirmation is a simulation assumption only.",
        "No statutory rate, method, or period apportionment default is supplied.",
        "Previous deductions and qualifying expenditure require supporting records and legal review.",
        ...(useSimulationParameters ? ["Rate, method, and period-use percentage are user-entered simulation parameters, not verified legal rules."] : []),
      ],
      missingInformation,
      provisionalNotice: calculationStatus !== "filing-ready" &&
        input.calculationMode !== "development" ? PROVISIONAL_NOTICE : null,
      schedule: [
        { label: "Total construction expenditure", amount: input.constructionExpenditure },
        { label: "Qualifying construction costs entered", amount: input.qualifyingConstructionCosts },
        { label: "Previous deductions entered", amount: -(input.previousDeductions ?? 0) },
        { label: "Remaining qualifying-cost basis", amount: remainingQualifyingCosts },
        ...(estimatedDeduction === null
          ? []
          : [{ label: "Simulation / verified deduction", amount: estimatedDeduction }]),
      ],
    };
  }

  return Object.freeze({
    PROVISIONAL_NOTICE,
    calculateIndustrialBuildingDeduction,
  });
});