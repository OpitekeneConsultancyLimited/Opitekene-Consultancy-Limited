(function (root, factory) {
  const transaction = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = transaction;
  } else {
    root.taxCompTransaction = transaction;
    transaction.initialize(root.ugandaTax);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CURRENT_FINANCIAL_YEAR = "2026/27";
  const transactionTypes = {
    "property-purchase": {
      label: "Purchase of land or a building",
      calculators: ["stamp-duty", "vat"],
      taxHeads: [
        ["Stamp Duty", "Buyer and parties to a chargeable instrument", "Confirm the instrument, execution date, valuation basis, applicable rate and any relief."],
        ["VAT", "Supplier; purchaser may have an input-tax question", "Confirm whether the property is a taxable supply, the seller's status, property use, invoice evidence and any exemption."],
        ["Industrial building deduction", "Purchasing entity", "Confirm the building qualifies, its qualifying construction expenditure, prescribed use and prior deduction history."],
        ["Capital allowances", "Purchasing entity", "Identify separately acquired machinery, asset class, business use and tax written-down value."],
        ["Corporate income tax", "Company purchaser", "Reconcile the transaction to the company's annual tax computation; accounting depreciation is not a tax deduction."],
        ["EFRIS", "VAT-registered supplier", "Confirm whether a valid electronic invoice or receipt is required and has been issued."],
      ],
    },
    "property-disposal": {
      label: "Sale or disposal of land or a building",
      calculators: ["capital-gains", "vat"],
      taxHeads: [
        ["Income tax on disposal", "Seller", "Confirm asset classification, taxable-business-asset status, historic cost evidence, related-party terms and the specific statutory adjustment."],
        ["Industrial building deduction adjustment", "Seller", "Retrieve deductions allowed or that would have been allowed; do not subtract unrelated capital allowances."],
        ["Capital allowance balancing adjustment", "Seller", "Identify machinery and pool history separately; machinery is not automatically a capital-gains asset."],
        ["VAT", "Seller", "Confirm property type, use, registration status and applicable exemption or taxable-supply treatment."],
        ["Stamp Duty", "Parties to the instrument", "Confirm whether the disposal instrument is chargeable and who is liable."],
        ["Corporate income tax", "Company seller", "Reconcile any taxable disposal result and balancing adjustment once the annual computation is reviewed."],
      ],
    },
    "consultancy-payment": {
      label: "Consultancy or professional-services payment",
      calculators: ["withholding", "vat"],
      taxHeads: [
        ["Withholding Tax", "Payer if it is a withholding agent; service provider receives credit or final-tax treatment as applicable", "Confirm service category, payer appointment, provider residence, treaty position and whether the rate is creditable or final."],
        ["VAT", "Supplier; purchaser may assess input VAT", "Confirm supplier registration, place and nature of supply, invoice evidence, business use and input-tax restrictions."],
        ["Corporate income tax", "Payer and service provider", "Confirm the expense's business purpose, deductibility, withholding credit and annual reconciliation."],
        ["EFRIS", "VAT-registered supplier", "Confirm invoice obligations and valid EFRIS evidence."],
        ["PAYE", "Employer if the relationship is employment in substance", "Assess the actual working relationship; a consultancy label alone does not determine employment status."],
      ],
    },
    "construction-contract": {
      label: "Construction or engineering contract",
      calculators: ["withholding", "vat"],
      taxHeads: [
        ["Withholding Tax", "Payer if it is a withholding agent", "Confirm contract/payment category, payer status, recipient residence, timing and applicable withholding treatment."],
        ["VAT", "Contractor; customer may assess input VAT", "Confirm registration, taxable supply, contract scope, milestones, invoice evidence and input-tax eligibility."],
        ["PAYE", "Employer if workers are employees in substance", "Review employment facts separately from the contractor relationship."],
        ["Stamp Duty", "Parties to a chargeable instrument", "Confirm whether the executed contract or another instrument is chargeable."],
        ["Capital allowances / industrial building deduction", "Asset owner", "Separate construction, land and installed machinery expenditure and assess statutory qualification."],
        ["Corporate income tax", "Contracting parties as relevant", "Review revenue recognition, deductible costs, capital expenditure and annual tax adjustments."],
        ["EFRIS", "VAT-registered supplier", "Confirm invoicing and tax-document evidence for each taxable supply."],
      ],
    },
    "rental-income": {
      label: "Rental income or property letting",
      calculators: ["rental", "vat"],
      taxHeads: [
        ["Rental income tax", "Landlord", "Confirm landlord type and residence, Uganda-source status, annual gross rent, allowable expenses and applicable special rules."],
        ["VAT", "Landlord", "Confirm whether the letting is a taxable supply, property use, registration status and any exemption."],
        ["Withholding Tax", "Tenant/payer if appointed or otherwise required", "Confirm payer status, landlord residence, payment category, treaty position and creditability."],
        ["Stamp Duty", "Parties to a chargeable lease", "Confirm the executed instrument and its chargeability."],
        ["Corporate income tax", "Company landlord", "Use the annual company computation and confirm rental-specific adjustments."],
        ["EFRIS", "VAT-registered landlord", "Confirm invoice obligations and evidence."],
      ],
    },
    "employee-compensation": {
      label: "Employee remuneration or benefits",
      calculators: ["paye"],
      taxHeads: [
        ["PAYE", "Employer", "Confirm residence, taxable employment benefits, payroll period, secondary employment and any special treatment."],
        ["NSSF", "Employer and employee", "Confirm coverage, contribution base, exemptions and current obligations; no NSSF calculation is made in this assessment."],
        ["Corporate income tax", "Employer", "Confirm deductibility and consistency with payroll and benefit reporting."],
      ],
    },
    "goods-import": {
      label: "Import of goods",
      calculators: ["customs-import"],
      taxHeads: [
        ["Customs duty", "Importer", "Confirm HS classification, origin, customs value, customs procedure and current EAC tariff."],
        ["Import VAT", "Importer", "Confirm customs value, duty/excise base, VAT treatment and input-tax eligibility."],
        ["Excise duty and levies", "Importer", "Confirm goods classification, applicable levy and statutory exemptions."],
        ["Withholding Tax", "Importer/payer where applicable", "Confirm the current import withholding rules and any applicable exemption."],
        ["Corporate income tax", "Importer", "Review inventory or capital-asset classification, customs costs and subsequent deductions."],
      ],
    },
    "goods-export": {
      label: "Export of goods",
      calculators: ["customs-export"],
      taxHeads: [
        ["Export VAT", "Exporter", "Confirm export evidence, destination, VAT status and zero-rating conditions."],
        ["Customs duty or levy", "Exporter", "Confirm goods classification, destination and applicable export levy."],
        ["Corporate income tax", "Exporter", "Review revenue, costs and any export incentives against current law."],
      ],
    },
    "machinery-purchase": {
      label: "Business machinery acquisition",
      calculators: ["wear-and-tear", "vat", "withholding"],
      taxHeads: [
        ["Capital allowances", "Business owner", "Confirm the statutory asset class, qualifying cost, business-use fraction, opening pool and disposals."],
        ["VAT", "Supplier; purchaser may assess input VAT", "Confirm VAT status, supply treatment, EFRIS evidence and business use."],
        ["Withholding Tax", "Payer if required to withhold", "Confirm payer status, supplier residence and the applicable payment category."],
        ["Corporate income tax", "Business owner", "Separate tax depreciation from accounting depreciation and reconcile only supported deductions."],
        ["EFRIS", "VAT-registered supplier", "Confirm valid electronic invoice or receipt."],
      ],
    },
    other: {
      label: "Other business transaction",
      calculators: [],
      taxHeads: [
        ["Transaction tax assessment", "Relevant parties depend on the facts", "Select a more specific transaction type or obtain professional review; this mode does not infer a tax treatment from free text."],
      ],
    },
  };

  const calculatorLabels = {
    "stamp-duty": "Stamp Duty arithmetic",
    "capital-gains": "Entered disposal-gain arithmetic",
    withholding: "Withholding Tax",
    vat: "VAT",
    rental: "Rental income tax",
    paye: "PAYE",
    "wear-and-tear": "Capital allowances / wear and tear",
    "customs-import": "Customs and import estimate",
    "customs-export": "Export tax and charges estimate",
    "company-income": "Annual company income tax",
  };

  const calculatorFields = {
    "stamp-duty": [
      { name: "chargeableInstrumentConfirmed", label: "I confirmed the instrument is chargeable", type: "boolean", required: true },
      { name: "chargeableAmount", label: "Chargeable amount / valuation base (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "adValoremRatePercent", label: "Applicable ad valorem rate (%) — enter only after checking the law", type: "number", required: true, min: 0, max: 100, step: "0.01" },
      { name: "fixedDuty", label: "Fixed duty (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "reliefAmount", label: "Approved relief (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
    ],
    "capital-gains": [
      { name: "businessAssetTreatmentConfirmed", label: "I have confirmed the asset and disposal belong in this entered-rate workpaper", type: "boolean", required: true },
      { name: "disposalProceeds", label: "Disposal proceeds (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "acquisitionCost", label: "Acquisition cost (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "improvementCosts", label: "Documented improvement costs (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "incidentalCosts", label: "Documented incidental costs (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "allowableLossRelief", label: "Separately verified allowable loss relief (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "taxRatePercent", label: "Rate (%) — enter only after checking the applicable law", type: "number", required: true, min: 0, max: 100, step: "0.01" },
    ],
    withholding: [
      { name: "grossPayment", label: "Gross payment (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "paymentType", label: "Payment category", type: "select", required: true, options: [
        ["resident-supply", "Resident supply / contract payment"],
        ["resident-dividend", "Resident dividend"],
        ["listed-dividend", "Listed company dividend to individual"],
        ["resident-interest", "Resident interest"],
        ["government-interest", "Government securities interest, under 10 years"],
        ["long-government-interest", "Government securities interest, 10 years or more"],
        ["related-company-dividend", "Related-company dividend"],
        ["nonresident-payment", "Non-resident dividend, interest, royalty, rent or management fee"],
        ["nonresident-government-interest", "Non-resident government securities interest, under 10 years"],
        ["nonresident-long-government-interest", "Non-resident government securities interest, 10 years or more"],
        ["imported-goods", "Import of goods"],
        ["nonresident-reinsurance", "Non-resident reinsurance premium"],
        ["nonresident-transport", "Non-resident transport operator"],
        ["nonresident-telecom", "Non-resident telecommunications or direct-to-home TV income"],
        ["resident-entertainer", "Resident public entertainer payment"],
        ["betting-winnings", "Betting or gaming winnings"],
        ["payment-service-commission", "Payment service provider commission"],
        ["insurance-agent-commission", "Insurance agent commission"],
        ["advertising-agent-commission", "Advertising agent commission"],
        ["mobile-money-commission", "Airtime distribution or mobile money commission"],
        ["vat-withholding", "VAT withholding on taxable supply without e-invoice"],
        ["nonresident-debenture-interest", "Qualifying non-resident debenture interest"],
      ] },
      { name: "isDesignatedPayer", label: "Payer is a designated withholding agent", type: "boolean", required: true },
      { name: "supplierIssuedInvoice", label: "Supplier issued the relevant EFRIS invoice or receipt", type: "boolean", required: true },
    ],
    vat: [
      { name: "standardRatedSales", label: "Confirmed standard-rated sales/supplies (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "salesIncludeVat", label: "Entered standard-rated sales include VAT", type: "boolean", required: true },
      { name: "zeroRatedSales", label: "Confirmed zero-rated sales (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "exemptSales", label: "Confirmed exempt sales (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "claimableInputVat", label: "Input VAT supported as potentially claimable (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "annualTaxableTurnover", label: "Annual taxable turnover (UGX; leave blank if not assessed)", type: "number", min: 0, step: "0.01" },
      { name: "threeMonthTaxableTurnover", label: "Three-month taxable turnover (UGX; leave blank if not assessed)", type: "number", min: 0, step: "0.01" },
      { name: "remoteServices", label: "Remote services registration rule may apply", type: "boolean", required: true },
    ],
    rental: [
      { name: "grossRentalIncome", label: "Annual gross rental income (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "taxpayerType", label: "Landlord type", type: "select", required: true, options: [["individual", "Individual"], ["company", "Company"]] },
      { name: "residency", label: "Landlord tax residence", type: "select", required: true, options: [["resident", "Resident"], ["nonresident", "Non-resident"]] },
      { name: "allowableExpenses", label: "Expenses confirmed for this estimate (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "carriedForwardLosses", label: "Separately verified carried-forward losses (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "taxPaid", label: "Tax already paid (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "withholdingCredits", label: "Withholding credits confirmed (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
    ],
    paye: [
      { name: "employmentRelationshipConfirmed", label: "I confirm this is employment in substance", type: "boolean", required: true },
      { name: "monthlyTaxableIncome", label: "Monthly taxable employment income (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "isResident", label: "Employee is Uganda tax resident", type: "boolean", required: true },
      { name: "monthlyGrossEarnings", label: "Monthly gross earnings for the displayed NSSF estimate (UGX)", type: "number", required: true, min: 0, step: "0.01" },
    ],
    "wear-and-tear": [
      { name: "assetClass", label: "Statutory wear-and-tear class (confirm classification)", type: "select", required: true, options: [
        ["class-1", "Class 1"],
        ["class-2", "Class 2"],
        ["class-3", "Class 3"],
      ] },
      { name: "openingTaxWrittenDownValue", label: "Opening tax written-down value (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "additions", label: "Qualifying additions (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "disposalProceeds", label: "Pool disposal proceeds (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "businessUsePercent", label: "Confirmed business use (%)", type: "number", required: true, min: 0, max: 100, step: "0.01" },
    ],
    "customs-import": [
      { name: "customsValue", label: "Customs value determined from import documents (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "customsDutyRate", label: "Customs duty rate (%) — verify HS code, origin and tariff first", type: "number", required: true, min: 0, max: 100, step: "0.01" },
      { name: "importExciseDuty", label: "Excise duty amount (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "importWithholdingRate", label: "Import withholding rate (%) — enter 0 if none verified", type: "number", required: true, min: 0, max: 100, step: "0.01" },
      { name: "importOtherCharges", label: "Other entered border charges (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "importVatTreatment", label: "Import VAT treatment", type: "select", required: true, options: [["standard", "Standard-rated"], ["zero-rated", "Zero-rated"], ["exempt", "Exempt"]] },
    ],
    "customs-export": [
      { name: "customsValue", label: "Export value determined from export documents (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "exportVatTreatment", label: "Export VAT treatment (confirm evidence and conditions)", type: "select", required: true, options: [["standard", "Standard-rated"], ["zero-rated", "Zero-rated"], ["exempt", "Exempt"]] },
      { name: "exportVatRate", label: "VAT rate (%) if standard-rated; enter 0 if not", type: "number", required: true, min: 0, max: 100, step: "0.01" },
      { name: "exportLevyRate", label: "Export levy rate (%) — verify goods and law first", type: "number", required: true, min: 0, max: 100, step: "0.01" },
      { name: "exportExciseDuty", label: "Export excise duty (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "exportOtherCharges", label: "Other entered export charges (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
    ],
    "company-income": [
      { name: "chargeableIncome", label: "Annual chargeable income before tax (UGX)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "taxPaid", label: "Company tax already paid (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
      { name: "withholdingCredits", label: "Withholding credits confirmed (UGX; enter 0 if none)", type: "number", required: true, min: 0, step: "0.01" },
    ],
  };

  const calculationFunctions = {
    "stamp-duty": "calculateStampDuty",
    "capital-gains": "calculateCapitalGainsTax",
    withholding: "calculateWithholdingTax",
    vat: "calculateVat",
    rental: "calculateRentalIncomeTax",
    paye: "calculatePaye",
    "wear-and-tear": "calculateWearAndTear",
    "customs-import": "calculateCustomsEstimate",
    "customs-export": "calculateCustomsEstimate",
    "company-income": "calculateCompanyIncomeTax",
  };

  function financialYearForDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new TypeError("Enter a valid transaction date.");
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new TypeError("Enter a valid transaction date.");
    }
    const year = parsed.getUTCMonth() >= 6
      ? parsed.getUTCFullYear()
      : parsed.getUTCFullYear() - 1;
    return `${year}/${String(year + 1).slice(-2)}`;
  }

  function analyzeTransaction(facts) {
    if (!facts || typeof facts !== "object") {
      throw new TypeError("Enter transaction facts before analysis.");
    }
    const type = transactionTypes[facts.type];
    if (!type) throw new RangeError("Choose a supported transaction type.");
    const date = facts.transactionDate;
    const taxPeriod = financialYearForDate(date);
    if (facts.amount === "" || facts.amount === null || facts.amount === undefined) {
      throw new TypeError("Enter the transaction amount.");
    }
    const amount = Number(facts.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError("Enter a non-negative transaction amount.");
    }
    if (facts.currency !== "UGX") {
      throw new RangeError("This first release supports UGX transactions only.");
    }
    if (facts.factsConfirmed !== true) {
      throw new Error("Confirm the transaction facts before analysis.");
    }
    const description = typeof facts.description === "string"
      ? facts.description.trim().slice(0, 1000)
      : "";
    if (!description) throw new TypeError("Describe the transaction without confidential identifiers.");
    const partyRole = String(facts.partyRole || "");
    if (!["buyer", "seller", "payer", "supplier", "landlord", "tenant",
      "employer", "employee", "importer", "exporter", "asset-owner", "other"]
      .includes(partyRole)) {
      throw new RangeError("Choose your role in the transaction.");
    }
    const taxpayerType = String(facts.taxpayerType || "");
    if (!["individual", "company", "unknown"].includes(taxpayerType)) {
      throw new RangeError("Choose the taxpayer type or mark it unknown.");
    }
    const taxpayerResidency = String(facts.taxpayerResidency || "");
    const counterpartyResidency = String(facts.counterpartyResidency || "");
    if (!["resident", "nonresident", "unknown"].includes(taxpayerResidency) ||
        !["resident", "nonresident", "unknown"].includes(counterpartyResidency)) {
      throw new RangeError("Choose a residence status or mark it unknown.");
    }
    const vatRegistration = String(facts.vatRegistration || "");
    const withholdingAgent = String(facts.withholdingAgent || "");
    const relatedParty = String(facts.relatedParty || "");
    const employmentRelationship = String(facts.employmentRelationship || "");
    const efrisInvoice = String(facts.efrisInvoice || "");
    if (![vatRegistration, withholdingAgent, relatedParty, efrisInvoice]
      .every((value) => ["yes", "no", "unknown"].includes(value)) ||
        !["employee", "independent", "uncertain", "not-applicable"]
          .includes(employmentRelationship)) {
      throw new RangeError("Complete the transaction status questions or mark them unknown.");
    }
    const calculatorModules = [...type.calculators];
    if (taxpayerType === "company") calculatorModules.push("company-income");
    const isRelatedParty = relatedParty === "yes";
    const nonResidentParty = taxpayerResidency === "nonresident" ||
      counterpartyResidency === "nonresident";
    const unknownKeyFacts = taxpayerType === "unknown" ||
      taxpayerResidency === "unknown" ||
      counterpartyResidency === "unknown" || vatRegistration === "unknown" ||
      withholdingAgent === "unknown" || relatedParty === "unknown" ||
      employmentRelationship === "uncertain" || efrisInvoice === "unknown";
    const periodSupported = taxPeriod === CURRENT_FINANCIAL_YEAR;

    return {
      type: facts.type,
      transactionType: type.label,
      transactionDate: date,
      taxPeriod,
      amount,
      currency: "UGX",
      description,
      partyRole,
      taxpayerType,
      taxpayerResidency,
      counterpartyResidency,
      vatRegistration,
      withholdingAgent,
      relatedParty,
      employmentRelationship,
      efrisInvoice,
      periodSupported,
      calculationsAllowed: periodSupported,
      reviewStatus: isRelatedParty || nonResidentParty || unknownKeyFacts || !periodSupported
        ? "review_required"
        : "further_information_required",
      reviewReasons: [
        ...(isRelatedParty ? ["Related-party terms require separate statutory review."] : []),
        ...(nonResidentParty ? ["Cross-border residence, treaty and source rules require review."] : []),
        ...(unknownKeyFacts ? ["One or more residence, registration, withholding-agent or relationship facts remain unknown."] : []),
        ...(!periodSupported
          ? [`Automated calculators are configured only for FY ${CURRENT_FINANCIAL_YEAR}.`]
          : []),
      ],
      taxHeads: type.taxHeads.map(([name, responsibleParty, factsToConfirm]) => ({
        name,
        responsibleParty,
        factsToConfirm,
        status: "further_information_required",
      })),
      calculatorModules: periodSupported ? calculatorModules : [],
      ruleReferences: [],
      legalConclusion: null,
    };
  }

  function numericInput(inputs, name, optional = false) {
    const raw = inputs[name];
    if (optional && (raw === "" || raw === undefined || raw === null)) return undefined;
    if (!optional && (raw === "" || raw === undefined || raw === null)) {
      throw new TypeError(`Enter a value for ${name}.`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Enter a non-negative value for ${name}.`);
    }
    return value;
  }

  function confirmedBoolean(inputs, name) {
    if (inputs[name] !== "yes" && inputs[name] !== "no" &&
        inputs[name] !== true && inputs[name] !== false) {
      throw new TypeError(`Confirm yes or no for ${name}.`);
    }
    return inputs[name] === "yes" || inputs[name] === true;
  }

  function callCalculator(calculator, module, inputs, transaction) {
    switch (module) {
      case "stamp-duty":
        if (!confirmedBoolean(inputs, "chargeableInstrumentConfirmed")) {
          throw new Error("Confirm that the instrument is chargeable before calculating Stamp Duty.");
        }
        return calculator.calculateStampDuty({
          chargeableAmount: numericInput(inputs, "chargeableAmount"),
          adValoremRatePercent: numericInput(inputs, "adValoremRatePercent"),
          fixedDuty: numericInput(inputs, "fixedDuty"),
          reliefAmount: numericInput(inputs, "reliefAmount"),
        });
      case "capital-gains":
        if (!confirmedBoolean(inputs, "businessAssetTreatmentConfirmed")) {
          throw new Error("Confirm the entered disposal treatment before running this arithmetic-only workpaper.");
        }
        return calculator.calculateCapitalGainsTax({
          disposalProceeds: numericInput(inputs, "disposalProceeds"),
          acquisitionCost: numericInput(inputs, "acquisitionCost"),
          improvementCosts: numericInput(inputs, "improvementCosts"),
          incidentalCosts: numericInput(inputs, "incidentalCosts"),
          allowableLossRelief: numericInput(inputs, "allowableLossRelief"),
          taxRatePercent: numericInput(inputs, "taxRatePercent"),
        });
      case "withholding":
        return calculator.calculateWithholdingTax(
          numericInput(inputs, "grossPayment"),
          String(inputs.paymentType || ""),
          confirmedBoolean(inputs, "isDesignatedPayer"),
          confirmedBoolean(inputs, "supplierIssuedInvoice"),
        );
      case "vat":
        return calculator.calculateVat({
          standardRatedSales: numericInput(inputs, "standardRatedSales"),
          salesIncludeVat: confirmedBoolean(inputs, "salesIncludeVat"),
          zeroRatedSales: numericInput(inputs, "zeroRatedSales"),
          exemptSales: numericInput(inputs, "exemptSales"),
          claimableInputVat: numericInput(inputs, "claimableInputVat"),
          annualTaxableTurnover: numericInput(inputs, "annualTaxableTurnover", true),
          threeMonthTaxableTurnover: numericInput(inputs, "threeMonthTaxableTurnover", true),
          remoteServices: confirmedBoolean(inputs, "remoteServices"),
        });
      case "rental":
        return calculator.calculateRentalIncomeTax({
          grossRentalIncome: numericInput(inputs, "grossRentalIncome"),
          taxpayerType: String(inputs.taxpayerType || ""),
          residency: String(inputs.residency || ""),
          allowableExpenses: numericInput(inputs, "allowableExpenses"),
          carriedForwardLosses: numericInput(inputs, "carriedForwardLosses"),
          taxPaid: numericInput(inputs, "taxPaid"),
          withholdingCredits: numericInput(inputs, "withholdingCredits"),
        });
      case "paye":
        if (!confirmedBoolean(inputs, "employmentRelationshipConfirmed")) {
          throw new Error("Confirm an employment relationship before calculating PAYE.");
        }
        return calculator.calculatePaye(
          numericInput(inputs, "monthlyTaxableIncome"),
          confirmedBoolean(inputs, "isResident"),
          numericInput(inputs, "monthlyGrossEarnings"),
        );
      case "wear-and-tear":
        return calculator.calculateWearAndTear({
          assetClass: String(inputs.assetClass || ""),
          openingTaxWrittenDownValue: numericInput(inputs, "openingTaxWrittenDownValue"),
          additions: numericInput(inputs, "additions"),
          disposalProceeds: numericInput(inputs, "disposalProceeds"),
          businessUsePercent: numericInput(inputs, "businessUsePercent"),
        });
      case "customs-import":
        return calculator.calculateCustomsEstimate({
          direction: "import",
          customsValue: numericInput(inputs, "customsValue"),
          customsDutyRate: numericInput(inputs, "customsDutyRate"),
          importExciseDuty: numericInput(inputs, "importExciseDuty"),
          importWithholdingRate: numericInput(inputs, "importWithholdingRate"),
          importOtherCharges: numericInput(inputs, "importOtherCharges"),
          importVatTreatment: String(inputs.importVatTreatment || ""),
        });
      case "customs-export":
        return calculator.calculateCustomsEstimate({
          direction: "export",
          customsValue: numericInput(inputs, "customsValue"),
          exportVatTreatment: String(inputs.exportVatTreatment || ""),
          exportVatRate: numericInput(inputs, "exportVatRate"),
          exportLevyRate: numericInput(inputs, "exportLevyRate"),
          exportExciseDuty: numericInput(inputs, "exportExciseDuty"),
          exportOtherCharges: numericInput(inputs, "exportOtherCharges"),
        });
      case "company-income":
        return calculator.calculateCompanyIncomeTax(
          numericInput(inputs, "chargeableIncome"),
          numericInput(inputs, "taxPaid"),
          numericInput(inputs, "withholdingCredits"),
        );
      default:
        throw new RangeError("Choose a supported calculator for this transaction.");
    }
  }

  function calculateTransactionEstimate(analysis, module, inputs, calculator) {
    if (!analysis || !analysis.calculationsAllowed) {
      throw new Error("This transaction period is not supported for automated calculation.");
    }
    if (!analysis.calculatorModules.includes(module)) {
      throw new Error("That calculator is not available for the selected transaction type.");
    }
    const functionName = calculationFunctions[module];
    if (!calculator || typeof calculator[functionName] !== "function") {
      throw new Error("The existing TaxComp calculator is unavailable.");
    }
    const result = callCalculator(calculator, module, inputs, analysis);
    return {
      calculationId: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      taxHead: calculatorLabels[module],
      module,
      transactionType: analysis.transactionType,
      transactionDate: analysis.transactionDate,
      taxPeriod: analysis.taxPeriod,
      calculatedAt: new Date().toISOString(),
      result,
      status: "indicative_unverified",
    };
  }

  function appendText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  }

  function formatUgx(value) {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function buildCalculatorFields(container, module, calculator) {
    container.replaceChildren();
    const fields = calculatorFields[module] || [];
    for (const field of fields) {
      const wrapper = document.createElement("label");
      wrapper.className = "tax-transaction-field";
      wrapper.textContent = field.label;
      let input;
      if (field.type === "select" || field.type === "boolean") {
        input = document.createElement("select");
        const prompt = document.createElement("option");
        prompt.value = "";
        prompt.textContent = field.type === "boolean" ? "Select yes or no" : "Choose an option";
        prompt.disabled = true;
        prompt.selected = true;
        input.append(prompt);
        const options = field.type === "boolean"
          ? [["yes", "Yes"], ["no", "No"]]
          : field.options;
        for (const [value, label] of options) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          input.append(option);
        }
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.min = String(field.min ?? 0);
        if (field.max !== undefined) input.max = String(field.max);
        input.step = field.step || "any";
      }
      input.name = field.name;
      input.required = Boolean(field.required);
      input.autocomplete = "off";
      wrapper.append(input);
      container.append(wrapper);
    }
  }

  function renderAssessment(container, analysis, calculatorSelect, calculationContainer) {
    container.replaceChildren();
    appendText(container, "h3", "", "Potential tax heads to review");
    appendText(
      container,
      "p",
      "tax-transaction-disclaimer",
      "These are screening prompts, not legal conclusions. No tax head is ruled out without reviewing the facts and applicable law.",
    );
    for (const head of analysis.taxHeads) {
      const card = document.createElement("article");
      card.className = "tax-transaction-head";
      appendText(card, "h4", "", head.name);
      appendText(card, "strong", "tax-transaction-status", "FURTHER INFORMATION REQUIRED");
      appendText(card, "p", "", `Relevant party: ${head.responsibleParty}.`);
      appendText(card, "p", "", head.factsToConfirm);
      container.append(card);
    }
    for (const reason of analysis.reviewReasons) {
      appendText(container, "p", "tax-transaction-review", reason);
    }
    if (analysis.type === "employee-compensation") {
      appendText(container, "p", "tax-transaction-disclaimer",
        "PAYE applies only where the facts establish an employment relationship; the calculator requires that relationship to be confirmed.");
    }
    if (analysis.type === "property-disposal") {
      appendText(container, "p", "tax-transaction-disclaimer",
        "The linked capital-gains calculator is arithmetic using user-entered rates. It does not replace industrial-building or machinery balancing-adjustment analysis.");
    }
    calculatorSelect.replaceChildren();
    const prompt = document.createElement("option");
    prompt.value = "";
    prompt.textContent = analysis.calculatorModules.length
      ? "Select a calculator to run"
      : "No calculator is configured for this transaction type";
    prompt.disabled = true;
    prompt.selected = true;
    calculatorSelect.append(prompt);
    for (const module of analysis.calculatorModules) {
      const option = document.createElement("option");
      option.value = module;
      option.textContent = calculatorLabels[module];
      calculatorSelect.append(option);
    }
    calculatorSelect.disabled = !analysis.calculationsAllowed ||
      analysis.calculatorModules.length === 0;
    calculationContainer.hidden = !analysis.calculationsAllowed ||
      analysis.calculatorModules.length === 0;
    if (!analysis.periodSupported) {
      appendText(container, "p", "tax-transaction-review",
        `No automated estimate is available for FY ${analysis.taxPeriod}; this release supports FY ${CURRENT_FINANCIAL_YEAR} only.`);
    }
  }

  function renderCalculation(container, calculation) {
    const result = calculation.result;
    const card = document.createElement("article");
    card.className = "tax-transaction-calculation";
    appendText(card, "h4", "", calculation.taxHead);
    appendText(card, "p", "", `FY ${calculation.taxPeriod} · ${new Date(calculation.calculatedAt).toLocaleString()}`);
    const summaryKeys = {
      vat: ["netVat", "Indicative net VAT from entered figures"],
      withholding: ["tax", "Indicative withholding from entered category"],
      "stamp-duty": ["tax", "Indicative duty using entered rate and base"],
      "capital-gains": ["tax", "Arithmetic using entered disposal assumptions and rate"],
      rental: ["tax", "Indicative rental tax from entered annual figures"],
      paye: ["monthlyTax", "Indicative monthly PAYE"],
      "wear-and-tear": ["allowance", "Indicative wear-and-tear allowance"],
      "customs-import": ["totalCharges", "Estimated entered import taxes and charges"],
      "customs-export": ["totalCharges", "Estimated entered export taxes and charges"],
      "company-income": ["tax", "Indicative annual company income tax before credits"],
    };
    const [key, label] = summaryKeys[calculation.module];
    if (Number.isFinite(result[key])) appendText(card, "p", "tax-transaction-total", `${label}: ${formatUgx(result[key])}`);
    if (Number.isFinite(result.balance)) appendText(card, "p", "", `Balance after entered credits/payments: ${formatUgx(result.balance)}`);
    const rows = Array.isArray(result.breakdown) ? result.breakdown : [];
    if (rows.length) {
      const list = document.createElement("ul");
      for (const row of rows) {
        const value = Number.isFinite(row.amount) ? row.amount
          : Number.isFinite(row.tax) ? row.tax : null;
        appendText(list, "li", "", value === null
          ? row.label
          : `${row.label}: ${formatUgx(value)}`);
      }
      card.append(list);
    }
    appendText(card, "p", "tax-transaction-disclaimer",
      "Indicative only; assumptions and legal eligibility were entered by you and are not independently verified. Not a tax return or filing result.");
    container.prepend(card);
  }

  function initialize(calculator) {
    if (typeof document === "undefined") return;
    const analysisForm = document.querySelector("#tax-transaction-form");
    if (!analysisForm) return;
    const modeButtons = [...document.querySelectorAll("[data-tax-chat-mode]")];
    const questionPanel = document.querySelector("#tax-chat-question-mode");
    const transactionPanel = document.querySelector("#tax-chat-transaction-mode");
    const assessment = document.querySelector("#tax-transaction-assessment");
    const analysisStatus = document.querySelector("#tax-transaction-status");
    const calculatorSelect = document.querySelector("#tax-transaction-calculator");
    const calculatorForm = document.querySelector("#tax-transaction-calculator-form");
    const calculatorFieldsContainer = document.querySelector("#tax-transaction-calculator-fields");
    const calculationResults = document.querySelector("#tax-transaction-calculation-results");
    let currentAnalysis = null;

    for (const button of modeButtons) {
      button.addEventListener("click", () => {
        const transactionMode = button.dataset.taxChatMode === "transaction";
        questionPanel.hidden = transactionMode;
        transactionPanel.hidden = !transactionMode;
        for (const modeButton of modeButtons) {
          const selected = modeButton === button;
          modeButton.setAttribute("aria-selected", selected ? "true" : "false");
          modeButton.tabIndex = selected ? 0 : -1;
        }
        analysisStatus.textContent = transactionMode
          ? "Transaction details stay in this page. They are not sent to Gemini or saved."
          : "";
      });
    }

    analysisForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!analysisForm.reportValidity()) return;
      try {
        const fields = new FormData(analysisForm);
        currentAnalysis = analyzeTransaction({
          type: fields.get("type"),
          transactionDate: fields.get("transactionDate"),
          amount: fields.get("amount"),
          currency: fields.get("currency"),
          description: fields.get("description"),
          factsConfirmed: fields.get("factsConfirmed") === "on",
          partyRole: fields.get("partyRole"),
          taxpayerType: fields.get("taxpayerType"),
          taxpayerResidency: fields.get("taxpayerResidency"),
          counterpartyResidency: fields.get("counterpartyResidency"),
          vatRegistration: fields.get("vatRegistration"),
          withholdingAgent: fields.get("withholdingAgent"),
          relatedParty: fields.get("relatedParty"),
          employmentRelationship: fields.get("employmentRelationship"),
          efrisInvoice: fields.get("efrisInvoice"),
        });
        calculationResults.replaceChildren();
        renderAssessment(
          assessment,
          currentAnalysis,
          calculatorSelect,
          calculatorForm,
        );
        assessment.hidden = false;
        analysisStatus.textContent = `Screening complete for ${currentAnalysis.transactionType}, ${formatUgx(currentAnalysis.amount)}, ${currentAnalysis.taxPeriod}. Review each head and enter verified details before requesting an estimate.`;
      } catch (error) {
        assessment.hidden = true;
        analysisStatus.textContent = error instanceof Error
          ? error.message
          : "The transaction could not be assessed.";
      }
    });

    calculatorSelect.addEventListener("change", () => {
      buildCalculatorFields(calculatorFieldsContainer, calculatorSelect.value, calculator);
      calculatorForm.hidden = !calculatorSelect.value;
      const description = calculatorFields[calculatorSelect.value];
      if (description) {
        appendText(calculatorFieldsContainer, "p", "tax-transaction-disclaimer",
          calculatorSelect.value === "capital-gains"
            ? "This legacy calculator uses user-entered rates and a simplified cost base. It is not the asset workspace's statutory disposal schedule."
            : "Enter every material input from reviewed source records. Rates and eligibility are not verified here.");
      }
    });

    calculatorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!currentAnalysis || !calculatorForm.reportValidity()) return;
      const module = calculatorSelect.value;
      const inputs = {};
      for (const field of calculatorFields[module] || []) {
        const control = calculatorFieldsContainer.querySelector(`[name="${field.name}"]`);
        if (!control) continue;
        if (field.type === "number") {
          inputs[field.name] = control.value === "" ? "" : control.valueAsNumber;
        } else {
          inputs[field.name] = control.value;
        }
      }
      try {
        const calculation = calculateTransactionEstimate(
          currentAnalysis,
          module,
          inputs,
          calculator,
        );
        renderCalculation(calculationResults, calculation);
        analysisStatus.textContent = `${calculation.taxHead} estimate calculated using the existing TaxComp calculator. It is not saved and requires legal review.`;
      } catch (error) {
        analysisStatus.textContent = error instanceof Error
          ? error.message
          : "The selected calculator could not complete the estimate.";
      }
    });
  }

  return {
    analyzeTransaction,
    calculateTransactionEstimate,
    financialYearForDate,
    initialize,
    transactionTypes,
  };
});
