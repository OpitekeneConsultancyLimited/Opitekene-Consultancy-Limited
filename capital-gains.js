(function (root, factory) {
  const taxRules = typeof module === "object" && module.exports
    ? require("./tax-rules.js")
    : root.ugandaTaxRules;
  const engine = factory(taxRules);

  if (typeof module === "object" && module.exports) {
    module.exports = engine;
  } else {
    root.ugandaCapitalGains = engine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (taxRules) {
  const PROVISIONAL_NOTICE =
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.";

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

  function normalizeAdjustments(items, label) {
    if (items === undefined) return [];
    if (!Array.isArray(items)) throw new TypeError(`${label} must be a list of described amounts.`);
    return items.map((item, index) => {
      if (!item || typeof item.description !== "string" || !item.description.trim()) {
        throw new RangeError(`${label} item ${index + 1} needs a description.`);
      }
      requireAmount(item.amount, `${label} item ${index + 1}`);
      return { description: item.description.trim(), amount: item.amount };
    });
  }

  function sum(items) {
    return items.reduce((total, item) => total + item.amount, 0);
  }

  function calculateCapitalGains(input, registry = taxRules) {
    if (!input || typeof input !== "object") {
      throw new TypeError("Capital-gains inputs are required.");
    }
    if (!["development", "simulation", "filing"].includes(input.calculationMode)) {
      throw new RangeError("Choose development, simulation, or filing calculation mode.");
    }
    if (!isDate(input.periodStart) || !isDate(input.periodEnd) || input.periodEnd < input.periodStart) {
      throw new RangeError("Enter a valid capital-gains tax period.");
    }
    if (!isDate(input.acquisitionDate) || !isDate(input.disposalDate) ||
        input.disposalDate < input.acquisitionDate) {
      throw new RangeError("Enter valid acquisition and disposal dates.");
    }
    if (!input.assetDescription?.trim() || !input.assetCategory?.trim() ||
        !["individual", "company"].includes(input.taxpayerType)) {
      throw new RangeError("Asset description, asset category, and taxpayer category are required.");
    }
    for (const [field, label] of [
      ["acquisitionCost", "Acquisition cost"],
      ["acquisitionIncidentalCosts", "Incidental acquisition costs"],
      ["improvementExpenditure", "Improvement expenditure"],
      ["disposalProceeds", "Disposal proceeds"],
      ["disposalIncidentalCosts", "Incidental disposal costs"],
      ["withholdingCredits", "Withholding credits"],
    ]) {
      requireAmount(input[field] ?? 0, label);
    }
    if (input.simulationRatePercent !== undefined && input.simulationRatePercent !== null &&
        (!Number.isFinite(input.simulationRatePercent) ||
          input.simulationRatePercent < 0 || input.simulationRatePercent > 100)) {
      throw new RangeError("Simulation rate must be between 0 and 100 percent.");
    }
    const calculationReviewComplete = typeof input.reviewer === "string" &&
      Boolean(input.reviewer.trim()) && isDate(input.reviewDate);

    const exemptions = normalizeAdjustments(input.exemptions, "Exemptions");
    const reliefs = normalizeAdjustments(input.reliefs, "Reliefs");
    const totalExemptions = sum(exemptions);
    const totalReliefs = sum(reliefs);
    const adjustedCostBase = input.acquisitionCost +
      (input.acquisitionIncidentalCosts ?? 0) + (input.improvementExpenditure ?? 0);
    const netDisposalProceeds = Math.max(
      0,
      input.disposalProceeds - (input.disposalIncidentalCosts ?? 0),
    );
    const gainOrLoss = netDisposalProceeds - adjustedCostBase;
    const grossGain = Math.max(0, gainOrLoss);
    if (totalExemptions + totalReliefs > grossGain) {
      throw new RangeError("Entered exemptions and reliefs cannot exceed the computed positive gain.");
    }
    const chargeableGain = Math.max(0, grossGain - totalExemptions - totalReliefs);
    const periodContainsDisposal = input.disposalDate >= input.periodStart &&
      input.disposalDate <= input.periodEnd;
    const ruleResolution = registry.resolveRulesForPeriod({
      taxHead: "income-tax",
      category: "capital-gains",
      taxpayerType: input.taxpayerType,
      jurisdiction: "UG",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    const rule = ruleResolution.rule || ruleResolution.candidate ||
      (ruleResolution.rules?.length === 1 ? ruleResolution.rules[0] : null);
    const isVerifiedRule = rule?.status === "verified" && ruleResolution.status === "verified" ||
      rule?.status === "superseded" && ruleResolution.status === "superseded" &&
        ruleResolution.historical === true;
    const verifiedRatePercent = Number.isFinite(rule?.value?.rate)
      ? rule.value.rate * 100
      : Number.isFinite(rule?.value) ? rule.value * 100 : null;
    const useSimulationRate = input.calculationMode === "simulation" &&
      ruleResolution.status === "pending-review" &&
      Number.isFinite(input.simulationRatePercent);
    const ratePercent = useSimulationRate ? input.simulationRatePercent
      : isVerifiedRule ? verifiedRatePercent : null;
    const classificationConfirmed = input.classificationConfirmed === true;
    const canCalculateTax = input.calculationMode !== "development" &&
      periodContainsDisposal && classificationConfirmed && ratePercent !== null &&
      !(input.calculationMode === "filing" && !calculationReviewComplete);
    const taxLiability = canCalculateTax ? chargeableGain * ratePercent / 100 : null;
    const finalTaxPayable = taxLiability === null
      ? null
      : taxLiability - (input.withholdingCredits ?? 0);
    const filingReady = input.calculationMode === "filing" &&
      periodContainsDisposal && classificationConfirmed && isVerifiedRule &&
      ratePercent !== null && calculationReviewComplete;
    const calculationStatus = input.calculationMode === "development"
      ? "development-only"
      : filingReady
        ? "filing-ready"
        : taxLiability === null ? "blocked" : "provisional";
    const missingInformation = [];
    if (!classificationConfirmed) {
      missingInformation.push("Asset category and tax classification require reviewer confirmation.");
    }
    if (!periodContainsDisposal) {
      missingInformation.push("The disposal date is outside the selected tax period.");
    }
    if (ruleResolution.status !== "verified" && ruleResolution.status !== "superseded") {
      missingInformation.push("No verified capital-gains rule covers this taxpayer and period.");
    }
    if (ruleResolution.status === "overlap" || ruleResolution.status === "rule-change-in-period") {
      missingInformation.push("Rule overlap or an effective-date change requires manual period segmentation and review.");
    }
    if (input.simulationRatePercent === undefined && !isVerifiedRule) {
      missingInformation.push("No default rate is supplied; enter a rate only for an explicitly provisional simulation.");
    }
    if (input.calculationMode === "filing" && !calculationReviewComplete) {
      missingInformation.push("Independent computation reviewer name and valid review date are required for filing-ready status.");
    }

    const schedule = [
      { label: "Disposal proceeds", amount: input.disposalProceeds },
      { label: "Less: incidental disposal costs", amount: -(input.disposalIncidentalCosts ?? 0) },
      { label: "Net disposal proceeds", amount: netDisposalProceeds },
      { label: "Less: acquisition cost", amount: -input.acquisitionCost },
      { label: "Less: incidental acquisition costs", amount: -(input.acquisitionIncidentalCosts ?? 0) },
      { label: "Less: improvement expenditure", amount: -(input.improvementExpenditure ?? 0) },
      { label: "Gain / (loss) before exemptions and reliefs", amount: gainOrLoss },
      ...exemptions.map((item) => ({ label: `Less: exemption entered - ${item.description}`, amount: -item.amount })),
      ...reliefs.map((item) => ({ label: `Less: relief entered - ${item.description}`, amount: -item.amount })),
      { label: "Chargeable gain", amount: chargeableGain },
      ...(taxLiability === null ? [] : [
        { label: "User-entered or verified rate", amount: null, rate: ratePercent / 100 },
        { label: "Capital-gains tax scenario", amount: taxLiability, rate: ratePercent / 100 },
        { label: "Less: withholding credits entered", amount: -(input.withholdingCredits ?? 0) },
        { label: "Tax payable / (overpayment) in this scenario", amount: finalTaxPayable },
      ]),
    ];
    const ruleIdsUsed = taxLiability !== null && rule ? [rule.ruleId] : [];
    const ruleVersionsUsed = taxLiability !== null && rule ? [rule.version] : [];
    return {
      calculationMode: input.calculationMode,
      calculationStatus,
      filingReady,
      taxpayerType: input.taxpayerType,
      reviewer: calculationReviewComplete ? input.reviewer.trim() : null,
      reviewDate: calculationReviewComplete ? input.reviewDate : null,
      assetCategory: input.assetCategory,
      period: { start: input.periodStart, end: input.periodEnd },
      acquisitionDate: input.acquisitionDate,
      disposalDate: input.disposalDate,
      adjustedCostBase,
      netDisposalProceeds,
      gainOrLoss,
      grossGain,
      totalExemptions,
      totalReliefs,
      chargeableGain,
      ratePercent,
      taxLiability,
      withholdingCredits: input.withholdingCredits ?? 0,
      finalTaxPayable,
      ruleStatus: ruleResolution.status,
      ruleIdsUsed,
      ruleVersionsUsed,
      candidateRuleId: rule?.ruleId || null,
      candidateRuleVersion: rule?.version || null,
      legislation: rule?.legislation || null,
      provision: rule?.provision || null,
      officialSourceUrl: rule?.officialSourceUrl || null,
      effectiveFrom: rule?.effectiveFrom || null,
      effectiveTo: rule?.effectiveTo || null,
      assumptions: [
        "Asset classification, exemptions, and relief amounts are user supplied and have not been independently verified.",
        "No universal rate or tax treatment is assumed for different asset categories.",
        ...(useSimulationRate ? ["The rate is a user-entered simulation assumption, not a verified legal rule."] : []),
      ],
      missingInformation,
      provisionalNotice: calculationStatus !== "filing-ready" &&
        input.calculationMode !== "development" ? PROVISIONAL_NOTICE : null,
      schedule,
    };
  }

  return Object.freeze({
    PROVISIONAL_NOTICE,
    calculateCapitalGains,
  });
});