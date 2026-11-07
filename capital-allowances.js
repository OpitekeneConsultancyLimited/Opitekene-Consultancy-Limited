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
    root.ugandaCapitalAllowances = engine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (taxRules, taxCalculator) {
  const PROVISIONAL_NOTICE =
    "PROVISIONAL COMPUTATION — LEGAL REVIEW REQUIRED — NOT APPROVED FOR FILING.";

  function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function requireNonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative number.`);
    }
  }

  function normalizeAsset(asset, index, classIds) {
    if (!asset || typeof asset.assetId !== "string" || !asset.assetId.trim()) {
      throw new RangeError(`Asset ${index + 1} needs an asset ID.`);
    }
    if (typeof asset.description !== "string" || !asset.description.trim()) {
      throw new RangeError(`Asset ${asset.assetId} needs a description.`);
    }
    if (!classIds.has(asset.assetClass)) {
      throw new RangeError(`Asset ${asset.assetId} needs a supported, user-selected asset class.`);
    }
    if (!isDate(asset.acquisitionDate) || !isDate(asset.dateBroughtIntoUse) ||
        asset.dateBroughtIntoUse < asset.acquisitionDate) {
      throw new RangeError(`Asset ${asset.assetId} needs valid acquisition and first-use dates.`);
    }
    const openingTaxWrittenDownValue = asset.openingTaxWrittenDownValue ?? 0;
    const qualifyingExpenditure = asset.qualifyingExpenditure ?? 0;
    const accountingDepreciation = asset.accountingDepreciation ?? 0;
    const disposalProceeds = asset.disposalProceeds ?? 0;
    const businessUsePercent = asset.businessUsePercent;
    requireNonNegative(openingTaxWrittenDownValue, `Asset ${asset.assetId} opening tax value`);
    requireNonNegative(qualifyingExpenditure, `Asset ${asset.assetId} qualifying expenditure`);
    requireNonNegative(accountingDepreciation, `Asset ${asset.assetId} accounting depreciation`);
    requireNonNegative(disposalProceeds, `Asset ${asset.assetId} disposal proceeds`);
    if (!Number.isFinite(businessUsePercent) || businessUsePercent < 0 || businessUsePercent > 100) {
      throw new RangeError(`Asset ${asset.assetId} business use must be between 0 and 100 percent.`);
    }
    if (asset.disposalDate !== undefined && asset.disposalDate !== null &&
        (!isDate(asset.disposalDate) || asset.disposalDate < asset.dateBroughtIntoUse)) {
      throw new RangeError(`Asset ${asset.assetId} disposal date is invalid.`);
    }
    if ((asset.disposalDate === undefined || asset.disposalDate === null) && disposalProceeds !== 0) {
      throw new RangeError(`Asset ${asset.assetId} needs a disposal date when proceeds are entered.`);
    }

    return {
      assetId: asset.assetId.trim(),
      description: asset.description.trim(),
      assetClass: asset.assetClass,
      acquisitionDate: asset.acquisitionDate,
      dateBroughtIntoUse: asset.dateBroughtIntoUse,
      openingTaxWrittenDownValue,
      qualifyingExpenditure,
      accountingDepreciation,
      disposalDate: asset.disposalDate || null,
      disposalProceeds,
      businessUsePercent,
      classificationConfirmed: asset.classificationConfirmed === true,
    };
  }

  function ruleRate(rule) {
    const rate = typeof rule?.value === "number" ? rule.value : rule?.value?.rate;
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
  }

  function calculateCapitalAllowanceSchedule(input, registry = taxRules, calculator = taxCalculator) {
    if (!input || typeof input !== "object") {
      throw new TypeError("Capital allowance inputs are required.");
    }
    if (!["development", "simulation", "filing"].includes(input.calculationMode)) {
      throw new RangeError("Choose development, simulation, or filing calculation mode.");
    }
    if (!isDate(input.periodStart) || !isDate(input.periodEnd) || input.periodEnd < input.periodStart) {
      throw new RangeError("Enter a valid capital allowance period.");
    }
    if (!calculator || typeof calculator.calculateWearAndTear !== "function") {
      throw new TypeError("The existing wear-and-tear calculator is required.");
    }

    const assetsInput = input.assets ?? [];
    if (!Array.isArray(assetsInput)) throw new TypeError("The fixed-asset register must be a list.");
    const classIds = new Set(calculator.wearAndTearClasses.map((assetClass) => assetClass.id));
    const assets = assetsInput.map((asset, index) => normalizeAsset(asset, index, classIds));
      const calculationReviewComplete = typeof input.reviewer === "string" &&
        Boolean(input.reviewer.trim()) && isDate(input.reviewDate);
    const assetIds = new Set();
    for (const asset of assets) {
      if (assetIds.has(asset.assetId)) throw new RangeError(`Duplicate asset ID: ${asset.assetId}`);
      assetIds.add(asset.assetId);
    }

    const groups = new Map();
    const excludedAssets = [];
    for (const asset of assets) {
      if (asset.dateBroughtIntoUse > input.periodEnd ||
          (asset.disposalDate && asset.disposalDate < input.periodStart)) {
        excludedAssets.push(asset);
        continue;
      }
      const group = groups.get(asset.assetClass) || {
        assetClass: asset.assetClass,
        assets: [],
        openingTaxWrittenDownValue: 0,
        qualifyingAdditions: 0,
        businessUseAdditions: 0,
        disposalProceeds: 0,
        businessUseDisposalProceeds: 0,
        accountingDepreciation: 0,
      };
      group.assets.push(asset);
      group.accountingDepreciation += asset.accountingDepreciation;
      if (asset.dateBroughtIntoUse < input.periodStart) {
        group.openingTaxWrittenDownValue += asset.openingTaxWrittenDownValue;
      } else if (asset.dateBroughtIntoUse <= input.periodEnd) {
        if (asset.openingTaxWrittenDownValue > 0) {
          throw new RangeError(
            `Asset ${asset.assetId} is first used in this period; its opening tax value must be zero.`,
          );
        }
        group.qualifyingAdditions += asset.qualifyingExpenditure;
        group.businessUseAdditions += asset.qualifyingExpenditure * asset.businessUsePercent / 100;
      }
      if (asset.disposalDate && asset.disposalDate >= input.periodStart &&
          asset.disposalDate <= input.periodEnd) {
        group.disposalProceeds += asset.disposalProceeds;
        group.businessUseDisposalProceeds += asset.disposalProceeds * asset.businessUsePercent / 100;
      }
      groups.set(asset.assetClass, group);
    }

    const missingInformation = [];
    if (groups.size === 0) missingInformation.push("No active assets are in use during the selected period.");
    if (assets.some((asset) => !asset.classificationConfirmed)) {
      missingInformation.push("Confirm the legal asset classification for every fixed-asset register entry.");
    }
    if (input.initialAllowanceRequested) {
      missingInformation.push("Initial allowance eligibility and amount are not computed because no verified rule is available.");
    }
    if (input.calculationMode === "filing" && !calculationReviewComplete) {
      missingInformation.push("Independent computation reviewer name and valid review date are required for filing-ready status.");
    }

    const classSchedules = [];
    for (const group of groups.values()) {
      const resolution = registry.resolveRulesForPeriod({
        taxHead: "income-tax",
        category: `wear-and-tear-${group.assetClass}`,
        taxpayerType: "business-taxpayer",
        jurisdiction: "UG",
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
      const classRule = resolution.rule || resolution.candidate ||
        (resolution.rules?.length === 1 ? resolution.rules[0] : null);
      const selectedClassMatches = classRule?.value?.id === group.assetClass;
      const canUsePendingSimulation = input.calculationMode === "simulation" &&
        resolution.status === "pending-review" && selectedClassMatches;
      const canUseVerifiedFiling = input.calculationMode === "filing" &&
        (resolution.status === "verified" ||
          resolution.status === "superseded" && resolution.historical === true) &&
          selectedClassMatches && calculationReviewComplete;
      const classificationComplete = group.assets.every((asset) => asset.classificationConfirmed);
      const mayCalculate = input.calculationMode !== "development" &&
        classificationComplete && (canUsePendingSimulation || canUseVerifiedFiling);
      const selectedRate = mayCalculate ? ruleRate(classRule) : null;
      const pool = selectedRate === null
        ? null
        : calculator.calculateWearAndTear({
            assetClass: group.assetClass,
            openingTaxWrittenDownValue: group.openingTaxWrittenDownValue,
            additions: group.businessUseAdditions,
            disposalProceeds: group.businessUseDisposalProceeds,
            businessUsePercent: 100,
            rateOverride: selectedRate,
          });

      if (resolution.status !== "verified" && resolution.status !== "pending-review") {
        missingInformation.push(`Asset class ${group.assetClass}: ${resolution.status} rule selection.`);
      }
      if (resolution.status === "pending-review") {
        missingInformation.push(`Asset class ${group.assetClass}: verify rate, classification, source, provision, dates, and method before filing.`);
      }
      if (group.assets.some((asset) => asset.disposalDate &&
          asset.disposalDate >= input.periodStart && asset.disposalDate <= input.periodEnd)) {
        missingInformation.push(`Asset class ${group.assetClass}: review disposal and any balancing adjustment separately.`);
      }
      if (pool?.excessDisposalProceeds > 0) {
        missingInformation.push(`Asset class ${group.assetClass}: disposal proceeds exceed the pool; balancing adjustment is not computed.`);
      }

      classSchedules.push({
        assetClass: group.assetClass,
        assetIds: group.assets.map((asset) => asset.assetId),
        ruleStatus: resolution.status,
        historicalRule: resolution.historical === true,
        ruleId: pool ? classRule.ruleId : null,
        ruleVersion: pool ? classRule.version : null,
        rate: selectedRate,
        openingTaxWrittenDownValue: group.openingTaxWrittenDownValue,
        qualifyingAdditions: group.qualifyingAdditions,
        businessUseAdditions: group.businessUseAdditions,
        disposalProceeds: group.disposalProceeds,
        businessUseDisposalProceeds: group.businessUseDisposalProceeds,
        accountingDepreciation: group.accountingDepreciation,
        allowance: pool?.allowance ?? null,
        closingTaxWrittenDownValue: pool?.closingTaxWrittenDownValue ?? null,
        excessDisposalProceeds: pool?.excessDisposalProceeds ?? null,
      });
    }

    const calculationsAvailable = classSchedules.length > 0 &&
      classSchedules.every((item) => item.allowance !== null);
    const unresolvedAdjustments = Boolean(input.initialAllowanceRequested) ||
      classSchedules.some((item) => item.disposalProceeds > 0 || item.excessDisposalProceeds > 0);
    const filingRulesVerified = classSchedules.every((item) => (
      item.allowance !== null &&
      (item.ruleStatus === "verified" || item.ruleStatus === "superseded" && item.historicalRule)
    ));
    const calculationStatus = input.calculationMode === "development"
      ? "development-only"
      : !calculationsAvailable
        ? "blocked"
        : input.calculationMode === "filing" && filingRulesVerified && !unresolvedAdjustments
          ? "filing-ready"
          : input.calculationMode === "filing" ? "blocked" : "provisional";
    const ruleIdsUsed = classSchedules.filter((item) => item.allowance !== null)
      .map((item) => item.ruleId);
    const ruleVersionsUsed = classSchedules.filter((item) => item.allowance !== null)
      .map((item) => item.ruleVersion);
    const computedAllowance = calculationsAvailable
      ? classSchedules.reduce((total, item) => total + item.allowance, 0)
      : null;
    const totalAllowance = input.calculationMode === "filing" &&
      calculationStatus !== "filing-ready"
      ? null
      : computedAllowance;
    const totalAccountingDepreciation = classSchedules.reduce(
      (total, item) => total + item.accountingDepreciation,
      0,
    );
    const assumptions = [
      "Asset class, qualifying expenditure, business use, and accounting depreciation are supplied by the user and are not independently validated.",
      "Accounting depreciation is reported separately and is not deducted as a tax capital allowance.",
      "Opening tax written-down values are assumed to be previously reviewed and apportioned.",
      ...(calculationStatus === "provisional"
        ? ["Pending-review wear-and-tear rates are applied only in explicit simulation mode."]
        : []),
    ];
    if (input.initialAllowanceRequested) {
      assumptions.push("No initial allowance is included in the computed wear-and-tear amount.");
    }

    return {
      calculationMode: input.calculationMode,
      calculationStatus,
      filingReady: calculationStatus === "filing-ready",
      period: { start: input.periodStart, end: input.periodEnd },
      taxpayerType: input.taxpayerType || "business-taxpayer",
      reviewer: calculationReviewComplete ? input.reviewer.trim() : null,
      reviewDate: calculationReviewComplete ? input.reviewDate : null,
      totalAllowance,
      totalAccountingDepreciation,
      classSchedules,
      assets,
      excludedAssetIds: excludedAssets.map((asset) => asset.assetId),
      ruleIdsUsed,
      ruleVersionsUsed,
      assumptions,
      missingInformation: [...new Set(missingInformation)],
      provisionalNotice: calculationStatus !== "filing-ready" &&
        input.calculationMode !== "development" ? PROVISIONAL_NOTICE : null,
    };
  }

  return Object.freeze({
    PROVISIONAL_NOTICE,
    calculateCapitalAllowanceSchedule,
  });
});