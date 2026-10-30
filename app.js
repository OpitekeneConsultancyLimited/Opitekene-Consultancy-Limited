const form = document.querySelector("#tax-form");
const taxTabs = [...document.querySelectorAll(".tax-tab")];
const taxFields = [...document.querySelectorAll(".tax-fields")];
const formTitle = document.querySelector("#form-title");
const formDescription = document.querySelector("#form-description");
const calculateLabel = document.querySelector("#calculate-label");
const emptyResults = document.querySelector("#empty-results");
const calculatedResults = document.querySelector("#calculated-results");
const balanceRow = document.querySelector("#balance-row");
const resultBreakdown = document.querySelector("#result-breakdown");
const estimatedTax = document.querySelector("#estimated-tax");
const resultLabel = document.querySelector("#result-label");
const effectiveRate = document.querySelector("#effective-rate");
const balanceLabel = document.querySelector("#balance-label");
const balanceAmount = document.querySelector("#balance-amount");
const breakdownTitle = document.querySelector("#breakdown-title");
const breakdownSubtitle = document.querySelector("#breakdown-subtitle");
const columnLabel = document.querySelector("#column-label");
const columnRate = document.querySelector("#column-rate");
const columnTax = document.querySelector("#column-tax");
const calculationNote = document.querySelector("#calculation-note");
const designatedPayerField = document.querySelector("#designated-payer-field");
const supplierInvoiceField = document.querySelector("#supplier-invoice-field");
const whtType = document.querySelector("#wht-type");
const formError = document.querySelector("#form-error");
const amountFormatter = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-UG", {
  style: "percent",
  maximumFractionDigits: 1,
});

const headContent = {
  individual: {
    title: "Your income",
    description: "Build annual chargeable income, then estimate tax using the applicable bands.",
    button: "Calculate individual tax",
  },
  paye: {
    title: "Employment income",
    description: "Estimate monthly PAYE and show NSSF contributions separately.",
    button: "Calculate monthly PAYE",
  },
  company: {
    title: "Company income",
    description: "Reconcile accounting profit to estimated chargeable income, then calculate tax.",
    button: "Calculate company tax",
  },
  vat: {
    title: "VAT for the period",
    description: "Estimate standard-rated output VAT less claimable input VAT.",
    button: "Calculate VAT",
  },
  rental: {
    title: "Rental income",
    description: "Estimate annual individual rental income tax.",
    button: "Calculate rental tax",
  },
  withholding: {
    title: "Payment details",
    description: "Estimate withholding tax for a common payment category.",
    button: "Calculate withholding",
  },
  presumptive: {
    title: "Small business turnover",
    description: "Apply the presumptive rate confirmed for your business.",
    button: "Calculate presumptive tax",
  },
};

function formatUgx(value) {
  const sign = value < 0 ? "- " : "";
  return `UGX ${sign}${amountFormatter.format(Math.round(Math.abs(value)))}`;
}

function formatPercent(rate) {
  return percentFormatter.format(rate);
}

function renderBreakdown(rows) {
  resultBreakdown.replaceChildren();

  for (const item of rows) {
    const row = document.createElement("tr");
    const label = document.createElement("td");
    const rate = document.createElement("td");
    const amount = document.createElement("td");

    label.textContent = item.label;
    rate.textContent = item.rate === null || item.rate === undefined
      ? "—"
      : formatPercent(item.rate);
    amount.textContent = formatUgx(item.amount);
    row.append(label, rate, amount);
    resultBreakdown.append(row);
  }
}

function setTaxHead(head, focusTab = false) {
  const selectedTab = taxTabs.find((tab) => tab.dataset.taxHead === head);
  const content = headContent[head];

  for (const tab of taxTabs) {
    const selected = tab === selectedTab;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }

  for (const panel of taxFields) {
    const selected = panel.dataset.fields === head;
    panel.hidden = !selected;
    for (const control of panel.querySelectorAll("input, select")) {
      control.disabled = !selected;
      control.required = selected && control.dataset.required === "true";
    }
  }

  formTitle.textContent = content.title;
  formDescription.textContent = content.description;
  calculateLabel.textContent = content.button;
  designatedPayerField.hidden = head !== "withholding" ||
    !["resident-supply", "vat-withholding"].includes(whtType.value);
  supplierInvoiceField.hidden = head !== "withholding" ||
    whtType.value !== "vat-withholding";
  formError.hidden = true;
  calculatedResults.hidden = true;
  emptyResults.hidden = false;
  form.dataset.taxHead = head;
  form.setAttribute("aria-labelledby", selectedTab.id);
  if (focusTab) selectedTab.focus();
}

