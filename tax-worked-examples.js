(function (root, factory) {
  const examples = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = examples;
  } else {
    root.ugandaTaxWorkedExamples = examples;
    examples.initialize();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const data = {
    parameters: {
      companyTaxRate: 0.3,
      yearOfIncome: 2024,
      statute: "Uganda Income Tax Act Cap. 338 (2023 Revision)",
    },
    csiBankTaxComputation: {
      provisions: [
        { name: "Substandard", amount: 222_586_819, rate: 0.2, provision: 44_517_364 },
        { name: "Doubtful", amount: 320_752_092, rate: 0.5, provision: 160_376_046 },
        { name: "Loss", amount: 978_669_455, rate: 1, provision: 978_669_455 },
      ],
      totalSpecificProvisions: 1_183_562_865,
      generalProvision: { rate: 0.01, performingBase: 323_288_575, provision: 3_232_886 },
      wearAndTear: [
        { class: "Class I", rate: 0.4, assetCosts: [262_148_011, 74_822_925], allowance: 134_788_374 },
        { class: "Class II", rate: 0.3, assetCosts: [29_442_400, 150_650_693], allowance: 54_027_928 },
        { class: "Class III", rate: 0.2, assetCosts: [627_928_138, 86_735_770], allowance: 142_932_782 },
      ],
      totalWearAndTear: 331_749_084,
      industrialBuildingAllowance: [
        { description: "Items (2014–2021)", amount: 99_169_976 },
        { description: "Refurbishment (2022)", amount: 123_950 },
        { description: "Gulu building (2023)", amount: 60_000_000 },
        { description: "New building (2024)", amount: 33_285_000 },
      ],
      totalIndustrialBuildingAllowance: 192_578_926,
      profitBeforeTax: 13_831_170_000,
      addBacks: [
        { name: "Depreciation", amount: 1_098_990_000 },
        { name: "Impairment charge", amount: 30_283_000 },
        { name: "Loss on sale of PPE", amount: 2_170_000 },
        { name: "Burial expenses", amount: 2_070_861_000 },
        { name: "Gratuity provision (non-actuarial)", amount: 229_805_039 },
        { name: "Leave provision", amount: 19_089_000 },
        { name: "Income tax expense", amount: 200_000_000 },
        { name: "PAYE expense", amount: 80_000_908 },
        { name: "Client entertainment", amount: 32_133_871 },
        { name: "Legal fees (property)", amount: 78_919_593 },
        { name: "BOU breach penalty", amount: 450_000_000 },
      ],
      totalAddBacks: 4_292_252_411,
      deductions: [
        { name: "Treasury bill and bond interest", amount: -10_891_264_000 },
        { name: "Unrealised forex gain", amount: -21_022_432 },
        { name: "Minor capital equipment", amount: -27_468_655 },
        { name: "Wear-and-tear allowance", amount: -331_749_084 },
        { name: "Industrial building allowance", amount: -192_578_926 },
        { name: "Specific provisions", amount: -1_183_562_865 },
        { name: "General provision", amount: -3_232_886 },
      ],
      chargeableIncome: 5_472_543_563,
      withholdingCredits: 24_322_000,
      netTaxPayable: 1_617_441_069,
    },
    burugoWithholding: [
      { source: "Treasury Bills Interest", grossAmount: 14_200_000, rate: 0.2, treatment: "Final", whtAmount: 2_840_000 },
      { source: "Treasury Bonds Interest", grossAmount: 13_100_000, rate: 0.2, treatment: "Final", whtAmount: 2_620_000 },
      { source: "Rental Income", grossAmount: 800_000_000, rate: 0.06, treatment: "Creditable", whtAmount: 48_000_000 },
      { source: "Telecom Commission", grossAmount: 560_000_000, rate: 0.1, treatment: "Final", whtAmount: 56_000_000 },
      { source: "Reinsurance Premiums", grossAmount: 345_100_000, rate: 0.1, treatment: "Non-resident", whtAmount: 34_510_000 },
      { source: "Management Fees", grossAmount: 0, rate: 0, treatment: "Nil", whtAmount: 0 },
    ],
    burugoTotalWht: 143_970_000,
  };

  const numberFormat = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 });
  const money = (amount) => `UGX ${numberFormat.format(amount)}`;
  const percent = (rate) => `${numberFormat.format(rate * 100)}%`;
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const round = (amount) => Math.round(amount);

  function calculateCsiBank() {
    const example = data.csiBankTaxComputation;
    const provisions = example.provisions.map((item) => ({
      ...item,
      calculatedProvision: round(item.amount * item.rate),
    }));
    const totalSpecificProvisions = sum(provisions.map((item) => item.calculatedProvision));
    const generalProvision = round(example.generalProvision.performingBase * example.generalProvision.rate);
    const wearAndTear = example.wearAndTear.map((item) => ({
      ...item,
      costBase: sum(item.assetCosts),
      calculatedAllowance: round(sum(item.assetCosts) * item.rate),
    }));
    const totalWearAndTear = sum(wearAndTear.map((item) => item.calculatedAllowance));
    const totalIndustrialBuildingAllowance = sum(example.industrialBuildingAllowance.map((item) => item.amount));
    const totalAddBacks = sum(example.addBacks.map((item) => item.amount));
    const chargeableIncome = example.profitBeforeTax
      + totalAddBacks
      + sum(example.deductions.map((item) => item.amount));
    const taxBeforeCredits = round(chargeableIncome * data.parameters.companyTaxRate);

    return {
      provisions,
      totalSpecificProvisions,
      generalProvision,
      wearAndTear,
      totalWearAndTear,
      totalIndustrialBuildingAllowance,
      totalAddBacks,
      chargeableIncome,
      taxBeforeCredits,
      netTaxPayable: taxBeforeCredits - example.withholdingCredits,
    };
  }

  function calculateBurugoWithholding() {
    const transactions = data.burugoWithholding.map((item) => ({
      ...item,
      calculatedWht: round(item.grossAmount * item.rate),
    }));
    return {
      transactions,
      totalWht: sum(transactions.map((item) => item.calculatedWht)),
    };
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makeTable(headers, rows) {
    const table = createElement("table", "worked-example-table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const header of headers) {
      const cell = createElement("th", "", header);
      cell.scope = "col";
      headerRow.append(cell);
    }
    head.append(headerRow);
    const body = document.createElement("tbody");
    for (const row of rows) {
      const tableRow = document.createElement("tr");
      for (const value of row) tableRow.append(createElement("td", "", value));
      body.append(tableRow);
    }
    table.append(head, body);
    return table;
  }

  function addTableSection(container, title, headers, rows) {
    const wrapper = createElement("div", "worked-example-table-wrap");
    wrapper.append(makeTable(headers, rows));
    container.append(createElement("h4", "", title), wrapper);
  }

  function initialize() {
    const root = document.querySelector("#tax-worked-examples");
    if (!root) return;
    const csi = data.csiBankTaxComputation;
    const csiResult = calculateCsiBank();
    const burugoResult = calculateBurugoWithholding();

    const metadata = root.querySelector("#worked-example-metadata");
    metadata.textContent = `Year of income ${data.parameters.yearOfIncome} · ${data.parameters.statute} · company tax rate ${percent(data.parameters.companyTaxRate)}`;

    const bank = root.querySelector("#worked-example-csi-bank");
    bank.replaceChildren();
    bank.append(createElement("h3", "", "Question 1 · CSI Bank income tax computation"));
    bank.append(createElement("p", "worked-example-lead", `Profit before tax: ${money(csi.profitBeforeTax)}. The working below reproduces the supplied adjustments and independently checks the arithmetic.`));

    addTableSection(bank, "Specific and general provisions", ["Provision", "Base", "Rate", "Supplied amount", "Recomputed amount"], [
      ...csiResult.provisions.map((item) => [
        item.name, money(item.amount), percent(item.rate), money(item.provision), money(item.calculatedProvision),
      ]),
      ["Specific provisions total", "—", "—", money(csi.totalSpecificProvisions), money(csiResult.totalSpecificProvisions)],
      ["General provision", money(csi.generalProvision.performingBase), percent(csi.generalProvision.rate), money(csi.generalProvision.provision), money(csiResult.generalProvision)],
    ]);

    addTableSection(bank, "Wear-and-tear allowances", ["Class", "Asset cost base", "Rate", "Supplied allowance", "Recomputed allowance"], [
      ...csiResult.wearAndTear.map((item) => [
        item.class, money(item.costBase), percent(item.rate), money(item.allowance), money(item.calculatedAllowance),
      ]),
      ["Total wear and tear", "—", "—", money(csi.totalWearAndTear), money(csiResult.totalWearAndTear)],
    ]);

    addTableSection(bank, "Industrial building allowance", ["Description", "Supplied amount"], [
      ...csi.industrialBuildingAllowance.map((item) => [item.description, money(item.amount)]),
      ["Total industrial building allowance", money(csi.totalIndustrialBuildingAllowance)],
    ]);

    addTableSection(bank, "Tax reconciliation", ["Adjustment", "Supplied amount"], [
      ["Profit before tax", money(csi.profitBeforeTax)],
      ...csi.addBacks.map((item) => [item.name, money(item.amount)]),
      ["Total add-backs", money(csi.totalAddBacks)],
      ...csi.deductions.map((item) => [item.name, money(item.amount)]),
      ["Chargeable income", money(csi.chargeableIncome)],
      ["Tax at supplied company rate", `${money(csiResult.taxBeforeCredits)} (${percent(data.parameters.companyTaxRate)})`],
      ["Less withholding tax credits", `−${money(csi.withholdingCredits)}`],
      ["Net tax payable", money(csi.netTaxPayable)],
    ]);

    const bankChecks = [
      ["Total add-backs", csiResult.totalAddBacks, csi.totalAddBacks],
      ["Chargeable income", csiResult.chargeableIncome, csi.chargeableIncome],
      ["Net tax payable", csiResult.netTaxPayable, csi.netTaxPayable],
    ];
    for (const [label, calculated, supplied] of bankChecks) {
      const difference = calculated - supplied;
      bank.append(createElement(
        "p",
        difference === 0 ? "worked-example-check" : "worked-example-check is-warning",
        difference === 0
          ? `Arithmetic check: ${label} agrees with the supplied figure.`
          : `Arithmetic check: ${label} differs from the supplied figure by ${money(difference)}.`,
      ));
    }

    const burugo = root.querySelector("#worked-example-burugo");
    burugo.replaceChildren();
    burugo.append(createElement("h3", "", "Question 4 · Burugo withholding tax"));
    burugo.append(createElement("p", "worked-example-lead", "Withholding amounts and treatments are shown as supplied. The arithmetic recomputes gross amount × entered rate; it does not confirm legal classification or eligibility."));
    addTableSection(burugo, "Transactions", ["Income source", "Gross amount", "Supplied rate / treatment", "Supplied WHT", "Recomputed WHT"], [
      ...burugoResult.transactions.map((item) => [
        item.source,
        money(item.grossAmount),
        `${percent(item.rate)} (${item.treatment})`,
        money(item.whtAmount),
        money(item.calculatedWht),
      ]),
      ["Total withholding tax", "—", "—", money(data.burugoTotalWht), money(burugoResult.totalWht)],
    ]);
    burugo.append(createElement(
      "p",
      burugoResult.totalWht === data.burugoTotalWht ? "worked-example-check" : "worked-example-check is-warning",
      burugoResult.totalWht === data.burugoTotalWht
        ? `Arithmetic check: total withholding tax agrees with the supplied figure (${money(burugoResult.totalWht)}).`
        : `Arithmetic check: recomputed withholding differs from the supplied total by ${money(burugoResult.totalWht - data.burugoTotalWht)}.`,
    ));
  }

  return { calculateBurugoWithholding, calculateCsiBank, data, initialize };
});
