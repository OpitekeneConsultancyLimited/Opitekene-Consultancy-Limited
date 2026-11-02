export const sources = {
  ura: {
    label: "Uganda Revenue Authority",
    url: "https://www.ura.go.ug/",
    sourceType: "ura_publication",
  },
  individual: {
    label: "PwC Uganda individual income tax (secondary summary)",
    url: "https://taxsummaries.pwc.com/uganda/individual/taxes-on-personal-income",
    sourceType: "secondary_publication",
  },
  corporate: {
    label: "PwC Uganda corporate income tax (secondary summary)",
    url: "https://taxsummaries.pwc.com/uganda/corporate/taxes-on-corporate-income",
    sourceType: "secondary_publication",
  },
  capitalAllowances: {
    label: "PwC Uganda capital allowances (secondary summary)",
    url: "https://taxsummaries.pwc.com/uganda/corporate/deductions",
    sourceType: "secondary_publication",
  },
  vat: {
    label: "PwC Uganda VAT and other taxes (secondary summary)",
    url: "https://taxsummaries.pwc.com/uganda/corporate/other-taxes",
    sourceType: "secondary_publication",
  },
  withholding: {
    label: "PwC Uganda withholding taxes (secondary summary)",
    url: "https://taxsummaries.pwc.com/uganda/corporate/withholding-taxes",
    sourceType: "secondary_publication",
  },
  transferPricing: {
    label: "OECD Transfer Pricing Guidelines",
    url: "https://www.oecd.org/tax/transfer-pricing/oecd-transfer-pricing-guidelines-for-multinational-enterprises-and-tax-administrations-20769717.htm",
    sourceType: "international_publication",
  },
  beps: {
    label: "OECD Base Erosion and Profit Shifting (BEPS)",
    url: "https://www.oecd.org/tax/beps/",
    sourceType: "international_publication",
  },
  customs: {
    label: "East African Community Common External Tariff resources",
    url: "https://www.eac.int/documents/category/eac-common-external-tariff",
    sourceType: "regional_publication",
  },
  ulIi: {
    label: "Uganda Legal Information Institute judgments",
    url: "https://ulii.org/en/judgments/",
    sourceType: "case_law",
  },
};

