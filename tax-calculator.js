(function (root, factory) {
  const taxRules = typeof module === "object" && module.exports
    ? require("./tax-rules.js")
    : root.ugandaTaxRules;
  const calculator = factory(taxRules);

  if (typeof module === "object" && module.exports) {
    module.exports = calculator;
  } else {
    root.ugandaTax = calculator;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (taxRules) {
  if (!taxRules) {
    throw new Error("Uganda tax rules must be loaded before the tax calculator.");
  }

  const activeTaxRules = taxRules.getRulesForFinancialYear(taxRules.currentFinancialYear);
  const residentIndividualBands = activeTaxRules.individualIncomeTax.residentBands;
  const nonResidentIndividualBands = activeTaxRules.individualIncomeTax.nonResidentBands;
  const wearAndTearClasses = activeTaxRules.capitalAllowances.wearAndTearClasses;
  const taxRuleSetMetadata = {
    id: activeTaxRules.id,
    financialYear: activeTaxRules.financialYear,
    approvalStatus: activeTaxRules.approvalStatus,
    approvedForFiling: activeTaxRules.approvedForFiling,
  };
  const individualTaxRuleSet = Object.freeze({
    ...taxRuleSetMetadata,
    sourceReferences: activeTaxRules.individualIncomeTax.sources,
  });
  const companyTaxRuleSet = Object.freeze({
    ...taxRuleSetMetadata,
    sourceReferences: activeTaxRules.companyIncomeTax.sources,
  });
  const capitalAllowanceRuleSet = Object.freeze({
    ...taxRuleSetMetadata,
    sourceReferences: activeTaxRules.capitalAllowances.wearAndTearSources,
  });

  const withholdingRates = {
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
  };

  function requireNonNegative(value, name) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative number.`);
    }
  }

  function calculateIndividualIncomeTax(taxableIncome, isResident = true) {
    requireNonNegative(taxableIncome, "Taxable income");
    const bands = isResident ? residentIndividualBands : nonResidentIndividualBands;

    const breakdown = bands.map((band) => {
      const taxableAmount = Math.max(
        0,
        Math.min(taxableIncome, band.upper) - band.lower,
      );

      return {
        label: band.label,
        rate: band.rate,
        taxableAmount,
        tax: taxableAmount * band.rate,
      };
    });

    const totalTax = breakdown.reduce((total, band) => total + band.tax, 0);
    const marginalRate = [...bands]
      .reverse()
      .find((band) => taxableIncome > band.lower)?.rate ?? 0;

    return {
      taxRuleSet: individualTaxRuleSet,
      taxableIncome,
      isResident,
      totalTax,
      marginalRate,
      effectiveRate: taxableIncome === 0 ? 0 : totalTax / taxableIncome,
      breakdown,
    };
  }

  function calculateChargeableIncome(income, additions = 0, deductions = 0) {
    requireNonNegative(income, "Income before tax adjustments");
    requireNonNegative(additions, "Taxable additions");
    requireNonNegative(deductions, "Allowable deductions");

    const incomeAfterAdditions = income + additions;
    if (deductions > incomeAfterAdditions) {
      throw new RangeError(
        "Deductions exceed income after additions. Loss relief is not calculated by this estimate.",
      );
    }

    return {
      income,
      additions,
      incomeAfterAdditions,
      deductions,
      chargeableIncome: incomeAfterAdditions - deductions,
    };
  }

  function calculateCompanyTaxBase(
    accountingProfit,
    additions = 0,
    deductions = 0,
    carriedForwardLosses = 0,
  ) {
    if (!Number.isFinite(accountingProfit)) {
      throw new RangeError("Accounting profit or loss must be a finite number.");
    }
    requireNonNegative(additions, "Taxable additions");
    requireNonNegative(deductions, "Allowable deductions");
    requireNonNegative(carriedForwardLosses, "Carried-forward tax losses");

    const incomeAfterAdditions = accountingProfit + additions;
    const adjustedProfitBeforeLosses = incomeAfterAdditions - deductions;
    const currentYearLoss = Math.max(0, -adjustedProfitBeforeLosses);
    if (carriedForwardLosses > Math.max(0, adjustedProfitBeforeLosses)) {
      throw new RangeError(
        "Carried-forward losses used cannot exceed positive adjusted profit before loss relief.",
      );
    }

    return {
      accountingProfit,
      additions,
      incomeAfterAdditions,
      deductions,
      adjustedProfitBeforeLosses,
      carriedForwardLossesUsed: carriedForwardLosses,
      chargeableIncome: Math.max(0, adjustedProfitBeforeLosses - carriedForwardLosses),
      currentYearLoss,
    };
  }

  function calculateSmartTaxSummary({
    taxableIncome,
    deductions = 0,
    taxAlreadyPaid = 0,
    employeeNssf = 0,
    spouseRelief = 0,
    dependentRelief = 0,
    otherRelief = 0,
    isResident = true,
  } = {}) {
    requireNonNegative(taxableIncome, "Taxable income");
    requireNonNegative(deductions, "Allowable deductions");
    requireNonNegative(taxAlreadyPaid, "Tax already paid");
    requireNonNegative(employeeNssf, "Employee NSSF contribution");
    requireNonNegative(spouseRelief, "Spouse relief");
    requireNonNegative(dependentRelief, "Dependent relief");
    requireNonNegative(otherRelief, "Other relief");

    const chargeableIncome = Math.max(0, taxableIncome - deductions);
    const estimate = calculateIndividualIncomeTax(chargeableIncome, isResident);
    const reliefTotal = spouseRelief + dependentRelief + otherRelief;
    const taxBeforeCredit = estimate.totalTax;
    const taxAfterRelief = Math.max(0, taxBeforeCredit - reliefTotal);
    const nssfRelief = Math.min(employeeNssf, taxAfterRelief);
    const finalTax = Math.max(0, taxAfterRelief - nssfRelief);
    const balance = Math.max(0, finalTax - taxAlreadyPaid);
    const refundableCredit = Math.max(0, taxAlreadyPaid - finalTax);

    return {
      taxableIncome,
      deductions,
      chargeableIncome,
      estimate,
      reliefTotal,
      nssfRelief,
      taxBeforeCredit,
      taxAfterRelief,
      totalTax: finalTax,
      balance,
      refundableCredit,
      effectiveRate: chargeableIncome === 0 ? 0 : finalTax / chargeableIncome,
      marginalRate: estimate.marginalRate,
      note: taxAlreadyPaid > 0
        ? "This estimate reflects the tax after allowable deductions, reliefs and employee NSSF relief, then subtracts tax already paid. Any excess payment is treated as a potential refundable credit."
        : "This estimate reflects the tax after allowable deductions, reliefs and employee NSSF relief. Confirm whether the annual income is correctly classified before filing.",
    };
  }

  function calculatePaye(
    monthlyTaxableIncome,
    isResident = true,
    monthlyGrossEarnings = monthlyTaxableIncome,
  ) {
    requireNonNegative(monthlyTaxableIncome, "Monthly taxable employment income");
    requireNonNegative(monthlyGrossEarnings, "Monthly gross earnings");

    const annualEstimate = calculateIndividualIncomeTax(monthlyTaxableIncome * 12, isResident);

    return {
      taxRuleSet: individualTaxRuleSet,
      monthlyTax: annualEstimate.totalTax / 12,
      effectiveRate: annualEstimate.effectiveRate,
      marginalRate: annualEstimate.marginalRate,
      monthlyEmployeeNssf: monthlyGrossEarnings * 0.05,
      monthlyEmployerNssf: monthlyGrossEarnings * 0.1,
      breakdown: annualEstimate.breakdown.map((band) => ({
        label: band.label,
        rate: band.rate,
        tax: band.tax / 12,
      })),
      smartEstimate: calculateSmartTaxSummary({
        taxableIncome: monthlyTaxableIncome * 12,
        employeeNssf: monthlyGrossEarnings * 0.05 * 12,
        isResident,
      }),
    };
  }

  function calculatePayeWithSecondaryEmployment(
    primaryMonthlyTaxableIncome,
    secondaryMonthlyTaxableIncome = 0,
    isResident = true,
    primaryMonthlyGrossEarnings = primaryMonthlyTaxableIncome,
  ) {
    requireNonNegative(
      secondaryMonthlyTaxableIncome,
      "Monthly secondary employment income",
    );
    const primary = calculatePaye(
      primaryMonthlyTaxableIncome,
      isResident,
      primaryMonthlyGrossEarnings,
    );
    const secondaryRate =
      activeTaxRules.individualIncomeTax.secondaryEmploymentWithholdingRate;
    const secondaryMonthlyTax = secondaryMonthlyTaxableIncome * secondaryRate;
    const combinedMonthlyTaxableIncome =
      primaryMonthlyTaxableIncome + secondaryMonthlyTaxableIncome;
    const combinedIncomeEstimate = calculatePaye(
      combinedMonthlyTaxableIncome,
      isResident,
      combinedMonthlyTaxableIncome,
    );

    return {
      taxRuleSet: primary.taxRuleSet,
      primaryMonthlyTax: primary.monthlyTax,
      primaryBreakdown: primary.breakdown,
      secondaryMonthlyTaxableIncome,
      secondaryRate,
      secondaryMonthlyTax,
      totalMonthlyWithholding: primary.monthlyTax + secondaryMonthlyTax,
      combinedMonthlyTaxableIncome,
      combinedAnnualTaxableIncome: combinedMonthlyTaxableIncome * 12,
      estimatedMonthlyTaxOnCombinedIncome: combinedIncomeEstimate.monthlyTax,
      estimatedAnnualTaxOnCombinedIncome: combinedIncomeEstimate.monthlyTax * 12,
      monthlyWithholdingDifference:
        primary.monthlyTax + secondaryMonthlyTax - combinedIncomeEstimate.monthlyTax,
      monthlyEmployeeNssf: primary.monthlyEmployeeNssf,
      monthlyEmployerNssf: primary.monthlyEmployerNssf,
    };
  }


  function calculateCompanyIncomeTax(chargeableIncome, taxPaid = 0, withholdingCredits = 0) {
    requireNonNegative(chargeableIncome, "Chargeable company income");
    requireNonNegative(taxPaid, "Tax already paid");
    requireNonNegative(withholdingCredits, "Creditable withholding tax");
    const taxRate = activeTaxRules.companyIncomeTax.standardResidentRate;
    const tax = chargeableIncome * taxRate;
    const balance = tax - taxPaid - withholdingCredits;

    return {
      tax,
      provisionalTaxPaid: taxPaid,
      withholdingCredits,
      totalCredits: taxPaid + withholdingCredits,
      balance,
      taxRate,
      effectiveRate: chargeableIncome === 0 ? 0 : tax / chargeableIncome,
      breakdown: [
        { label: "Chargeable company income", rate: null, amount: chargeableIncome },
        { label: "Company income tax", rate: taxRate, amount: tax },
      ],
      taxRuleSet: companyTaxRuleSet,
    };
  }

  function calculateWearAndTear({
    assetClass,
    openingTaxWrittenDownValue,
    additions = 0,
    disposalProceeds = 0,
    businessUsePercent,
  }) {
    const selectedClass = wearAndTearClasses.find((item) => item.id === assetClass);
    if (!selectedClass) {
      throw new RangeError("Select a valid wear-and-tear asset class.");
    }

    requireNonNegative(openingTaxWrittenDownValue, "Opening tax written-down value");
    requireNonNegative(additions, "Qualifying additions");
    requireNonNegative(disposalProceeds, "Disposal proceeds");
    if (!Number.isFinite(businessUsePercent) ||
        businessUsePercent < 0 ||
        businessUsePercent > 100) {
      throw new RangeError("Business use must be between 0 and 100 percent.");
    }

    const businessUse = businessUsePercent / 100;
    const businessUseAdditions = additions * businessUse;
    const businessUseDisposalProceeds = disposalProceeds * businessUse;
    const poolBeforeDisposals = openingTaxWrittenDownValue + businessUseAdditions;
    const excessDisposalProceeds = Math.max(
      0,
      businessUseDisposalProceeds - poolBeforeDisposals,
    );
    const poolAvailableForAllowance = Math.max(
      0,
      poolBeforeDisposals - businessUseDisposalProceeds,
    );
    const allowance = poolAvailableForAllowance * selectedClass.rate;
    const closingTaxWrittenDownValue = poolAvailableForAllowance - allowance;

    return {
      taxRuleSet: capitalAllowanceRuleSet,
      assetClass: selectedClass,
      rate: selectedClass.rate,
      openingTaxWrittenDownValue,
      additions,
      businessUsePercent,
      businessUseAdditions,
      disposalProceeds,
      businessUseDisposalProceeds,
      poolBeforeDisposals,
      poolAvailableForAllowance,
      allowance,
      closingTaxWrittenDownValue,
      excessDisposalProceeds,
      breakdown: [
        { label: "Opening tax written-down value", rate: null, amount: openingTaxWrittenDownValue },
        { label: `Additions included at ${businessUsePercent}% business use`, rate: null, amount: businessUseAdditions },
        { label: `Less: disposal proceeds at ${businessUsePercent}% business use`, rate: null, amount: -businessUseDisposalProceeds },
        { label: "Pool balance before wear-and-tear allowance", rate: null, amount: poolAvailableForAllowance },
        { label: `Wear-and-tear allowance — ${selectedClass.id.replace("-", " ")} at ${selectedClass.rate * 100}%`, rate: selectedClass.rate, amount: allowance },
        { label: "Closing tax written-down value to carry forward", rate: null, amount: closingTaxWrittenDownValue },
        ...(excessDisposalProceeds > 0
          ? [{ label: "Excess disposal proceeds — review for a balancing adjustment", rate: null, amount: excessDisposalProceeds }]
          : []),
      ],
    };
  }

  function calculateCustomsEstimate({
    direction,
    customsValue,
    customsDutyRate = 0,
    importExciseDuty = 0,
    importWithholdingRate = 0,
    importOtherCharges = 0,
    importVatTreatment = "standard",
    exportVatTreatment = "zero-rated",
    exportVatRate = 0,
    exportLevyRate = 0,
    exportExciseDuty = 0,
    exportOtherCharges = 0,
  }) {
    requireNonNegative(customsValue, "Customs or export value");

    const requireRate = (rate, name) => {
      requireNonNegative(rate, name);
      if (rate > 100) {
        throw new RangeError(`${name} must not exceed 100%.`);
      }
    };

    const rows = [];
    let totalCharges;

    if (direction === "import") {
      requireRate(customsDutyRate, "Customs duty rate");
      requireRate(importWithholdingRate, "Import withholding tax rate");
      requireNonNegative(importExciseDuty, "Import excise duty");
      requireNonNegative(importOtherCharges, "Other import charges");

      const customsDuty = customsValue * customsDutyRate / 100;
      const importVatRate = importVatTreatmentRate(importVatTreatment);
      const importVatBase = customsValue + customsDuty + importExciseDuty;
      const importVat = importVatBase * importVatRate;
      const importWithholding = customsValue * importWithholdingRate / 100;
      totalCharges = customsDuty + importExciseDuty + importVat +
        importWithholding + importOtherCharges;

      rows.push(
        { label: "Customs value (as assessed)", rate: null, amount: customsValue },
        { label: "Customs duty", rate: customsDutyRate / 100, amount: customsDuty },
        { label: "Excise duty entered", rate: null, amount: importExciseDuty },
        { label: "Import VAT", rate: importVatRate, amount: importVat },
        { label: "Import withholding tax (entered rate)", rate: importWithholdingRate / 100, amount: importWithholding },
        { label: "Other import charges entered", rate: null, amount: importOtherCharges },
        { label: "Estimated total border taxes and charges", rate: null, amount: totalCharges },
        { label: "Estimated landed cost before local delivery", rate: null, amount: customsValue + totalCharges },
      );

      return {
        direction,
        customsValue,
        totalCharges,
        landedCost: customsValue + totalCharges,
        importVat,
        breakdown: rows,
      };
    }

    if (direction === "export") {
      requireRate(exportVatRate, "Export VAT rate");
      requireRate(exportLevyRate, "Export duty or levy rate");
      requireNonNegative(exportExciseDuty, "Export excise duty");
      requireNonNegative(exportOtherCharges, "Other export charges");
      if (!["standard", "zero-rated", "exempt"].includes(exportVatTreatment)) {
        throw new RangeError("Choose a valid export VAT treatment.");
      }

      const vatRate = exportVatTreatment === "standard"
        ? exportVatRate / 100
        : 0;
      const exportVat = customsValue * vatRate;
      const exportLevy = customsValue * exportLevyRate / 100;
      totalCharges = exportVat + exportLevy + exportExciseDuty + exportOtherCharges;

      rows.push(
        { label: "Export value entered", rate: null, amount: customsValue },
        { label: "Export VAT", rate: vatRate, amount: exportVat },
        { label: "Export duty or levy (entered rate)", rate: exportLevyRate / 100, amount: exportLevy },
        { label: "Excise duty entered", rate: null, amount: exportExciseDuty },
        { label: "Other export charges entered", rate: null, amount: exportOtherCharges },
        { label: "Estimated total export taxes and charges", rate: null, amount: totalCharges },
        { label: "Estimated proceeds after entered charges", rate: null, amount: customsValue - totalCharges },
      );

      return {
        direction,
        customsValue,
        totalCharges,
        netProceeds: customsValue - totalCharges,
        exportVat,
        breakdown: rows,
      };
    }

    throw new RangeError("Choose whether the goods are being imported or exported.");
  }

  function importVatTreatmentRate(treatment) {
    if (treatment === "standard") return 0.18;
    if (treatment === "zero-rated" || treatment === "exempt") return 0;
    throw new RangeError("Choose a valid import VAT treatment.");
  }

  function calculateVat({
    standardRatedSales,
    salesIncludeVat = false,
    zeroRatedSales = 0,
    exemptSales = 0,
    claimableInputVat = 0,
    annualTaxableTurnover,
    threeMonthTaxableTurnover,
    remoteServices = false,
  }) {
    requireNonNegative(standardRatedSales, "Standard-rated sales");
    requireNonNegative(zeroRatedSales, "Zero-rated sales");
    requireNonNegative(exemptSales, "Exempt sales");
    requireNonNegative(claimableInputVat, "Claimable input VAT");
    if (annualTaxableTurnover !== undefined) {
      requireNonNegative(annualTaxableTurnover, "Annual taxable turnover");
    }
    if (threeMonthTaxableTurnover !== undefined) {
      requireNonNegative(threeMonthTaxableTurnover, "Three-month taxable turnover");
    }

    const taxableValue = salesIncludeVat
      ? standardRatedSales / 1.18
      : standardRatedSales;
    const outputVat = salesIncludeVat
      ? standardRatedSales - taxableValue
      : taxableValue * 0.18;
    const taxableSupplyValue = taxableValue + zeroRatedSales;
    const totalSupplyValue = taxableSupplyValue + exemptSales;
    const exemptShare = totalSupplyValue === 0 ? 0 : exemptSales / totalSupplyValue;
    const recoverableInputFraction = exemptShare <= 0.05
      ? 1
      : exemptShare > 0.95
        ? 0
        : taxableSupplyValue / totalSupplyValue;
    const recoverableInputVat = claimableInputVat * recoverableInputFraction;
    const netVat = outputVat - recoverableInputVat;
    const registrationRequired = Boolean(
      remoteServices ||
      (annualTaxableTurnover !== undefined && annualTaxableTurnover > 300_000_000) ||
      (threeMonthTaxableTurnover !== undefined && threeMonthTaxableTurnover > 75_000_000),
    );

    return {
      outputVat,
      claimableInputVat: recoverableInputVat,
      enteredInputVat: claimableInputVat,
      recoverableInputFraction,
      exemptShare,
      netVat,
      zeroRatedSales,
      taxableSupplyValue,
      annualTaxableTurnover,
      threeMonthTaxableTurnover,
      registrationRequired,
      registrationAssessed: remoteServices ||
        annualTaxableTurnover !== undefined ||
        threeMonthTaxableTurnover !== undefined,
      breakdown: [
        { label: "Output VAT on standard-rated sales", rate: 0.18, amount: outputVat },
        { label: "Zero-rated sales (VAT at 0%)", rate: 0, amount: zeroRatedSales },
        { label: "Exempt sales (no output VAT)", rate: null, amount: exemptSales },
        { label: "Entered input VAT", rate: null, amount: claimableInputVat },
        { label: "Allowable input VAT after exempt-supply restriction", rate: null, amount: -recoverableInputVat },
      ],
    };
  }

  function calculateRentalIncomeTax({
    grossRentalIncome,
    taxpayerType = "individual",
    residency = "resident",
    allowableExpenses = 0,
    carriedForwardLosses = 0,
    taxPaid = 0,
    withholdingCredits = 0,
  }) {
    requireNonNegative(grossRentalIncome, "Gross rental income");
    requireNonNegative(allowableExpenses, "Allowable rental expenses");
    requireNonNegative(carriedForwardLosses, "Carried-forward rental tax losses");
    requireNonNegative(taxPaid, "Rental tax already paid");
    requireNonNegative(withholdingCredits, "Creditable rental withholding tax");

    if (!["individual", "company"].includes(taxpayerType)) {
      throw new RangeError("Choose an individual or company taxpayer.");
    }
    if (!["resident", "nonresident"].includes(residency)) {
      throw new RangeError("Choose resident or non-resident tax status.");
    }

    const breakdown = [
      { label: "Annual gross rental income", rate: null, amount: grossRentalIncome },
    ];
    let taxBase = grossRentalIncome;
    let taxRate;
    let tax;
    let taxLabel;
    let balance;
    let currentYearLoss = 0;
    let totalCredits;
    let note;

    if (residency === "nonresident") {
      taxRate = 0.15;
      tax = grossRentalIncome * taxRate;
      totalCredits = taxPaid;
      balance = tax - totalCredits;
      taxLabel = "Indicative gross-rent withholding on Uganda-source rent";
      breakdown.push(
        { label: "Non-resident rent withholding (gross basis)", rate: taxRate, amount: tax },
        { label: "Withholding/tax already paid entered", rate: null, amount: -taxPaid },
        { label: "Estimated withholding still due", rate: null, amount: balance },
      );
      note = "For Uganda-source rent paid to a non-resident, the standard domestic withholding rate is 15% of gross rent. A double-tax agreement or specific circumstances may change the rate, final-tax treatment or filing obligations. This estimate does not calculate treaty relief or determine the withholding agent; confirm with URA or a qualified tax professional. Rental expenses are not deducted from this gross-basis estimate.";
    } else if (taxpayerType === "individual") {
      taxRate = 0.12;
      taxBase = Math.max(0, grossRentalIncome - 2_820_000);
      tax = taxBase * taxRate;
      totalCredits = taxPaid;
      balance = tax - totalCredits;
      taxLabel = "Estimated individual rental income tax";
      breakdown.push(
        { label: "Annual individual rental threshold", rate: null, amount: -Math.min(grossRentalIncome, 2_820_000) },
        { label: "Taxable rental income", rate: null, amount: taxBase },
        { label: "Individual rental income tax", rate: taxRate, amount: tax },
        { label: "Rental tax already paid entered", rate: null, amount: -taxPaid },
        { label: "Estimated balance after entered payments", rate: null, amount: balance },
      );
      note = "Applies the individual rental-tax rule: 12% of annual gross rental income above UGX 2,820,000, without expense deductions. The annual threshold is shown for an individual landlord; non-resident persons are handled under the separate non-resident gross-rent withholding estimate. Secondary commentary describes monthly provisional returns as an option, not a general mandatory monthly filing rule; confirm the available filing route and any payment obligation with URA.";
    } else {
      taxRate = activeTaxRules.companyIncomeTax.standardResidentRate;
      const companyTaxBase = calculateCompanyTaxBase(
        grossRentalIncome,
        0,
        allowableExpenses,
        carriedForwardLosses,
      );
      taxBase = companyTaxBase.chargeableIncome;
      currentYearLoss = companyTaxBase.currentYearLoss;
      tax = taxBase * taxRate;
      totalCredits = taxPaid + withholdingCredits;
      balance = tax - totalCredits;
      taxLabel = "Estimated company income tax on rental income";
      breakdown.push(
        { label: "Allowable rental expenses entered", rate: null, amount: -allowableExpenses },
        { label: "Adjusted rental profit before carried-forward losses", rate: null, amount: companyTaxBase.adjustedProfitBeforeLosses },
        ...(carriedForwardLosses > 0
          ? [{ label: "Eligible carried-forward rental tax losses used", rate: null, amount: -carriedForwardLosses }]
          : []),
        { label: "Estimated chargeable rental income", rate: null, amount: taxBase },
        ...(currentYearLoss > 0
          ? [{ label: "Current-year rental tax loss (not automatically carried forward)", rate: null, amount: currentYearLoss }]
          : []),
        { label: "Company income tax", rate: taxRate, amount: tax },
        { label: "Provisional tax paid entered", rate: null, amount: -taxPaid },
        { label: "Creditable withholding tax entered", rate: null, amount: -withholdingCredits },
        { label: "Estimated balance after entered credits", rate: null, amount: balance },
      );
      note = "Uses the standard 30% resident-company rate on estimated chargeable rental income after user-entered allowable expenses and eligible carried-forward losses. The estimator does not determine deductibility, loss availability, ring-fencing, incentives or whether rental income is part of a broader company tax computation. Avoid double counting this income, expenses, losses or credits in the separate company calculator.";
    }

    return {
      tax,
      balance,
      taxBase,
      taxRate,
      taxLabel,
      totalCredits,
      currentYearLoss,
      ...(taxpayerType === "company" && residency !== "nonresident"
        ? { taxRuleSet: companyTaxRuleSet }
        : {}),
      breakdown,
      note,
    };
  }

  function calculateWithholdingTax(
    grossPayment,
    paymentType,
    isDesignatedPayer = false,
    supplierIssuedInvoice = false,
    stakeAmount = 0,
    isNationalLotteryWinnings = false,
  ) {
    requireNonNegative(grossPayment, "Gross payment");
    const category = withholdingRates[paymentType];

    if (!category) {
      throw new RangeError("Choose a supported withholding payment category.");
    }

    if (paymentType === "betting-winnings") {
      requireNonNegative(stakeAmount, "Stake amount");
      if (stakeAmount > grossPayment) {
        throw new RangeError("Stake amount cannot exceed the payout amount.");
      }
    }

    const taxBase = paymentType === "betting-winnings"
      ? grossPayment - stakeAmount
      : grossPayment;
    const thresholdApplies = paymentType === "resident-supply";
    const vatInvoiceExemption = paymentType === "vat-withholding" &&
      (!isDesignatedPayer || supplierIssuedInvoice);
    const lotteryExemption = paymentType === "betting-winnings" && isNationalLotteryWinnings;
    const exemptPayment = thresholdApplies &&
      (!isDesignatedPayer || grossPayment <= 1_000_000) ||
      vatInvoiceExemption ||
      lotteryExemption;
    const rate = exemptPayment ? 0 : category.rate;
    const tax = taxBase * rate;

    return {
      tax,
      rate,
      taxBase,
      paymentLabel: category.label,
      breakdown: paymentType === "betting-winnings"
        ? [
            { label: "Payout amount", rate: null, amount: grossPayment },
            { label: "Less stake", rate: null, amount: -stakeAmount },
            { label: "Winnings subject to withholding", rate: null, amount: taxBase },
            { label: category.label, rate, amount: tax },
          ]
        : [
            { label: "Gross payment", rate: null, amount: grossPayment },
            { label: category.label, rate, amount: tax },
          ],
      note: lotteryExemption
        ? "No withholding is estimated for winnings paid by a person licensed to conduct a national lottery. Verify the licence, payment and statutory conditions."
        : paymentType === "betting-winnings"
          ? "The 15% withholding estimate is based on winnings (payout less stake), not the full payout. The statutory exclusion for winnings paid by a person licensed to conduct a national lottery applies only when its conditions are met."
          : paymentType === "resident-telecom-commission"
            ? "The 10% category concerns commissions paid by telecommunications service providers for telecommunications retail, mobile network or mobile-money services. Confirm the payer, commission and statutory conditions."
            : paymentType === "nonresident-debenture-interest"
        ? "The 5% rate applies only if all statutory conditions for qualifying offshore debentures are met. Otherwise the general non-resident interest rate may apply; verify the instrument and recipient before withholding."
        : paymentType === "insurance-agent-commission"
          ? "The 10% withholding on an insurance-agent commission is a final tax from 1 July 2026."
          : exemptPayment
            ? paymentType === "vat-withholding"
              ? "No VAT withholding is estimated: it applies only to a designated withholding agent where the supplier has not issued an EFRIS e-invoice or e-receipt."
              : "This estimate applies no withholding because resident supply withholding generally requires a designated agent and a payment exceeding UGX 1,000,000."
            : "Treaty relief, exemptions, final-tax treatment and special payer rules are not included. Verify the applicable rate before withholding.",
    };
  }

  function calculatePresumptiveTax(annualTurnover, applicableRatePercent) {
    requireNonNegative(annualTurnover, "Annual turnover");

    if (!Number.isFinite(applicableRatePercent) ||
        applicableRatePercent < 0 ||
        applicableRatePercent > 100) {
      throw new RangeError("The applicable presumptive rate must be between 0 and 100 percent.");
    }

    if (annualTurnover > 150_000_000) {
      throw new RangeError("The standard presumptive regime generally applies to eligible resident taxpayers with turnover not exceeding UGX 150,000,000. Use another income tax calculator or confirm your treatment.");
    }

    const rate = applicableRatePercent / 100;
    const tax = annualTurnover * rate;

    return {
      tax,
      rate,
      breakdown: [
        { label: "Annual business turnover", rate: null, amount: annualTurnover },
        { label: "Presumptive tax (user-entered rate)", rate, amount: tax },
      ],
    };
  }

  return {
    calculateChargeableIncome,
    calculateCompanyTaxBase,
    calculateWearAndTear,
    wearAndTearClasses,
    calculateCustomsEstimate,
    calculateIndividualIncomeTax,
    calculateSmartTaxSummary,
    calculatePaye,
    calculatePayeWithSecondaryEmployment,
    calculateCompanyIncomeTax,
    calculateVat,
    calculateRentalIncomeTax,
    calculateWithholdingTax,
    calculatePresumptiveTax,
  };
});
