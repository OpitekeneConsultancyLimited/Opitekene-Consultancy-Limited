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
const whtGrossLabel = document.querySelector("#wht-gross-label");
const whtGrossHelp = document.querySelector("#wht-gross-help");
const bettingStakeField = document.querySelector("#betting-stake-field");
const bettingStake = document.querySelector("#betting-stake");
const nationalLotteryField = document.querySelector("#national-lottery-field");
const nationalLotteryWinnings = document.querySelector("#national-lottery-winnings");
const formError = document.querySelector("#form-error");
const customsDirection = document.querySelector("#customs-direction");
const capitalAssetRows = document.querySelector("#capital-asset-rows");
const capitalAssetTemplate = document.querySelector("#capital-asset-row-template");
const addCapitalAssetButton = document.querySelector("#add-capital-asset");
const rentalTaxpayerType = document.querySelector("#rental-taxpayer-type");
const rentalResidency = document.querySelector("#rental-residency");
const payeEmploymentType = document.querySelector("#paye-employment-type");
const payeSelectedIncomeLabel = document.querySelector("#paye-selected-income-label");
const payeSelectedIncomeHelp = document.querySelector("#paye-selected-income-help");
const payeOtherIncomeLabel = document.querySelector("#paye-other-income-label");
const payeOtherIncomeHelp = document.querySelector("#paye-other-income-help");
const payePrimaryItems = document.querySelector("#paye-primary-items");
const payeNssfField = document.querySelector("#paye-nssf-field");
const advisoryForm = document.querySelector("#tax-advisory-search");
const advisoryQuery = document.querySelector("#advisory-query");
const advisoryTopic = document.querySelector("#advisory-topic");
const advisoryResults = document.querySelector("#advisory-results");
const advisoryResultCount = document.querySelector("#advisory-result-count");
const advisoryNoResults = document.querySelector("#advisory-no-results");
const taxCaseForm = document.querySelector("#tax-case-search");
const taxCaseQuery = document.querySelector("#tax-case-query");
const taxCaseResults = document.querySelector("#tax-case-results");
const taxCaseResultCount = document.querySelector("#tax-case-result-count");
const taxCaseNoResults = document.querySelector("#tax-case-no-results");
const amountFormatter = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-UG", {
  style: "percent",
  maximumFractionDigits: 1,
});

const payeTaxableItems = [
  { key: "travel-allowance", label: "Travel allowance" },
  { key: "medical-allowance", label: "Medical allowance" },
  { key: "leave-pay", label: "Leave pay" },
  { key: "utilities", label: "Utilities benefit" },
  { key: "school-fees", label: "School fees and dependent education benefits" },
  { key: "spouse-travel", label: "Travel allowance for spouse" },
  { key: "dependent-medical", label: "Medical benefits for spouse or dependents" },
  { key: "domestic-assistant", label: "Housekeeper, chauffeur, gardener or other domestic assistant" },
  { key: "reimbursed-expenditure", label: "Reimbursed employee expenditure not treated as employer business expenditure" },
  { key: "termination", label: "Compensation for termination of employment" },
  { key: "life-insurance", label: "Life insurance premium paid by a tax-exempt employer" },
  { key: "employment-conditions", label: "Consideration for agreeing to employment conditions or changes" },
  { key: "share-scheme", label: "Taxable employee share-scheme benefit or option disposal gain" },
  { key: "gifts", label: "Employer gifts determined taxable under the monthly threshold rules" },
  { key: "motor-vehicle", label: "Motor vehicle benefit (enter assessed taxable value)" },
  { key: "low-interest-loan", label: "Low-interest loan benefit (enter assessed taxable value)" },
  { key: "housing", label: "Residential housing benefit (enter assessed taxable value)" },
  { key: "gratuity", label: "Gratuity or end-of-term benefit" },
  { key: "overtime", label: "Overtime pay" },
  { key: "bonus", label: "Bonus" },
  { key: "other", label: "Other taxable employment benefit or income" },
];

const companyAddbackItems = [
  { key: "accounting-depreciation", label: "Accounting depreciation" },
  { key: "amortisation", label: "Amortisation" },
  { key: "income-tax", label: "Income tax (including rental tax) expense or provision" },
  { key: "property-income", label: "Non-deductible expenses relating to property or rental income" },
  { key: "insurance-business", label: "Insurance-business-specific tax adjustment (if applicable)" },
  { key: "dividends-reserves", label: "Dividends or amounts transferred to reserves/capital" },
  { key: "personal-expenses", label: "Personal, commuting, clothing or non-qualifying education expenses" },
  { key: "director-interest", label: "Interest on director debit balances" },
  { key: "insurance-recoverable", label: "Expenses or losses recoverable under insurance, contract or indemnity" },
  { key: "non-qualifying-donations", label: "Donations not confirmed as qualifying" },
  { key: "fines-penalties", label: "Government or local-authority fines and penalties" },
  { key: "retirement-insurance", label: "Employee retirement contributions, life premiums or pension payments confirmed disallowable" },
  { key: "employee-gifts", label: "Employee gift expense where the related benefit is not included in taxable employment income" },
  { key: "supplier-documentation", label: "Expenses affected by supplier TIN or EFRIS documentation rules" },
  { key: "meals-entertainment", label: "Meals, refreshments or entertainment amount confirmed disallowable" },
  { key: "bad-debt-provisions", label: "General bad-debt provisions or increases in provisions" },
  { key: "capital-disposal-loss", label: "Loss on disposal of fixed or other capital assets" },
  { key: "share-capital", label: "Expenditure on increase of share capital" },
  { key: "capitalised-costs", label: "Legal, stamp-duty or other incidental asset costs charged to expenses" },
  { key: "exempt-income-expenses", label: "Expenses incurred in deriving exempt income" },
  { key: "forex-impairment", label: "Foreign-exchange or revaluation loss and loan impairment not deductible" },
  { key: "restricted-interest", label: "Interest disallowed under a foreign-control or other statutory restriction" },
  { key: "petroleum-contract", label: "Petroleum-operation contract expenditure confirmed non-deductible" },
  { key: "bad-debt-recovery", label: "Bad debt recovered or other taxable recovery not already included in profit" },
  { key: "withholding-expense", label: "Withholding tax expense confirmed non-deductible" },
  { key: "balancing-charge", label: "Balancing charge or other taxable recovery not already in profit" },
  { key: "other", label: "Other confirmed disallowable expense or taxable adjustment" },
];