export const guidance = [
  {
    title: "Individual income tax",
    keywords: "individual personal income chargeable bands resident nonresident rates deductions source",
    summary: "The FY 2026/27 calculator applies progressive resident or non-resident individual tax bands to chargeable income. Establish tax residence, income source, exemptions and allowable deductions from the actual facts; the calculator does not decide eligibility.",
    sourceKeys: ["individual", "ura"],
    calculator: "individual",
  },
  {
    title: "PAYE and employment benefits",
    keywords: "paye payroll salary employment benefits allowance housing motor vehicle loan school fees gratuity bonus termination NSSF",
    summary: "PAYE is estimated from monthly taxable pay annualized for the year. Employment income can include salary, allowances and taxable benefits, but valuation rules and exceptions depend on the law and facts. NSSF is shown separately from income tax.",
    sourceKeys: ["individual", "ura"],
    calculator: "paye",
  },
  {
    title: "Company income tax and accounting profit reconciliation",
    keywords: "company corporate income tax accounting profit loss addbacks deductions depreciation exempt income capital allowance assessed losses",
    summary: "The company worksheet starts from accounting profit or loss, adds confirmed tax adjustments, subtracts user-confirmed deductions and applies the standard 30% rate to positive chargeable income. It does not decide whether a cost, tax loss, incentive or capital allowance qualifies.",
    sourceKeys: ["corporate", "ura"],
    calculator: "company",
  },
  {
    title: "Capital allowances",
    keywords: "capital allowance depreciation wear tear asset rate industrial building tax basis class classes computer data handling farming manufacturing mining vehicles reducing balance",
    summary: "The FY 2026/27 schedule applies reducing-balance rates to depreciable assets other than minor assets: Class 1 computers and data-handling equipment at 40%; Class 2 plant and machinery used in farming, manufacturing or mining at 30%; and Class 3 at 20% for automobiles, buses/minibuses, construction and earth-moving equipment, specialised trucks/tractors/trailers, rail equipment, vessels, aircraft, specialised public-utility equipment, office furniture/fixtures/equipment and assets not in another class. TaxComp calculates a class pool from the opening tax written-down value, qualifying additions and entered disposal proceeds, with business-use apportionment. Asset eligibility, balancing adjustments and special rules still require review.",
    sourceKeys: ["capitalAllowances", "ura"],
    calculator: "capital-allowances",
  },
  {
    title: "Resident individual rental income",
    keywords: "rental rent landlord resident individual gross threshold expenses filing monthly",
    summary: "The FY 2026/27 resident individual rental estimate applies 12% to annual gross rent above UGX 2,820,000 without deducting expenses. The calculator is annual; monthly filing/payment requirements are noted as applying from 1 July 2026 and are not calculated monthly.",
    sourceKeys: ["individual", "ura"],
    calculator: "rental",
  },
  {
    title: "Company and non-resident rental income",
    keywords: "rental company landlord nonresident non-resident withholding gross rent expenses treaty",
    summary: "Resident company rental profit is estimated under the standard company tax treatment using user-entered expenses and eligible losses. For non-resident landlords, the site estimates domestic withholding of 15% on Uganda-source gross rent. Treaty relief, final-tax status and eligibility are not determined.",
    sourceKeys: ["corporate", "withholding", "ura"],
    calculator: "rental",
  },
  {
    title: "VAT registration thresholds",
    keywords: "vat registration threshold annual three month quarterly 300 million 75 million taxable supplies",
    summary: "The FY 2026/27 guidance represents standard registration thresholds of UGX 300 million in annual taxable supplies or more than UGX 75 million in a three-month period. Special registration rules may apply; confirm the periods and conditions with URA.",
    sourceKeys: ["vat", "ura"],
    calculator: "vat",
  },
  {
    title: "VAT input tax and EFRIS",
    keywords: "vat input tax credit claim efris invoice exempt supplies withholding invoice",
    summary: "Input VAT recovery depends on business use, valid EFRIS evidence, timing, exempt-supply restrictions and statutory conditions. The calculator applies only simplified restrictions and does not approve claims. VAT withholding is estimated only for a designated agent when the supplier has not issued the relevant EFRIS invoice or receipt.",
    sourceKeys: ["vat", "ura"],
    calculator: "vat",
  },
  {
    title: "FY 2026/27 VAT changes",
    keywords: "2026 VAT amendments exemption nuclear energy contractor subcontractor",
    summary: "TaxComp reflects FY 2026/27 VAT registration thresholds, EFRIS-related conditions and a targeted exemption for specified supplies to nuclear-energy contractors and subcontractors. Confirm the amended law and the exact transaction before applying an exemption.",
    sourceKeys: ["vat", "ura"],
    calculator: "vat",
  },
  {
    title: "Withholding tax categories",
    keywords: "withholding tax wht entertainers betting gaming insurance agent debenture nonresident rates 2026",
    summary: "The FY 2026/27 guide represents a 6% withholding category for resident public entertainers, 15% on betting/gaming winnings, specified 10% insurance-agent commission treatment, and a conditional 5% rate for qualifying non-resident debenture interest. Conditions, recipient status, treaty relief and whether tax is creditable or final matter.",
    sourceKeys: ["withholding", "ura"],
    calculator: "withholding",
  },
  {
    title: "Presumptive tax",
    keywords: "presumptive small business turnover threshold schedule eligibility professional services",
    summary: "The general resident small-business turnover ceiling represented is UGX 150 million, subject to eligibility and exclusions. TaxComp applies a user-entered rate; it does not select the statutory schedule or determine eligibility.",
    sourceKeys: ["corporate", "ura"],
    calculator: "presumptive",
  },
  {
    title: "Imports and exports",
    keywords: "customs import export duty excise vat hs code tariff origin customs value landed cost",
    summary: "Import estimates may include customs duty, excise, import VAT and entered charges; export estimates use entered charges and a selected VAT treatment. Rates depend on HS classification, origin, customs value and eligibility. TaxComp does not classify goods or look up tariff rates.",
    sourceKeys: ["customs", "ura"],
    calculator: "customs",
  },
  {
    title: "Filing deadlines and URA notices",
    keywords: "filing deadline due date objection appeal notice audit penalties return",
    summary: "Deadlines and response periods depend on the tax type, notice and facts. TaxComp deliberately does not guess statutory deadlines or objection periods. Read any URA notice immediately and confirm the applicable date with URA or a qualified tax professional.",
    sourceKeys: ["ura"],
  },
  {
    title: "International tax residence and source",
    keywords: "international cross-border residence residency income source worldwide foreign income tax countries Uganda",
    summary: "Cross-border analysis must determine tax residence and the source of each income stream under the relevant countries' domestic laws. Citizenship, payment location or a mailing address alone may not settle those questions; more than one country may assert taxing rights. Map the countries, tax year, income type, workdays, contracts and where activities or assets are located, then verify local law and any applicable treaty.",
    sourceKeys: ["ura", "individual", "corporate"],
    calculator: "international",
  },
  {
    title: "Tax treaties and non-resident withholding",
    keywords: "international treaty DTA double tax agreement withholding dividend interest royalty services management fees beneficial ownership nonresident",
    summary: "Do not apply a treaty rate merely because a recipient is overseas. Confirm an agreement is in force for the relevant countries and payment date, that its article covers the payment, and that residence, beneficial-ownership, anti-abuse and documentation requirements are met. TaxComp has no verified treaty-rate matrix and does not determine treaty entitlement. Verify the current treaty and domestic procedure, and retain residency evidence, withholding certificates and payment proof.",
    sourceKeys: ["ura", "withholding"],
    calculator: "international",
  },
  {
    title: "Permanent establishment and foreign business activity",
    keywords: "international permanent establishment PE branch fixed place project service dependent agent foreign company business profits",
    summary: "An overseas enterprise may have local registration, income-tax or profit-attribution exposure where it has sufficient local presence. Domestic permanent-establishment rules and an applicable treaty may differ; assess the actual locations, project, people, agency authority and service activity rather than relying on a day count alone.",
    sourceKeys: ["ura", "corporate"],
    calculator: "international",
  },
  {
    title: "International transfer pricing",
    keywords: "international transfer pricing related party associated enterprise arm's length intercompany services loans royalties goods documentation",
    summary: "Cross-border dealings between associated persons can require arm's-length pricing and supporting evidence. Review transaction substance, functions, assets and risks, comparables, financing terms, and current local disclosure and documentation rules. OECD guidance is a reference framework, not a substitute for Uganda's enacted law.",
    sourceKeys: ["ura", "corporate", "transferPricing"],
    calculator: "international",
  },
  {
    title: "Foreign tax credits and double-tax relief",
    keywords: "international foreign tax credit paid overseas foreign source income double taxation relief exemption limit evidence",
    summary: "Foreign tax paid does not automatically create a Uganda credit. Confirm the taxpayer, income and foreign tax type, timing, evidence, domestic or treaty relief mechanism, and any limit or category restriction before offsetting amounts.",
    sourceKeys: ["ura", "individual", "corporate"],
    calculator: "international",
  },
  {
    title: "Cross-border employment, VAT and customs",
    keywords: "international employee remote work workdays payroll PAYE social security VAT imported digital services reverse charge customs EAC tariff origin",
    summary: "Cross-border work can raise residence, payroll withholding, employer registration, social-security and immigration issues. Imported or digital services can require a separate VAT review; goods require correct classification, customs value, origin, tariff and proof. Check the countries involved and current local rules; standard domestic calculators do not determine these obligations.",
    sourceKeys: ["ura", "individual", "vat", "customs"],
    calculator: "international",
  },
  {
    title: "Multinational groups and BEPS screening",
    keywords: "international multinational BEPS CFC controlled foreign company global minimum tax Pillar Two country by country reporting interest limitation hybrid",
    summary: "Multinational groups may need to screen controlled-foreign-company, interest-limitation, hybrid-mismatch, treaty anti-abuse, country-by-country reporting and global minimum-tax rules. Scope depends on each jurisdiction, group structure, thresholds and effective dates. OECD materials do not themselves create a Uganda filing obligation; verify enacted local rules.",
    sourceKeys: ["ura", "corporate", "beps"],
    calculator: "international",
  },
];

