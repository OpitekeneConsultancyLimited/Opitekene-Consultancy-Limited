(function (root, factory) {
  const internationalTax = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = internationalTax;
  } else {
    root.internationalTax = internationalTax;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const methods = {
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
        values[field.id] = field.optional && input.value === ""
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
        result.append(resultHeading, rows, note);
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
    calculateCurrencyConversion,
    calculateForeignTaxCreditScenario,
    calculateImportedServicesVat,
    calculateProfitAttributionScenario,
    calculateTransferPricingComparison,
    calculateWithholdingComparison,
    calculateWorkdayAllocation,
  };
});