const companyDeductionItems = [
  { key: "business-expenditure", label: "Allowable business expenditure not already deducted in the accounts" },
  { key: "apportioned-expenses", label: "Allowable apportioned expenses for taxable income (enter only the assessed portion)" },
  { key: "local-service-tax", label: "Local Service Tax" },
  { key: "bad-debts", label: "Bad debts written off after required recovery steps" },
  { key: "specific-provision", label: "Qualifying specific bad-debt provision for a financial institution" },
  { key: "interest", label: "Allowable interest on debt obligations" },
  { key: "minor-capital-repairs", label: "Qualifying minor capital expenditure, repairs or minor capital equipment" },
  { key: "trading-stock-disposal", label: "Tax adjustment on disposal of trading stock" },
  { key: "wear-and-tear", label: "Wear-and-tear/capital allowance from the tax asset schedule" },
  { key: "balancing-allowance", label: "Balancing allowance on disposal of a depreciable asset" },
  { key: "industrial-building", label: "Industrial building deduction from the tax schedule" },
  { key: "reverse-charge-vat", label: "Reverse-charge VAT confirmed deductible for income-tax purposes" },
  { key: "start-up-intangibles", label: "Qualifying start-up or intangible-asset expenditure" },
  { key: "research-training", label: "Qualifying scientific research, training or education expenditure" },
  { key: "charitable-donations", label: "Qualifying charitable donations" },
  { key: "farming", label: "Qualifying farming expenditure" },
  { key: "foreign-exchange", label: "Realized foreign-currency debt loss, unrealized exchange gain or reevaluation gain adjustment" },
  { key: "partnership-estate", label: "Qualifying partnership, trust or deceased-estate loss/expenditure" },
  { key: "petroleum-decommissioning", label: "Qualifying petroleum-operation or decommissioning expenditure" },
  { key: "work-permit", label: "Qualifying initial or renewed work-permit costs" },
  { key: "insurance-reserves", label: "Qualifying decrease in provisions or insurance reserves" },
  { key: "other", label: "Other confirmed allowable deduction" },
];

function createAdjustmentFields(containerId, items, dataAttribute, idPrefix) {
  const container = document.querySelector(`#${containerId}`);

  for (const item of items) {
    const field = document.createElement("div");
    field.className = "field adjustment-field";

    const label = document.createElement("label");
    const inputId = `${idPrefix}-${item.key}`;
    label.htmlFor = inputId;
    label.textContent = item.label;

    const inputWrap = document.createElement("div");
    inputWrap.className = "input-wrap";
    const currency = document.createElement("span");
    currency.className = "currency-prefix";
    currency.setAttribute("aria-hidden", "true");
    currency.textContent = "UGX";

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.inputMode = "numeric";
    input.placeholder = "0";
    input.disabled = true;
    input.setAttribute(dataAttribute, item.key);

    inputWrap.append(currency, input);
    field.append(label, inputWrap);
    container.append(field);
  }
}

function readAdjustmentItems(dataAttribute) {
  return [...form.querySelectorAll(`input[${dataAttribute}]`)]
    .map((input) => ({
      label: input.labels[0].textContent,
      amount: input.value === "" ? 0 : input.valueAsNumber,
    }))
    .filter((item) => item.amount > 0);
}

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
    description: "Estimate Uganda rental tax or non-resident rent withholding for individuals and companies.",
    button: "Calculate rental estimate",
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
  customs: {
    title: "Import or export goods",
    description: "Estimate Uganda customs taxes using rates confirmed for your goods and tariff code.",
    button: "Calculate customs estimate",
  },
  "capital-allowances": {
    title: "Wear-and-tear schedule",
    description: "Calculate the reducing-balance allowance using Uganda’s statutory asset classes.",
    button: "Calculate wear-and-tear",
  },
  "industrial-building": {
    title: "Industrial building review",
    description: "Capture building facts and review eligibility before any provisional deduction scenario.",
    button: "Review industrial building",
  },
  "capital-gains": {
    title: "Asset disposal review",
    description: "Reconcile disposal proceeds and cost base by asset category before any provisional tax scenario.",
    button: "Review asset disposal",
  },
};

function formatUgx(value) {
  const sign = value < 0 ? "- " : "";
  return `UGX ${sign}${amountFormatter.format(Math.round(Math.abs(value)))}`;
}

function formatPercent(rate) {
  return percentFormatter.format(rate);
}

function updateCustomsMode() {
  const active = !document.querySelector('.tax-fields[data-fields="customs"]').hidden;

  for (const panel of document.querySelectorAll(".customs-mode-fields")) {
    const selected = panel.dataset.customsMode === customsDirection.value;
    panel.hidden = !selected;
    for (const control of panel.querySelectorAll("input, select, textarea")) {
      control.disabled = !active || !selected;
      control.required = active && selected && control.dataset.required === "true";
    }
  }
}

function updateRentalMode() {
  const active = !document.querySelector('.tax-fields[data-fields="rental"]').hidden;
  const mode = `${rentalResidency.value}-${rentalTaxpayerType.value}`;

  for (const panel of document.querySelectorAll(".rental-mode-fields")) {
    const selected = panel.dataset.rentalMode === mode;
    panel.hidden = !selected;
    for (const control of panel.querySelectorAll("input, select")) {
      control.disabled = !active || !selected;
      control.required = active && selected && control.dataset.required === "true";
    }
  }
}

function renderAdvisoryGuidance() {
  const results = ugandaTaxAdvisory.searchGuidance(
    advisoryQuery.value,
    advisoryTopic.value,
  );
  advisoryResults.replaceChildren();
  advisoryNoResults.hidden = results.length !== 0;
  advisoryResultCount.textContent = `${results.length} ${results.length === 1 ? "guidance note" : "guidance notes"}`;

  for (const item of results) {
    const article = document.createElement("article");
    article.className = "advisory-card";

    const topic = document.createElement("span");
    topic.className = "advisory-card-topic";
    topic.textContent = item.topic.replace("-", " ");

    const heading = document.createElement("h3");
    heading.textContent = item.title;

    const summary = document.createElement("p");
    summary.textContent = item.summary;

    const nextStepLabel = document.createElement("strong");
    nextStepLabel.className = "advisory-next-label";
    nextStepLabel.textContent = "What to check";

    const nextStep = document.createElement("p");
    nextStep.className = "advisory-next-step";
    nextStep.textContent = item.nextStep;

    const sourceList = document.createElement("ul");
    sourceList.className = "advisory-sources";
    sourceList.setAttribute("aria-label", "Guidance sources");
    for (const source of ugandaTaxAdvisory.getSources(item.sourceKeys)) {
      const sourceItem = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.label;
      sourceItem.append(link);
      sourceList.append(sourceItem);
    }

    article.append(topic, heading, summary, nextStepLabel, nextStep, sourceList);
    if (item.calculator) {
      const calculatorLink = document.createElement("a");
      calculatorLink.className = "advisory-calculator-link";
      if (item.calculator === "international") {
        calculatorLink.href = "#international-tax";
        calculatorLink.dataset.advisoryInternational = "true";
        calculatorLink.textContent = "Open international tax workbench";
      } else {
        calculatorLink.href = "#estimator";
        calculatorLink.dataset.advisoryHead = item.calculator;
        calculatorLink.textContent = "Open related calculator";
      }
      article.append(calculatorLink);
    }
    advisoryResults.append(article);
  }
}