export const taxCases = [
  {
    title: "Quickway Property Services Limited v Uganda Revenue Authority",
    citation: "Application No. TAT 105 of 2021 · [2023] UGTAT 2 (21 February 2023)",
    keywords: "input VAT input tax payments evidence invoices proof claim",
    summary: "ULII's published case summary says the applicant failed to prove the input VAT payments. The Tax Appeals Tribunal upheld URA's disallowance and dismissed the application with costs. This case-specific result is not a blanket rule for every input VAT claim.",
    url: "https://ulii.org/en/akn/ug/judgment/ugtat/2023/2/eng@2023-02-21",
  },
  {
    title: "Multiple ICD Limited v Uganda Revenue Authority",
    citation: "Civil Application No. 1062 of 2026 · [2026] UGCA 329 (28 October 2026)",
    keywords: "vat lease time supply moratorium assessment recovery stay appeal security section 14",
    summary: "ULII's published case summary says the Court of Appeal stayed recovery of the VAT assessment pending appeal, identifying an arguable statutory issue and adequate security. This was an interim application, not a final decision of the VAT merits.",
    url: "https://ulii.org/en/akn/ug/judgment/ugca/2026/329/eng@2026-10-28",
  },
];

function getFinancialYear(text) {
  const match = String(text || "")
    .match(/\b(?:FY|financial year)\s*(20\d{2})\s*[/-]\s*(\d{2,4})\b/i);
  if (!match) return null;

  const endYear = Number(match[2].length === 2
    ? `${match[1].slice(0, 2)}${match[2]}`
    : match[2]);
  if (endYear !== Number(match[1]) + 1) return null;
  return `${match[1]}/${String(endYear).slice(-2)}`;
}