for (const tab of taxTabs) {
  tab.addEventListener("click", () => setTaxHead(tab.dataset.taxHead));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = taxTabs.indexOf(tab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? taxTabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : taxTabs.length - 1)) %
          taxTabs.length;
    setTaxHead(taxTabs[nextIndex].dataset.taxHead, true);
  });
}

whtType.addEventListener("change", () => {
  designatedPayerField.hidden =
    !["resident-supply", "vat-withholding"].includes(whtType.value);
  supplierInvoiceField.hidden = whtType.value !== "vat-withholding";
});

for (const panel of taxFields) {
  const requiredControl = panel.querySelector("input, select");
  if (requiredControl) requiredControl.dataset.required = "true";
}

function renderResult({
  value,
  label,
  context = "",
  balance,
  remainingLabel = "Estimated balance to pay",
  breakdown,
  note,
  breakdownHeading = "How the estimate adds up",
  breakdownCaption = "Calculation details",
  extraRows = [],
}) {
  resultLabel.textContent = label;
  estimatedTax.textContent = formatUgx(value);
  effectiveRate.textContent = context;
  balanceRow.hidden = balance === undefined || balance === null;
  if (!balanceRow.hidden) {
    balanceLabel.textContent = balance < 0
      ? "Estimated overpayment / credit"
      : remainingLabel;
    balanceAmount.textContent = formatUgx(Math.abs(balance));
  }
  breakdownTitle.textContent = breakdownHeading;
  breakdownSubtitle.textContent = breakdownCaption;
  columnLabel.textContent = "Description";
  columnRate.textContent = "Rate";
  columnTax.textContent = "Amount";
  renderBreakdown([...breakdown, ...extraRows]);
  calculationNote.textContent = note;
  emptyResults.hidden = true;
  calculatedResults.hidden = false;
}

function showIncomeTax() {
  const income = document.querySelector("#assessable-income").valueAsNumber;
  const deductionsInput = document.querySelector("#individual-deductions");
  const deductions = deductionsInput.value === "" ? 0 : deductionsInput.valueAsNumber;
  const isResident = document.querySelector("#individual-residency").value === "resident";
  const paid = document.querySelector("#tax-paid").value === ""
    ? 0
    : document.querySelector("#tax-paid").valueAsNumber;
  const chargeability = ugandaTax.calculateChargeableIncome(income, 0, deductions);
  const estimate = ugandaTax.calculateIndividualIncomeTax(
    chargeability.chargeableIncome,
    isResident,
  );

  renderResult({
    value: estimate.totalTax,
    label: "Estimated annual individual income tax",
    context: `Chargeable income: ${formatUgx(chargeability.chargeableIncome)} · ${isResident ? "Resident" : "Non-resident"} · Effective rate: ${formatPercent(estimate.effectiveRate)} · Marginal rate: ${formatPercent(estimate.marginalRate)}`,
    balance: estimate.totalTax - paid,
    breakdown: [
      { label: "Annual assessable income", rate: null, amount: chargeability.income },
      { label: "Less: allowable deductions entered", rate: null, amount: -chargeability.deductions },
      { label: "Estimated chargeable income", rate: null, amount: chargeability.chargeableIncome },
      ...estimate.breakdown.map((band) => ({
        label: `Tax band: ${band.label}`,
        rate: band.rate,
        amount: band.tax,
      })),
    ],
    breakdownCaption: "Income adjustments and tax by band",
    note: `Standard ${isResident ? "resident" : "non-resident"} individual bands for FY 2026/27. Include income sources correctly and claim only deductions you have confirmed are allowable. Reliefs, exempt-income classification, loss relief, treaty rules and special regimes are not assessed.`,
  });
}