function renderTaxCases() {
  const cases = ugandaTaxAdvisory.searchTaxCases(taxCaseQuery.value);
  taxCaseResults.replaceChildren();
  taxCaseNoResults.hidden = cases.length !== 0;
  taxCaseResultCount.textContent = `${cases.length} ${cases.length === 1 ? "case summary" : "case summaries"}`;

  for (const item of cases) {
    const article = document.createElement("article");
    article.className = "case-law-card";

    const topic = document.createElement("span");
    topic.className = "advisory-card-topic";
    topic.textContent = item.topic;

    const heading = document.createElement("h3");
    const caseLink = document.createElement("a");
    caseLink.href = item.sourceUrl;
    caseLink.target = "_blank";
    caseLink.rel = "noopener noreferrer";
    caseLink.textContent = item.name;
    heading.append(caseLink);

    const citation = document.createElement("p");
    citation.className = "case-law-citation";
    citation.textContent = `${item.citation} · ${item.date}`;

    const court = document.createElement("p");
    court.className = "case-law-court";
    court.textContent = item.court;

    const issueLabel = document.createElement("strong");
    issueLabel.textContent = "Issue";
    const issue = document.createElement("p");
    issue.textContent = item.issue;

    const outcomeLabel = document.createElement("strong");
    outcomeLabel.textContent = "Published case summary";
    const summary = document.createElement("p");
    summary.textContent = item.summary;

    const significanceLabel = document.createElement("strong");
    significanceLabel.textContent = "How to read it";
    const significance = document.createElement("p");
    significance.className = "case-law-significance";
    significance.textContent = item.significance;

    const sourceLink = document.createElement("a");
    sourceLink.className = "advisory-calculator-link";
    sourceLink.href = item.sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    sourceLink.textContent = "Read the judgment on ULII";

    article.append(
      topic,
      heading,
      citation,
      court,
      issueLabel,
      issue,
      outcomeLabel,
      summary,
      significanceLabel,
      significance,
      sourceLink,
    );
    taxCaseResults.append(article);
  }
}

advisoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderAdvisoryGuidance();
});

advisoryTopic.addEventListener("change", renderAdvisoryGuidance);
advisoryQuery.addEventListener("input", renderAdvisoryGuidance);

document.querySelector(".advisory-quick-questions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-advisory-query]");
  if (!button) return;
  advisoryQuery.value = button.dataset.advisoryQuery;
  renderAdvisoryGuidance();
});

advisoryResults.addEventListener("click", (event) => {
  const internationalLink = event.target.closest("[data-advisory-international]");
  if (internationalLink) {
    event.preventDefault();
    document.querySelector("#international-tax").scrollIntoView({ behavior: "smooth" });
    document.querySelector("#international-tax-method").focus({ preventScroll: true });
    return;
  }
  const link = event.target.closest("[data-advisory-head]");
  if (!link) return;
  event.preventDefault();
  const targetTab = taxTabs.find((tab) => tab.dataset.taxHead === link.dataset.advisoryHead);
  if (targetTab) {
    setTaxHead(link.dataset.advisoryHead);
    document.querySelector("#estimator").scrollIntoView({ behavior: "smooth" });
    targetTab.focus({ preventScroll: true });
  }
});

taxCaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderTaxCases();
});

taxCaseQuery.addEventListener("input", renderTaxCases);

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
    amount.textContent = item.amount === null || item.amount === undefined
      ? "—"
      : formatUgx(item.amount);
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
    for (const control of panel.querySelectorAll("input, select, textarea")) {
      const requiredFor = control.dataset.requiredFor;
      const conditionMatches = !requiredFor || requiredFor === whtType.value;
      control.disabled = !selected || !conditionMatches;
      control.required = selected &&
        conditionMatches &&
        control.dataset.required === "true";
    }
  }

  updateCustomsMode();
  updateRentalMode();
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
  updateWithholdingFields();
  updatePayeEmploymentType();
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
  updateWithholdingFields();
});

customsDirection.addEventListener("change", updateCustomsMode);
rentalTaxpayerType.addEventListener("change", updateRentalMode);
rentalResidency.addEventListener("change", updateRentalMode);
payeEmploymentType.addEventListener("change", updatePayeEmploymentType);

for (const panel of taxFields) {
  const requiredControl = panel.querySelector("input, select");
  if (requiredControl) requiredControl.dataset.required = "true";
}

function updateWithholdingFields() {
  const isBetting = whtType.value === "betting-winnings";
  const withholdingActive = form.dataset.taxHead === "withholding";
  bettingStakeField.hidden = !isBetting;
  nationalLotteryField.hidden = !isBetting;
  bettingStake.disabled = !withholdingActive || !isBetting;
  bettingStake.required = withholdingActive && isBetting;
  nationalLotteryWinnings.disabled = !withholdingActive || !isBetting;
  whtGrossLabel.textContent = isBetting ? "Payout amount (including stake)" : "Gross payment";
  whtGrossHelp.textContent = isBetting
    ? "Enter the payout before deducting the stake. Withholding is computed on payout less stake."
    : "For resident supply payments, withholding generally applies to designated agents on payments exceeding UGX 1,000,000.";
}

function updatePayeEmploymentType() {
  const isSecondary = payeEmploymentType.value === "secondary";
  const payeActive = form.dataset.taxHead === "paye";
  const otherIncome = document.querySelector("#monthly-secondary-income");
  const grossEarnings = document.querySelector("#monthly-gross-earnings");

  payeSelectedIncomeLabel.textContent = isSecondary
    ? "Monthly taxable pay from this secondary employer"
    : "Monthly basic cash salary from primary employment";
  payeSelectedIncomeHelp.textContent = isSecondary
    ? "Enter this secondary employer's total monthly taxable pay, including assessed taxable benefits. Secondary withholding is estimated at 40%."
    : "Enter basic salary only. Add assessed taxable pay and benefits in the primary employment schedule below.";
  payeOtherIncomeLabel.childNodes[0].textContent = isSecondary
    ? "Monthly taxable income from the primary employer "
    : "Monthly taxable income from secondary employer(s) ";
  payeOtherIncomeLabel.querySelector("span").textContent = isSecondary
    ? "(required for combined two-employer estimate)"
    : "(optional)";
  payeOtherIncomeHelp.textContent = isSecondary
    ? "Enter the primary employer's monthly taxable pay, including assessed taxable benefits. This is required to show total withholding across both employers and the indicative combined-income comparison."
    : "Enter the combined monthly taxable pay, including assessed taxable benefits, from all other employers. Secondary-employment PAYE is estimated at 40%. Confirm current treatment with URA.";
  payePrimaryItems.hidden = isSecondary;
  for (const input of payePrimaryItems.querySelectorAll("input")) {
    input.disabled = isSecondary || !payeActive;
  }
  payeNssfField.hidden = isSecondary;
  grossEarnings.disabled = isSecondary || !payeActive;
  otherIncome.required = isSecondary && payeActive;
  otherIncome.placeholder = isSecondary
    ? "Primary employer's monthly taxable pay"
    : "Total from other employer(s)";
}

