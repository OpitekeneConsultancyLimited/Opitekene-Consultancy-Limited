(function (root, factory) {
  const analysis = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = analysis;
  } else {
    root.taxcompMultiTax = analysis;
    initializeWorkspace(root, analysis);
  }

  function initializeWorkspace(global, engine) {
    const form = global.document.querySelector("#multi-tax-form");
    if (!form) return;

    const resultsPanel = global.document.querySelector("#multi-tax-results");
    const statusText = global.document.querySelector("#multi-tax-status");
    const summaryText = global.document.querySelector("#multi-tax-summary");
    const riskFlags = global.document.querySelector("#multi-tax-risk-flags");
    const headList = global.document.querySelector("#multi-tax-head-list");
    const errorText = global.document.querySelector("#multi-tax-error");
    const registerList = global.document.querySelector("#multi-tax-register-list");
    const registerEmpty = global.document.querySelector("#multi-tax-register-empty");
    const addToRegister = global.document.querySelector("#multi-tax-register-add");
    const numberFormat = new Intl.NumberFormat("en-UG", {
      maximumFractionDigits: 0,
    });
    const storedAssessments = [];
    let currentAssessment = null;

    function formatAmount(value) {
      return `UGX ${numberFormat.format(value)}`;
    }

    function textElement(tag, className, text) {
      const element = global.document.createElement(tag);
      if (className) element.className = className;
      element.textContent = text;
      return element;
    }

    function toggleConditionalFields() {
      const scenario = form.elements.scenario.value;
      const payeRole = form.elements.payeRole.value;
      const payeFields = form.querySelector("[data-paye-role-field]");
      const primaryPayField = form.querySelector("[data-primary-pay-field]");
      const primaryPayInput = form.elements.primaryMonthlyTaxableIncome;
      const rentalField = form.querySelector("[data-rental-annual-field]");
      const isPayroll = scenario === "employment";
      const isRental = scenario === "commercial-rental";
      payeFields.hidden = !isPayroll;
      primaryPayField.hidden = !isPayroll || payeRole !== "secondary";
      primaryPayInput.disabled = primaryPayField.hidden;
      primaryPayInput.required = !primaryPayField.hidden;
      rentalField.hidden = !isRental;
      if (!isPayroll) form.elements.annualRentalAmount.checked = false;
    }

    function inputRecord() {
      const amount = Number(form.elements.amount.value);
      const primaryMonthlyTaxableIncome =
        form.elements.primaryMonthlyTaxableIncome.value === ""
          ? null
          : Number(form.elements.primaryMonthlyTaxableIncome.value);
      return {
        reference: form.elements.reference.value.trim(),
        eventDate: form.elements.eventDate.value,
        scenario: form.elements.scenario.value,
        direction: form.elements.direction.value,
        partyType: form.elements.partyType.value,
        partyRole: form.elements.partyRole.value,
        residency: form.elements.residency.value,
        supplierResidency: form.elements.supplierResidency.value,
        amount,
        assetType: form.elements.assetType.value,
        supplierVat: form.elements.supplierVat.value,
        vatTreatment: form.elements.vatTreatment.value,
        amountIncludesVat: form.elements.amountIncludesVat.checked,
        whtAgent: form.elements.whtAgent.value,
        employmentRelationship: form.elements.employmentRelationship.value,
        instrumentExecuted: form.elements.instrumentExecuted.value,
        industrialBuilding: form.elements.industrialBuilding.value,
        efrisStatus: form.elements.efrisStatus.value,
        payeRole: form.elements.payeRole.value,
        primaryMonthlyTaxableIncome,
        annualRentalAmount: form.elements.annualRentalAmount.checked,
        relatedParty: form.elements.relatedParty.checked,
        description: form.elements.description.value.trim(),
      };
    }

    function renderRiskFlags(flags) {
      riskFlags.replaceChildren();
      if (!flags.length) return;
      const title = textElement("h4", "", "Review flags");
      const list = global.document.createElement("ul");
      for (const flag of flags) {
        list.append(textElement("li", "", flag));
      }
      riskFlags.append(title, list);
    }

    function renderHead(head) {
      const card = textElement("article", "multi-tax-head-card", "");
      const heading = global.document.createElement("div");
      heading.className = "multi-tax-head-heading";
      heading.append(
        textElement("h4", "", head.label),
        textElement(
          "span",
          `assessment-pill assessment-pill-${head.status}`,
          engine.statusLabel(head.status),
        ),
      );
      card.append(heading);
      card.append(textElement("p", "", head.reason));
      card.append(textElement("p", "assessment-detail", `Responsible party: ${head.responsibleParty}`));
      card.append(textElement("p", "assessment-detail", `Relevant event: ${head.taxEvent}; period needs separate review.`));
      for (const missing of head.informationRequired) {
        card.append(textElement("p", "assessment-information", `Further information required: ${missing}`));
      }
      if (head.calculation) {
        const calculation = global.document.createElement("div");
        calculation.className = "assessment-calculation";
        calculation.append(textElement("strong", "", `${head.calculation.label}: ${formatAmount(head.calculation.amount)}`));
        calculation.append(textElement("p", "", head.calculation.note));
        if (head.calculation.breakdown?.length) {
          const details = global.document.createElement("details");
          details.append(textElement("summary", "", "Show calculator workings"));
          const list = global.document.createElement("ul");
          for (const row of head.calculation.breakdown) {
            list.append(textElement("li", "", `${row.label}: ${formatAmount(row.amount)}`));
          }
          details.append(list);
          calculation.append(details);
        }
        card.append(calculation);
      }
      if (head.status === "not_indicated") {
        card.append(textElement("p", "assessment-detail", "This is not a legal determination that no tax obligation exists."));
      }
      card.append(textElement("p", "assessment-verification", `Legal references: not individually verified. ${head.verificationNote}`));
      return card;
    }

    function renderAssessment(assessment) {
      currentAssessment = assessment;
      resultsPanel.hidden = false;
      statusText.textContent = engine.assessmentStatusLabel(assessment.status);
      summaryText.textContent =
        `${assessment.reference || "Unreferenced transaction"} · ${assessment.scenarioLabel} · ` +
        `${formatAmount(assessment.amount)} · Event date ${assessment.eventDate}. ` +
        `This date is recorded as entered; statutory tax points and filing periods are not inferred.`;
      renderRiskFlags(assessment.riskFlags);
      headList.replaceChildren(...assessment.taxHeads.map(renderHead));
      addToRegister.disabled = false;
      addToRegister.textContent = "Add to temporary register";
      addToRegister.hidden = storedAssessments.some(
        (item) => item.reference === assessment.reference &&
          item.eventDate === assessment.eventDate &&
          item.scenario === assessment.scenario,
      );
    }

    function renderRegister() {
      registerList.replaceChildren();
      registerEmpty.hidden = storedAssessments.length !== 0;
      for (const assessment of storedAssessments) {
        const row = textElement("article", "multi-tax-register-row", "");
        const content = global.document.createElement("div");
        content.append(
          textElement("strong", "", assessment.reference || assessment.scenarioLabel),
          textElement(
            "span",
            "",
            `${assessment.scenarioLabel} · ${assessment.eventDate} · ${formatAmount(assessment.amount)}`,
          ),
        );
        const status = textElement("span", "assessment-pill", engine.assessmentStatusLabel(assessment.status));
        row.append(content, status);
        registerList.append(row);
      }
    }

    form.elements.scenario.addEventListener("change", toggleConditionalFields);
    form.elements.payeRole.addEventListener("change", toggleConditionalFields);
    toggleConditionalFields();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      errorText.hidden = true;
      const input = inputRecord();
      try {
        const assessment = engine.assessTransaction(input, global.ugandaTax);
        renderAssessment(assessment);
        resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        errorText.textContent = error instanceof Error
          ? error.message
          : "The transaction could not be analysed.";
        errorText.hidden = false;
      }
    });

    form.addEventListener("reset", () => {
      currentAssessment = null;
      resultsPanel.hidden = true;
      errorText.hidden = true;
      global.setTimeout(toggleConditionalFields, 0);
    });

    addToRegister.addEventListener("click", () => {
      if (!currentAssessment) return;
      storedAssessments.push(currentAssessment);
      renderRegister();
      addToRegister.hidden = true;
    });

    global.document.querySelector("#multi-tax-register-clear").addEventListener("click", () => {
      storedAssessments.length = 0;
      renderRegister();
      addToRegister.hidden = !currentAssessment;
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const scenarioLabels = Object.freeze({
    property: "Commercial property sale or purchase",
    construction: "Construction contract",
    "imported-machinery": "Imported machinery",
    "professional-services": "Consultancy or professional services",
    "commercial-rental": "Commercial rental",
    employment: "Employee remuneration",
    "share-transfer": "Company share transfer",
    "industrial-building": "Industrial building acquisition or disposal",
    other: "Other transaction",
  });

  const statuses = Object.freeze({
    calculated: "Indicative estimate",
    potential: "Potentially relevant",
    information_required: "Further information required",
    not_indicated: "Not indicated from entered facts",
  });

  const supplyScenarios = new Set([
    "property",
    "construction",
    "imported-machinery",
    "professional-services",
    "commercial-rental",
  ]);
  const instrumentScenarios = new Set([
    "property",
    "construction",
    "share-transfer",
    "industrial-building",
  ]);
  const disposalScenarios = new Set([
    "property",
    "share-transfer",
    "industrial-building",
    "imported-machinery",
  ]);

  function statusLabel(status) {
    return statuses[status] || statuses.information_required;
  }

  function assessmentStatusLabel(status) {
    return status === "information_required"
      ? "Information required before reviewer sign-off"
      : "Pending qualified review";
  }

  function validEventDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function assessTransaction(input, taxCalculator) {
    if (!input || !scenarioLabels[input.scenario]) {
      throw new RangeError("Choose a supported transaction category.");
    }
    if (!validEventDate(input.eventDate)) {
      throw new RangeError("Enter a valid transaction or event date.");
    }
    if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 1_000_000_000_000) {
      throw new RangeError("Enter a transaction amount between UGX 0 and UGX 1 trillion.");
    }

    const heads = [];
    const riskFlags = [];
    const pushHead = (details) => heads.push({
      key: details.key,
      label: details.label,
      status: details.status,
      reason: details.reason,
      responsibleParty: details.responsibleParty,
      taxEvent: details.taxEvent || "the transaction event/date entered",
      informationRequired: details.informationRequired || [],
      calculation: details.calculation || null,
      verificationNote: details.verificationNote ||
        "No final applicability decision is made by this prototype.",
    });
    const addInformationHead = (details) => pushHead({
      ...details,
      status: "information_required",
    });
    const assessedParty = input.partyType === "company"
      ? "Company"
      : input.partyType === "individual"
        ? "Individual"
        : "Taxpayer classification to be confirmed";
    const amount = input.amount;
    const hasConfirmedVatTreatment =
      ["standard", "zero-rated", "exempt", "out-of-scope"].includes(input.vatTreatment);
    const isPayroll = input.scenario === "employment";
    const isDisposal = input.direction === "sale" &&
      disposalScenarios.has(input.scenario);
    const isAssetAcquisition =
      ["purchase", "income"].includes(input.direction) &&
      ["property", "imported-machinery", "industrial-building"].includes(input.scenario);

    if (input.relatedParty) {
      riskFlags.push("Related-party transaction: review valuation, transfer-pricing, relationship and documentation rules.");
    }
    if (input.assetType === "mixed-property") {
      riskFlags.push("Separate land, building and machinery values; one bundled amount may not be a suitable tax base.");
    }
    if (input.efrisStatus === "fiscalised") {
      riskFlags.push("EFRIS status is self-reported only; this prototype has no URA connection and cannot verify fiscalisation.");
    }

    if (isPayroll) {
      pushHead({
        key: "vat",
        label: "Value Added Tax (VAT)",
        status: "not_indicated",
        reason: "Ordinary employee remuneration is not mapped as a VAT supply in this prototype.",
        responsibleParty: "Not applicable to ordinary payroll; assess any separate supplies independently.",
      });
    } else if (input.scenario === "share-transfer") {
      pushHead({
        key: "vat",
        label: "Value Added Tax (VAT)",
        status: "not_indicated",
        reason: "VAT is not indicated on the share transfer itself in this preliminary map; separate advisory or intermediary supplies may need review.",
        responsibleParty: "Not indicated for the share transfer itself.",
      });
    } else if (supplyScenarios.has(input.scenario)) {
      const importTransaction = input.scenario === "imported-machinery";
      if (importTransaction) {
        addInformationHead({
          key: "vat",
          label: "Value Added Tax (VAT)",
          reason: "Import VAT depends on the import documents, customs value and import treatment, which are not computed by the domestic supply calculator.",
          responsibleParty: "Importer.",
          informationRequired: ["Import declaration and verified import-VAT calculation; a foreign supplier's Uganda VAT registration alone does not determine import VAT."],
        });
      } else if (input.supplierVat === "not-registered") {
        pushHead({
          key: "vat",
          label: "Value Added Tax (VAT)",
          status: "not_indicated",
          reason: "The entered supplier status is not registered. Import VAT, registration obligations or other parties' supplies may still require separate assessment.",
          responsibleParty: importTransaction ? "Importer / purchaser (import VAT requires customs documents)." : "Supplier; purchaser-side input VAT needs separate evidence.",
        });
      } else if (input.supplierVat !== "registered" || !hasConfirmedVatTreatment) {
        addInformationHead({
          key: "vat",
          label: "Value Added Tax (VAT)",
          reason: "Taxability, registration and supply classification have not all been confirmed.",
          responsibleParty: importTransaction ? "Importer and supplier, as applicable." : "Supplier for output VAT; purchaser for any input-credit claim.",
          informationRequired: [
            "Confirm the relevant supplier/importer registration and transaction-specific VAT treatment.",
            ...(importTransaction ? ["Provide import declaration, customs value and import-VAT evidence; the domestic supply estimator is not an import-VAT calculation."] : []),
          ],
        });
      } else if (input.vatTreatment === "out-of-scope") {
        pushHead({
          key: "vat",
          label: "Value Added Tax (VAT)",
          status: "not_indicated",
          reason: "The user marked the transaction outside scope; that classification has not been independently verified.",
          responsibleParty: "Supplier or importer, if the classification changes.",
        });
      } else {
        if (!taxCalculator || typeof taxCalculator.calculateVat !== "function") {
          addInformationHead({
            key: "vat",
            label: "Value Added Tax (VAT)",
            reason: "The existing VAT calculator is unavailable.",
            responsibleParty: "Supplier for output VAT; purchaser for any input-credit claim.",
            informationRequired: ["Load the existing VAT calculator before estimating."],
          });
        } else {
          const vatInputs = {
            standardRatedSales: input.vatTreatment === "standard" ? amount : 0,
            salesIncludeVat: input.amountIncludesVat,
            zeroRatedSales: input.vatTreatment === "zero-rated" ? amount : 0,
            exemptSales: input.vatTreatment === "exempt" ? amount : 0,
          };
          const estimate = taxCalculator.calculateVat(vatInputs);
          pushHead({
            key: "vat",
            label: "Value Added Tax (VAT)",
            status: "calculated",
            reason: "The existing VAT calculator was run using the user-confirmed supply classification. Output VAT only is shown; no input VAT credit is assumed.",
            responsibleParty: "Supplier for output VAT; purchaser for any separately evidenced input-credit claim.",
            calculation: {
              label: "Indicative output VAT (not net VAT payable)",
              amount: estimate.outputVat,
              breakdown: estimate.breakdown,
              note: "This transaction-only estimate does not establish registration liability, exemptions, input-credit entitlement or filing amount.",
            },
            verificationNote: `Uses the existing FY ${estimate.taxRuleSet?.financialYear || "2026/27"} VAT calculator; transaction facts and legal classification still require review.`,
          });
        }
      }
    }

    if (["professional-services", "construction"].includes(input.scenario)) {
      if (input.supplierResidency === "unknown" || input.whtAgent === "unknown") {
        addInformationHead({
          key: "withholding-tax",
          label: "Withholding tax (WHT)",
          reason: "The payment type, supplier residence and payer's designated-agent status determine whether withholding is relevant.",
          responsibleParty: "Payer/withholding agent for deduction and remittance; supplier for income-tax credit or final-tax treatment.",
          informationRequired: ["Confirm supplier residence, payment nature, payer designation, threshold and any exemption or treaty relief."],
        });
      } else if (input.supplierResidency === "nonresident") {
        if (input.whtAgent === "yes" && taxCalculator?.calculateWithholdingTax) {
          const estimate = taxCalculator.calculateWithholdingTax(amount, "nonresident-payment");
          pushHead({
            key: "withholding-tax",
            label: "Withholding tax (WHT)",
            status: "calculated",
            reason: "A non-resident payment withholding estimate was run for the entered service/contract payment; source, treaty relief, exemptions and payment characterization remain unverified.",
            responsibleParty: "Payer/withholding agent for deduction and remittance; non-resident recipient for applicable final-tax treatment.",
            calculation: {
              label: "Indicative withholding at source (not additional supplier tax)",
              amount: estimate.tax,
              breakdown: estimate.breakdown,
              note: estimate.note,
            },
            verificationNote: "Uses the existing withholding calculator; verify the exact payment category, source, treaty, exemptions and statutory conditions.",
          });
        } else {
          addInformationHead({
            key: "withholding-tax",
            label: "Withholding tax (WHT)",
            reason: "A cross-border service/contract payment may require withholding assessment.",
            responsibleParty: "Payer/withholding agent and non-resident recipient.",
            informationRequired: ["Confirm payer designation, Uganda-source treatment, payment category, treaty relief and applicable exemptions."],
          });
        }
      } else if (input.whtAgent === "yes" && amount > 1_000_000 &&
          taxCalculator?.calculateWithholdingTax) {
        const estimate = taxCalculator.calculateWithholdingTax(
          amount,
          "resident-supply",
          true,
        );
        pushHead({
          key: "withholding-tax",
          label: "Withholding tax (WHT)",
          status: "calculated",
          reason: "The existing resident-supply WHT calculator was run because a designated payer and a payment above UGX 1,000,000 were entered.",
          responsibleParty: "Payer/withholding agent for deduction and remittance; resident supplier for credit or applicable final-tax treatment.",
          calculation: {
            label: "Indicative withholding at source (not additional supplier tax)",
            amount: estimate.tax,
            breakdown: estimate.breakdown,
            note: estimate.note,
          },
          verificationNote: "Uses the existing withholding calculator; verify payment category, exemptions, statutory conditions and current designation.",
        });
      } else if (input.whtAgent === "no" || amount <= 1_000_000) {
        pushHead({
          key: "withholding-tax",
          label: "Withholding tax (WHT)",
          status: "not_indicated",
          reason: "The entered facts do not meet the resident-supply agent/threshold conditions used by the existing calculator. Other payment categories may differ.",
          responsibleParty: "Payer and supplier, subject to the actual payment category.",
        });
      } else {
        addInformationHead({
          key: "withholding-tax",
          label: "Withholding tax (WHT)",
          reason: "The payer is marked as a designated agent but the payment category, threshold treatment, exemptions and supplier residence need confirmation.",
          responsibleParty: "Payer/withholding agent for deduction and remittance; supplier for credit or final-tax treatment.",
          informationRequired: ["Verify the statutory payment category, threshold, exemptions and residence."],
        });
      }
    } else if (input.scenario === "commercial-rental") {
      if (input.residency === "unknown" || input.whtAgent === "unknown") {
        addInformationHead({
          key: "withholding-tax",
          label: "Withholding tax on rent",
          reason: "The landlord's residence and tenant's withholding-agent status are unknown.",
          responsibleParty: "Tenant/payer if designated; landlord/recipient for income-tax treatment.",
          informationRequired: ["Confirm landlord residence, payer designation, source and any treaty or exemption."],
        });
      } else if (input.residency === "nonresident" && input.whtAgent === "yes" &&
          taxCalculator?.calculateWithholdingTax) {
        const estimate = taxCalculator.calculateWithholdingTax(amount, "nonresident-payment");
        pushHead({
          key: "withholding-tax",
          label: "Withholding tax on rent",
          status: "calculated",
          reason: "The existing non-resident-payment estimate is shown for review; rental-specific final-tax treatment and treaty relief are not determined.",
          responsibleParty: "Tenant/payer for withholding; non-resident landlord for applicable final-tax treatment.",
          calculation: {
            label: "Indicative withholding at source (not additional landlord tax)",
            amount: estimate.tax,
            breakdown: estimate.breakdown,
            note: estimate.note,
          },
          verificationNote: "Confirm the rental-specific rule, payer status, source, applicable treaty and any exemptions.",
        });
      } else if (input.whtAgent === "no") {
        pushHead({
          key: "withholding-tax",
          label: "Withholding tax on rent",
          status: "not_indicated",
          reason: "The entered payer status does not indicate a designated withholding agent; other withholding rules have not been tested.",
          responsibleParty: "Tenant/payer and landlord.",
        });
      } else {
        addInformationHead({
          key: "withholding-tax",
          label: "Withholding tax on rent",
          reason: "Rental withholding depends on the taxpayer and payer facts.",
          responsibleParty: "Tenant/payer if designated; landlord for income-tax treatment.",
          informationRequired: ["Confirm the rental-specific withholding provision, threshold, residence and exemptions."],
        });
      }
    } else if (input.scenario === "imported-machinery") {
      addInformationHead({
        key: "withholding-tax",
        label: "Import withholding tax",
        reason: "Import WHT can depend on the importer, goods, exemptions and statutory conditions; the basic transaction amount is not a verified tax base.",
        responsibleParty: "Importer/payer and supplier, as applicable.",
        informationRequired: ["Import declaration, importer status and verified WHT category/relief."],
      });
    }

    if (instrumentScenarios.has(input.scenario)) {
      if (input.instrumentExecuted === "yes") {
        addInformationHead({
          key: "stamp-duty",
          label: "Stamp Duty",
          reason: "An instrument is reported as executed; the instrument type, chargeable amount, liable party and any relief have not been assessed.",
          responsibleParty: "Party liable under the specific instrument and legislation; not assumed to be the payment maker.",
          informationRequired: ["Instrument copy/type, execution date, chargeable value, liable party and verified relief/rate."],
        });
      } else if (input.instrumentExecuted === "no") {
        pushHead({
          key: "stamp-duty",
          label: "Stamp Duty",
          status: "not_indicated",
          reason: "No chargeable instrument was reported for this entry; a later agreement or transfer instrument may create a separate event.",
          responsibleParty: "Not indicated from the instrument facts entered.",
        });
      } else {
        addInformationHead({
          key: "stamp-duty",
          label: "Stamp Duty",
          reason: "The presence and type of a chargeable instrument are unknown.",
          responsibleParty: "Party liable under the applicable instrument.",
          informationRequired: ["Confirm whether an instrument exists, its legal form, execution date and responsible party."],
        });
      }
    }

    if (isDisposal) {
      addInformationHead({
        key: "income-tax-disposal",
        label: "Income tax on asset/share disposal",
        reason: "A disposal event is indicated, but its income-tax treatment depends on the asset, taxpayer, proceeds, adjusted cost and applicable reliefs. No universal capital-gains rate is assumed.",
        responsibleParty: input.partyRole === "seller"
          ? `${assessedParty} seller/disposer`
          : `${assessedParty} assessed party; confirm seller/disposer`,
        informationRequired: ["Acquisition cost/date, qualifying improvements and costs, ownership, business use, proceeds, taxpayer status and exemptions/restructuring relief."],
      });
    }

    if (input.scenario === "commercial-rental") {
      if (!input.annualRentalAmount || !["individual", "company"].includes(input.partyType) ||
          input.residency === "unknown") {
        addInformationHead({
          key: "rental-income-tax",
          label: "Rental income tax",
          reason: "The existing rental calculator needs the taxpayer category, residence and annual gross rent; a single periodic rent amount is not assumed to be annual.",
          responsibleParty: input.partyRole === "landlord" ? assessedParty : "Landlord/recipient",
          informationRequired: ["Confirm annual gross rental income, taxpayer classification, residence and applicable deductions/credits."],
        });
      } else if (taxCalculator?.calculateRentalIncomeTax) {
        const estimate = taxCalculator.calculateRentalIncomeTax({
          grossRentalIncome: amount,
          taxpayerType: input.partyType,
          residency: input.residency,
        });
        pushHead({
          key: "rental-income-tax",
          label: "Rental income tax",
          status: "calculated",
          reason: "The existing rental-income calculator was run on the user-confirmed annual gross-rent amount and taxpayer details.",
          responsibleParty: input.partyRole === "landlord" ? assessedParty : "Landlord/recipient",
          calculation: {
            label: estimate.taxLabel || "Indicative rental tax estimate",
            amount: estimate.tax,
            breakdown: estimate.breakdown,
            note: estimate.note,
          },
          verificationNote: "Uses the existing rental calculator; ring-fencing, deductions, filing cadence and separate income-tax inclusion require review.",
        });
      } else {
        addInformationHead({
          key: "rental-income-tax",
          label: "Rental income tax",
          reason: "The existing rental calculator is unavailable.",
          responsibleParty: "Landlord/recipient",
          informationRequired: ["Load the existing rental calculator and confirm the annual taxable amount."],
        });
      }
    }

    if (isPayroll || input.employmentRelationship === "yes") {
      if (!isPayroll || input.partyRole !== "employee" ||
          input.residency === "unknown" ||
          (input.payeRole === "secondary" &&
            (!Number.isFinite(input.primaryMonthlyTaxableIncome) ||
              input.primaryMonthlyTaxableIncome < 0))) {
        addInformationHead({
          key: "paye",
          label: "PAYE",
          reason: "An employment relationship is indicated, but employee status, residence, monthly taxable pay or primary-employment income is incomplete.",
          responsibleParty: "Employer for withholding and remittance; employee for the employment-income tax treatment.",
          informationRequired: ["Confirm the actual employment relationship, monthly taxable benefits/pay, residence and primary/secondary-employment inputs."],
        });
      } else if (taxCalculator?.calculatePaye) {
        const resident = input.residency === "resident";
        const estimate = input.payeRole === "secondary"
          ? taxCalculator.calculatePayeWithSecondaryEmployment(
              input.primaryMonthlyTaxableIncome,
              amount,
              resident,
            )
          : taxCalculator.calculatePaye(amount, resident, amount);
        const monthlyTax = input.payeRole === "secondary"
          ? estimate.secondaryMonthlyTax
          : estimate.monthlyTax;
        pushHead({
          key: "paye",
          label: "PAYE",
          status: "calculated",
          reason: "The existing monthly PAYE calculator was run using the stated employee residence and employment role.",
          responsibleParty: "Employer for withholding and remittance; employee for employment-income tax.",
          calculation: {
            label: input.payeRole === "secondary"
              ? "Indicative secondary-employment monthly withholding"
              : "Indicative primary-employment monthly PAYE",
            amount: monthlyTax,
            breakdown: input.payeRole === "secondary"
              ? [{ label: "Secondary employment monthly withholding", amount: monthlyTax }]
              : estimate.breakdown.map((row) => ({ label: row.label, amount: row.tax })),
            note: input.payeRole === "secondary"
              ? "This shows the secondary-employer withholding estimate only; it is not an annual final tax reconciliation."
              : "This monthly estimate excludes unentered benefits, reliefs and year-end reconciliation.",
          },
          verificationNote: `Uses the existing FY ${estimate.taxRuleSet?.financialYear || "2026/27"} PAYE calculator; taxable benefits and relief eligibility still require review.`,
        });
      } else {
        addInformationHead({
          key: "paye",
          label: "PAYE",
          reason: "The existing PAYE calculator is unavailable.",
          responsibleParty: "Employer for withholding and remittance; employee for the tax treatment.",
          informationRequired: ["Load the existing PAYE calculator and confirm taxable employment income."],
        });
      }
    } else if (input.scenario !== "employment") {
      pushHead({
        key: "paye",
        label: "PAYE",
        status: input.employmentRelationship === "no" ? "not_indicated" : "information_required",
        reason: input.employmentRelationship === "no"
          ? "The user reports no employment relationship; ordinary supplier payments are not automatically treated as PAYE."
          : "The relationship has not been determined; consultancy/contract labels alone do not decide whether a worker is an employee.",
        responsibleParty: "Employer if an employment relationship is established.",
        informationRequired: input.employmentRelationship === "unknown"
          ? ["Review actual working arrangements and employment indicators."]
          : [],
      });
    }

    if (isAssetAcquisition) {
      if (input.assetType === "land") {
        pushHead({
          key: "capital-allowances",
          label: "Capital allowances",
          status: "not_indicated",
          reason: "Land alone is not treated as a depreciating asset in this prototype; separately priced buildings or machinery need their own assessment.",
          responsibleParty: "Purchaser/asset owner.",
        });
      } else if (["individual", "company"].includes(input.partyType) &&
          ["machinery", "building", "mixed-property"].includes(input.assetType)) {
        addInformationHead({
          key: "capital-allowances",
          label: "Capital allowances",
          reason: "The acquisition may involve a qualifying depreciable asset; asset class, ownership, business use and tax written-down values are not provided.",
          responsibleParty: "Purchaser/asset owner.",
          informationRequired: ["Separate qualifying asset expenditure and land value; confirm asset class, business use, acquisition timing and existing tax pools."],
        });
      } else {
        addInformationHead({
          key: "capital-allowances",
          label: "Capital allowances",
          reason: "Asset type and taxpayer classification are not sufficient to identify a qualifying allowance.",
          responsibleParty: "Purchaser/asset owner.",
          informationRequired: ["Confirm the asset classification, qualifying expenditure, owner and business use."],
        });
      }

      if (input.industrialBuilding === "no") {
        pushHead({
          key: "industrial-building-deduction",
          label: "Industrial building deduction",
          status: "not_indicated",
          reason: "Qualifying industrial-building use was marked no; verify other building or asset allowances separately.",
          responsibleParty: "Building owner.",
        });
      } else if (input.scenario === "industrial-building" ||
          input.industrialBuilding === "yes" ||
          input.industrialBuilding === "unknown" &&
            ["building", "mixed-property"].includes(input.assetType)) {
        addInformationHead({
          key: "industrial-building-deduction",
          label: "Industrial building deduction",
          reason: "Industrial-building eligibility, qualifying expenditure, use, dates and disposal adjustments require evidence; no allowance is computed.",
          responsibleParty: "Purchaser/owner of the building.",
          informationRequired: ["Confirm statutory building class, use, qualifying expenditure, date first used and any prior allowances/disposal."],
        });
      }
    }

    if (isDisposal && input.scenario === "industrial-building") {
      addInformationHead({
        key: "industrial-building-deduction",
        label: "Industrial building deduction",
        reason: "The disposal may affect prior building deductions or trigger a tax adjustment; prior claims and disposal values have not been assessed.",
        responsibleParty: input.partyRole === "seller" ? "Building owner/disposer." : "Assessed building owner; confirm the disposer.",
        informationRequired: ["Prior qualifying expenditure and allowances, disposal proceeds, date, transferee and any applicable balancing adjustment or relief."],
      });
    }

    if (input.scenario === "imported-machinery") {
      addInformationHead({
        key: "customs-import-taxes",
        label: "Customs duty and import taxes",
        reason: "Imported machinery requires tariff classification, customs value, origin, import declaration and relief analysis.",
        responsibleParty: "Importer.",
        informationRequired: ["Tariff code, customs value, country of origin, import declaration and any relief certificate."],
      });
    }

    if (["construction", "professional-services", "commercial-rental"].includes(input.scenario) &&
        ["individual", "company"].includes(input.partyType)) {
      addInformationHead({
        key: input.partyType === "company" ? "corporate-income-tax" : "business-income-tax",
        label: input.partyType === "company" ? "Corporate income tax" : "Business income tax",
        reason: "One transaction amount cannot establish annual chargeable income, deductible expenses, capital treatment, losses or credits.",
        responsibleParty: input.partyRole === "supplier" || input.partyRole === "landlord"
          ? assessedParty
          : "Income recipient / business operator",
        informationRequired: ["Review period-wide income, allowable expenses, deductions, disallowances, losses and tax already paid in the existing income-tax calculator."],
      });
    }

    if (input.scenario !== "employment" &&
        supplyScenarios.has(input.scenario) &&
        input.efrisStatus === "not-recorded") {
      pushHead({
        key: "efris",
        label: "EFRIS / e-invoicing",
        status: "information_required",
        reason: "A supply/payment may have invoicing obligations, but the prototype does not connect to URA EFRIS or determine the legal document requirement.",
        responsibleParty: "Supplier for any applicable invoicing obligation.",
        informationRequired: ["Check actual invoice/receipt requirements and retrieve the genuine URA system result."],
        verificationNote: "The existing EFRIS workspace is manual/import-only; no invoice is created, submitted or fiscalised here.",
      });
    } else if (input.efrisStatus !== "not-recorded" &&
        input.scenario !== "employment" &&
        supplyScenarios.has(input.scenario)) {
      pushHead({
        key: "efris",
        label: "EFRIS / e-invoicing",
        status: "potential",
        reason: `Document status "${input.efrisStatus}" was entered by the user; no status was verified with URA.`,
        responsibleParty: "Supplier for any applicable invoicing obligation.",
        verificationNote: "This is not a live EFRIS integration. Verify any claimed submission/fiscalisation directly in the genuine URA system.",
      });
    }

    if (input.partyType === "unknown") {
      riskFlags.push("Confirm whether the relevant taxpayer is an individual or company; the legal treatment can differ.");
    }
    if (input.residency === "unknown" &&
        ["commercial-rental", "employment", "professional-services"].includes(input.scenario)) {
      riskFlags.push("Confirm the assessed taxpayer's residence and any treaty or non-resident treatment.");
    }

    const informationCount = heads.filter(
      (head) => head.status === "information_required",
    ).length;
    const assessment = {
      reference: input.reference || "",
      eventDate: input.eventDate,
      scenario: input.scenario,
      scenarioLabel: scenarioLabels[input.scenario],
      direction: input.direction,
      amount,
      status: informationCount > 0 ? "information_required" : "pending_review",
      taxHeads: heads,
      riskFlags,
      relatedParty: Boolean(input.relatedParty),
      description: input.description || "",
      informationRequiredCount: informationCount,
      calculations: heads.filter((head) => head.calculation).map((head) => ({
        key: head.key,
        amount: head.calculation.amount,
        kind: head.key === "withholding-tax"
          ? "withholding"
          : head.key === "paye"
            ? "monthly-payroll"
            : head.key === "rental-income-tax"
              ? "rental-income-tax"
              : "transaction-estimate",
      })),
      finalTaxPayable: null,
      legalReferences: [],
    };
    assessment.report = buildAssessmentReport(assessment);
    return assessment;
  }

  function classifyTransactionInput(input) {
    const scenario = input?.scenario || "other";
    const direction = input?.direction || "other";
    const relatedParty = Boolean(input?.relatedParty || input?.supplierResidency === "unknown");
    let taxModel = "business";
    if (scenario === "employment") {
      taxModel = "employment";
    } else if (scenario === "commercial-rental") {
      taxModel = "rental";
    } else if (scenario === "imported-machinery") {
      taxModel = "import-tax";
    } else if (scenario === "other" || scenario === "share-transfer") {
      taxModel = "business";
    }

    const analysisScope = scenario === "employment" || input?.partyType === "individual"
      ? "single-party"
      : relatedParty
        ? "multi-party"
        : "single-party";

    return {
      scenario,
      direction,
      taxModel,
      analysisScope,
      relatedParty,
      requiresSeparateReview: true,
      singlePartyView: analysisScope === "single-party",
    };
  }

  function buildAssessmentReport(assessment) {
    const scenarioKey = assessment?.scenario || "other";
    const classification = classifyTransactionInput(assessment);
    const relevantTaxHeads = Array.isArray(assessment?.taxHeads)
      ? assessment.taxHeads.filter((head) => head && head.status !== "not_indicated")
      : [];

    return {
      scenario: scenarioKey,
      classification,
      headCount: Array.isArray(assessment?.taxHeads) ? assessment.taxHeads.length : 0,
      relevantHeadCount: relevantTaxHeads.length,
      noDoubleCount: true,
      taxPayable: assessment?.finalTaxPayable ?? null,
      summary: [
        assessment?.reference ? `Reference ${assessment.reference}` : "Unreferenced transaction",
        assessment?.scenarioLabel || scenarioLabels[scenarioKey] || "transaction review",
        `UGX ${Number.isFinite(assessment?.amount) ? assessment.amount.toLocaleString("en-UG") : 0}`,
        `Event date ${assessment?.eventDate || "not entered"}`,
        "No consolidated net payable is shown; estimates, withholding credits, recoverable VAT and liabilities remain separate.",
      ].join(" · "),
      riskFlags: Array.isArray(assessment?.riskFlags) ? assessment.riskFlags : [],
      relevantTaxHeads: relevantTaxHeads.map((head) => ({
        key: head.key,
        label: head.label,
        status: head.status,
      })),
      warning: "This is not a filing approval. Each tax head is reviewed independently to avoid double counting.",
    };
  }

  return {
    assessTransaction,
    classifyTransactionInput,
    buildAssessmentReport,
    statusLabel,
    assessmentStatusLabel,
    scenarioLabels,
  };
});