function showPaye() {
  const monthlyIncome = document.querySelector("#monthly-salary").valueAsNumber;
  const grossInput = document.querySelector("#monthly-gross-earnings");
  const monthlyGross = grossInput.value === ""
    ? monthlyIncome
    : grossInput.valueAsNumber;
  const isResident = document.querySelector("#paye-residency").value === "resident";
  const estimate = ugandaTax.calculatePaye(monthlyIncome, isResident, monthlyGross);

  renderResult({
    value: estimate.monthlyTax,
    label: "Estimated PAYE per month",
    context: `Annualized PAYE: ${formatUgx(estimate.monthlyTax * 12)} · Employee NSSF: ${formatUgx(estimate.monthlyEmployeeNssf)}/month · Employer NSSF: ${formatUgx(estimate.monthlyEmployerNssf)}/month`,
    breakdown: estimate.breakdown.map((band) => ({
      label: band.label,
      rate: band.rate,
      amount: band.tax,
    })),
    extraRows: [
      { label: "Employee NSSF (separate contribution)", rate: 0.05, amount: estimate.monthlyEmployeeNssf },
      { label: "Employer NSSF (separate contribution)", rate: 0.1, amount: estimate.monthlyEmployerNssf },
    ],
    breakdownHeading: "Monthly PAYE and payroll",
    breakdownCaption: "NSSF is not income tax",
    note: `Assumes a ${isResident ? "resident" : "non-resident"} employee with the same taxable monthly pay throughout the year. A resident employee earning no more than UGX 335,000 per month is within the PAYE-exempt threshold. NSSF is estimated at 5% employee and 10% employer; verify applicability. Benefits, Local Service Tax and special reliefs are not included.`,
  });
}

function showCompanyTax() {
  const accountingProfit = document.querySelector("#company-profit").valueAsNumber;
  const addbacksInput = document.querySelector("#company-addbacks");
  const deductionsInput = document.querySelector("#company-deductions");
  const addbacks = addbacksInput.value === "" ? 0 : addbacksInput.valueAsNumber;
  const deductions = deductionsInput.value === "" ? 0 : deductionsInput.valueAsNumber;
  const chargeability = ugandaTax.calculateChargeableIncome(
    accountingProfit,
    addbacks,
    deductions,
  );
  const paid = document.querySelector("#company-paid").value === ""
    ? 0
    : document.querySelector("#company-paid").valueAsNumber;
  const estimate = ugandaTax.calculateCompanyIncomeTax(
    chargeability.chargeableIncome,
    paid,
  );

  renderResult({
    value: estimate.tax,
    label: "Estimated annual company income tax",
    context: `Estimated chargeable income: ${formatUgx(chargeability.chargeableIncome)} · Standard resident company rate: 30%`,
    balance: estimate.balance,
    breakdown: [
      { label: "Accounting profit before tax", rate: null, amount: chargeability.income },
      { label: "Add: non-deductible expenses entered", rate: null, amount: chargeability.additions },
      { label: "Profit after add-backs", rate: null, amount: chargeability.incomeAfterAdditions },
      { label: "Less: further allowable deductions entered", rate: null, amount: -chargeability.deductions },
      ...estimate.breakdown.map((item) => ({
        label: item.label,
        rate: item.rate,
        amount: item.amount,
      })),
    ],
    breakdownCaption: "Accounting profit to chargeable income",
    note: "Uses the standard 30% company rate. Enter only adjustments not already reflected in the accounts and deductions confirmed allowable under the applicable rules. The estimator does not determine deductibility, capital allowances, exempt income, carried-forward losses, incentives or special regimes.",
  });
}