function renderResult({
  value,
  label,
  context = "",
  balance,
  remainingLabel = "Estimated balance to pay",
  breakdown,
  note,
  taxRuleSet,
  breakdownHeading = "How the estimate adds up",
  breakdownCaption = "Calculation details",
  extraRows = [],
}) {
  resultLabel.textContent = label;
  estimatedTax.textContent = value === null || value === undefined
    ? "Unavailable"
    : formatUgx(value);
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
  const ruleSetNote = taxRuleSet
    ? `Ruleset ${taxRuleSet.id}${taxRuleSet.financialYear ? ` (${taxRuleSet.financialYear})` : ""}; status ${taxRuleSet.status || "pending-review"}; not approved for filing.`
    : "";
  const ruleProvenanceNote = taxRuleSet?.ruleIds?.length
    ? `Rule records: ${taxRuleSet.ruleIds.map((ruleId, index) =>
      `${ruleId}${taxRuleSet.versions?.[index] ? ` (${taxRuleSet.versions[index]})` : ""}`,
    ).join(", ")}.`
    : "";
  calculationNote.textContent = [note, ruleSetNote, ruleProvenanceNote].filter(Boolean).join(" ");
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
  const estimate = ugandaTax.calculateSmartTaxSummary({
    taxableIncome: chargeability.chargeableIncome,
    deductions: 0,
    taxAlreadyPaid: paid,
    isResident,
  });

  renderResult({
    value: estimate.estimate.totalTax,
    label: "Estimated annual individual income tax",
    context: `Chargeable income: ${formatUgx(chargeability.chargeableIncome)} · ${isResident ? "Resident" : "Non-resident"} · Effective rate: ${formatPercent(estimate.estimate.effectiveRate)} · Marginal rate: ${formatPercent(estimate.estimate.marginalRate)}`,
    balance: estimate.estimate.totalTax - paid,
    breakdown: [
      { label: "Annual assessable income", rate: null, amount: chargeability.income },
      { label: "Less: allowable deductions entered", rate: null, amount: -chargeability.deductions },
      { label: "Estimated chargeable income", rate: null, amount: chargeability.chargeableIncome },
      ...estimate.estimate.breakdown.map((band) => ({
        label: `Tax band: ${band.label}`,
        rate: band.rate,
        amount: band.tax,
      })),
      { label: "Smart-plan note: reliefs and employee NSSF relief", rate: null, amount: -estimate.reliefTotal - estimate.nssfRelief },
    ],
    breakdownCaption: "Income adjustments and tax by band",
    taxRuleSet: estimate.estimate.taxRuleSet,
    note: `Standard ${isResident ? "resident" : "non-resident"} individual bands for FY 2026/27. This estimate applies deductions first, then a simple relief check and employee NSSF relief, before subtracting tax already paid. Include income sources correctly and claim only deductions you have confirmed are allowable. Reliefs, exempt-income classification, loss relief, treaty rules and special regimes are not assessed.`,
  });
}

function showPaye() {
  const salary = document.querySelector("#monthly-salary").valueAsNumber;
  const isSecondary = payeEmploymentType.value === "secondary";
  const taxableItems = isSecondary
    ? []
    : readAdjustmentItems("data-paye-taxable-item");
  const taxableItemsTotal = taxableItems.reduce((total, item) => total + item.amount, 0);
  const selectedMonthlyIncome = salary + taxableItemsTotal;
  const otherIncomeInput = document.querySelector("#monthly-secondary-income");
  const otherMonthlyIncome = otherIncomeInput.value === ""
    ? 0
    : otherIncomeInput.valueAsNumber;
  const primaryMonthlyIncome = isSecondary
    ? otherMonthlyIncome
    : selectedMonthlyIncome;
  const secondaryMonthlyIncome = isSecondary
    ? selectedMonthlyIncome
    : otherMonthlyIncome;
  const grossInput = document.querySelector("#monthly-gross-earnings");
  const primaryMonthlyGross = !isSecondary && grossInput.value !== ""
    ? grossInput.valueAsNumber
    : primaryMonthlyIncome;
  const isResident = document.querySelector("#paye-residency").value === "resident";
  const period = document.querySelector("#paye-period")?.value || "2026/27";
  if (period !== "2026/27") {
    showPayeEarlierYear(period, { isResident, isSecondary, salary, taxableItems, primaryMonthlyIncome, secondaryMonthlyIncome, primaryMonthlyGross });
    return;
  }
  const estimate = ugandaTax.calculatePayeWithSecondaryEmployment(
    primaryMonthlyIncome,
    secondaryMonthlyIncome,
    isResident,
    primaryMonthlyGross,
  );

  renderResult({
    value: estimate.totalMonthlyWithholding,
    label: "Estimated total PAYE withholding across entered employers",
    context: `Primary PAYE: ${formatUgx(estimate.primaryMonthlyTax)} · Secondary withholding: ${formatUgx(estimate.secondaryMonthlyTax)} at 40% · Combined-income progressive estimate: ${formatUgx(estimate.estimatedMonthlyTaxOnCombinedIncome)}/month before credits or reliefs`,
    breakdown: estimate.primaryBreakdown.map((band) => ({
      label: `Primary employment — ${band.label}`,
      rate: band.rate,
      amount: band.tax,
    })),
    extraRows: [
      {
        label: isSecondary
          ? "Selected secondary employer — monthly taxable pay"
          : "Primary employment — monthly cash salary",
        rate: null,
        amount: salary,
      },
      ...taxableItems.map((item) => ({
        label: `Primary employment — ${item.label}`,
        rate: null,
        amount: item.amount,
      })),
      { label: "Primary employment — monthly taxable income", rate: null, amount: primaryMonthlyIncome },
      {
        label: "Secondary employment — monthly taxable income",
        rate: null,
        amount: secondaryMonthlyIncome,
      },
      {
        label: "Secondary employment — PAYE withholding at 40%",
        rate: estimate.secondaryRate,
        amount: estimate.secondaryMonthlyTax,
      },
      { label: "Total PAYE withheld across both employments", rate: null, amount: estimate.totalMonthlyWithholding },
      { label: "Combined annual employment income (assuming 12 equal months)", rate: null, amount: estimate.combinedAnnualTaxableIncome },
      { label: "Indicative monthly tax on combined income using progressive bands", rate: null, amount: estimate.estimatedMonthlyTaxOnCombinedIncome },
      { label: "Withholding above/(below) combined-income band estimate", rate: null, amount: estimate.monthlyWithholdingDifference },
      ...payeEarlierYearComparison(primaryMonthlyIncome, isResident, estimate.primaryMonthlyTax),
      ...(!isSecondary
        ? [
          { label: "Employee NSSF at primary employer (separate contribution)", rate: 0.05, amount: estimate.monthlyEmployeeNssf },
          { label: "Employer NSSF at primary employer (separate contribution)", rate: 0.1, amount: estimate.monthlyEmployerNssf },
        ]
        : []),
    ],
    breakdownHeading: "Monthly PAYE and payroll",
    breakdownCaption: "Primary progressive PAYE and secondary 40% withholding; NSSF is separate",
    taxRuleSet: estimate.taxRuleSet,
    note: `Assumes a ${isResident ? "resident" : "non-resident"} employee with the same monthly income for 12 months. The employer selected above is treated as ${isSecondary ? "secondary" : "primary"}; primary employment uses progressive bands and secondary employment withholding is estimated at 40%, based on a reported URA clarification. This FY 2026/27 rate remains pending primary-source verification and must be confirmed with URA before payroll use. The combined-income progressive estimate is only an indicative comparison before credits, reliefs or annual adjustments, not a final assessment or refund calculation. Enter the primary and secondary taxable pay once each; assess benefits separately and do not double count them. NSSF is shown only when primary employment is selected; assess each employer's obligations separately. The estimator does not value benefits, determine exemptions, or calculate special treatment for lump sums, share schemes or termination pay.`,
  });
}

