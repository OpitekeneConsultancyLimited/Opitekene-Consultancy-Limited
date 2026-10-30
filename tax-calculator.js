(function (root, factory) {
  const calculator = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = calculator;
  } else {
    root.ugandaTax = calculator;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const residentIndividualBands = [
    { label: "UGX 0 – 4,020,000", lower: 0, upper: 4_020_000, rate: 0 },
    { label: "UGX 4,020,001 – 4,920,000", lower: 4_020_000, upper: 4_920_000, rate: 0.2 },
    { label: "UGX 4,920,001 – 5,820,000", lower: 4_920_000, upper: 5_820_000, rate: 0.25 },
    { label: "UGX 5,820,001 – 120,000,000", lower: 5_820_000, upper: 120_000_000, rate: 0.3 },
    { label: "Above UGX 120,000,000", lower: 120_000_000, upper: Infinity, rate: 0.4 },
  ];

  const nonResidentIndividualBands = [
    { label: "UGX 0 – 4,020,000", lower: 0, upper: 4_020_000, rate: 0.1 },
    { label: "UGX 4,020,001 – 4,920,000", lower: 4_020_000, upper: 4_920_000, rate: 0.2 },
    { label: "UGX 4,920,001 – 120,000,000", lower: 4_920_000, upper: 120_000_000, rate: 0.3 },
    { label: "Above UGX 120,000,000", lower: 120_000_000, upper: Infinity, rate: 0.4 },
  ];

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
    "payment-service-commission": { label: "Payment service provider commission", rate: 0.1 },
    "insurance-agent-commission": { label: "Insurance agent commission", rate: 0.1 },
    "advertising-agent-commission": { label: "Advertising agent commission", rate: 0.1 },
    "mobile-money-commission": { label: "Airtime distribution or mobile money commission", rate: 0.1 },
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

  function calculatePaye(
    monthlyTaxableIncome,
    isResident = true,
    monthlyGrossEarnings = monthlyTaxableIncome,
  ) {
    requireNonNegative(monthlyTaxableIncome, "Monthly taxable employment income");
    requireNonNegative(monthlyGrossEarnings, "Monthly gross earnings");

    const annualEstimate = calculateIndividualIncomeTax(monthlyTaxableIncome * 12, isResident);

    return {
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
    };
  }

  function calculateCompanyIncomeTax(chargeableIncome, taxPaid = 0, withholdingCredits = 0) {
    requireNonNegative(chargeableIncome, "Chargeable company income");
    requireNonNegative(taxPaid, "Tax already paid");
    requireNonNegative(withholdingCredits, "Creditable withholding tax");
    const tax = chargeableIncome * 0.3;
    const balance = tax - taxPaid - withholdingCredits;

    return {
      tax,
      provisionalTaxPaid: taxPaid,
      withholdingCredits,
      totalCredits: taxPaid + withholdingCredits,
      balance,
      effectiveRate: chargeableIncome === 0 ? 0 : tax / chargeableIncome,
      breakdown: [
        { label: "Chargeable company income", rate: null, amount: chargeableIncome },
        { label: "Company income tax", rate: 0.3, amount: tax },
      ],
    };
  }

  function calculateCapitalAllowance(taxBase, ratePercent) {
    requireNonNegative(taxBase, "Capital allowance tax basis");
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      throw new RangeError("The capital allowance rate must be between 0 and 100 percent.");
    }

    const rate = ratePercent / 100;
    const allowance = taxBase * rate;

    return {
      taxBase,
      rate,
      allowance,
      closingTaxValue: taxBase - allowance,
      breakdown: [
        { label: "Tax basis entered", rate: null, amount: taxBase },
        { label: "Capital allowance at user-confirmed rate", rate, amount: allowance },
        { label: "Illustrative closing tax value", rate: null, amount: taxBase - allowance },
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

  function calculateRentalIncomeTax(grossRentalIncome, taxPaid = 0) {
    requireNonNegative(grossRentalIncome, "Gross rental income");
    requireNonNegative(taxPaid, "Rental tax already paid");
    const taxableRentalIncome = Math.max(0, grossRentalIncome - 2_820_000);
    const tax = taxableRentalIncome * 0.12;

    return {
      tax,
      balance: tax - taxPaid,
      taxableRentalIncome,
      breakdown: [
        { label: "Annual gross rental income", rate: null, amount: grossRentalIncome },
        { label: "Rental income threshold", rate: null, amount: -Math.min(grossRentalIncome, 2_820_000) },
        { label: "Taxable rental income", rate: null, amount: taxableRentalIncome },
        { label: "Rental income tax", rate: 0.12, amount: tax },
      ],
    };
  }

  function calculateWithholdingTax(
    grossPayment,
    paymentType,
    isDesignatedPayer = false,
    supplierIssuedInvoice = false,
  ) {
    requireNonNegative(grossPayment, "Gross payment");
    const category = withholdingRates[paymentType];

    if (!category) {
      throw new RangeError("Choose a supported withholding payment category.");
    }

    const thresholdApplies = paymentType === "resident-supply";
    const vatInvoiceExemption = paymentType === "vat-withholding" &&
      (!isDesignatedPayer || supplierIssuedInvoice);
    const exemptPayment = thresholdApplies &&
      (!isDesignatedPayer || grossPayment <= 1_000_000) ||
      vatInvoiceExemption;
    const rate = exemptPayment ? 0 : category.rate;
    const tax = grossPayment * rate;

    return {
      tax,
      rate,
      paymentLabel: category.label,
      breakdown: [
        { label: "Gross payment", rate: null, amount: grossPayment },
        { label: category.label, rate, amount: tax },
      ],
      note: paymentType === "nonresident-debenture-interest"
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
    calculateCapitalAllowance,
    calculateCustomsEstimate,
    calculateIndividualIncomeTax,
    calculatePaye,
    calculateCompanyIncomeTax,
    calculateVat,
    calculateRentalIncomeTax,
    calculateWithholdingTax,
    calculatePresumptiveTax,
  };
});