function showVat() {
  const optionalNumber = (selector) => {
    const input = document.querySelector(selector);
    return input.value === "" ? undefined : input.valueAsNumber;
  };
  const estimate = ugandaTax.calculateVat({
    standardRatedSales: document.querySelector("#vat-sales").valueAsNumber,
    salesIncludeVat: document.querySelector("#vat-price-mode").value === "inclusive",
    zeroRatedSales: document.querySelector("#vat-zero-sales").value === ""
      ? 0
      : document.querySelector("#vat-zero-sales").valueAsNumber,
    exemptSales: document.querySelector("#vat-exempt-sales").value === ""
      ? 0
      : document.querySelector("#vat-exempt-sales").valueAsNumber,
    claimableInputVat: document.querySelector("#vat-input").value === ""
      ? 0
      : document.querySelector("#vat-input").valueAsNumber,
    annualTaxableTurnover: optionalNumber("#vat-annual-turnover"),
    threeMonthTaxableTurnover: optionalNumber("#vat-three-month-turnover"),
    remoteServices: document.querySelector("#vat-remote-services").checked,
  });
  const hasCredit = estimate.netVat < 0;
  const registrationStatus = !estimate.registrationAssessed
    ? "Registration threshold not assessed"
    : estimate.registrationRequired
      ? "Registration threshold met — check with URA"
      : "Thresholds not met from figures entered";

  renderResult({
    value: Math.abs(estimate.netVat),
    label: hasCredit ? "Estimated excess input VAT" : "Estimated net VAT payable",
    context: `${registrationStatus} · Allowable input VAT: ${formatUgx(estimate.claimableInputVat)}`,
    breakdown: estimate.breakdown,
    note: "Uses 18% standard VAT and 0% on zero-rated sales. FY 2026/27 registration thresholds are UGX 300 million annual or more than UGX 75 million in three months. Remote-service rules may require registration separately. Input VAT recovery is restricted by exempt-supply share; claims generally require a valid EFRIS invoice/receipt and must be made within six months. This is not a VAT return.",
  });
}

function showRentalTax() {
  const income = document.querySelector("#rental-income").valueAsNumber;
  const paid = document.querySelector("#rental-paid").value === ""
    ? 0
    : document.querySelector("#rental-paid").valueAsNumber;
  const estimate = ugandaTax.calculateRentalIncomeTax(income, paid);

  renderResult({
    value: estimate.tax,
    label: "Estimated annual individual rental income tax",
    context: `Taxable rental income: ${formatUgx(estimate.taxableRentalIncome)} · Rate: 12%`,
    balance: estimate.balance,
    breakdown: estimate.breakdown,
    note: "Applies 12% to annual gross individual rental income above UGX 2,820,000. No rental expense deductions are applied. Monthly filing and payment apply from 1 July 2026; this annual estimate does not calculate monthly instalments. Company rental income is not covered.",
  });
}

function showWithholdingTax() {
  const estimate = ugandaTax.calculateWithholdingTax(
    document.querySelector("#wht-gross").valueAsNumber,
    whtType.value,
    document.querySelector("#designated-payer").checked,
    document.querySelector("#supplier-issued-invoice").checked,
  );

  renderResult({
    value: estimate.tax,
    label: "Estimated withholding to deduct",
    context: `Applicable rate: ${formatPercent(estimate.rate)}`,
    breakdown: estimate.breakdown,
    note: estimate.note,
    breakdownHeading: "Payment calculation",
  });
}

function showPresumptiveTax() {
  const estimate = ugandaTax.calculatePresumptiveTax(
    document.querySelector("#presumptive-turnover").valueAsNumber,
    document.querySelector("#presumptive-rate").valueAsNumber,
  );

  renderResult({
    value: estimate.tax,
    label: "Estimated presumptive tax",
    context: `Entered rate: ${formatPercent(estimate.rate)}`,
    breakdown: estimate.breakdown,
    note: "This calculator applies the rate you provide to turnover; it does not select the statutory presumptive schedule. Confirm eligibility and the correct rate with URA or a qualified tax professional. Some professional and specified service businesses are excluded.",
    breakdownHeading: "Turnover calculation",
  });
}

const calculations = {
  individual: showIncomeTax,
  paye: showPaye,
  company: showCompanyTax,
  vat: showVat,
  rental: showRentalTax,
  withholding: showWithholdingTax,
  presumptive: showPresumptiveTax,
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!form.reportValidity()) return;

  try {
    calculations[form.dataset.taxHead]();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

setTaxHead("individual");