const stopWords = new Set([
  "about", "after", "also", "and", "are", "can", "does", "for", "from",
  "give", "help", "how", "into", "like", "need", "please", "tell", "that",
  "the", "this", "under", "what", "when", "where", "which", "with", "would",
  "you", "your", "tax", "taxes", "uganda",
]);

export function queryTerms(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !stopWords.has(term)) || [];
}

export function retrieveKnowledge(question) {
  const terms = queryTerms(question);
  const requestedFinancialYear = getFinancialYear(question);
  const appliesToRequestedYear = (item) => !requestedFinancialYear ||
    getFinancialYear([
      item.financialYear,
      item.title,
      item.keywords,
      item.summary,
    ].filter(Boolean).join(" ")) === requestedFinancialYear;
  const applicableGuidance = guidance.filter(appliesToRequestedYear);
  const applicableCases = taxCases.filter(appliesToRequestedYear);

  if (terms.length === 0) {
    return {
      guidance: [],
      cases: [],
      sources: [],
      calculators: [],
      sufficient: false,
      requestedFinancialYear,
    };
  }

  const rank = (item) => {
    const title = item.title.toLowerCase();
    const keywords = item.keywords.toLowerCase();
    const text = `${title} ${keywords} ${item.summary}`.toLowerCase();
    return terms.reduce((score, term) => (
      score + (title.includes(term) ? 4 : 0) +
        (keywords.includes(term) ? 2 : 0) +
        (text.includes(term) ? 1 : 0)
    ), 0);
  };

  const top = (items, limit) => items
    .map((item) => ({ item, score: rank(item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);

  const rankedGuidance = top(applicableGuidance, 4);
  const rankedCases = top(applicableCases, 3);
  const selectedGuidance = rankedGuidance.filter((item) => rank(item) >= 3);
  const selectedCases = rankedCases.filter((item) => rank(item) >= 3);
  const sourceKeys = new Set(
    selectedGuidance.flatMap((item) => item.sourceKeys),
  );
  if (selectedCases.length > 0) sourceKeys.add("ulIi");
  const selectedSources = [...sourceKeys].map((key) => sources[key]);
  const calculators = [...new Set(
    selectedGuidance.map((item) => item.calculator).filter(Boolean),
  )];

  return {
    guidance: selectedGuidance,
    cases: selectedCases,
    sources: selectedSources,
    calculators,
    sufficient: selectedGuidance.length > 0 || selectedCases.length > 0,
    requestedFinancialYear,
  };
}