/** Comparison rows: the same primary pay under FY 2025/26 bands (resident only). */
function payeEarlierYearComparison(monthlyIncome, isResident, currentMonthlyTax) {
  if (!isResident || typeof ugandaTax.calculatePayeForFinancialYear !== "function") return [];
  const earlier = ugandaTax.calculatePayeForFinancialYear(monthlyIncome, "2025/26", true);
  return [
    { label: "Comparison: same primary pay under FY 2025/26 bands", rate: null, amount: earlier.monthlyTax },
    { label: "Change in monthly PAYE from FY 2025/26 to FY 2026/27", rate: null, amount: currentMonthlyTax - earlier.monthlyTax },
  ];
}

/** PAYE for an earlier tax year: one resident, primary employer (the bands TaxComp holds). */
function showPayeEarlierYear(period, { isResident, isSecondary, salary, taxableItems, primaryMonthlyIncome, secondaryMonthlyIncome, primaryMonthlyGross }) {
  if (!isResident) throw new RangeError(`TaxComp holds only resident bands for FY ${period}. Choose FY 2026/27 for a non-resident employee.`);
  if (isSecondary || secondaryMonthlyIncome > 0) throw new RangeError(`The FY ${period} calculation covers one primary employer only. Remove the secondary employment income, or choose FY 2026/27.`);
  const earlier = ugandaTax.calculatePayeForFinancialYear(primaryMonthlyIncome, period, true);
  const current = ugandaTax.calculatePayeForFinancialYear(primaryMonthlyIncome, "2026/27", true);
  const nssf = ugandaTax.calculatePaye(primaryMonthlyIncome, true, primaryMonthlyGross);
  renderResult({
    value: earlier.monthlyTax,
    label: `Estimated monthly PAYE for FY ${period}`,
    context: `Primary employment, resident · Marginal rate: ${formatPercent(earlier.marginalRate)} · The same pay in FY 2026/27: ${formatUgx(current.monthlyTax)}/month`,
    breakdown: earlier.breakdown.map((band) => ({ label: `FY ${period} — ${band.label}`, rate: band.rate, amount: band.tax })),
    extraRows: [
      { label: "Primary employment — monthly cash salary", rate: null, amount: salary },
      ...taxableItems.map((item) => ({ label: `Primary employment — ${item.label}`, rate: null, amount: item.amount })),
      { label: "Primary employment — monthly taxable income", rate: null, amount: primaryMonthlyIncome },
      { label: `Comparison: same pay under FY 2026/27 bands`, rate: null, amount: current.monthlyTax },
      { label: `Change in monthly PAYE from FY ${period} to FY 2026/27`, rate: null, amount: current.monthlyTax - earlier.monthlyTax },
      { label: "Employee NSSF (separate contribution)", rate: 0.05, amount: nssf.monthlyEmployeeNssf },
      { label: "Employer NSSF (separate contribution)", rate: 0.1, amount: nssf.monthlyEmployerNssf },
    ],
    breakdownHeading: `Monthly PAYE for FY ${period}`,
    breakdownCaption: `FY ${period} resident bands, with the FY 2026/27 figure for comparison; NSSF is separate`,
    taxRuleSet: earlier.taxRuleSet,
    note: `Uses the resident individual bands for FY ${period} (July ${period.slice(0, 4)} to June 20${period.slice(5)}): the rates the Income Tax (Amendment) Act, 2026 replaced from 1 July 2026. ${earlier.taxRuleSet.note} Assumes the same monthly income for 12 months, one primary employer and no other income. Use it to check or correct pay for months before July 2026; it is not a final assessment.`,
  });
}

