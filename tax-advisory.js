(function (root, factory) {
  const advisory = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = advisory;
  } else {
    root.ugandaTaxAdvisory = advisory;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const sources = {
    ura: {
      label: "Uganda Revenue Authority (official)",
      url: "https://www.ura.go.ug/",
    },
    individual: {
      label: "PwC Uganda individual income tax (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/individual/taxes-on-personal-income",
    },
    corporate: {
      label: "PwC Uganda corporate income tax (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/taxes-on-corporate-income",
    },
    capitalAllowances: {
      label: "PwC Uganda capital allowances (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/deductions",
    },
    vat: {
      label: "PwC Uganda VAT and other taxes (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/other-taxes",
    },
    withholding: {
      label: "PwC Uganda withholding taxes (secondary summary)",
      url: "https://taxsummaries.pwc.com/uganda/corporate/withholding-taxes",
    },
    amendments2026: {
      label: "MRT Tax 2026 amendment commentary (secondary source; not legislation)",
      url: "https://mrt.tax/2026/08/24/ugandas-2026-income-tax-and-excise-duty-amendments-now-law-key-changes-and-what-they-mean-for-taxpayers/",
    },
    domesticTaxCompendium: {
      label: "Uganda domestic tax-law compilation (2025–2026; reference only; verify current law at URA)",
      url: "https://ura.go.ug/",
    },
    transferPricing: {
      label: "OECD Transfer Pricing Guidelines",
      url: "https://www.oecd.org/tax/transfer-pricing/oecd-transfer-pricing-guidelines-for-multinational-enterprises-and-tax-administrations-20769717.htm",
    },
    beps: {
      label: "OECD Base Erosion and Profit Shifting (BEPS)",
      url: "https://www.oecd.org/tax/beps/",
    },
    eac: {
      label: "East African Community Common External Tariff resources",
      url: "https://www.eac.int/documents/category/eac-common-external-tariff",
    },
    singleWindow: {
      label: "URA Electronic Single Window",
      url: "https://singlewindow.go.ug/stp/#/",
    },
    uliiJudgments: {
      label: "Uganda Legal Information Institute (ULII) judgments",
      url: "https://ulii.org/en/judgments/",
    },
  };

  const taxCases = [
    {
      id: "quickway-property-services-ura-2023",
      topic: "Input VAT",
      court: "Tax Appeals Tribunal (Uganda)",
      name: "Quickway Property Services Limited v Uganda Revenue Authority",
      citation: "Application No. TAT 105 of 2021 · [2023] UGTAT 2",
      date: "21 February 2023",
      keywords: [
        "input VAT input tax payments evidence invoices proof claim disallowance burden",
      ],
      issue: "Whether Quickway established the input VAT payments it claimed in its tax dispute.",
      summary: "ULII's published case summary says the applicant failed to prove the input VAT payments. The Tribunal upheld URA's disallowance and dismissed the application with costs.",
      significance: "The decision is a reminder to retain and present adequate evidence for disputed input VAT claims. Its result turns on the record in that case; it does not mean every input VAT claim without a particular document automatically fails.",
      sourceUrl: "https://ulii.org/en/akn/ug/judgment/ugtat/2023/2/eng@2023-02-21",
    },
    {
      id: "multiple-icd-ura-2026",
      topic: "VAT",
      court: "Court of Appeal of Uganda",
      name: "Multiple ICD Limited v Uganda Revenue Authority",
      citation: "Civil Application No. 1062 of 2026 · [2026] UGCA 329",
      date: "28 October 2026",
      keywords: [
        "vat lease time of supply moratorium assessment recovery stay appeal security section 14",
      ],
      issue: "The ULII case listing identifies the dispute as concerning the time of supply under a lease, the effect of a contractual moratorium, and section 14 of the Value Added Tax Act.",
      summary: "According to ULII's published case summary, the Court of Appeal stayed recovery of the VAT assessment pending appeal. It found an arguable statutory issue and noted that adequate security had been paid.",
      significance: "This was an interim stay application. The published summary does not establish that the Court finally decided the VAT time-of-supply question or the taxpayer's ultimate liability.",
      sourceUrl: "https://ulii.org/en/akn/ug/judgment/ugca/2026/329/eng@2026-10-28",
    },
  ];

  const guidance = [
    {
      id: "individual-income-scope",
      topic: "individual",
      title: "What counts as income for an individual taxpayer?",
      keywords: ["income tax act sections 2 9 14 17 19 20 21 individual employment property business foreign source resident nonresident exempt income benefit allowance"],
      summary: "The compendium indexes definitions and residence rules, gross income, employment and property income, exempt income, and taxation of individuals (including Income Tax Act sections 2, 9, 14, 17–21 and 62). Whether a receipt is taxable, exempt, Uganda-source or foreign-source depends on the applicable definition, facts and current amendments; the PAYE and individual calculators do not classify receipts for you.",
      nextStep: "Describe the taxpayer, year, receipt, payer, work or asset location and any exemption claimed. Check the current Act and retain the evidence supporting classification and value.",
      sourceKeys: ["domesticTaxCompendium", "individual", "ura"],
      calculator: "individual",
    },
    {
      id: "business-deductions-and-losses",
      topic: "business",
      title: "Which business expenses and tax losses should I review?",
      keywords: ["Income Tax Act sections 22 23 24 25 26 27 28 30 31 32 33 34 35 36 deduction expense entertainment bad debt interest repairs depreciation building intangible research training donation farming apportionment carry forward loss"],
      summary: "The compendium indexes business deduction rules for income-producing expenses, entertainment, bad debts, interest, repairs and minor capital equipment, depreciable assets, industrial buildings, intangible assets, research, training, donations, farming, apportionment and loss carry-forward (sections 22–36). It does not mean every expense in a category is deductible: purpose, evidence, statutory limits and amendments still matter.",
      nextStep: "For each material item, retain invoices/contracts and business-purpose evidence, separate capital from revenue expenditure, apportion mixed use, and verify any loss restriction or special regime.",
      sourceKeys: ["domesticTaxCompendium", "corporate", "capitalAllowances", "ura"],
      calculator: "company",
    },
    {
      id: "income-accounting-and-disposals",
      topic: "business",
      title: "How do tax accounting rules and asset disposals affect income?",
      keywords: ["Income Tax Act sections 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 56 58 accrual cash inventory trading stock foreign exchange currency debts disposal capital gain cost base depreciation accounting year"],
      summary: "The compendium indexes year-of-income and accounting-method rules, cash/accrual accounting, prepayments, trading stock, long-term contracts, foreign-currency debt, and gains and losses on disposal of assets (sections 37–52, 56 and 58). A disposal, exchange movement, inventory method or accounting entry may have a tax treatment different from its book presentation; the standard company worksheet does not calculate these special rules.",
      nextStep: "Reconcile the tax and accounting treatment by transaction and year; preserve acquisition and disposal documents, inventory records, exchange-rate sources and tax written-down values.",
      sourceKeys: ["domesticTaxCompendium", "corporate", "ura"],
      calculator: "company",
    },
    {
      id: "mining-petroleum-tax",
      topic: "international",
      title: "What special tax rules apply to mining and petroleum operations?",
      keywords: ["Income Tax Act sections 89 90 91 92 93 94 95 96 97 98 99 100 101 102 103 104 mining petroleum extractive license exploration development rehabilitation decommissioning windfall farmout indirect transfer contractor"],
      summary: "The compendium's Income Tax Act Part X indexes specialised rules for mining and petroleum licences, deduction limits, exploration and development expenditure, rehabilitation and decommissioning, windfall tax, farm-outs, indirect transfers, contractors, withholding, returns and audits (sections 89–115). Ordinary company-tax estimates are not designed to apply these industry-specific rules.",
      nextStep: "Identify the licence, project, contract, expenditure pool, transaction and year; review the current sector-specific provisions, regulations, licence terms and URA requirements with an adviser experienced in extractive taxation.",
      sourceKeys: ["domesticTaxCompendium", "ura", "amendments2026"],
      calculator: "international",
    },
    {
      id: "income-tax-withholding-map",
      topic: "withholding",
      title: "Which withholding-tax rules should I check?",
      keywords: ["Income Tax Act sections 125 126 127 128 129 130 131 132 133 134 135 135A 136 137 138 139 140 141 142 143 employer interest dividends professional fees asset purchase betting winnings reinsurance telecom airtime mobile money insurance advertising payment service goods services international nonresident final tax credit"],
      summary: "The compendium's withholding part indexes employer PAYE, resident interest and dividends, professional fees, asset purchases, betting winnings, reinsurance, airtime/mobile-money, insurance and advertising commissions, payment-service providers, goods/services, international and non-resident contracts, final-tax treatment, certificates and records (sections 125–146). The relevant payer, recipient, payment date, rate, exclusions and creditability must be checked separately. The 2026 changes are summarized in a separate note and are not all represented by the historic compilation.",
      nextStep: "Classify each payment and recipient, confirm withholding-agent status and current rate/effective date, issue and reconcile certificates, then verify whether the tax is final or creditable.",
      sourceKeys: ["domesticTaxCompendium", "withholding", "ura", "amendments2026"],
      calculator: "withholding",
    },
    {
      id: "tax-agents-and-representatives",
      topic: "business",
      title: "Who may act as a tax agent or tax representative?",
      keywords: ["Tax Procedures Code Act sections 6 7 8 9 10 11 12 13 14 tax agent registration tax representative liability taxpayer business successor"],
      summary: "The compendium indexes Tax Procedures Code Act provisions on the Tax Agents Registration Committee, registration and renewal of tax agents, changes or cancellation, tax representatives, successors and discontinuing a business (sections 6–14). A software tool cannot verify whether a person is currently registered or decide who is legally liable for a taxpayer's obligations.",
      nextStep: "Check current registration and appointment documents, keep taxpayer particulars current, and obtain professional advice before relying on an agent or representative arrangement.",
      sourceKeys: ["domesticTaxCompendium", "ura"],
    },
    {
      id: "tax-decisions-and-appeals",
      topic: "business",
      title: "How can a tax decision be challenged?",
      keywords: ["Tax Procedures Code Act sections 26 27 28 Tax Appeals Tribunals Act objection review appeal tribunal burden proof decision assessment URA deadline"],
      summary: "The compendium indexes objections to tax decisions, review of objection decisions and the burden of proof under the Tax Procedures Code Act, followed by review of taxation decisions under the Tax Appeals Tribunals Act. Procedure, security, payment and time limits may be amended or depend on the decision and case facts; this guide does not calculate a deadline or advise whether to appeal.",
      nextStep: "Read the decision and current procedural law immediately, preserve evidence and proof of service, and get qualified advice on the applicable objection, review or appeal route and deadline.",
      sourceKeys: ["domesticTaxCompendium", "ura", "uliiJudgments"],
    },
    {
      id: "stamp-duty-instruments",
      topic: "business",
      title: "When might stamp duty apply to an instrument?",
      keywords: ["Stamp Duty Act sections 2 3 4 5 instrument agreement lease transfer mortgage sale insurance shares foreign currency stamp assessment objection"],
      summary: "The compendium indexes stamp duty by chargeable instruments and schedules, including documents involving transactions, multiple matters, counterparts, timing and valuation. Whether a document is dutiable and who must pay depend on the current schedule, instrument and transaction facts; TaxComp does not classify or value legal instruments.",
      nextStep: "Identify the executed document, parties, consideration, date and transaction; check the current Stamp Duty Act schedule and URA procedure before execution or registration.",
      sourceKeys: ["domesticTaxCompendium", "ura"],
    },
    {
      id: "gaming-operator-tax",
      topic: "customs",
      title: "What is the difference between gaming-operator tax and tax on winnings?",
      keywords: ["Lotteries and Gaming Act Part VIII casino gaming betting operator tax gaming activity levy tax winnings player stake national lottery licence amendment 2026"],
      summary: "The compendium has a separate Lotteries and Gaming Act part for taxation of casino, gaming and betting activities. That operator/activity-level regime is different from income-tax withholding on a recipient's betting winnings. Reported 2026 changes affect withholding calculations and exclusions; do not infer an operator's tax from a player's payout or the reverse.",
      nextStep: "Establish whether the question concerns a licensed operator, activity-level tax, or a recipient's payout; confirm the current licence, tax head, amendment and statutory base with URA and the gaming regulator.",
      sourceKeys: ["domesticTaxCompendium", "ura", "amendments2026"],
      calculator: "withholding",
    },
    {
      id: "uganda-tax-law-framework",
      topic: "business",
      title: "Which Ugandan tax laws should a business check?",
      keywords: ["tax law compendium domestic laws statutes Income Tax Act Cap 338 VAT Cap 344 Excise Duty Stamp Duty Lotteries Gaming Tax Procedures Code Act appeals acts regulations"],
      summary: "The 2025–2026 domestic tax-law compilation indexes the Income Tax Act (Cap. 338), VAT Act (Cap. 344), Excise Duty Act, Stamp Duty Act, Lotteries and Gaming Act, Tax Procedures Code Act (Cap. 343), Tax Appeals Tribunals Act and subsidiary legislation. The compilation itself warns that it is not a substitute for gazetted Acts and may be inaccurate; use it to locate provisions, then check current legislation and URA guidance.",
      nextStep: "Identify the tax head, taxpayer, transaction and period first. Check the current Act, amendments, regulations, schedules and any applicable URA guidance before taking a filing position.",
      sourceKeys: ["domesticTaxCompendium", "ura"],
    },
    {
      id: "income-tax-computation-framework",
      topic: "business",
      title: "How do I build an income-tax computation from the Act?",
      keywords: ["Income Tax Act section 15 17 18 19 20 21 22 23 24 25 26 27 28 35 36 chargeable gross business employment property exempt deductions bad debt interest depreciation losses"],
      summary: "The compendium's Income Tax Act contents group chargeable income, gross/business/employment/property income, exempt income, deductible expenses, entertainment, bad debts, interest, depreciable assets, industrial buildings, apportionment and loss relief (sections 15–36). These headings are a review checklist, not proof that an item is taxable, exempt, deductible or eligible for relief in a particular return.",
      nextStep: "Reconcile accounting figures to source documents, classify each receipt and expense under the current Act, and document the legal basis, apportionment, evidence and any restriction for each adjustment.",
      sourceKeys: ["domesticTaxCompendium", "corporate", "ura"],
      calculator: "company",
    },
    {
      id: "returns-provisional-tax",
      topic: "individual",
      title: "What should I check for income-tax returns and provisional tax?",
      keywords: ["recent current updated Income Tax Act sections 118 119 120 121 122 123 124 return due date provisional estimated tax refunds rental tax monthly provisional return amendment amendments 2026"],
      summary: "The compendium indexes Income Tax Act sections 118–123 for income-tax returns, payment, provisional tax, estimated tax and refunds, and section 124 for rental-tax procedure. Filing and payment rules depend on taxpayer type, income, year, elections and later amendments. Secondary commentary on the 2026 amendment describes monthly provisional rental returns as an option for an individual required to pay rental tax, not a general mandatory monthly-return rule.",
      nextStep: "Confirm the current section and any amendment for your taxpayer type and period; check the URA filing account and applicable due date rather than relying on a generic calendar or this annual estimator.",
      sourceKeys: ["domesticTaxCompendium", "ura", "amendments2026"],
    },
    {
      id: "vat-transaction-lifecycle",
      topic: "vat",
      title: "What is the VAT lifecycle for a transaction?",
      keywords: ["VAT Act sections 5 6 7 13 14 15 16 17 18 20 21 22 23 24 27 28 29 30 31 taxable person registration time place supply taxable exempt input credit invoice return payment"],
      summary: "The compendium indexes VAT registration and taxable-person rules (sections 5–8), time/place of supply and imports (sections 13–16), taxable and exempt supplies (sections 17–19), taxable value (sections 20–22), and tax calculation, input credits, invoices, returns and payment (sections 23–31). A VAT conclusion depends on the transaction, registration status, evidence, period and current schedules; the calculator applies only simplified user-entered assumptions.",
      nextStep: "For each supply, document who supplied what, where and when; classify its VAT treatment; reconcile output tax and eligible input tax to valid invoices and returns; verify amended thresholds, EFRIS conditions and statutory schedules.",
      sourceKeys: ["domesticTaxCompendium", "vat", "ura", "amendments2026"],
      calculator: "vat",
    },
    {
      id: "tax-records-assessments-objections",
      topic: "business",
      title: "What records and steps matter in a tax assessment or objection?",
      keywords: ["Tax Procedures Code Act section 15 16 22 23 24 25 26 27 28 48 49 56 57 records accounts returns self assessment default additional assessment objection review burden proof audit investigation evidence"],
      summary: "The compendium indexes Tax Procedures Code Act section 15 on accounts and records, sections 16 and 22–28 on returns, assessments, objections, review and burden of proof, and sections 48–49 on investigations and information requests. These provisions should be read with current amendments and the actual tax decision; the site does not calculate response periods or decide the merits of an objection.",
      nextStep: "Preserve complete ledgers, invoices, contracts, bank and payroll evidence, filed returns and URA correspondence. Record the decision date, identify disputed issues and amounts, and verify the current objection procedure and deadline immediately.",
      sourceKeys: ["domesticTaxCompendium", "ura"],
    },
    {
      id: "international-income-and-digital-services",
      topic: "international",
      title: "Which cross-border income rules should I screen?",
      keywords: ["Income Tax Act sections 78 78A 78B 79 80 81 82 83 84 85 86 87 88 international tax source permanent establishment foreign employment credit branch profits withholding digital nonresident royalty software"],
      summary: "The compendium indexes Income Tax Act Part IX on source, permanent establishments, foreign employment, foreign tax credits, branch profits, international payments, non-resident performers and professionals, shipping/telecommunications, digital services and international agreements (sections 78–88, including 78A–78B). Secondary 2026 amendment commentary separately reports that software is expressly included in the royalty definition; this is not the same question as the digital-services tax rules, and treaty or domestic-law treatment depends on the facts.",
      nextStep: "Map residence, source, service location, contract rights, payee, beneficial ownership, permanent-establishment exposure, treaty and payment date. Verify the enacted amendment and current treaty before classifying a payment or applying withholding.",
      sourceKeys: ["domesticTaxCompendium", "ura", "amendments2026", "withholding"],
      calculator: "international",
    },
    {
      id: "excise-stamp-and-gaming",
      topic: "customs",
      title: "How do excise, stamp duty and gaming obligations differ?",
      keywords: ["Excise Duty Act section 3 4 9 10 11 12 schedules product rates registration returns Stamp Duty Act section 2 instruments schedule Lotteries Gaming Act Part VIII gaming betting operator winnings"],
      summary: "The compendium treats excise as product/service-specific duty with separate registration, control, payment and return provisions, while stamp duty is assessed by reference to chargeable instruments and schedules. It also has a distinct Lotteries and Gaming Act section on taxation of casino, gaming and betting activities. These operator/instrument obligations are not interchangeable with withholding on a recipient's betting winnings; TaxComp does not classify products or legal instruments.",
      nextStep: "Identify the product and tariff unit, document or instrument, or licensed gaming activity; check the applicable current schedule, licence and amendment. Use the enacted 2026 excise rates, not Bill-stage proposals or an old compendium schedule.",
      sourceKeys: ["domesticTaxCompendium", "ura", "amendments2026", "eac"],
      calculator: "customs",
    },
    {
      id: "historical-company-tax-computation",
      topic: "business",
      title: "How is a historical company tax computation reconciled?",
      keywords: ["2024 historical company tax computation CSI Bank profit before tax add backs deductions chargeable income provisions wear tear building allowance"],
      summary: "A worked reconciliation starts with accounting profit, adds back the supplied non-deductible or adjusted items, applies supported deductions and allowances, then calculates tax before credits and deducts supported tax credits. TaxComp's 2024 example checks arithmetic only and does not verify the legal treatment or supporting evidence.",
      nextStep: "Review the historical CSI Bank worked example as a teaching illustration, and verify the law, return period and records that apply to any real filing.",
      sourceKeys: ["ura", "corporate"],
    },
    {
      id: "historical-withholding-schedule",
      topic: "withholding",
      title: "How can withholding tax transactions be reconciled?",
      keywords: ["2024 Burugo historical withholding WHT schedule treasury bills bonds rental telecom commission reinsurance management fees gross amount rate total"],
      summary: "A transaction schedule can show each income source, gross amount, entered rate and withholding amount, then reconcile the transaction amounts to a total. A matching arithmetic total does not confirm that the withholding rate, final or creditable treatment, residency or legal classification is correct.",
      nextStep: "Review the historical Burugo schedule as a supplied arithmetic example only. Check current law, taxpayer status, payment date and supporting certificates before applying a withholding treatment.",
      sourceKeys: ["ura", "withholding"],
    },
    {
      id: "business-tax-audit",
      topic: "business",
      title: "How can a business prepare for a URA tax audit?",
      keywords: ["business tax audit URA prepare notice request records evidence deadline assessment inspection review"],
      summary: "Start from the actual notice: verify its source, tax types, periods, scope, requested records and response dates. Preserve the relevant accounting, invoice, payroll, customs and filing records; reconcile material figures to returns; index each response and keep proof of delivery. The facts and applicable procedure determine what must be provided.",
      nextStep: "Use TaxComp's audit-readiness checklist to organize requests and supporting evidence. Confirm deadlines and response requirements with URA or a qualified Ugandan tax adviser; this checklist does not act for you.",
      sourceKeys: ["ura"],
    },
    {
      id: "business-tax-health-check",
      topic: "business",
      title: "What should a business include in a tax health check?",
      keywords: ["business tax health check compliance review VAT EFRIS PAYE withholding customs records reconciliations cross-border"],
      summary: "A useful internal review maps registrations and filing obligations, reconciles returns to accounting and payment records, samples evidence for material tax positions, and reviews VAT/EFRIS, payroll, withholding, customs and cross-border or related-party activity where relevant. A checklist cannot establish legal compliance or replace an independent tax review.",
      nextStep: "Use TaxComp's health-check prompts to record items ready for review, items needing follow-up and items that may not apply. Verify current obligations and deadlines against official URA information and your business facts.",
      sourceKeys: ["ura"],
    },
    {
      id: "international-residence-source",
      topic: "international",
      title: "How do tax residence and income source affect cross-border tax?",
      keywords: ["international cross-border tax residence residency source foreign income worldwide Uganda nonresident"],
      summary: "A cross-border review starts by determining each person's or entity's tax residence and the source of each income stream under the relevant countries' domestic laws. Citizenship, payment location or a mailing address alone may not settle residence or source. More than one country may assert taxing rights.",
      nextStep: "Map the tax year, countries, legal entity/person, workdays, contracts, income type and where activities or assets are located; verify each country's law and any applicable treaty.",
      sourceKeys: ["ura", "individual", "corporate"],
      calculator: "international",
    },
    {
      id: "international-treaties",
      topic: "international",
      title: "Can a tax treaty reduce withholding on a Uganda payment?",
      keywords: ["international tax treaty double taxation DTA agreement dividends interest royalties management fees technical services nonresident withholding beneficial ownership relief"],
      summary: "Do not apply a treaty rate just because the recipient is overseas. Confirm that an agreement is in force between the relevant countries for the payment date, that the income article covers the payment, and that residence, beneficial-ownership, anti-abuse and filing/documentation conditions are satisfied. TaxComp does not maintain a verified treaty-rate matrix or determine entitlement.",
      nextStep: "Obtain the current treaty text and residency evidence, classify the payment, check domestic law and procedural requirements, and retain the withholding certificate and proof of payment.",
      sourceKeys: ["ura", "withholding"],
      calculator: "international",
    },
    {
      id: "international-permanent-establishment",
      topic: "international",
      title: "Could overseas activity create a permanent establishment?",
      keywords: ["international permanent establishment PE branch fixed place construction project service dependent agent foreign company Uganda business profits"],
      summary: "An overseas enterprise may have registration, income-tax or profit-attribution exposure where it has sufficient local presence. Domestic permanent-establishment rules and an applicable treaty may differ; a project, office, staff member or agent should not be assessed using a day count alone.",
      nextStep: "Review locations, project duration, people and authority to conclude contracts, service delivery, premises, activity and the exact treaty article before deciding the filing position.",
      sourceKeys: ["ura", "corporate"],
      calculator: "international",
    },
    {
      id: "international-transfer-pricing",
      topic: "international",
      title: "What should a Uganda group review for transfer pricing?",
      keywords: ["international transfer pricing related party associated enterprise arm's length documentation intercompany services loans royalties goods APA"],
      summary: "Cross-border transactions between associated persons can require arm's-length pricing and supporting records. The transaction's substance, functions, assets and risks, comparable evidence, financing terms and local disclosure/documentation rules all matter. OECD guidance is a reference framework, not a substitute for Uganda's current law.",
      nextStep: "Identify related-party transactions and amounts, preserve agreements and evidence of services, and verify current Uganda documentation, filing and penalty requirements.",
      sourceKeys: ["ura", "corporate", "transferPricing"],
      calculator: "international",
    },
    {
      id: "international-foreign-tax-credit",
      topic: "international",
      title: "Can foreign tax paid be credited against Uganda tax?",
      keywords: ["international foreign income foreign tax credit double tax relief paid overseas proof credit limit exemption"],
      summary: "Foreign tax paid does not automatically create a Uganda credit. The taxpayer, foreign income, tax type, timing, evidence, treaty or domestic-law mechanism and any credit limitation must be checked. Relief methods can differ between countries and income categories.",
      nextStep: "Keep foreign assessments, payment receipts and income calculations, identify the matching Uganda income and tax year, and confirm the applicable relief rule before offsetting amounts.",
      sourceKeys: ["ura", "individual", "corporate"],
      calculator: "international",
    },
    {
      id: "international-employment",
      topic: "international",
      title: "What tax issues arise when staff work across borders?",
      keywords: ["international employment expatriate remote work employee payroll PAYE workdays economic employer treaty social security immigration"],
      summary: "Cross-border work can create payroll withholding, employee residence, employer registration, social-security and immigration questions in more than one country. Treaty employment provisions and short-term work relief are fact-specific and are not determined by citizenship or a simple travel-day count.",
      nextStep: "Track work locations and dates, employer and economic-employer facts, compensation and benefits, payroll withholding, social security coverage and immigration permissions.",
      sourceKeys: ["ura", "individual"],
      calculator: "international",
    },
    {
      id: "international-vat-services",
      topic: "international",
      title: "How should imported and digital services be reviewed for VAT?",
      keywords: ["international cross-border VAT imported services reverse charge nonresident digital services ecommerce platform place supply"],
      summary: "Cross-border services and digital supplies may trigger VAT registration, reverse-charge, collection, invoicing or recovery obligations. The result depends on the supplier, customer, place and use of the service, local rules and any registration regime; the ordinary goods-import calculator does not determine these service rules.",
      nextStep: "Describe the service and parties, identify where it is supplied and used, and check current URA requirements plus VAT rules in the supplier and customer countries.",
      sourceKeys: ["ura", "vat"],
      calculator: "international",
    },
    {
      id: "international-customs-trade",
      topic: "international",
      title: "What international customs and trade facts affect a shipment?",
      keywords: ["international customs EAC tariff import export HS code classification customs value origin preferential rules certificate goods"],
      summary: "Border taxes and preferences depend on correct product classification, customs value, origin, shipment evidence, current tariff schedules and destination-country requirements. A supplier's dispatch country is not necessarily the goods' country of origin, and a preferential rate requires the applicable origin rules and proof.",
      nextStep: "Confirm the HS code, valuation, origin and origin documents with URA or a licensed customs agent, and check both the export and import countries' current rules.",
      sourceKeys: ["ura", "eac"],
      calculator: "international",
    },
    {
      id: "international-groups-beps",
      topic: "international",
      title: "Which international group and BEPS rules should be screened?",
      keywords: ["international BEPS CFC controlled foreign company global minimum tax Pillar Two country by country reporting interest limitation hybrid arrangement multinational"],
      summary: "Multinational groups may need to screen controlled-foreign-company, interest-limitation, hybrid-mismatch, treaty anti-abuse, country-by-country reporting and global minimum-tax rules. Scope and implementation depend on the jurisdiction, group structure, revenue thresholds and effective date; OECD materials do not themselves establish a Uganda filing obligation.",
      nextStep: "Map the group and jurisdictions, identify applicable thresholds and effective periods, then check enacted local rules and filing obligations in every country involved.",
      sourceKeys: ["ura", "corporate", "beps"],
      calculator: "international",
    },
    {
      id: "international-records-disputes",
      topic: "international",
      title: "What records help with cross-border audits and disputes?",
      keywords: ["international tax audit records treaty mutual agreement procedure MAP exchange information objection foreign tax certificate residency"],
      summary: "Cross-border reviews may involve information exchange, audits in more than one country, foreign tax credits, treaty relief or competent-authority procedures. Deadlines and routes differ; a treaty mutual-agreement process does not replace domestic objection or appeal steps unless the relevant rules provide otherwise.",
      nextStep: "Keep contracts, invoices, residency certificates, workday logs, related-party support, customs records, foreign tax assessments and payment evidence; calendar local filing and objection dates.",
      sourceKeys: ["ura", "corporate"],
      calculator: "international",
    },
    {
      id: "individual-residence",
      topic: "individual",
      title: "Which income is in scope for a resident or non-resident individual?",
      keywords: ["residency resident nonresident non-resident foreign source worldwide income"],
      summary: "The general distinction is that a resident person is assessed on income from all geographical sources, while a non-resident person is generally assessed on Uganda-source income. Residence and source are legal tests; do not decide them from citizenship or a mailing address alone.",
      nextStep: "Establish tax residence, source, income type, treaty position and any exemption before applying the individual calculator.",
      sourceKeys: ["individual", "ura", "domesticTaxCompendium"],
      calculator: "individual",
    },
    {
      id: "individual-bands",
      topic: "individual",
      title: "How is individual income tax calculated?",
      keywords: ["individual personal income chargeable bands resident nonresident threshold rates"],
      summary: "The calculator applies progressive FY 2026/27 bands to chargeable income and distinguishes resident and non-resident individuals. The amount you enter should already reflect the correct income classification and only deductions you have established are allowable.",
      nextStep: "Review the band breakdown and confirm deductions, exemptions, reliefs, foreign income and treaty treatment against the current law.",
      sourceKeys: ["individual", "ura", "domesticTaxCompendium"],
      calculator: "individual",
    },
    {
      id: "employment-benefits",
      topic: "employment",
      title: "Which employment benefits can affect PAYE?",
      keywords: ["paye salary cash remuneration benefit allowance medical school fees house housing motor vehicle loan gifts spouse dependents gratuity overtime bonus terminal termination share scheme"],
      summary: "Employment income can include salary, allowances and the taxable value of benefits such as housing, a vehicle, a low-interest loan, school fees, domestic assistance and certain reimbursements or termination-related amounts. Statutory exceptions and valuation rules can apply. The PAYE tool asks for amounts you have assessed; it does not value benefits or decide that an item is taxable.",
      nextStep: "Use the benefit valuation rules and evidence for the relevant year. Keep payroll records and do not include an amount twice.",
      sourceKeys: ["individual", "ura", "domesticTaxCompendium"],
      calculator: "paye",
    },
    {
      id: "company-income",
      topic: "business",
      title: "How do I move from accounting profit to company chargeable income?",
      keywords: ["company corporate profit loss tax reconciliation addbacks disallowable deductions depreciation capital allowance assessed losses"],
      summary: "Start from accounting profit or loss, add back confirmed non-deductible amounts, remove exempt income included in profit where the law permits, and subtract confirmed allowable deductions and eligible loss relief. The calculator displays this reconciliation and applies the standard 30% company rate to positive chargeable income; special regimes and taxpayer-specific rules can change the result.",
      nextStep: "Use a tax reconciliation supported by accounts, schedules and records. Avoid duplicating adjustments in both itemized fields and grouped totals.",
      sourceKeys: ["corporate", "ura", "domesticTaxCompendium"],
      calculator: "company",
    },
    {
      id: "capital-allowances",
      topic: "business",
      title: "How is wear-and-tear depreciation calculated by asset class?",
      keywords: ["capital allowance depreciation wear tear industrial building tax asset class classes rate pool computer data handling farming manufacturing mining vehicles reducing balance"],
      summary: "The FY 2026/27 schedule applies reducing-balance rates to depreciable assets other than minor assets: Class 1 computers and data-handling equipment at 40%; Class 2 plant and machinery used in farming, manufacturing or mining at 30%; and Class 3 at 20% for automobiles, buses/minibuses, construction and earth-moving equipment, specialised trucks/tractors/trailers, rail equipment, vessels, aircraft, specialised public-utility equipment, office furniture/fixtures/equipment and assets not in another class. TaxComp calculates a class pool from the opening tax written-down value, qualifying additions and entered disposal proceeds, with business-use apportionment. Asset eligibility, balancing adjustments and special rules still require review.",
      nextStep: "Reconcile each class pool to prior-year closing tax value and supporting asset records. Confirm qualifying cost, business use, disposal treatment, minor-asset expensing and any industrial-building allowance against the current law.",
      sourceKeys: ["capitalAllowances", "ura", "domesticTaxCompendium"],
      calculator: "capital-allowances",
    },
    {
      id: "rental-individual",
      topic: "rental",
      title: "How is rental income taxed for a resident individual?",
      keywords: ["rental rent landlord individual resident gross threshold expenses deductions monthly filing"],
      summary: "The current individual rental estimate applies 12% to annual gross rental income above UGX 2,820,000 and does not deduct rental expenses. Secondary commentary on the 2026 amendment describes a monthly provisional return as an option for an individual required to pay rental tax, not a general mandatory monthly filing rule. This annual tool does not calculate provisional instalments.",
      nextStep: "Check the taxpayer's residence and rental circumstances, reconcile gross rent, and confirm the available filing route and any payment obligation with URA.",
      sourceKeys: ["individual", "ura", "amendments2026", "domesticTaxCompendium"],
      calculator: "rental",
    },
    {
      id: "rental-company",
      topic: "rental",
      title: "Can a resident company deduct rental-property expenses?",
      keywords: ["rental rent landlord company resident expenses deductions losses chargeable"],
      summary: "A resident company is generally assessed under the company income-tax rules, not the resident individual's special rental formula. The rental estimate applies the standard 30% rate after user-entered allowable expenses and eligible losses. It does not determine whether an expense is deductible or whether losses may be used.",
      nextStep: "Confirm the business purpose, supporting evidence, expense allocation, loss availability and any special property rules. Do not double count rental income or expenses in the company calculator.",
      sourceKeys: ["corporate", "ura", "domesticTaxCompendium"],
      calculator: "rental",
    },
    {
      id: "rental-nonresident",
      topic: "rental",
      title: "What if the landlord is a non-resident?",
      keywords: ["nonresident non-resident landlord rent rental withholding source gross 15 treaty section 83"],
      summary: "The standard domestic rule summarized for Uganda-source rent paid to a non-resident is 15% withholding on gross rent. The site estimates that gross-basis amount for both individual and company landlords; it does not calculate treaty relief, decide final-tax treatment in a specific case, or establish all filing duties.",
      nextStep: "Confirm the withholding agent, beneficial ownership, treaty eligibility, documentation and any filing obligation with URA or a qualified adviser.",
      sourceKeys: ["withholding", "ura", "domesticTaxCompendium"],
      calculator: "rental",
    },
    {
      id: "vat-threshold",
      topic: "vat",
      title: "When might VAT registration be required?",
      keywords: ["vat threshold registration annual quarterly 300 million 75 million taxable supplies remote electronic services"],
      summary: "The FY 2026/27 guide represents standard registration thresholds of UGX 300 million in annual taxable supplies or more than UGX 75 million in a three-month period. Special rules, including some remote-service cases, may apply independently. Meeting a threshold is a prompt to confirm registration with URA, not a registration decision by this site.",
      nextStep: "Review taxable supplies and the relevant periods, exemptions and special registration rules with URA.",
      sourceKeys: ["vat", "ura", "domesticTaxCompendium"],
      calculator: "vat",
    },
    {
      id: "vat-input-credits",
      topic: "vat",
      title: "Can I claim input VAT?",
      keywords: ["vat input credit claim efris invoice receipt exempt supplies six months"],
      summary: "Input VAT recovery depends on the purchase's business use, valid EFRIS evidence, timing, exempt-supply restrictions and other statutory conditions. The calculator applies only a simplified exempt-supply restriction and does not approve a claim.",
      nextStep: "Check each invoice, business purpose, claim period and restriction before filing a VAT return.",
      sourceKeys: ["vat", "ura", "domesticTaxCompendium"],
      calculator: "vat",
    },
    {
      id: "vat-changes",
      topic: "vat",
      title: "What VAT changes are represented for FY 2026/27?",
      keywords: ["2026 recent latest current amendment amendments VAT changes update efris withholding exemption nuclear energy threshold"],
      summary: "The guide reflects the FY 2026/27 VAT registration thresholds, EFRIS-related conditions for VAT withholding and input-credit evidence, and a targeted exemption for specified supplies to nuclear-energy contractors and subcontractors. Those targeted conditions are narrow; do not classify a supply as exempt based only on a sector label.",
      nextStep: "Check the transaction against the amended VAT law and current URA guidance before applying a rate or exemption.",
      sourceKeys: ["vat", "ura", "domesticTaxCompendium", "amendments2026"],
      calculator: "vat",
    },
    {
      id: "withholding-changes",
      topic: "withholding",
      title: "Which new withholding rules are represented from 1 July 2026?",
      keywords: ["recent latest current withholding wht tax 2026 changes amendment amendments entertainer betting gaming insurance agent debenture interest payout stake mobile money telecom commission"],
      summary: "The current guide represents 6% withholding on specified payments to public entertainers, 15% on betting/gaming winnings calculated on payout less stake (with a narrow national-lottery exclusion), 10% on specified telecommunications/mobile-network/mobile-money commissions, final-tax treatment for specified insurance-agent commission withholding, and a conditional 5% rate for qualifying non-resident debenture interest. Rates, commencement, payer scope, and exceptions must be checked against the Act; they are not universal sector rates.",
      nextStep: "Verify the payer and recipient, exact payment type, statutory conditions and exclusions, treaty position, effective date, and whether withholding is creditable or final.",
      sourceKeys: ["withholding", "ura", "domesticTaxCompendium", "amendments2026"],
      calculator: "withholding",
    },
    {
      id: "income-tax-amendments-2026",
      topic: "business",
      title: "What other Income Tax changes were reported in 2026?",
      keywords: ["recent latest current 2026 amendment amendments update income tax software royalty controlled transactions arm's length tourism hotel microfinance bad debt Bujagali"],
      summary: "Secondary commentary on the 2026 Income Tax amendment reports an express arm's-length requirement for controlled transactions, software being expressly included in the royalty definition, and targeted changes affecting qualifying hotel/tourism operations, specified microfinance bad-debt deductions and the Bujagali exemption. TaxComp does not determine eligibility or apply these reliefs automatically; the precise statutory wording, dates, and conditions control.",
      nextStep: "Review the enacted amendment and current URA guidance for the relevant provision, entity, transaction, effective date, evidence and any approval or election condition. Do not rely on a sector label alone.",
      sourceKeys: ["ura", "amendments2026"],
    },
    {
      id: "excise-amendments-2026",
      topic: "customs",
      title: "How should I use the 2026 excise amendments?",
      keywords: ["recent latest current 2026 excise duty amendment amendments update fuel cement sugar cooking oil plastics rates enacted"],
      summary: "Secondary commentary reports product-specific 2026 excise changes, including fuel, cement, sugar, cooking oil and plastics. Rates can differ from Bill-stage proposals and depend on product classification and commencement. The customs estimator deliberately uses user-entered rates rather than an unverified lookup.",
      nextStep: "Check the final schedule in the enacted Excise Duty (Amendment) Act and current URA tariff guidance for the precise product, unit, rate and effective date.",
      sourceKeys: ["ura", "amendments2026"],
      calculator: "customs",
    },
    {
      id: "wht-rent",
      topic: "withholding",
      title: "Does rent paid to a non-resident have withholding tax?",
      keywords: ["withholding rent nonresident landlord section 83 15% gross property"],
      summary: "A resident payer of Uganda-source rent to a non-resident landlord may have a withholding obligation. The standard domestic rate summarized is 15% of gross rent; treaty relief or other facts may affect the outcome.",
      nextStep: "Confirm the payer's withholding-agent status, treaty documents, payment date and reporting duties. The rental estimate is not a withholding return.",
      sourceKeys: ["withholding", "ura", "domesticTaxCompendium"],
      calculator: "rental",
    },
    {
      id: "presumptive",
      topic: "business",
      title: "Can a small business use presumptive tax?",
      keywords: ["presumptive small business turnover 150 million resident threshold schedule eligibility professional services"],
      summary: "The guide represents the general resident small-business turnover ceiling of UGX 150 million, subject to eligibility and exclusions. Presumptive tax uses statutory schedules; the calculator applies only the rate you enter and does not select the schedule or decide eligibility.",
      nextStep: "Confirm business activity, turnover, accounting records, exclusions and the applicable URA schedule before relying on an estimate.",
      sourceKeys: ["corporate", "ura", "domesticTaxCompendium"],
      calculator: "presumptive",
    },
    {
      id: "customs-import",
      topic: "customs",
      title: "What taxes may apply when importing goods into Uganda?",
      keywords: ["import customs goods duty excise vat withholding hs code origin tariff customs value eac"],
      summary: "Depending on the goods and facts, an import estimate may include customs duty, excise, import VAT, withholding and other assessed charges. Rates and tax bases depend on correct tariff classification, customs value, origin, exemptions and current EAC/URA treatment. TaxComp does not classify products or look up a tariff rate.",
      nextStep: "Use the official customs assessment or confirm HS code, origin and applicable charges with URA or a licensed customs agent.",
      sourceKeys: ["singleWindow", "eac", "ura", "domesticTaxCompendium"],
      calculator: "customs",
    },
    {
      id: "customs-export",
      topic: "customs",
      title: "What should I check before exporting goods?",
      keywords: ["export goods customs levy excise vat zero rated evidence origin destination"],
      summary: "Export treatment depends on the product, destination, evidence and current tariff. Zero-rated export VAT requires qualifying facts and evidence; export duties or levies apply only to specified goods. The calculator uses rates and charges you provide.",
      nextStep: "Confirm HS classification, origin, export documentation, levy and VAT treatment with URA or a licensed customs agent.",
      sourceKeys: ["singleWindow", "eac", "ura", "domesticTaxCompendium"],
      calculator: "customs",
    },
    {
      id: "filing-due-dates",
      topic: "individual",
      title: "Where can I confirm a tax filing deadline or respond to a URA notice?",
      keywords: ["deadline due date filing return payment penalty objection notice audit dispute appeal"],
      summary: "Deadlines and response periods depend on the tax type, taxpayer, return period, notice and current procedure rules. This guide deliberately does not guess due dates, penalty amounts or objection periods.",
      nextStep: "Read the notice and verify its issue date and response deadline immediately. Contact URA or a qualified tax professional promptly; keep the notice, returns, receipts and supporting records.",
      sourceKeys: ["ura", "domesticTaxCompendium"],
      calculator: null,
    },
  ];

  function searchGuidance(query = "", topic = "all") {
    const stopWords = new Set([
      "a", "an", "and", "are", "as", "at", "be", "can", "do", "does", "for",
      "from", "help", "how", "i", "in", "is", "it", "me", "my", "of", "on",
      "please", "the", "this", "to", "uganda", "what", "when", "where", "which",
      "who", "with", "you", "your", "on",
    ]);
    const aliases = {
      amendments: "amendment",
      amended: "amendment",
      changes: "change",
      deductions: "deduction",
      expenses: "expense",
      latest: "recent",
      laws: "law",
      records: "record",
      returns: "return",
      winnings: "winning",
    };
    let terms = (query.toLowerCase().match(/[a-z0-9]+/g) || [])
      .map((term) => aliases[term] || term)
      .filter((term) => term.length > 1 && !stopWords.has(term));
    if (terms.length > 1) {
      terms = terms.filter((term) => term !== "tax");
    }

    if (terms.length === 0) {
      return guidance.filter((item) => topic === "all" || item.topic === topic);
    }

    const ranked = guidance
      .filter((item) => topic === "all" || item.topic === topic)
      .map((item) => {
        const title = item.title.toLowerCase();
        const keywords = item.keywords.join(" ").toLowerCase();
        const body = `${item.summary} ${item.nextStep} ${item.topic}`.toLowerCase();
        const searchable = `${title} ${keywords} ${body}`;
        const matched = terms.filter((term) => searchable.includes(term));
        const score = terms.reduce((total, term) => (
          total + (title.includes(term) ? 4 : 0) +
            (keywords.includes(term) ? 2 : 0) +
            (body.includes(term) ? 1 : 0)
        ), 0);
        return { item, matched: new Set(matched).size, score };
      });
    const minimumMatches = terms.length > 2
      ? Math.max(2, Math.ceil(terms.length * 0.4))
      : 1;

    return ranked
      .filter((entry) => entry.matched >= minimumMatches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((entry) => entry.item);
  }

  function getSources(sourceKeys) {
    return sourceKeys.map((key) => sources[key]);
  }

  function searchTaxCases(query = "", topic = "all") {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return taxCases.filter((item) => {
      if (topic !== "all" && item.topic.toLowerCase() !== topic.toLowerCase()) return false;
      if (terms.length === 0) return true;

      const searchable = [
        item.name,
        item.citation,
        item.topic,
        item.keywords,
        item.issue,
        item.summary,
        item.significance,
      ].join(" ").toLowerCase();

      return terms.every((term) => searchable.includes(term));
    });
  }

  return {
    reviewedOn: "1 November 2026",
    guidance,
    getSources,
    searchGuidance,
    searchTaxCases,
    taxCases,
  };
});
