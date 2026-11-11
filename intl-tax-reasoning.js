// Guided international tax reasoning (Knowledge Centre and International tax page).
//
// Turns a plain-language question into facts, asks for the facts that are
// missing, then sets out the answer in TaxComp's standard order:
// understanding, short answer, rules, explanation, example, calculation,
// compliance actions, sources, assumptions and uncertainty.
//
// It separates international principles (general, from the conceptual
// framework) from domestic law (Uganda statutes in the law register) and
// from official guidance. It never states a tax rate or threshold: figures
// come only from the user, with the source of any rate they enter.
// Verified knowledge records are added when the reader is signed in.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.taxCompIntlReasoning = api;
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => api.initialize(root));
      else api.initialize(root);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Chapter titles from the book's own table of contents. Chapters only: no
  // page numbers and no text from the book are used anywhere in TaxComp.
  const PRIMER = {
    reference: "Brian J. Arnold, International Tax Primer, 4th ed. (Kluwer Law International, 2019)",
    use: "Used as a conceptual framework only. TaxComp's notes are its own words; the book is referred to by chapter.",
    chapters: [
      [1, "Introduction"], [2, "Jurisdiction to Tax"], [3, "Taxation of Residents"], [4, "Double Taxation Relief"], [5, "Taxation of Nonresidents"],
      [6, "Transfer Pricing"], [7, "Anti-avoidance Measures"], [8, "An Introduction to Tax Treaties"], [9, "Emerging Issues"],
    ],
  };

  // International layer. The ids match the knowledge records seeded in the
  // database (supabase/migrations/20261112000100_knowledge_base.sql).
  const TOPICS = [
    { id: "intl.introduction", label: "What international tax covers", chapters: [1], words: /\binternational tax\b/i },
    { id: "intl.residence-source", label: "Residence and source", chapters: [2], words: /\b(?:residen\w*|source)\b/i },
    { id: "intl.residence-individuals", label: "Residence of individuals", chapters: [2], words: /\b(?:days?|live|home|resident individual)\b/i },
    { id: "intl.residence-companies", label: "Residence of companies", chapters: [2], words: /\b(?:incorporat\w*|managed and controlled|company residence)\b/i },
    { id: "intl.worldwide-income", label: "Taxing residents on worldwide income", chapters: [3], words: /\bworldwide\b/i },
    { id: "intl.foreign-source-income", label: "Foreign-source income of residents", chapters: [3], words: /\b(?:foreign|abroad|overseas|outside uganda)\b/i },
    { id: "intl.nonresidents", label: "Taxing nonresidents", chapters: [5], words: /\bnon-?residents?\b/i },
    { id: "intl.double-taxation", label: "Why double taxation arises", chapters: [4], words: /\bdouble tax\w*/i },
    { id: "intl.foreign-tax-credit", label: "Foreign tax credit method", chapters: [4], words: /\b(?:tax credit|credit for foreign|foreign tax)\b/i },
    { id: "intl.exemption-method", label: "Exemption method", chapters: [4], words: /\bexemption method\b/i },
    { id: "intl.deduction-method", label: "Deduction method", chapters: [4], words: /\bdeduction method\b/i },
    { id: "intl.withholding", label: "Withholding taxes on cross-border payments", chapters: [5], words: /\b(?:withholding|withheld|wht)\b/i },
    { id: "intl.permanent-establishment", label: "Permanent establishment", chapters: [5, 8], words: /\b(?:permanent establishment|branch|office in)\b/i },
    { id: "intl.treaties", label: "Tax treaties", chapters: [8], words: /\b(?:treat(?:y|ies)|dta|double taxation agreement)\b/i },
    { id: "intl.treaty-interpretation", label: "Interpreting tax treaties", chapters: [8], words: /\binterpret\w*\b/i },
    { id: "intl.transfer-pricing", label: "Transfer pricing", chapters: [6], words: /\b(?:transfer pric\w*|related part\w*|associat\w*|intra-?group)\b/i },
    { id: "intl.arms-length", label: "The arm's length principle", chapters: [6], words: /\barm'?s[ -]length\b/i },
    { id: "intl.cfc", label: "Controlled foreign company rules", chapters: [7], words: /\b(?:cfc|controlled foreign)\b/i },
    { id: "intl.thin-capitalisation", label: "Thin capitalisation and interest limits", chapters: [7], words: /\b(?:thin cap\w*|interest limit\w*|debt to equity)\b/i },
    { id: "intl.beps", label: "Base erosion and profit shifting (BEPS)", chapters: [9], words: /\bbeps\b|\bprofit shifting\b/i },
    { id: "intl.hybrids", label: "Hybrid mismatch arrangements", chapters: [7, 9], words: /\bhybrid\w*/i },
    { id: "intl.digital", label: "Taxing the digital economy", chapters: [9], words: /\b(?:digital|online platform|app store|e-?commerce)\b/i },
    { id: "intl.planning-avoidance-evasion", label: "Tax planning, avoidance and evasion", chapters: [7], words: /\b(?:avoid\w*|evasion|evade|tax haven)\b/i },
  ];

  // Domestic layer, Uganda first. Statutes are those in TaxComp's law
  // register; null means the register has no entry yet.
  const DOMESTIC = {
    UG: [
      { category: "income-tax", label: "Income tax", statute: "Income Tax Act" },
      { category: "vat", label: "VAT", statute: "Value Added Tax Act" },
      { category: "paye", label: "PAYE", statute: "Income Tax Act" },
      { category: "withholding", label: "Withholding tax", statute: "Income Tax Act" },
      { category: "corporation-tax", label: "Corporation tax", statute: "Income Tax Act" },
      { category: "presumptive-tax", label: "Presumptive tax", statute: "Income Tax Act" },
      { category: "capital-gains", label: "Capital gains", statute: "Income Tax Act" },
      { category: "stamp-duty", label: "Stamp duty", statute: "Stamp Duty Act" },
      { category: "excise-duty", label: "Excise duty", statute: "Excise Duty Act" },
      { category: "customs", label: "Customs", statute: null },
      { category: "tax-administration", label: "Tax administration", statute: "Tax Procedures Code Act" },
      { category: "returns-filing", label: "Returns and filing", statute: "Tax Procedures Code Act" },
      { category: "registration-compliance", label: "Registration and compliance", statute: "Tax Procedures Code Act" },
      { category: "penalties-interest", label: "Penalties and interest", statute: "Tax Procedures Code Act" },
      { category: "objections-appeals", label: "Objections and appeals", statute: "Tax Procedures Code Act; Tax Appeals Tribunals Act" },
    ],
  };

  const HIERARCHY = [
    "Legislation and amendments",
    "Regulations and statutory instruments",
    "Court and tribunal decisions",
    "Official tax authority guidance",
    "Tax treaties",
    "International standards (OECD, UN)",
    "Textbooks and commentary",
    "General knowledge (lowest weight)",
  ];

  const LAYER = {
    principle: "International principle",
    domestic: "Uganda law (to confirm in the Act)",
    guidance: "Administrative guidance",
  };

  const COUNTRIES = ["Kenya", "Tanzania", "Rwanda", "Burundi", "South Sudan", "DRC", "Democratic Republic of Congo", "Ethiopia", "Somalia", "Zambia", "Nigeria", "Ghana",
    "South Africa", "Mauritius", "Egypt", "United Kingdom", "UK", "United States", "USA", "US", "Canada", "India", "China", "Japan", "United Arab Emirates", "UAE", "Dubai",
    "Netherlands", "Germany", "France", "Belgium", "Ireland", "Italy", "Norway", "Denmark", "Sweden", "Switzerland", "Australia", "Qatar", "Saudi Arabia"];
  const COUNTRY_ALIASES = { UK: "United Kingdom", US: "United States", USA: "United States", UAE: "United Arab Emirates", Dubai: "United Arab Emirates", DRC: "Democratic Republic of Congo" };

  const TRANSACTIONS = [
    ["employment", "Employment (salary, wages, bonus)", /\b(?:salary|salaries|wages?|employ\w*|bonus|payroll)\b/i],
    ["services", "Services or consulting fees", /\b(?:consult\w*|services?|freelanc\w*|fees?|management fee|technical fee|contract work)\b/i],
    ["dividend", "Dividends", /\bdividends?\b/i],
    ["interest", "Interest", /\binterest\b/i],
    ["royalty", "Royalties or licence fees", /\b(?:royalt\w*|licen[cs]e fees?)\b/i],
    ["rent", "Rent", /\b(?:rent|rental|lease)\b/i],
    ["pension", "Pension", /\bpension\b/i],
    ["capital-gain", "Sale of shares, land or other assets", /\b(?:sold|sale of|disposal|capital gain)\b/i],
    ["business", "Sales of goods or business profits", /\b(?:goods|export\w*|import\w*|sales|profits?|trading)\b/i],
    ["gift", "Gift or family support", /\b(?:gift|donation|family support|remittance)\b/i],
    ["other", "Something else", null],
  ];

  const QUESTIONS = {
    direction: { ask: "Did you receive money from another country, or pay money to someone in another country?", options: [["inbound", "I received it"], ["outbound", "I paid it"], ["other", "Neither: another cross-border question"]] },
    residence: { ask: "Where do you (or your business) live for tax purposes: where is your permanent home, or where is the business incorporated or managed?", options: [["UG", "Uganda"], ["other", "Another country"], ["both", "Both, or not sure"]] },
    taxpayer: { ask: "Who is this about?", options: [["individual", "An individual (me or another person)"], ["company", "A company"], ["other", "A partnership, trust or other body"]] },
    transaction: { ask: "What was the payment for?", options: TRANSACTIONS.map(([id, label]) => [id, label]) },
    country: { ask: "Which other country is involved?", text: true, placeholder: "e.g. Kenya" },
    period: { ask: "Which tax year? Uganda's income tax year for most taxpayers runs from 1 July to 30 June.", options: [["2026/27", "2026/27"], ["2025/26", "2025/26"], ["2024/25", "2024/25"], ["earlier", "Earlier"]] },
    regularity: { ask: "Is it a one-off payment or a regular one?", options: [["one-off", "One-off"], ["regular", "Regular"]] },
    foreignTax: { ask: "Was tax taken off the payment, or paid on it, in the other country?", options: [["yes", "Yes"], ["no", "No"], ["unknown", "I don't know"]] },
    presence: { ask: "Does the foreign party have an office, staff, agent or project in Uganda?", options: [["yes", "Yes"], ["no", "No"], ["unknown", "I don't know"]] },
    related: { ask: "Are the two parties related (same group, or one controls the other)?", options: [["yes", "Yes"], ["no", "No"], ["unknown", "I don't know"]] },
  };

  const INTERNATIONAL = /\b(?:abroad|overseas|foreign|outside uganda|from (?:a |an )?(?:company|client|employer|firm|person) (?:in|outside|abroad)|non-?residents?|treat(?:y|ies)|double tax\w*|transfer pric\w*|related part\w*|permanent establishment|cross[- ]border|offshore|expat\w*|diaspora|international|beps|cfc|controlled foreign|thin cap\w*|hybrid\w*|remit\w*|parent company|subsidiary)\b/i;
  const EVASION = /\b(?:hide|hiding|conceal\w*|not declar\w*|undeclared|without declaring|without telling (?:ura|the tax)|evade|evasion|fake invoices?|false invoices?|off the books|so ura (?:does not|doesn't|won't) (?:know|find))\b/i;
  const AVOIDANCE = /\b(?:avoid(?:ing)? (?:the |my |our )?tax|(?:reduce|lower|minimi[sz]e|cut) (?:the |my |our )?tax|pay less tax|shell compan\w*|treaty shopping|tax haven|low[- ]tax (?:country|jurisdiction))\b/i;

  function findCountry(text) {
    for (const name of COUNTRIES) {
      // Also matches the adjective: Kenyan, Tanzanian, South African.
      const pattern = new RegExp(`\\b${name.replace(/ /g, "\\s+")}${name.length <= 3 ? "" : "(?:n|an)?"}\\b`, name.length <= 3 ? "" : "i");
      if (pattern.test(text)) return COUNTRY_ALIASES[name] || name;
    }
    return null;
  }

  /** Reads what it can from the question. Unknown facts stay undefined. */
  function detectFacts(question) {
    const text = String(question || "");
    const facts = { question: text.trim() };
    facts.international = INTERNATIONAL.test(text) || Boolean(findCountry(text));
    if (/\b(?:we|our|us)\b/i.test(text) || /\bmy (?:business|company|firm)\b/i.test(text)) facts.taxpayer = "company";
    else if (/\b(?:i|my|me)\b/i.test(text)) facts.taxpayer = "individual";
    else if (/\b(?:company|ltd|limited|firm|subsidiary|branch)\b/i.test(text)) facts.taxpayer = "company";
    if (/\b(?:received?|receiving|earn\w*|got paid|paid me|was paid|sent me|get (?:my |a |the )?(?:salary|pay|payment|money|income))\b/i.test(text)) facts.direction = "inbound";
    else if (/\b(?:pay|pays|paying|paid|send|sends|sending|remit\w*)\b[^.]{0,60}?\bto (?:a |an |its |our |my |the |their )?(?:foreign|non-?resident|overseas|parent|supplier|consultant|company|firm|provider|someone|person|contractor|group)/i.test(text)
      || /\b(?:pay|pays|paying)\s+(?:a |an )?(?:foreign|non-?resident|overseas)\b/i.test(text)) facts.direction = "outbound";
    const nationalBody = /\b(?:kenyan|tanzanian|rwandan|burundian|congolese|ethiopian|nigerian|south african|british|american|canadian|indian|chinese|dutch|german|french|emirati) (?:company|firm|business|entity|group|parent)\b/i;
    if (/\b(?:i live in uganda|resident in uganda|based in uganda|ugandan (?:company|resident|business|firm|entity|consultant|individual|employee)|registered in uganda|uganda resident|(?:live|living|based|work\w*)(?: remotely)? (?:in|from) (?:uganda|kampala|entebbe|jinja|gulu|mbarara))\b/i.test(text)
      || /\b(?:i am|i'm|we are|we're)\b[^.;,]{0,40}\b(?:in|from) (?:uganda|kampala|entebbe|jinja|gulu|mbarara)\b/i.test(text)) facts.residence = "UG";
    else if ((/\b(?:i live (?:in|abroad)|non-?resident)\b/i.test(text) && !/\blive in uganda\b/i.test(text)) || /^\s*(?:we are|i am|i'm|we're) an? /i.test(text) && nationalBody.test(text)) facts.residence = "other";
    const country = findCountry(text.replace(/\buganda\b/gi, ""));
    if (country) facts.country = country;
    for (const [id, , pattern] of TRANSACTIONS) {
      if (pattern && pattern.test(text)) { facts.transaction = id; break; }
    }
    const fy = text.match(/\b(20\d{2})\s*\/\s*(\d{2})\b/);
    if (fy) facts.period = `${fy[1]}/${fy[2]}`;
    if (/\b(?:tax (?:was )?(?:deducted|withheld|taken off|paid) (?:there|abroad|in)|foreign tax (?:was )?paid|paid tax (?:there|abroad|in))\b/i.test(text)) facts.foreignTax = "yes";
    if (/\b(?:related|parent company|subsidiary|sister company|same group|our group)\b/i.test(text)) facts.related = "yes";
    facts.conduct = EVASION.test(text) ? "evasion" : AVOIDANCE.test(text) ? "avoidance" : "planning";
    return facts;
  }

  /** The facts still needed, in the order a person would be asked them. */
  function requiredFacts(facts) {
    const needed = ["direction", "residence", "taxpayer", "transaction", "country", "period"];
    if (facts.direction === "inbound" && facts.residence !== "other") needed.push("regularity", "foreignTax");
    if (["services", "business"].includes(facts.transaction) && (facts.direction === "outbound" || facts.residence === "other")) needed.push("presence");
    if (facts.taxpayer === "company" && facts.direction !== "other") needed.push("related");
    return needed;
  }

  function nextQuestions(facts) {
    return requiredFacts(facts).filter((key) => !facts[key]).map((key) => ({ id: key, ...QUESTIONS[key] }));
  }

  function transactionLabel(id) {
    const found = TRANSACTIONS.find(([key]) => key === id);
    return found ? found[1].toLowerCase() : "payment";
  }

  function topic(id) {
    const found = TOPICS.find((t) => t.id === id);
    return { id, label: found.label, chapters: found.chapters };
  }

  function chapterRef(chapters) {
    return chapters.map((n) => `Chapter ${n}: ${PRIMER.chapters[n - 1][1]}`).join("; ");
  }

  /** Which situation the facts describe. */
  function scenario(facts) {
    if (facts.residence === "both") return "dual";
    if (facts.direction === "outbound") return "outbound";
    if (facts.residence === "other") return "nonresident";
    if (facts.direction === "other") return "general";
    return "resident-inbound";
  }

  /**
   * Builds the full answer. `records` are verified knowledge records from the
   * Worker (optional); they are listed first among the sources because the
   * source hierarchy puts verified law above the framework notes.
   */
  function lawIndexApi() {
    if (typeof module === "object" && module.exports && typeof require === "function") return require("./law-index.js");
    return (typeof globalThis !== "undefined" && globalThis.taxCompLawIndex) || null;
  }

  // Sections to cite, by heading as printed in law-index.json.
  const REFS = {
    residence: [["ita", /^Resident individual$/], ["ita", /^Resident company$/], ["ita", /^Non-resident person$/]],
    source: [["ita", /^Source of income$/], ["ita", /^Exempt income$/]],
    foreignEmployment: [["ita", /^Foreign source employment income$/]],
    foreignTaxCredit: [["ita", /^Foreign tax credit$/]],
    treaties: [["ita", /^International agreements$/]],
    returns: [["ita", /^Furnishing of return of income$/], ["tpca", /^Furnishing of tax returns$/]],
    provisional: [["ita", /^Payment of provisional tax$/]],
    nonresidentPayments: [["ita", /^Tax on international payments$/], ["ita", /^International payments$/]],
    contractors: [["ita", /^Tax on payments to non-resident contractors or professionals$/], ["ita", /^Non-resident services contract$/]],
    digital: [["ita", /^Taxation of non-residents providing digital services$/]],
    permanentEstablishment: [["ita", /^Permanent establishment$/], ["ita", /^Calculation of chargeable income of permanent establishment$/], ["ita", /^Taxation of permanent establishment/]],
    importedServices: [["vata", /^Person liable to pay tax$/], ["vata", /^Place of supply of services$/]],
    transferPricing: [["ita", /^Transactions between associates$/], ["ita-reg-transfer-pricing-2011", /^(?:Consistency with arm.s length principles|Documentation)$/]],
    registration: [["tpca", /^Registration$/]],
    antiAvoidance: [["ita", /^Re-characterisation of income and deductions$/], ["ita", /^Transactions between associates$/]],
  };

  function analyse(facts, records = [], lawIndex = null) {
    const kind = scenario(facts);
    const other = facts.country || "the other country";
    const what = transactionLabel(facts.transaction);
    const period = facts.period && facts.period !== "earlier" ? facts.period : "the tax year concerned";
    const topics = new Set(["intl.residence-source"]);
    const rules = [];
    const domestic = [];
    const compliance = [];
    const assumptions = [];
    const uncertainty = [];
    const reliefs = [];
    let shortAnswer = "";
    let explanation = "";
    let calculation = null;

    const principle = (topicId, text) => { topics.add(topicId); rules.push({ layer: LAYER.principle, text, topic: topic(topicId) }); };
    const citations = [];
    const law = (category, text, refs = []) => {
      const entry = DOMESTIC.UG.find((d) => d.category === category);
      domestic.push(entry);
      const cited = lawIndex && refs.length ? lawIndexApi()?.cite(lawIndex, refs) : "";
      if (cited) citations.push(cited);
      rules.push({
        layer: LAYER.domestic,
        text: cited ? `${text} See ${cited}.` : entry.statute ? `${text} See the ${entry.statute}.` : `${text} TaxComp's law register has no entry for this yet.`,
      });
    };

    if (kind === "resident-inbound") {
      shortAnswer = `If you are resident in Uganda, this ${what} from ${other} may be taxable in Uganda as well as in ${other}. Whether it is, and what relief you get for any tax paid in ${other}, depends on Uganda's rules on foreign income and foreign tax credits, and on whether a Uganda–${other} tax treaty applies for ${period}.`;
      principle("intl.worldwide-income", "Countries that tax on residence often tax residents on income from everywhere, not only home income.");
      principle("intl.foreign-source-income", `Income paid from ${other} is usually foreign-source income for a Uganda resident; where it is sourced depends on the type of income (for employment, usually where the work is physically done).`);
      if (facts.foreignTax === "yes") {
        principle("intl.foreign-tax-credit", "Where both countries tax the same income, the residence country usually gives relief, most often a credit for the foreign tax limited to its own tax on that income.");
        reliefs.push("Foreign tax credit (or exemption) for the tax paid abroad, if the Income Tax Act allows it for this income");
        calculation = "foreignTaxCredit";
      } else {
        principle("intl.double-taxation", "If no tax was paid abroad there is no double taxation to relieve, but the income may still be taxable at home.");
        calculation = "taxableIncome";
      }
      principle("intl.treaties", `A Uganda–${other} tax treaty, if one is in force for the period, may limit which country taxes this income.`);
      law("income-tax", "Whether a Uganda resident is taxed on this foreign income, and any exemption for it, is set by the residence, source and exemption provisions.", [...REFS.residence.slice(0, 2), ...REFS.source, ...(facts.transaction === "employment" ? REFS.foreignEmployment : [])]);
      if (facts.foreignTax === "yes") law("income-tax", "Relief for tax paid abroad is given by the foreign tax credit provision, within its limits.", REFS.foreignTaxCredit);
      law("income-tax", "A treaty takes effect in Uganda through the Act's provision on international agreements.", REFS.treaties);
      law("returns-filing", "The income and any relief claimed are reported in the return of income for the year.", [...REFS.returns, ...(facts.regularity === "regular" ? REFS.provisional : [])]);
      compliance.push(`Keep the contract or payslips, bank records showing the money arriving, and any certificate or receipt for tax paid in ${other}.`);
      compliance.push(`Include the income in your Uganda return of income for ${period}, and claim any foreign tax credit there if the law allows it.`);
      compliance.push(`Check URA's list of tax treaties in force to see whether Uganda has an effective treaty with ${other}.`);
      if (facts.regularity === "regular") compliance.push("Regular foreign income may mean you need to make provisional (estimated) tax payments; check the Act and URA's guidance.");
      explanation = `Uganda, like many countries, can tax its residents on what they earn abroad, and ${other} may also tax it because it arose there. The law in each country decides the first question; treaties and foreign tax credits stop the same income being fully taxed twice.`;
    } else if (kind === "outbound") {
      shortAnswer = `A payment from Uganda to a nonresident in ${other} for ${what} may require the payer to withhold Uganda tax and pay it to URA, unless the law exempts it or a Uganda–${other} treaty reduces it.${["services", "business"].includes(facts.transaction) ? ` If the payee has a permanent establishment in Uganda (${facts.presence === "yes" ? "you said it has a presence here" : "check its presence here"}), its profits here may be taxed by assessment instead.` : ""}`;
      principle("intl.nonresidents", "A country generally taxes nonresidents only on income sourced in that country.");
      principle("intl.withholding", "Tax on payments to nonresidents is often collected by the payer withholding it from the payment.");
      law("withholding", "Which payments to nonresidents need withholding, the rate and the deadline for paying it to URA are set by the Act.", [...REFS.nonresidentPayments, ...(facts.transaction === "services" ? REFS.contractors : []), ...(/\b(?:digital|software|subscription|online)\b/i.test(facts.question || "") ? REFS.digital : [])]);
      if (["services", "business"].includes(facts.transaction)) {
        principle("intl.permanent-establishment", "Business profits of a nonresident are usually taxable in the source country only through a permanent establishment there.");
        law("income-tax", "When a nonresident has a permanent establishment in Uganda, and how its income is worked out, is set by the Act.", REFS.permanentEstablishment);
      }
      if (["services", "royalty"].includes(facts.transaction) || /\b(?:digital|software|subscription|online)\b/i.test(facts.question || "")) {
        law("vat", "Services imported from abroad may give rise to VAT for the Uganda recipient (often called reverse charge); check whether and how it applies.", REFS.importedServices);
      }
      principle("intl.treaties", `A Uganda–${other} treaty, if in force, may lower the withholding rate; the payee usually must be the beneficial owner and prove residence.`);
      reliefs.push("Treaty-reduced withholding, if a treaty is in force and its conditions are met", "Any exemption in the Act for this kind of payment");
      compliance.push("Before paying, confirm the payee's country of residence and get its tax residence certificate if you will rely on a treaty.");
      compliance.push("Withhold the correct amount, file the withholding return and pay URA by the due date; give the payee a withholding tax certificate.");
      compliance.push("Keep the contract, invoices and proof of payment.");
      calculation = "withholdingGrossUp";
      explanation = `When money leaves Uganda for someone who is not resident here, Uganda often cannot reach that person later, so the law may make the payer collect the tax at the moment of payment.`;
    } else if (kind === "nonresident") {
      const business = ["services", "business"].includes(facts.transaction) || /\b(?:project|office|branch|staff|site)\b/i.test(facts.question || "");
      shortAnswer = `As a nonresident, you are generally taxed in Uganda only on income from Ugandan sources. This ${what} may be taxed in Uganda (often by withholding at payment), and your home country may tax it too, with relief there.${business ? " If you have a fixed place of business, staff or a long project in Uganda, you may have a permanent establishment here, and its profits may be taxed in Uganda by assessment." : ""}`;
      principle("intl.nonresidents", "Nonresidents are usually taxed only on income sourced in the country.");
      principle("intl.withholding", "Tax on payments to nonresidents is often collected by withholding.");
      if (business) {
        principle("intl.permanent-establishment", "A fixed place of business, a dependent agent or a long project can create a permanent establishment; treaties often set a minimum duration for projects.");
        law("income-tax", "Whether there is a permanent establishment, and how its income is worked out, is set by the Act.", REFS.permanentEstablishment);
        law("registration-compliance", "A business with a taxable presence in Uganda may need to register with URA and file returns.", REFS.registration);
        compliance.push("Count how long the project or presence in Uganda lasts, and check the time limit in any treaty with your country.");
      }
      principle("intl.double-taxation", "Your country of residence usually gives the relief for tax paid at source.");
      law("withholding", "Withholding on payments to nonresidents is set by the Act.", [["ita", /^Non-resident person$/], ...REFS.nonresidentPayments, ...(facts.transaction === "services" ? REFS.contractors : [])]);
      compliance.push("Keep the withholding tax certificate from the Ugandan payer as proof of tax paid in Uganda.", "Claim relief in your home country's return as its law allows.");
      calculation = "withholdingGrossUp";
      explanation = "The country where income arises usually gets the first chance to tax it; the country where you live then decides how much relief to give.";
    } else if (kind === "dual") {
      shortAnswer = `Your tax position depends first on where you are resident. Uganda and ${other} each apply their own residence test, so you could be resident in both; a treaty, if one applies, has tie-breaker rules to settle it.`;
      principle("intl.residence-individuals", "Residence tests look at facts such as a permanent home, days present and where personal and economic ties are strongest.");
      principle("intl.residence-companies", "A company may be resident where it is incorporated or where it is managed and controlled.");
      principle("intl.treaties", "Treaties contain tie-breaker rules for persons resident in both countries.");
      law("income-tax", "Uganda's residence tests for individuals and companies are in the Act.", REFS.residence);
      law("income-tax", "Treaty tie-breakers apply in Uganda through the Act's provision on international agreements.", REFS.treaties);
      compliance.push("Record days spent in each country, where your home and family are, and where the business is managed.");
      uncertainty.push("Residence must be settled before the rest of the answer can be relied on.");
      explanation = "Residence is the gateway question in international tax: it decides whether a country taxes all your income or only what arises there.";
    } else {
      const matched = TOPICS.filter((t) => t.words.test(facts.question || "")).slice(0, 4);
      for (const t of matched.length ? matched : [TOPICS[0]]) principle(t.id, `This question concerns ${t.label.toLowerCase()}; see the concept note.`);
      law("income-tax", "The domestic rules that apply are in the Act.");
      shortAnswer = "This is a general international tax question. The concept notes below explain the principle; how Uganda applies it is set by the law listed.";
      explanation = "International principles describe how countries usually approach a problem; each country's own law decides the result.";
      if (topics.has("intl.transfer-pricing") || topics.has("intl.arms-length")) calculation = "transferPricingAdjustment";
    }

    if (facts.related === "yes" && kind !== "general") {
      principle("intl.transfer-pricing", "Prices between related parties may be adjusted to what independent parties would have agreed (the arm's length principle).");
      law("income-tax", "Uganda's transfer pricing rules for transactions between associates are in the Act and its regulations.", REFS.transferPricing);
      compliance.push("Keep transfer pricing documentation showing how the price was set and why it is arm's length.");
      calculation = calculation || "transferPricingAdjustment";
    }

    let conduct = null;
    if (facts.conduct === "evasion") {
      topics.add("intl.planning-avoidance-evasion");
      conduct = { kind: "evasion", text: "What you describe may be tax evasion: hiding income or giving false information to avoid tax that is due. It is illegal, and TaxComp will not help with it. If income has not been declared, speak to a tax adviser about correcting your position with URA." };
      shortAnswer = conduct.text;
    } else if (facts.conduct === "avoidance") {
      topics.add("intl.planning-avoidance-evasion");
      law("income-tax", "The Act lets the Commissioner General re-characterise arrangements and adjust transactions between associates.", REFS.antiAvoidance);
      conduct = { kind: "avoidance", text: "Arranging your affairs lawfully is tax planning. Arrangements whose main purpose is a tax result the law did not intend are tax avoidance, and anti-avoidance rules can cancel the benefit. TaxComp explains the rules and compares options; it does not design avoidance schemes." };
    }

    // Facts we were not told are assumptions; say so.
    if (!facts.country) assumptions.push("The other country was not given; treaty and foreign rules were not considered.");
    if (!facts.period || facts.period === "earlier") assumptions.push("The tax year was not given (or is earlier than 2024/25); the law for that period may differ.");
    if (!facts.transaction || facts.transaction === "other") assumptions.push("The type of payment was not clear; different income types follow different rules.");
    if (facts.foreignTax === "unknown") assumptions.push("It is not known whether foreign tax was paid; relief depends on proof of it.");
    if (facts.presence === "unknown") assumptions.push("It is not known whether the foreign party has a presence in Uganda (permanent establishment).");
    uncertainty.push("No rate or threshold is given here: TaxComp does not state rates it has not verified for the period. Use the calculator with the rate from the Act, treaty or URA notice.");
    uncertainty.push("Treaty status and the exact Uganda provisions must be confirmed for the period; the register's chapter numbers and links are still being verified.");
    if (citations.length) uncertainty.push("Section numbers and headings are from the 2024 revised edition as at FY 2024/25 and have not yet been checked against the official edition; amendments since then may have changed them.");
    if (!records.length) uncertainty.push("No reviewed knowledge record was available for this answer; the concept notes are general principles, not Uganda law.");

    const sources = [];
    for (const r of records) sources.push({ kind: "verified", label: r.title, ref: r.sourceReference, url: r.sourceUrl || null, reviewed: r.lastReviewed || null });
    for (const entry of domestic.filter((d, i, all) => d.statute && all.indexOf(d) === i)) sources.push({ kind: "legislation", label: `${entry.statute} (Uganda)`, ref: `Topic: ${entry.label}`, url: "https://ulii.org/en/legislation/" });
    const reviewedIds = new Set(records.map((r) => r.id));
    for (const id of topics) {
      if (reviewedIds.has(id)) continue; // already listed as a reviewed record
      const t = topic(id);
      sources.push({ kind: "framework", label: t.label, ref: `Concept reference: ${PRIMER.reference}, ${chapterRef(t.chapters)}` });
    }

    const steps = [
      ["Subject", kind === "outbound" ? "Withholding on a cross-border payment" : kind === "general" ? "International tax concept" : "Income tax on cross-border income"],
      ["Countries", ["Uganda", facts.country].filter(Boolean).join(" and ") || "Uganda"],
      ["Taxpayer", facts.taxpayer || "Not stated"],
      ["Transaction", facts.transaction ? transactionLabel(facts.transaction) : "Not stated"],
      ["Applicable law", [...new Set(domestic.map((d) => d.statute).filter(Boolean))].join("; ") || "Not identified"],
      ["Tax period", facts.period || "Not stated"],
      ["Knowledge used", `${records.length} reviewed record${records.length === 1 ? "" : "s"}; ${topics.size} concept note${topics.size === 1 ? "" : "s"}`],
      ["Exemptions and reliefs to check", reliefs.join("; ") || "None identified from the facts given"],
      ["Calculation", calculation ? "Available: enter the figures and the rate with its source" : "Not needed for this question"],
      ["Explanation", "Given in plain language below"],
      ["Sources", `${sources.length} listed, strongest authority first`],
      ["Uncertainty", `${uncertainty.length + assumptions.length} point${uncertainty.length + assumptions.length === 1 ? "" : "s"} to confirm`],
    ].map(([name, result], index) => ({ n: index + 1, name, result }));

    const understanding = [
      facts.taxpayer ? `You are asking about ${facts.taxpayer === "company" ? "a company" : facts.taxpayer === "individual" ? "an individual" : "a partnership, trust or other body"}` : "You are asking",
      facts.residence === "UG" ? "resident in Uganda" : facts.residence === "other" ? "not resident in Uganda" : facts.residence === "both" ? "whose residence is unclear" : "",
      facts.direction === "inbound" ? `who received ${what}${facts.country ? ` from ${facts.country}` : " from abroad"}` : facts.direction === "outbound" ? `who paid ${what}${facts.country ? ` to someone in ${facts.country}` : " to someone abroad"}` : "with a cross-border question",
      facts.period ? `in ${facts.period}` : "",
    ].filter(Boolean).join(", ") + ".";

    const example = calculation === "foreignTaxCredit"
      ? "Example with letters, not real rates: foreign income F was taxed abroad by T. Uganda's tax on F is U (F times the Uganda rate that applies). Under a credit, you pay U minus the lesser of T and U, so if T is bigger than U, nothing more is due in Uganda and the excess T is not refunded."
      : calculation === "withholdingGrossUp"
        ? "Example with letters: a payment of P with a withholding rate r means the payer sends P × r to URA and P × (1 − r) to the payee. If the contract says the payee must receive P in full, the payer must pay P ÷ (1 − r) gross."
        : calculation === "transferPricingAdjustment"
          ? "Example with letters: a Ugandan company sells goods to its parent at price A while independent buyers pay B. If A is less than B, Uganda's tax authority may increase taxable income by (B − A) × the quantity sold."
          : "";

    return {
      level: facts.direction === "other" && !facts.country ? "short" : "full",
      scenario: kind,
      understanding,
      shortAnswer,
      rules,
      explanation,
      example,
      calculation,
      compliance,
      sources,
      assumptions,
      uncertainty,
      conduct,
      steps,
      hierarchy: HIERARCHY,
    };
  }

  // ------------------------------------------------------------------ page
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function list(items, tag = "ul") {
    return el(tag, {}, items.map((item) => el("li", { text: item })));
  }

  function renderAnswer(container, answer, { onCalculate } = {}) {
    const sections = [];
    const section = (title, ...content) => sections.push(el("section", { className: "intl-answer-part" }, [el("h4", { text: title }), ...content]));
    section("What we understood", el("p", { text: answer.understanding }));
    section("Short answer", el("p", { className: answer.conduct?.kind === "evasion" ? "intl-answer-warning" : "intl-answer-lead", text: answer.shortAnswer }));
    if (answer.conduct?.kind !== "evasion") {
      if (answer.conduct) section("Planning, avoidance or evasion", el("p", { text: answer.conduct.text }));
      section("The rules", el("ul", { className: "intl-rules" }, answer.rules.map((rule) => el("li", {}, [
        el("span", { className: `intl-layer ${rule.layer === LAYER.principle ? "is-principle" : "is-domestic"}`, text: rule.layer }), " ", rule.text,
      ]))));
      section("In plain terms", el("p", { text: answer.explanation }));
      if (answer.example) section("Example", el("p", { text: answer.example }));
      if (answer.calculation) {
        const button = el("button", { type: "button", className: "btn btn-small btn-secondary", text: "Work out my figures" });
        button.addEventListener("click", () => onCalculate && onCalculate(answer.calculation));
        section("Calculation", el("p", { text: "Enter your own figures and the rate from the Act, treaty or URA notice. The working is shown step by step." }), button);
      }
      if (answer.level === "full") section("What to do", list(answer.compliance, "ol"));
    }
    section("Sources (strongest authority first)", el("ul", { className: "intl-sources" }, answer.sources.map((s) => el("li", {}, [
      el("span", { className: `intl-source-kind is-${s.kind}`, text: s.kind === "verified" ? "Reviewed" : s.kind === "legislation" ? "Law" : "Concept" }), " ",
      s.url ? el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.label }) : s.label,
      el("span", { className: "intl-muted", text: ` · ${s.ref}${s.reviewed ? ` · last reviewed ${String(s.reviewed).slice(0, 10)}` : ""}` }),
    ]))));
    section("Assumptions and what is uncertain", list([...answer.assumptions, ...answer.uncertainty]));
    const trace = el("details", { className: "intl-steps" }, [el("summary", { text: "How TaxComp reasoned (12 steps)" }), el("ol", {}, answer.steps.map((s) => el("li", {}, [el("strong", { text: `${s.name}: ` }), s.result])))]);
    container.replaceChildren(...sections, trace);
    container.hidden = false;
  }

  function renderFramework(container) {
    const rows = PRIMER.chapters.map(([n, title]) => {
      const inChapter = TOPICS.filter((t) => t.chapters.includes(n)).map((t) => t.label);
      return el("li", {}, [el("strong", { text: `Chapter ${n}: ${title}` }), inChapter.length ? el("span", { className: "intl-muted", text: ` · ${inChapter.join(", ")}` }) : null]);
    });
    const domestic = DOMESTIC.UG.map((d) => el("li", {}, [el("strong", { text: d.label }), el("span", { className: "intl-muted", text: ` · ${d.statute || "not yet in TaxComp's law register"}` })]));
    container.replaceChildren(
      el("p", { text: `International principles follow the chapters of ${PRIMER.reference}. ${PRIMER.use}` }),
      el("ol", { className: "intl-framework-list" }, rows),
      el("h4", { text: "Uganda: domestic law by tax" }),
      el("ul", { className: "intl-framework-list" }, domestic),
      el("h4", { text: "Order of authority" }),
      el("ol", {}, HIERARCHY.map((h) => el("li", { text: h }))),
    );
  }

  async function verifiedRecords(root, question) {
    const account = root.TaxCompAccount;
    if (!account || typeof account.getAccessToken !== "function") return [];
    try {
      const token = await account.getAccessToken();
      if (!token) return [];
      const meta = document.querySelector('meta[name="taxcomp-chat-endpoint"]');
      const base = meta ? new URL(meta.content, location.href).origin : "";
      const url = `${base}/api/challenge/knowledge?country=UG&q=${encodeURIComponent(question.slice(0, 300))}&onDate=${new Date().toISOString().slice(0, 10)}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results || []).filter((r) => r.status === "verified" && r.current).slice(0, 6);
    } catch {
      return [];
    }
  }

  function initialize(root) {
    const form = document.querySelector("#intl-guide-form");
    const framework = document.querySelector("#intl-framework");
    if (framework) renderFramework(framework);
    if (!form) return;
    const textarea = form.querySelector("#intl-guide-question");
    const questionsBox = form.querySelector("#intl-guide-questions");
    const answerBox = document.querySelector("#intl-guide-answer");
    const submit = form.querySelector("button[type=submit]");
    let facts = null;

    const onCalculate = (method) => {
      const select = document.querySelector("#international-tax-method");
      if (!select || ![...select.options].some((o) => o.value === method)) return;
      select.value = method;
      select.dispatchEvent(new Event("change"));
      document.querySelector("#international-tax-form")?.scrollIntoView({ block: "start" });
      document.querySelector("#international-tax-fields input")?.focus({ preventScroll: true });
    };

    const askMissing = () => {
      const missing = nextQuestions(facts);
      questionsBox.replaceChildren(...missing.map((q) => {
        const id = `intl-q-${q.id}`;
        const control = q.text
          ? el("input", { id, name: q.id, type: "text", placeholder: q.placeholder || "", autocomplete: "off" })
          : el("select", { id, name: q.id }, [el("option", { value: "", text: "Choose…" }), ...q.options.map(([value, label]) => el("option", { value, text: label }))]);
        return el("div", { className: "field" }, [el("label", { for: id, text: q.ask }), control]);
      }));
      submit.textContent = missing.length ? "Continue" : "Show the answer";
      return missing;
    };

    textarea.addEventListener("input", () => { facts = null; questionsBox.replaceChildren(); answerBox.hidden = true; submit.textContent = "Continue"; });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const question = textarea.value.trim();
      if (!question) { textarea.focus(); return; }
      if (!facts) {
        facts = detectFacts(question);
        if (askMissing().length) return;
      } else {
        for (const control of questionsBox.querySelectorAll("select, input")) {
          if (control.value.trim()) facts[control.name] = control.name === "country" ? control.value.trim().slice(0, 60) : control.value;
        }
        if (askMissing().length && questionsBox.querySelector("select, input")) {
          const unanswered = [...questionsBox.querySelectorAll("select, input")].find((c) => !c.value.trim());
          if (unanswered) { unanswered.focus(); return; }
        }
      }
      submit.disabled = true;
      try {
        const [records, lawIndex] = await Promise.all([verifiedRecords(root, question), root.taxCompLawIndex ? root.taxCompLawIndex.load() : null]);
        renderAnswer(answerBox, analyse(facts, records, lawIndex), { onCalculate });
        answerBox.querySelector("h4")?.scrollIntoView({ block: "nearest" });
      } finally {
        submit.disabled = false;
      }
    });
  }

  return { PRIMER, TOPICS, DOMESTIC, HIERARCHY, QUESTIONS, detectFacts, nextQuestions, analyse, initialize };
});