function showCompanyTax() {
  const accountingProfit = document.querySelector("#company-profit").valueAsNumber;
  const itemizedAddbacks = readAdjustmentItems("data-company-addback-item");
  const itemizedDeductions = readAdjustmentItems("data-company-deduction-item");
  const addbacksInput = document.querySelector("#company-addbacks");
  const exemptIncomeInput = document.querySelector("#company-exempt-income");
  const capitalAllowancesInput = document.querySelector("#company-capital-allowances");
  const lossesInput = document.querySelector("#company-tax-losses");
  const deductionsInput = document.querySelector("#company-deductions");
  const otherAddbacks = addbacksInput.value === "" ? 0 : addbacksInput.valueAsNumber;
  const addbacks = itemizedAddbacks.reduce((total, item) => total + item.amount, otherAddbacks);
  const exemptIncome = exemptIncomeInput.value === "" ? 0 : exemptIncomeInput.valueAsNumber;
  const capitalAllowances = capitalAllowancesInput.value === ""
    ? 0
    : capitalAllowancesInput.valueAsNumber;
  const taxLosses = lossesInput.value === "" ? 0 : lossesInput.valueAsNumber;
  const otherDeductions = deductionsInput.value === "" ? 0 : deductionsInput.valueAsNumber;
  const itemizedDeductionTotal = itemizedDeductions.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const deductions = exemptIncome + capitalAllowances + itemizedDeductionTotal + otherDeductions;
  const paid = document.querySelector("#company-paid").value === ""
    ? 0
    : document.querySelector("#company-paid").valueAsNumber;
  const withholdingCreditsInput = document.querySelector("#company-wht-credits");
  const withholdingCredits = withholdingCreditsInput.value === ""
    ? 0
    : withholdingCreditsInput.valueAsNumber;
  const result = ugandaCorporateTax.calculateCorporateIncomeTax({
    calculationMode: document.querySelector("#company-calculation-mode").value,
    taxpayerCategory: document.querySelector("#company-taxpayer-category").value,
    periodStart: document.querySelector("#company-period-start").value,
    periodEnd: document.querySelector("#company-period-end").value,
    reviewer: document.querySelector("#company-computation-reviewer").value,
    reviewDate: document.querySelector("#company-computation-review-date").value,
    accountingProfit,
    addBacks: [
      ...itemizedAddbacks.map((item) => ({ description: item.label, amount: item.amount })),
      ...(otherAddbacks > 0
        ? [{ description: "Other disallowable expenses or taxable adjustments", amount: otherAddbacks }]
        : []),
    ],
    exemptIncome: exemptIncome > 0
      ? [{ description: "Exempt income included in accounting profit", amount: exemptIncome }]
      : [],
    allowableDeductions: [
      ...itemizedDeductions.map((item) => ({ description: item.label, amount: item.amount })),
      ...(otherDeductions > 0
        ? [{ description: "Other allowable tax deductions", amount: otherDeductions }]
        : []),
    ],
    capitalAllowances: capitalAllowances > 0
      ? [{ description: "User-entered capital allowances schedule", amount: capitalAllowances }]
      : [],
    carriedForwardLosses: taxLosses,
    provisionalTaxPaid: paid,
    withholdingTaxCredits: withholdingCredits,
  });

  renderResult({
    value: result.grossTaxLiability,
    label: result.grossTaxLiability === null
      ? "Corporate tax liability unavailable"
      : result.calculationStatus === "provisional"
        ? "Provisional corporate tax estimate"
        : "Corporate income tax liability",
    context: `Taxable income: ${formatUgx(result.taxableIncome)} · Period ${result.period.start} to ${result.period.end} · ${result.calculationStatus}`,
    balance: result.finalTaxPayable,
    breakdown: result.schedule,
    breakdownCaption: "Itemized tax reconciliation from accounting profit or loss",
    taxRuleSet: result.taxRuleSet,
    note: [
      result.provisionalNotice,
      ...result.assumptions,
      ...result.missingInformation,
    ].filter(Boolean).join(" "),
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
  const expensesInput = document.querySelector("#rental-expenses");
  const lossesInput = document.querySelector("#rental-losses");
  const creditsInput = document.querySelector("#rental-wht-credits");
  const taxpayerType = rentalTaxpayerType.value;
  const residency = rentalResidency.value;
  const estimate = ugandaTax.calculateRentalIncomeTax({
    grossRentalIncome: income,
    taxpayerType,
    residency,
    allowableExpenses: expensesInput.value === "" ? 0 : expensesInput.valueAsNumber,
    carriedForwardLosses: lossesInput.value === "" ? 0 : lossesInput.valueAsNumber,
    taxPaid: paid,
    withholdingCredits: creditsInput.value === "" ? 0 : creditsInput.valueAsNumber,
  });
  const context = residency === "nonresident"
    ? `Uganda-source gross rent: ${formatUgx(income)} · Standard domestic withholding: ${formatPercent(estimate.taxRate)}`
    : taxpayerType === "individual"
      ? `Taxable rental income: ${formatUgx(estimate.taxBase)} · Rate: ${formatPercent(estimate.taxRate)}`
      : `Chargeable rental income: ${formatUgx(estimate.taxBase)} · Company rate: ${formatPercent(estimate.taxRate)}`;

  renderResult({
    value: estimate.tax,
    label: estimate.taxLabel,
    context,
    balance: estimate.balance,
    breakdown: estimate.breakdown,
    note: estimate.note,
    taxRuleSet: estimate.taxRuleSet,
    breakdownHeading: "Rental income computation",
    breakdownCaption: `${taxpayerType === "individual" ? "Individual" : "Company"} · ${residency === "resident" ? "Resident" : "Non-resident"}`,
  });
}

function showWithholdingTax() {
  const estimate = ugandaTax.calculateWithholdingTax(
    document.querySelector("#wht-gross").valueAsNumber,
    whtType.value,
    document.querySelector("#designated-payer").checked,
    document.querySelector("#supplier-issued-invoice").checked,
    bettingStake.value === "" ? 0 : bettingStake.valueAsNumber,
    nationalLotteryWinnings.checked,
  );

  renderResult({
    value: estimate.tax,
    label: "Estimated withholding to deduct",
    context: `${whtType.value === "betting-winnings" ? `Winnings subject to withholding: ${formatUgx(estimate.taxBase)} · ` : ""}Applicable rate: ${formatPercent(estimate.rate)}`,
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

function showCustomsEstimate() {
  const direction = customsDirection.value;
  const goods = document.querySelector("#customs-goods").value.trim();
  const hsCode = document.querySelector("#customs-hs-code").value.trim();
  const origin = direction === "import"
    ? document.querySelector("#import-origin").value.trim()
    : "";
  const tradeDetails = [
    goods,
    `HS code: ${hsCode || "not entered"}`,
    origin ? `Origin: ${origin}` : "",
  ].filter(Boolean).join(" · ");
  const optionalNumber = (selector) => {
    const input = document.querySelector(selector);
    return input.value === "" ? 0 : input.valueAsNumber;
  };
  const estimate = ugandaTax.calculateCustomsEstimate({
    direction,
    customsValue: direction === "import"
      ? document.querySelector("#import-customs-value").valueAsNumber
      : document.querySelector("#export-customs-value").valueAsNumber,
    customsDutyRate: optionalNumber("#import-duty-rate"),
    importExciseDuty: optionalNumber("#import-excise-duty"),
    importWithholdingRate: optionalNumber("#import-withholding-rate"),
    importOtherCharges: optionalNumber("#import-other-charges"),
    importVatTreatment: document.querySelector("#import-vat-treatment").value,
    exportVatTreatment: document.querySelector("#export-vat-treatment").value,
    exportVatRate: ugandaTax.standardVatRatePercent,
    exportLevyRate: optionalNumber("#export-levy-rate"),
    exportExciseDuty: optionalNumber("#export-excise-duty"),
    exportOtherCharges: optionalNumber("#export-other-charges"),
  });

  renderResult({
    value: estimate.totalCharges,
    label: direction === "import"
      ? "Estimated import taxes and charges"
      : "Estimated export taxes and charges",
    context: direction === "import"
      ? `Estimated landed cost: ${formatUgx(estimate.landedCost)} · ${tradeDetails}`
      : `Estimated proceeds after entered charges: ${formatUgx(estimate.netProceeds)} · ${tradeDetails}`,
    breakdown: estimate.breakdown,
    taxRuleSet: estimate.taxRuleSet,
    breakdownCaption: direction === "import"
      ? "Customs value to landed cost"
      : "Export value to net proceeds",
    note: direction === "import"
      ? "Duty and other rates depend on the HS code, origin and current EAC tariff. Import VAT is estimated on customs value plus entered duty and excise. Import WHT is only included at the rate you enter; confirm whether it applies and its legal base. Import VAT may be recoverable by eligible registered businesses but is shown as cash due here. This estimate excludes unentered levies, fees, storage, broker charges and local delivery."
      : "Export duty and levies apply only to specified goods and must be confirmed for the HS code and destination. Zero-rated export VAT requires eligibility and evidence; choose a different treatment only when confirmed. This estimate excludes unentered levies, fees, freight, insurance and destination-country taxes.",
    breakdownHeading: "Customs tax and charge calculation",
  });
}

function showCapitalAllowance() {
  const assets = [...capitalAssetRows.querySelectorAll("[data-asset-row]")].map((row) => {
    const field = (name) => row.querySelector(`[data-asset-field="${name}"]`);
    const number = (name) => field(name).value === "" ? 0 : field(name).valueAsNumber;
    return {
      assetId: field("assetId").value.trim(),
      description: field("description").value.trim(),
      assetClass: field("assetClass").value,
      acquisitionDate: field("acquisitionDate").value,
      dateBroughtIntoUse: field("dateBroughtIntoUse").value,
      openingTaxWrittenDownValue: number("openingTaxWrittenDownValue"),
      qualifyingExpenditure: number("qualifyingExpenditure"),
      accountingDepreciation: number("accountingDepreciation"),
      disposalDate: field("disposalDate").value || null,
      disposalProceeds: number("disposalProceeds"),
      businessUsePercent: field("businessUsePercent").valueAsNumber,
      classificationConfirmed: field("classificationConfirmed").checked,
    };
  });
  const result = ugandaCapitalAllowances.calculateCapitalAllowanceSchedule({
    calculationMode: document.querySelector("#allowance-calculation-mode").value,
    taxpayerType: document.querySelector("#allowance-taxpayer-type").value,
    periodStart: document.querySelector("#allowance-period-start").value,
    periodEnd: document.querySelector("#allowance-period-end").value,
    reviewer: document.querySelector("#allowance-computation-reviewer").value,
    reviewDate: document.querySelector("#allowance-computation-review-date").value,
    initialAllowanceRequested: document.querySelector("#initial-allowance-requested").checked,
    assets,
  });
  const breakdown = result.classSchedules.flatMap((schedule) => [
    { label: `${schedule.assetClass} opening tax written-down value`, amount: schedule.openingTaxWrittenDownValue },
    { label: `${schedule.assetClass} qualifying additions`, amount: schedule.qualifyingAdditions },
    { label: `${schedule.assetClass} additions after business-use apportionment`, amount: schedule.businessUseAdditions },
    { label: `${schedule.assetClass} disposal proceeds after business-use apportionment`, amount: -schedule.businessUseDisposalProceeds },
    { label: `${schedule.assetClass} accounting depreciation (not a tax deduction here)`, amount: schedule.accountingDepreciation },
    ...(schedule.allowance === null ? [] : [
      { label: `${schedule.assetClass} wear-and-tear allowance at ${formatPercent(schedule.rate)}`, amount: schedule.allowance, rate: schedule.rate },
      { label: `${schedule.assetClass} closing tax written-down value`, amount: schedule.closingTaxWrittenDownValue },
      ...(schedule.excessDisposalProceeds > 0
        ? [{ label: `${schedule.assetClass} excess disposal proceeds for balancing review`, amount: schedule.excessDisposalProceeds }]
        : []),
    ]),
  ]);

  renderResult({
    value: result.totalAllowance,
    label: result.totalAllowance === null
      ? "Capital allowance unavailable"
      : result.calculationStatus === "provisional"
        ? "Provisional wear-and-tear allowance"
        : "Wear-and-tear allowance",
    context: `Period ${result.period.start} to ${result.period.end} · ${result.calculationStatus} · Accounting depreciation shown separately`,
    breakdown,
    breakdownCaption: "Asset register and class-pool reconciliation",
    taxRuleSet: result.taxRuleSet,
    note: [result.provisionalNotice, ...result.assumptions, ...result.missingInformation]
      .filter(Boolean)
      .join(" "),
  });
}

function showIndustrialBuilding() {
  const optionalNumber = (selector) => {
    const field = document.querySelector(selector);
    return field.value === "" ? undefined : field.valueAsNumber;
  };
  const result = ugandaIndustrialBuilding.calculateIndustrialBuildingDeduction({
    calculationMode: document.querySelector("#industrial-building-calculation-mode").value,
    taxpayerType: document.querySelector("#industrial-building-taxpayer").value,
    periodStart: document.querySelector("#industrial-building-period-start").value,
    periodEnd: document.querySelector("#industrial-building-period-end").value,
    buildingDescription: document.querySelector("#industrial-building-description").value.trim(),
    owner: document.querySelector("#industrial-building-owner").value.trim(),
    constructionExpenditure: document.querySelector("#industrial-building-construction-cost").valueAsNumber,
    qualifyingConstructionCosts: document.querySelector("#industrial-building-qualifying-cost").valueAsNumber,
    constructionStarted: document.querySelector("#industrial-building-construction-start").value,
    constructionCompleted: document.querySelector("#industrial-building-construction-complete").value,
    firstUsed: document.querySelector("#industrial-building-first-used").value,
    buildingUse: document.querySelector("#industrial-building-use").value.trim(),
    previousDeductions: document.querySelector("#industrial-building-prior-deductions").valueAsNumber,
    disposalDate: document.querySelector("#industrial-building-disposal-date").value || null,
    changeOfUseDate: document.querySelector("#industrial-building-change-use-date").value || null,
    qualificationConfirmed: document.querySelector("#industrial-building-qualification-confirmed").checked,
    reviewer: document.querySelector("#industrial-building-computation-reviewer").value,
    reviewDate: document.querySelector("#industrial-building-computation-review-date").value,
    simulationRatePercent: optionalNumber("#industrial-building-rate"),
    simulationMethod: document.querySelector("#industrial-building-method").value || undefined,
    periodUsePercent: optionalNumber("#industrial-building-use-percent"),
  });
  const candidateRuleId = result.candidateRuleId;
  const taxRuleSet = {
    id: candidateRuleId || "UG-INDUSTRIAL-BUILDING",
    status: result.ruleStatus,
    approvedForFiling: result.filingReady,
    legacyEstimate: !result.filingReady,
    ruleIds: result.ruleIdsUsed.length ? result.ruleIdsUsed : candidateRuleId ? [candidateRuleId] : [],
    versions: result.ruleVersionsUsed.length
      ? result.ruleVersionsUsed
      : result.candidateRuleVersion ? [result.candidateRuleVersion] : [],
  };

  renderResult({
    value: result.estimatedDeduction,
    label: result.estimatedDeduction === null
      ? "Deduction unavailable"
      : result.calculationStatus === "provisional"
        ? "Provisional deduction scenario"
        : "Industrial-building deduction",
    context: `${result.qualificationStatus} · ${result.deductionMethod || "No verified method"} · ${result.deductionRatePercent === null ? "No verified rate" : `${result.deductionRatePercent}%`}`,
    breakdown: result.schedule,
    breakdownCaption: "Construction-cost and prior-deduction reconciliation",
    taxRuleSet,
    note: [
      result.provisionalNotice,
      result.qualificationReason,
      ...result.assumptions,
      ...result.missingInformation,
      result.legislation ? `Legislation: ${result.legislation}.` : "No verified legislation or statutory provision is recorded.",
      result.provision ? `Provision: ${result.provision}.` : "Statutory provision unavailable; review required.",
    ].filter(Boolean).join(" "),
  });
}

function showCapitalGains() {
  const optionalNumber = (selector) => {
    const field = document.querySelector(selector);
    return field.value === "" ? 0 : field.valueAsNumber;
  };
  const exemption = optionalNumber("#capital-gains-exemption");
  const relief = optionalNumber("#capital-gains-relief");
  const result = ugandaCapitalGains.calculateCapitalGains({
    calculationMode: document.querySelector("#capital-gains-calculation-mode").value,
    taxpayerType: document.querySelector("#capital-gains-taxpayer").value,
    assetDescription: document.querySelector("#capital-gains-asset-description").value.trim(),
    assetCategory: document.querySelector("#capital-gains-asset-category").value,
    acquisitionDate: document.querySelector("#capital-gains-acquisition-date").value,
    disposalDate: document.querySelector("#capital-gains-disposal-date").value,
    periodStart: document.querySelector("#capital-gains-period-start").value,
    periodEnd: document.querySelector("#capital-gains-period-end").value,
    acquisitionCost: document.querySelector("#capital-gains-acquisition-cost").valueAsNumber,
    acquisitionIncidentalCosts: optionalNumber("#capital-gains-acquisition-costs"),
    improvementExpenditure: optionalNumber("#capital-gains-improvements"),
    disposalProceeds: document.querySelector("#capital-gains-proceeds").valueAsNumber,
    disposalIncidentalCosts: optionalNumber("#capital-gains-disposal-costs"),
    exemptions: exemption > 0 ? [{ description: "User-entered exemption", amount: exemption }] : [],
    reliefs: relief > 0 ? [{ description: "User-entered relief", amount: relief }] : [],
    withholdingCredits: optionalNumber("#capital-gains-wht-credits"),
    simulationRatePercent: optionalNumber("#capital-gains-rate") || null,
    classificationConfirmed: document.querySelector("#capital-gains-classification-confirmed").checked,
    reviewer: document.querySelector("#capital-gains-computation-reviewer").value,
    reviewDate: document.querySelector("#capital-gains-computation-review-date").value,
  });
  const candidateRuleId = result.candidateRuleId;
  const taxRuleSet = {
    id: candidateRuleId || "UG-CAPITAL-GAINS",
    status: result.ruleStatus,
    approvedForFiling: result.filingReady,
    legacyEstimate: !result.filingReady,
    ruleIds: result.ruleIdsUsed.length ? result.ruleIdsUsed : candidateRuleId ? [candidateRuleId] : [],
    versions: result.ruleVersionsUsed.length
      ? result.ruleVersionsUsed
      : result.candidateRuleVersion ? [result.candidateRuleVersion] : [],
  };
  renderResult({
    value: result.taxLiability,
    label: result.taxLiability === null
      ? "Capital-gains liability unavailable"
      : result.calculationStatus === "provisional"
        ? "Provisional capital-gains scenario"
        : "Capital-gains tax",
    context: `${result.assetCategory} · Chargeable gain ${formatUgx(result.chargeableGain)} · ${result.calculationStatus}`,
    balance: result.finalTaxPayable,
    breakdown: result.schedule,
    breakdownCaption: "Disposal proceeds and adjusted cost-base reconciliation",
    taxRuleSet,
    note: [
      result.provisionalNotice,
      ...result.assumptions,
      ...result.missingInformation,
      result.legislation ? `Legislation: ${result.legislation}.` : "No verified legislation or statutory provision is recorded.",
      result.provision ? `Provision: ${result.provision}.` : "Statutory provision unavailable; review required.",
    ].filter(Boolean).join(" "),
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
  customs: showCustomsEstimate,
  "capital-allowances": showCapitalAllowance,
  "industrial-building": showIndustrialBuilding,
  "capital-gains": showCapitalGains,
};

createAdjustmentFields(
  "paye-taxable-items",
  payeTaxableItems,
  "data-paye-taxable-item",
  "paye-item",
);
createAdjustmentFields(
  "company-addback-items",
  companyAddbackItems,
  "data-company-addback-item",
  "company-addback-item",
);
createAdjustmentFields(
  "company-deduction-items",
  companyDeductionItems,
  "data-company-deduction-item",
  "company-deduction-item",
);

function addCapitalAssetRow() {
  const row = capitalAssetTemplate.content.firstElementChild.cloneNode(true);
  const rowIndex = capitalAssetRows.querySelectorAll("[data-asset-row]").length + 1;
  row.querySelector("[data-asset-title]").textContent = `Asset ${rowIndex}`;
  for (const control of row.querySelectorAll("[data-asset-field]")) {
    const fieldName = control.dataset.assetField;
    control.id = `capital-asset-${rowIndex}-${fieldName}`;
    const label = row.querySelector(`label[data-label-for="${fieldName}"]`);
    if (label) label.htmlFor = control.id;
  }
  row.querySelector("[data-remove-asset]").addEventListener("click", () => {
    row.remove();
    for (const [index, remainingRow] of
      [...capitalAssetRows.querySelectorAll("[data-asset-row]")].entries()) {
      remainingRow.querySelector("[data-asset-title]").textContent = `Asset ${index + 1}`;
    }
  });
  capitalAssetRows.append(row);
}

addCapitalAssetButton.addEventListener("click", addCapitalAssetRow);
addCapitalAssetRow();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!form.reportValidity()) return;

  // Phase 2b: a rule set withdrawn by TaxComp's legal reviewers shows their reason, never figures.
  const taxHead = form.dataset.taxHead;
  const earlierYear = (taxHead === "paye" || taxHead === "individual") && document.querySelector("#paye-period")?.value === "2025/26";
  const withdrawal = window.taxcompLegalStatus?.calculatorBlock(taxHead, earlierYear ? "UG-FY2025-26-individual-v1" : "UG-FY2026-27-v1");
  if (withdrawal) {
    calculatedResults.hidden = true;
    emptyResults.hidden = false;
    formError.textContent = `This calculator has been withdrawn by TaxComp's legal reviewers while it is corrected: ${String(withdrawal.reason).replace(/[.\s]*$/, ".")} No figures are shown. Please ask a tax professional.`;
    formError.hidden = false;
    return;
  }

  try {
    calculations[form.dataset.taxHead]();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formError.textContent = error.message;
    formError.hidden = false;
  }
});

setTaxHead("individual");
renderAdvisoryGuidance();
renderTaxCases();
