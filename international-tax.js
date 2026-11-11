(function (root, factory) {
  const internationalTax = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = internationalTax;
  } else {
    root.internationalTax = internationalTax;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const RATE_SOURCE = { id: "rateSource", label: "Where the rate comes from (Act and section, treaty article or URA notice)", text: true };
  const methods = {
    taxableIncome: {
      title: "Taxable income, with working",
      caveat: "Arithmetic only. Whether income is taxable or exempt, and whether a deduction is allowed, is decided by the Income Tax Act for the period.",
      fields: [
        { id: "grossIncomeUGX", label: "Gross income (UGX)" },
        { id: "exemptIncomeUGX", label: "Income you have confirmed is exempt (UGX)" },
        { id: "deductionsUGX", label: "Deductions you have confirmed are allowable (UGX)" },
        { id: "ratePercent", label: "Rate to apply, if known (%) (optional)", percent: true, optional: true },
        { ...RATE_SOURCE, optional: true },
      ],
      calculate: calculateTaxableIncome,
      rows: (result) => [["Taxable income", result.taxableIncomeUGX, "UGX"], ...(result.taxUGX === null ? [] : [["Tax at the rate you entered", result.taxUGX, "UGX"]])],
    },
    foreignTaxCredit: {
      title: "Foreign tax credit, with working",
      caveat: "Applies the usual credit limit (the lesser of the foreign tax and the Uganda tax on the same income). Confirm in the Income Tax Act that this income and this foreign tax qualify, and how the limit is worked out.",
      fields: [
        { id: "foreignIncomeUGX", label: "Foreign income, converted to UGX" },
        { id: "foreignTaxPaidUGX", label: "Foreign tax paid on it, converted to UGX" },
        { id: "ratePercent", label: "Uganda rate that applies to this income (%)", percent: true },
        RATE_SOURCE,
      ],
      calculate: calculateForeignTaxCredit,
      rows: (result) => [
        ["Uganda tax on the foreign income", result.ugandaTaxUGX, "UGX"],
        ["Foreign tax credit", result.creditUGX, "UGX"],
        ["Uganda tax still payable on it", result.ugandaTaxAfterCreditUGX, "UGX"],
        ["Foreign tax not relieved", result.unrelievedUGX, "UGX"],
      ],
    },
    doubleTaxRelief: {
      title: "Double tax relief: credit, exemption and deduction compared",
      caveat: "Shows how the three relief methods would work on the same figures. Which method Uganda law gives for this income is a legal question; most often it is the credit.",
      fields: [
        { id: "foreignIncomeUGX", label: "Foreign income, converted to UGX" },
        { id: "foreignTaxPaidUGX", label: "Foreign tax paid on it, converted to UGX" },
        { id: "ratePercent", label: "Uganda rate that applies to this income (%)", percent: true },
        RATE_SOURCE,
      ],
      calculate: calculateDoubleTaxRelief,
      rows: (result) => result.methods.map((m) => [`Total tax (foreign + Uganda): ${m.label}`, m.totalTaxUGX, "UGX"]),
    },
    withholdingGrossUp: {
      title: "Withholding tax, with working (including gross-up)",
      caveat: "Arithmetic only. Whether withholding applies, the rate, any treaty reduction and the payment deadline are set by the Income Tax Act and the treaty.",
      fields: [
        { id: "paymentUGX", label: "Payment amount (UGX)" },
        { id: "ratePercent", label: "Withholding rate (%)", percent: true },
        RATE_SOURCE,
        { id: "grossUp", label: "Must the payee receive this amount in full? (1 = yes, 0 = no)", integer: true },
      ],
      calculate: calculateWithholdingWorking,
      rows: (result) => [["Gross payment", result.grossUGX, "UGX"], ["Tax withheld and paid to URA", result.taxUGX, "UGX"], ["Net paid to the payee", result.netUGX, "UGX"]],
    },
    transferPricingAdjustment: {
      title: "Transfer pricing adjustment, with working",
      caveat: "Uses the arm's length price you enter. Establishing that price needs a transfer pricing analysis; this does not do that.",
      fields: [
        { id: "actualPrice", label: "Price actually charged per unit (UGX)" },
        { id: "armsLengthPrice", label: "Arm's length price per unit (UGX)", positive: true },
        { id: "quantity", label: "Number of units", integer: true, positive: true },
        { id: "ugandaIsSeller", label: "Is the Ugandan party the seller? (1 = seller, 0 = buyer)", integer: true },
        { id: "ratePercent", label: "Rate to apply to the adjustment, if known (%) (optional)", percent: true, optional: true },
        { ...RATE_SOURCE, optional: true },
      ],
      calculate: calculateTransferPricingAdjustment,
      rows: (result) => [["Increase in Uganda taxable income", result.adjustmentUGX, "UGX"], ...(result.taxUGX === null ? [] : [["Tax on the adjustment at the rate you entered", result.taxUGX, "UGX"]])],
    },
    structureComparison: {
      title: "Compare two ways of structuring a transaction",
      caveat: "Compares the effective tax rates and costs you enter for each option. It does not decide whether a structure works legally, and arrangements whose main purpose is a tax benefit may be cancelled by anti-avoidance rules.",
      fields: [
        { id: "incomeUGX", label: "Income or profit under both options (UGX)" },
        { id: "optionARatePercent", label: "Option A: total effective tax rate (%)", percent: true },
        { id: "optionACostsUGX", label: "Option A: other costs (UGX)" },
        { id: "optionBRatePercent", label: "Option B: total effective tax rate (%)", percent: true },
        { id: "optionBCostsUGX", label: "Option B: other costs (UGX)" },
        RATE_SOURCE,
      ],
      calculate: calculateStructureComparison,
      rows: (result) => [["Option A: net after tax and costs", result.optionA.netUGX, "UGX"], ["Option B: net after tax and costs", result.optionB.netUGX, "UGX"], ["Difference (A minus B)", result.differenceUGX, "UGX"]],
    },
    withholding: {
      title: "Illustrative withholding amounts",
      caveat: "Arithmetic only. Verify the legal rate, tax base, treaty in force, beneficial ownership, anti-abuse rules, paperwork and withholding obligations. Treaty eligibility is not assessed.",
      fields: [
        { id: "grossPayment", label: "Gross payment (UGX)" },
        { id: "domesticRatePercent", label: "Confirmed domestic withholding rate (%)", percent: true },
        { id: "treatyRatePercent", label: "Confirmed treaty rate (%) (optional)", percent: true, optional: true },
      ],
      calculate: calculateWithholdingComparison,
      rows: (result) => [
        ["Domestic-rate scenario", result.domesticWithholding, "UGX"],
        ...(result.treatyWithholding === null
          ? []
          : [
            ["Treaty-rate scenario (eligibility not assessed)", result.treatyWithholding, "UGX"],
            ["Domestic minus treaty scenario", result.scenarioDifference, "UGX"],
          ]),
      ],
    },
    foreignCredit: {
      title: "Illustrative foreign-tax-credit ceiling",
      caveat: "This compares amounts only. It does not determine whether foreign tax or income qualifies for relief, whether the same-income limitation applies, or whether the credit can be claimed in Uganda.",
      fields: [
        { id: "foreignTaxPaidUGX", label: "Foreign tax paid, converted to UGX" },
        { id: "ugandaTaxCapUGX", label: "User-confirmed Uganda tax ceiling for the same income (UGX)" },
      ],
      calculate: calculateForeignTaxCreditScenario,
      rows: (result) => [
        ["Indicative credit in this capped scenario", result.indicativeCreditUGX, "UGX"],
        ["Foreign tax above entered ceiling", result.uncreditedForeignTaxUGX, "UGX"],
      ],
    },
    currency: {
      title: "Indicative foreign-currency conversion",
      caveat: "Uses the exchange rate you enter. This is not an official tax conversion rate and does not determine the correct accounting or statutory conversion date.",
      fields: [
        { id: "foreignAmount", label: "Amount in foreign currency" },
        { id: "ugxPerForeignUnit", label: "UGX per one foreign-currency unit", positive: true },
      ],
      calculate: calculateCurrencyConversion,
      rows: (result) => [["Indicative UGX equivalent", result.ugxEquivalent, "UGX"]],
    },
    transferPricing: {
      title: "Related-party price comparison",
      caveat: "A difference is only a comparison to your entered reference amount. This does not establish an arm's-length price, a tax adjustment, or transfer-pricing compliance.",
      fields: [
        { id: "transactionPrice", label: "Actual transaction price (same currency units)" },
        { id: "referencePrice", label: "User-selected reference price (same currency units)", positive: true },
      ],
      calculate: calculateTransferPricingComparison,
      rows: (result) => [
        ["Actual price minus entered reference", result.priceDifference, "amount"],
        ["Difference as a percentage of reference", result.variancePercent, "%"],
      ],
    },
    workdays: {
      title: "Cross-border workday allocation scenario",
      caveat: "A day-based arithmetic allocation only. Taxable employment income, treaty relief, employer obligations and the correct day-count method depend on the countries and facts.",
      fields: [
        { id: "incomeForAllocationUGX", label: "Income considered for allocation (UGX)" },
        { id: "workdaysInUganda", label: "Workdays physically worked in Uganda", integer: true },
        { id: "totalWorkdays", label: "Total relevant workdays in period", integer: true, positive: true },
      ],
      calculate: calculateWorkdayAllocation,
      rows: (result) => [
        ["Uganda workday share", result.ugandaWorkdayShare, "%"],
        ["Income allocated by entered workday ratio", result.allocatedIncomeUGX, "UGX"],
      ],
    },
    importedServicesVat: {
      title: "Imported-service VAT scenario",
      caveat: "Arithmetic only using your confirmed taxable base, rate and recovery percentage. It does not decide whether reverse charge applies, whether input VAT is recoverable, or the filing period.",
      fields: [
        { id: "serviceValueUGX", label: "Confirmed taxable service value (UGX)" },
        { id: "vatRatePercent", label: "Confirmed VAT rate (%)", percent: true },
        { id: "recoverableInputPercent", label: "User-confirmed recoverable share of this VAT (%)", percent: true },
      ],
      calculate: calculateImportedServicesVat,
      rows: (result) => [
        ["Illustrative reverse-charge output VAT", result.outputVatUGX, "UGX"],
        ["Input VAT at entered recovery share", result.recoverableInputVatUGX, "UGX"],
        ["Net amount after entered recovery", result.netVatUGX, "UGX"],
      ],
    },
    profitAttribution: {
      title: "User-entered permanent-establishment profit allocation",
      caveat: "This applies a percentage you provide to a profit figure. It does not determine whether a permanent establishment exists or how profits must legally be attributed.",
      fields: [
        { id: "businessProfitUGX", label: "Profit considered for allocation (UGX)" },
        { id: "ugandaAttributionPercent", label: "User-confirmed Uganda-attributable share (%)", percent: true },
      ],
      calculate: calculateProfitAttributionScenario,
      rows: (result) => [
        ["Illustrative Uganda-attributed amount", result.ugandaAttributedProfitUGX, "UGX"],
        ["Remaining amount outside entered share", result.remainingProfitUGX, "UGX"],
      ],
    },
  };

  function requireAmount(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative number.`);
    }
  }

  function requireRate(value, label) {
    requireAmount(value, label);
    if (value > 100) {
      throw new RangeError(`${label} must not exceed 100%.`);
    }
  }

  function calculateWithholdingComparison({
    grossPayment,
    domesticRatePercent,
    treatyRatePercent,
  }) {
    requireAmount(grossPayment, "Gross payment");
    requireRate(domesticRatePercent, "Domestic rate");
    if (treatyRatePercent !== undefined && treatyRatePercent !== null) {
      requireRate(treatyRatePercent, "Treaty rate");
    }

    const domesticWithholding = grossPayment * domesticRatePercent / 100;
    const treatyWithholding = treatyRatePercent === undefined || treatyRatePercent === null
      ? null
      : grossPayment * treatyRatePercent / 100;

    return {
      domesticWithholding,
      treatyWithholding,
      scenarioDifference: treatyWithholding === null
        ? null
        : domesticWithholding - treatyWithholding,
    };
  }

  function calculateForeignTaxCreditScenario({ foreignTaxPaidUGX, ugandaTaxCapUGX }) {
    requireAmount(foreignTaxPaidUGX, "Foreign tax paid");
    requireAmount(ugandaTaxCapUGX, "Uganda tax ceiling");
    return {
      indicativeCreditUGX: Math.min(foreignTaxPaidUGX, ugandaTaxCapUGX),
      uncreditedForeignTaxUGX: Math.max(0, foreignTaxPaidUGX - ugandaTaxCapUGX),
    };
  }

  function calculateCurrencyConversion({ foreignAmount, ugxPerForeignUnit }) {
    requireAmount(foreignAmount, "Foreign amount");
    if (!Number.isFinite(ugxPerForeignUnit) || ugxPerForeignUnit <= 0) {
      throw new RangeError("Exchange rate must be greater than zero.");
    }
    return { ugxEquivalent: foreignAmount * ugxPerForeignUnit };
  }

  function calculateTransferPricingComparison({ transactionPrice, referencePrice }) {
    requireAmount(transactionPrice, "Transaction price");
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      throw new RangeError("Reference price must be greater than zero.");
    }
    const priceDifference = transactionPrice - referencePrice;
    return {
      priceDifference,
      variancePercent: priceDifference / referencePrice * 100,
    };
  }

  function calculateWorkdayAllocation({
    incomeForAllocationUGX,
    workdaysInUganda,
    totalWorkdays,
  }) {
    requireAmount(incomeForAllocationUGX, "Income for allocation");
    if (!Number.isInteger(workdaysInUganda) || workdaysInUganda < 0) {
      throw new RangeError("Uganda workdays must be a non-negative whole number.");
    }
    if (!Number.isInteger(totalWorkdays) || totalWorkdays <= 0) {
      throw new RangeError("Total workdays must be a positive whole number.");
    }
    if (workdaysInUganda > totalWorkdays) {
      throw new RangeError("Uganda workdays cannot exceed total workdays.");
    }
    const ugandaWorkdayShare = workdaysInUganda / totalWorkdays * 100;
    return {
      ugandaWorkdayShare,
      allocatedIncomeUGX: incomeForAllocationUGX * workdaysInUganda / totalWorkdays,
    };
  }

  function calculateImportedServicesVat({
    serviceValueUGX,
    vatRatePercent,
    recoverableInputPercent,
  }) {
    requireAmount(serviceValueUGX, "Service value");
    requireRate(vatRatePercent, "VAT rate");
    requireRate(recoverableInputPercent, "Recoverable input VAT share");
    const outputVatUGX = serviceValueUGX * vatRatePercent / 100;
    const recoverableInputVatUGX = outputVatUGX * recoverableInputPercent / 100;
    return {
      outputVatUGX,
      recoverableInputVatUGX,
      netVatUGX: outputVatUGX - recoverableInputVatUGX,
    };
  }

  function calculateProfitAttributionScenario({ businessProfitUGX, ugandaAttributionPercent }) {
    requireAmount(businessProfitUGX, "Business profit");
    requireRate(ugandaAttributionPercent, "Attribution share");
    const ugandaAttributedProfitUGX = businessProfitUGX * ugandaAttributionPercent / 100;
    return {
      ugandaAttributedProfitUGX,
      remainingProfitUGX: businessProfitUGX - ugandaAttributedProfitUGX,
    };
  }

  // ------------------------------------------------- calculations with working
  // Every one shows the figures used, the assumptions, the rule, the formula,
  // each step and the result. None has a built-in rate: the user enters the
  // rate and where it comes from, so TaxComp never invents one.
  const money = (value) => `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 }).format(value)}`;
  const pct = (value) => `${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 4 }).format(value)}%`;

  function requireSource(value) {
    const text = String(value ?? "").trim();
    if (text.length < 3) throw new RangeError("Say where the rate comes from (for example the Act and section, the treaty article or the URA notice). TaxComp does not supply rates.");
    return text.slice(0, 200);
  }

  function optionalRate(ratePercent, rateSource) {
    if (ratePercent === undefined || ratePercent === null) return null;
    requireRate(ratePercent, "Rate");
    return { rate: ratePercent, source: requireSource(rateSource) };
  }

  function calculateTaxableIncome({ grossIncomeUGX, exemptIncomeUGX, deductionsUGX, ratePercent, rateSource }) {
    requireAmount(grossIncomeUGX, "Gross income");
    requireAmount(exemptIncomeUGX, "Exempt income");
    requireAmount(deductionsUGX, "Deductions");
    if (exemptIncomeUGX > grossIncomeUGX) throw new RangeError("Exempt income cannot be more than gross income.");
    const rate = optionalRate(ratePercent, rateSource);
    const chargeable = grossIncomeUGX - exemptIncomeUGX;
    const taxableIncomeUGX = Math.max(0, chargeable - deductionsUGX);
    const taxUGX = rate ? taxableIncomeUGX * rate.rate / 100 : null;
    const steps = [
      `Gross income less exempt income: ${money(grossIncomeUGX)} − ${money(exemptIncomeUGX)} = ${money(chargeable)}`,
      `Less allowable deductions: ${money(chargeable)} − ${money(deductionsUGX)} = ${money(chargeable - deductionsUGX)}${chargeable - deductionsUGX < 0 ? " (a loss: taxable income is nil; whether the loss carries forward is a legal question)" : ""}`,
    ];
    if (rate) steps.push(`Tax: ${money(taxableIncomeUGX)} × ${pct(rate.rate)} = ${money(taxUGX)}`);
    return {
      taxableIncomeUGX, taxUGX,
      working: {
        figures: [["Gross income", money(grossIncomeUGX)], ["Exempt income", money(exemptIncomeUGX)], ["Allowable deductions", money(deductionsUGX)], ...(rate ? [["Rate", `${pct(rate.rate)} (source: ${rate.source})`]] : [])],
        assumptions: ["The exempt income and deductions entered are allowed by the Income Tax Act for this period.", ...(rate ? ["A single flat rate applies to the whole amount. Graduated rates (such as individual bands) need the band calculator instead."] : ["No rate entered, so no tax is computed."])],
        rule: "Taxable income is gross income, less exempt income, less allowable deductions.",
        formula: "Taxable income = max(0, gross − exempt − deductions)" + (rate ? "; tax = taxable income × rate" : ""),
        steps,
      },
    };
  }

  function calculateForeignTaxCredit({ foreignIncomeUGX, foreignTaxPaidUGX, ratePercent, rateSource }) {
    requireAmount(foreignIncomeUGX, "Foreign income");
    requireAmount(foreignTaxPaidUGX, "Foreign tax paid");
    requireRate(ratePercent, "Uganda rate");
    const source = requireSource(rateSource);
    if (foreignTaxPaidUGX > foreignIncomeUGX) throw new RangeError("Foreign tax paid cannot be more than the foreign income.");
    const ugandaTaxUGX = foreignIncomeUGX * ratePercent / 100;
    const creditUGX = Math.min(foreignTaxPaidUGX, ugandaTaxUGX);
    const ugandaTaxAfterCreditUGX = ugandaTaxUGX - creditUGX;
    const unrelievedUGX = Math.max(0, foreignTaxPaidUGX - ugandaTaxUGX);
    return {
      ugandaTaxUGX, creditUGX, ugandaTaxAfterCreditUGX, unrelievedUGX,
      working: {
        figures: [["Foreign income", money(foreignIncomeUGX)], ["Foreign tax paid", money(foreignTaxPaidUGX)], ["Uganda rate", `${pct(ratePercent)} (source: ${source})`]],
        assumptions: ["The amounts were converted to UGX at the rate the law requires.", "The foreign tax is a tax on income and has actually been paid (keep the certificate or receipt).", "The credit is limited per item of income; the Act may group income differently."],
        rule: "Credit method: the residence country taxes the foreign income but credits the foreign tax, up to its own tax on that income.",
        formula: "Credit = lesser of (foreign tax paid) and (foreign income × Uganda rate)",
        steps: [
          `Uganda tax on the foreign income: ${money(foreignIncomeUGX)} × ${pct(ratePercent)} = ${money(ugandaTaxUGX)}`,
          `Credit is the lesser of ${money(foreignTaxPaidUGX)} and ${money(ugandaTaxUGX)} = ${money(creditUGX)}`,
          `Uganda tax still payable on this income: ${money(ugandaTaxUGX)} − ${money(creditUGX)} = ${money(ugandaTaxAfterCreditUGX)}`,
          `Foreign tax above the limit (not refunded or credited): ${money(unrelievedUGX)}`,
        ],
      },
    };
  }

  function calculateDoubleTaxRelief({ foreignIncomeUGX, foreignTaxPaidUGX, ratePercent, rateSource }) {
    const credit = calculateForeignTaxCredit({ foreignIncomeUGX, foreignTaxPaidUGX, ratePercent, rateSource });
    const deductionBase = foreignIncomeUGX - foreignTaxPaidUGX;
    const deductionTax = deductionBase * ratePercent / 100;
    const noRelief = foreignIncomeUGX * ratePercent / 100;
    const methodsCompared = [
      { label: "no relief", ugandaTaxUGX: noRelief, totalTaxUGX: foreignTaxPaidUGX + noRelief },
      { label: "credit method", ugandaTaxUGX: credit.ugandaTaxAfterCreditUGX, totalTaxUGX: foreignTaxPaidUGX + credit.ugandaTaxAfterCreditUGX },
      { label: "exemption method", ugandaTaxUGX: 0, totalTaxUGX: foreignTaxPaidUGX },
      { label: "deduction method", ugandaTaxUGX: deductionTax, totalTaxUGX: foreignTaxPaidUGX + deductionTax },
    ];
    return {
      methods: methodsCompared,
      working: {
        figures: credit.working.figures,
        assumptions: [...credit.working.assumptions, "Exemption is shown without progression (the exempt income does not change the rate on other income)."],
        rule: "Credit: Uganda tax less foreign tax (capped). Exemption: no Uganda tax on the income. Deduction: foreign tax reduces the income Uganda taxes.",
        formula: "Credit: F×r − min(T, F×r) · Exemption: 0 · Deduction: (F − T)×r, where F is foreign income, T foreign tax, r the Uganda rate",
        steps: [
          `No relief: Uganda tax ${money(noRelief)}; total with foreign tax ${money(foreignTaxPaidUGX + noRelief)}`,
          `Credit: Uganda tax ${money(credit.ugandaTaxAfterCreditUGX)}; total ${money(foreignTaxPaidUGX + credit.ugandaTaxAfterCreditUGX)}`,
          `Exemption: Uganda tax nil; total ${money(foreignTaxPaidUGX)}`,
          `Deduction: (${money(foreignIncomeUGX)} − ${money(foreignTaxPaidUGX)}) × ${pct(ratePercent)} = ${money(deductionTax)}; total ${money(foreignTaxPaidUGX + deductionTax)}`,
        ],
      },
    };
  }

  function calculateWithholdingWorking({ paymentUGX, ratePercent, rateSource, grossUp }) {
    requireAmount(paymentUGX, "Payment");
    requireRate(ratePercent, "Withholding rate");
    const source = requireSource(rateSource);
    if (grossUp !== 0 && grossUp !== 1) throw new RangeError("Enter 1 if the payee must receive the amount in full, otherwise 0.");
    if (grossUp === 1 && ratePercent >= 100) throw new RangeError("A gross-up needs a rate below 100%.");
    const grossUGX = grossUp === 1 ? paymentUGX / (1 - ratePercent / 100) : paymentUGX;
    const taxUGX = grossUGX * ratePercent / 100;
    const netUGX = grossUGX - taxUGX;
    return {
      grossUGX, taxUGX, netUGX,
      working: {
        figures: [["Payment amount entered", money(paymentUGX)], ["Withholding rate", `${pct(ratePercent)} (source: ${source})`], ["Gross-up", grossUp === 1 ? "Yes: the payee must receive the amount in full" : "No"]],
        assumptions: ["Withholding applies to this payment and no exemption certificate covers it.", "If a treaty rate was entered, the payee qualifies for it (residence certificate, beneficial owner)."],
        rule: "The payer deducts tax from the gross payment and pays it to URA; the payee receives the rest.",
        formula: grossUp === 1 ? "Gross = net ÷ (1 − rate); tax = gross × rate" : "Tax = gross × rate; net = gross − tax",
        steps: [
          ...(grossUp === 1 ? [`Gross: ${money(paymentUGX)} ÷ (1 − ${pct(ratePercent)}) = ${money(grossUGX)}`] : []),
          `Tax withheld: ${money(grossUGX)} × ${pct(ratePercent)} = ${money(taxUGX)}`,
          `Net to payee: ${money(grossUGX)} − ${money(taxUGX)} = ${money(netUGX)}`,
        ],
      },
    };
  }

  function calculateTransferPricingAdjustment({ actualPrice, armsLengthPrice, quantity, ugandaIsSeller, ratePercent, rateSource }) {
    requireAmount(actualPrice, "Price charged");
    if (!Number.isFinite(armsLengthPrice) || armsLengthPrice <= 0) throw new RangeError("Arm's length price must be greater than zero.");
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError("Quantity must be a positive whole number.");
    if (ugandaIsSeller !== 0 && ugandaIsSeller !== 1) throw new RangeError("Enter 1 if the Ugandan party is the seller, 0 if it is the buyer.");
    const rate = optionalRate(ratePercent, rateSource);
    const perUnit = ugandaIsSeller === 1 ? armsLengthPrice - actualPrice : actualPrice - armsLengthPrice;
    const adjustmentUGX = Math.max(0, perUnit) * quantity;
    const taxUGX = rate ? adjustmentUGX * rate.rate / 100 : null;
    return {
      adjustmentUGX, taxUGX,
      working: {
        figures: [["Price charged per unit", money(actualPrice)], ["Arm's length price per unit", money(armsLengthPrice)], ["Units", String(quantity)], ["Ugandan party", ugandaIsSeller === 1 ? "Seller" : "Buyer"], ...(rate ? [["Rate", `${pct(rate.rate)} (source: ${rate.source})`]] : [])],
        assumptions: ["The arm's length price comes from a proper comparability analysis.", "Only an adjustment that increases Uganda income is shown; a reduction would need the other country to agree (corresponding adjustment)."],
        rule: "Arm's length principle: income from a related-party transaction is adjusted to what independent parties would have agreed.",
        formula: ugandaIsSeller === 1 ? "Adjustment = max(0, arm's length price − price charged) × units" : "Adjustment = max(0, price charged − arm's length price) × units",
        steps: [
          ugandaIsSeller === 1
            ? `Under-pricing per unit: ${money(armsLengthPrice)} − ${money(actualPrice)} = ${money(perUnit)}`
            : `Over-pricing per unit: ${money(actualPrice)} − ${money(armsLengthPrice)} = ${money(perUnit)}`,
          `Adjustment: ${money(Math.max(0, perUnit))} × ${quantity} = ${money(adjustmentUGX)}${perUnit <= 0 ? " (the price is at or better than arm's length for Uganda: no increase)" : ""}`,
          ...(rate ? [`Tax on the adjustment: ${money(adjustmentUGX)} × ${pct(rate.rate)} = ${money(taxUGX)}`] : []),
        ],
      },
    };
  }

  function calculateStructureComparison({ incomeUGX, optionARatePercent, optionACostsUGX, optionBRatePercent, optionBCostsUGX, rateSource }) {
    requireAmount(incomeUGX, "Income");
    requireRate(optionARatePercent, "Option A rate");
    requireRate(optionBRatePercent, "Option B rate");
    requireAmount(optionACostsUGX, "Option A costs");
    requireAmount(optionBCostsUGX, "Option B costs");
    const source = requireSource(rateSource);
    const option = (rate, costs) => {
      const taxUGX = incomeUGX * rate / 100;
      return { taxUGX, costsUGX: costs, netUGX: incomeUGX - taxUGX - costs };
    };
    const optionA = option(optionARatePercent, optionACostsUGX);
    const optionB = option(optionBRatePercent, optionBCostsUGX);
    return {
      optionA, optionB, differenceUGX: optionA.netUGX - optionB.netUGX,
      working: {
        figures: [["Income", money(incomeUGX)], ["Option A", `${pct(optionARatePercent)} tax, ${money(optionACostsUGX)} costs`], ["Option B", `${pct(optionBRatePercent)} tax, ${money(optionBCostsUGX)} costs`], ["Rates from", source]],
        assumptions: ["Each effective rate already includes every tax on that route (for example withholding abroad and tax at home, less any credit).", "Both options are commercially real; anti-avoidance rules are not tested here."],
        rule: "Compare what is left after tax and costs. A lower-tax option is lawful planning only if it has real commercial substance.",
        formula: "Net = income − income × effective rate − costs",
        steps: [
          `Option A: ${money(incomeUGX)} − ${money(optionA.taxUGX)} − ${money(optionACostsUGX)} = ${money(optionA.netUGX)}`,
          `Option B: ${money(incomeUGX)} − ${money(optionB.taxUGX)} − ${money(optionBCostsUGX)} = ${money(optionB.netUGX)}`,
          `Difference (A − B): ${money(optionA.netUGX - optionB.netUGX)}`,
        ],
      },
    };
  }

  function renderWorking(working) {
    const block = document.createElement("div");
    block.className = "intl-working";
    const add = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; block.append(node); return node; };
    add("h5", "Figures used");
    const figures = document.createElement("dl");
    for (const [label, value] of working.figures) {
      const term = document.createElement("dt"); term.textContent = label;
      const detail = document.createElement("dd"); detail.textContent = value;
      figures.append(term, detail);
    }
    block.append(figures);
    add("h5", "Rule");
    add("p", working.rule);
    add("h5", "Formula");
    add("p", working.formula, "intl-formula");
    add("h5", "Steps");
    const steps = document.createElement("ol");
    for (const step of working.steps) { const item = document.createElement("li"); item.textContent = step; steps.append(item); }
    block.append(steps);
    add("h5", "Assumptions");
    const assumptions = document.createElement("ul");
    for (const text of working.assumptions) { const item = document.createElement("li"); item.textContent = text; assumptions.append(item); }
    block.append(assumptions);
    return block;
  }

  function initializeWorkbench() {
    const form = document.querySelector("#international-tax-form");
    if (!form) return;

    const methodSelect = form.querySelector("#international-tax-method");
    const fieldsContainer = form.querySelector("#international-tax-fields");
    const result = document.querySelector("#international-tax-result");
    const error = document.querySelector("#international-tax-error");
    const heading = document.querySelector("#international-tax-workbench-title");
    const description = document.querySelector("#international-tax-method-description");
    const numberFormatter = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 });

    function renderFields() {
      const method = methods[methodSelect.value];
      fieldsContainer.replaceChildren();
      result.hidden = true;
      error.hidden = true;
      heading.textContent = method.title;
      description.textContent = method.caveat;

      for (const field of method.fields) {
        const wrapper = document.createElement("div");
        wrapper.className = "field";
        const label = document.createElement("label");
        label.htmlFor = `international-${field.id}`;
        label.textContent = field.label;
        const inputWrap = document.createElement("div");
        inputWrap.className = "input-wrap";
        if (field.id.endsWith("UGX")) {
          const currency = document.createElement("span");
          currency.className = "currency-prefix";
          currency.setAttribute("aria-hidden", "true");
          currency.textContent = "UGX";
          inputWrap.append(currency);
        }
        const input = document.createElement("input");
        input.id = `international-${field.id}`;
        input.name = field.id;
        if (field.text) {
          input.type = "text";
          input.maxLength = 200;
          input.autocomplete = "off";
          input.required = !field.optional;
          inputWrap.append(input);
          wrapper.append(label, inputWrap);
          fieldsContainer.append(wrapper);
          continue;
        }
        input.type = "number";
        input.min = field.positive
          ? field.integer ? "1" : "0.0000001"
          : "0";
        input.step = field.integer ? "1" : field.percent ? "0.01" : "any";
        input.inputMode = field.percent ? "decimal" : "numeric";
        input.required = !field.optional;
        if (field.percent) {
          const suffix = document.createElement("span");
          suffix.className = "currency-prefix";
          suffix.setAttribute("aria-hidden", "true");
          suffix.textContent = "%";
          inputWrap.append(input, suffix);
        } else {
          inputWrap.append(input);
        }
        wrapper.append(label, inputWrap);
        fieldsContainer.append(wrapper);
      }
    }

    methodSelect.addEventListener("change", renderFields);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      result.hidden = true;
      error.hidden = true;
      if (!form.reportValidity()) return;

      const method = methods[methodSelect.value];
      const values = {};
      for (const field of method.fields) {
        const input = form.elements.namedItem(field.id);
        values[field.id] = field.text
          ? input.value.trim()
          : field.optional && input.value === ""
            ? null
            : Number(input.value);
      }

      try {
        const calculation = method.calculate(values);
        result.replaceChildren();
        const resultHeading = document.createElement("h4");
        resultHeading.textContent = method.title;
        const rows = document.createElement("dl");
        for (const [label, value, unit] of method.rows(calculation)) {
          const term = document.createElement("dt");
          const amount = document.createElement("dd");
          term.textContent = label;
          amount.textContent = unit === "UGX"
            ? `UGX ${numberFormatter.format(value)}`
            : unit === "%"
              ? `${numberFormatter.format(value)}%`
              : numberFormatter.format(value);
          rows.append(term, amount);
        }
        const note = document.createElement("p");
        note.textContent = method.caveat;
        result.append(resultHeading, rows);
        if (calculation.working) result.append(renderWorking(calculation.working));
        result.append(note);
        result.hidden = false;
      } catch (caught) {
        if (!(caught instanceof RangeError)) throw caught;
        error.textContent = caught.message;
        error.hidden = false;
      }
    });

    renderFields();
  }

  if (typeof document !== "undefined") initializeWorkbench();

  return {
    calculateDoubleTaxRelief,
    calculateForeignTaxCredit,
    calculateStructureComparison,
    calculateTaxableIncome,
    calculateTransferPricingAdjustment,
    calculateWithholdingWorking,
    calculateCurrencyConversion,
    calculateForeignTaxCreditScenario,
    calculateImportedServicesVat,
    calculateProfitAttributionScenario,
    calculateTransferPricingComparison,
    calculateWithholdingComparison,
    calculateWorkdayAllocation,
  };
});
