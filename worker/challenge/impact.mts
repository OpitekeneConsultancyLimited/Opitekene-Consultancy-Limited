// Tax Impact Assessment engine.
//
// Turns a situation described in ordinary language into: the facts still
// needed, the applicable law (from the legislative database and the 2026
// amendments register, each with its legal status), a deterministic
// calculation by TaxComp's own calculators (never by a language model), the
// position before and after the amendment (and under both figures where the
// Bill and the reported Act differ), compliance actions, and plain and
// professional explanations built from the same evidence.
//
// The calculator (tax-calculator.js) is passed in by the caller, so this
// module stays pure and testable.
import type { Database } from "./store.mts";
import { amendmentFigures, listAmendments, type AmendmentRecord } from "./legislation.mts";

// ------------------------------------------------------------------ calculator contract
interface Band { label: string; rate: number; tax: number }
export interface Calculator {
  comparePayeAcrossFinancialYears(monthly: number, isResident?: boolean): Array<{ financialYear: string; monthlyTax: number; breakdown: Band[]; marginalRate: number; taxRuleSet: { approvalStatus: string } }>;
  calculateVat(input: { standardRatedSales: number; annualTaxableTurnover?: number; threeMonthTaxableTurnover?: number }): { registrationRequired: boolean; taxRuleSet: { approvalStatus: string } };
  calculateWithholdingTax(gross: number, paymentType: string, isDesignatedPayer?: boolean, supplierIssuedInvoice?: boolean, stake?: number, isNationalLottery?: boolean): { tax: number; rate: number; taxBase: number; paymentLabel: string; note: string; breakdown: Array<{ label: string; rate: number | null; amount: number }> };
}

export class ImpactError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Row = Record<string, unknown>;
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-US")}`;

// ------------------------------------------------------------------ step 1 and 2: the user and the issue
export const USER_TYPES = ["employee", "employer", "sole_proprietor", "company", "landlord", "vat_registered", "not_vat_registered", "importer_exporter", "accountant", "consultant", "student", "other"] as const;
export type UserType = (typeof USER_TYPES)[number];
export const USER_TYPE_LABEL: Readonly<Record<UserType, string>> = {
  employee: "Individual employee", employer: "Employer", sole_proprietor: "Sole proprietor", company: "Registered company", landlord: "Landlord",
  vat_registered: "VAT-registered business", not_vat_registered: "Business not registered for VAT", importer_exporter: "Importer or exporter",
  accountant: "Accountant", consultant: "Tax consultant", student: "Tax student", other: "Other taxpayer",
};

export const TAX_HEADS: ReadonlyArray<[string, string, RegExp]> = [
  ["paye", "PAYE", /\b(?:paye|salary|salaries|payroll|pay ?slip|wages?|employee'?s? tax)\b/i],
  ["vat", "VAT", /\b(?:vat|value added tax|efris|output tax|input tax)\b/i],
  ["withholding", "Withholding tax", /\b(?:withh?old(?:ing)?|wht|winnings|betting|commissions?|entertainers?|debentures?)\b/i],
  ["rental", "Rental income tax", /\b(?:rent(?:al)?|landlord|tenant)\b/i],
  ["corporation", "Corporation tax", /\b(?:corporat(?:ion|e) tax|company tax|companies|chargeable income|capital allowances?)\b/i],
  ["income", "Income tax", /\b(?:income tax|tax bands?|individual income)\b/i],
  ["excise", "Excise duty", /\b(?:excise|fuel|cement|sugar|cooking oil|spirits|plastics)\b/i],
  ["stamp", "Stamp duty", /\bstamp duty\b/i],
  ["customs", "Customs and international tax", /\b(?:customs|import(?:s|ed|ing)?|export(?:s|ed|ing)?|non-?residents?|treat(?:y|ies)|cross-border)\b/i],
  ["procedures", "Tax Procedures Code", /\b(?:tax procedures?|penal(?:ty|ties)|interest on (?:unpaid|late)|late (?:filing|payment)|waiver|records?)\b/i],
  ["incentives", "Tax incentives", /\b(?:incentives?|exempt(?:ion)?s?|holiday)\b/i],
  ["administration", "Tax administration and compliance", /\b(?:tin|register(?:ed|ing)?|registration|returns?|deadlines?|file|filing)\b/i],
  ["disputes", "Disputes and appeals", /\b(?:objections?|appeals?|tribunal|assessments?|dispute)\b/i],
];

export function taxHeadsIn(question: string): Array<{ id: string; label: string }> {
  return TAX_HEADS.filter(([, , pattern]) => pattern.test(question)).map(([id, label]) => ({ id, label }));
}

/** Amounts written in ordinary ways: "UGX 180 million", "180m", "1.5bn", "2,000,000". */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?:ugx|shs?\.?|ushs\.?)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(billion|bn|b\b|million|mn|m\b|thousand|k\b)?/gi;
  for (const m of text.matchAll(re)) {
    const raw = Number(String(m[1]).replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const factor = /^b/.test(unit) ? 1e9 : /^m/.test(unit) ? 1e6 : /^(?:thousand|k)/.test(unit) ? 1e3 : 1;
    const value = Math.round(raw * factor);
    if (unit || value >= 1000) out.push(value); // bare small numbers ("2026", "12 months") are not money
  }
  return out.filter((n) => !(n >= 1900 && n <= 2100));
}

// ------------------------------------------------------------------ scenarios
export const SCENARIOS = {
  vat_registration: "VAT registration threshold",
  paye_change: "PAYE on employment income (FY 2025/26 and FY 2026/27)",
  withholding_2026: "Withholding tax on payments changed in 2026",
} as const;
export type Scenario = keyof typeof SCENARIOS;

export const WHT_2026: Readonly<Record<string, { amendment: string; label: string }>> = {
  "betting-winnings": { amendment: "ita-2026-s131-winnings", label: "Winnings from betting or gaming" },
  "resident-telecom-commission": { amendment: "ita-2026-s133-telecom-commission", label: "Commission paid by a telecom provider (retail, mobile network or mobile money services)" },
  "resident-entertainer": { amendment: "ita-2026-s135b-entertainers", label: "Payment to a public entertainer" },
  "nonresident-debenture-interest": { amendment: "ita-2026-s82-debenture-interest", label: "Interest on qualifying debentures issued abroad" },
};

export interface Interpretation {
  scenario: Scenario | null;
  taxHeads: Array<{ id: string; label: string }>;
  facts: Record<string, unknown>;
  understanding: string;
}

/** Steps 1 and 2: which scenario, which tax heads, and the facts the question already gives. */
export function interpretQuestion(question: string): Interpretation {
  const q = question.slice(0, 2000);
  const heads = taxHeadsIn(q);
  const amounts = amountsIn(q);
  const facts: Record<string, unknown> = {};
  let scenario: Scenario | null = null;
  const lower = q.toLowerCase();
  const whtType = /winnings|betting|gaming/.test(lower) ? "betting-winnings" : /entertainer|musician|artist|performer/.test(lower) ? "resident-entertainer"
    : /debenture/.test(lower) ? "nonresident-debenture-interest" : /(?:telecom|mobile money|airtime|mobile network).*commission|commission.*(?:telecom|mobile money|mobile network)/.test(lower) ? "resident-telecom-commission" : null;
  if (whtType) {
    scenario = "withholding_2026";
    facts.paymentType = whtType;
    if (amounts[0] !== undefined) facts.grossPayment = amounts[0];
  } else if (/\b(?:vat|value added tax)\b/i.test(q) && (/regist|threshold|turnover|earn|sales|revenue|income/i.test(q) || amounts.length)) {
    scenario = "vat_registration";
    if (amounts[0] !== undefined) facts.statedAmount = amounts[0];
    facts.statedPeriod = /\b(?:annual(?:ly)?|a year|per year|per annum|yearly|12 months)\b/i.test(q) ? "year" : /\b(?:3|three) months|quarter/i.test(q) ? "three_months" : /\bmonth(?:ly)?\b/i.test(q) ? "month" : null;
  } else if (/\b(?:paye|salary|payroll|pay ?slip|wages?|take[- ]home)\b/i.test(q)) {
    scenario = "paye_change";
    if (amounts[0] !== undefined) facts.monthlyPay = /\b(?:annual(?:ly)?|a year|per year|per annum)\b/i.test(q) ? Math.round(amounts[0] / 12) : amounts[0];
    if (/non-?resident/i.test(q)) facts.resident = "no";
  }
  const understanding = scenario
    ? `This is about ${SCENARIOS[scenario].toLowerCase()}${heads.length ? ` (${heads.map((h) => h.label).join(", ")})` : ""}.`
    : heads.length ? `This concerns ${heads.map((h) => h.label).join(", ")}. TaxComp's impact assessment does not cover it yet; the legislation found is listed below.` : "TaxComp could not tell which tax this is about. Describe what you earn, sell or pay, and to whom.";
  return { scenario, taxHeads: heads, facts, understanding };
}

// ------------------------------------------------------------------ sources and legal status
export interface SourceItem {
  title: string;
  provision: string;
  legalStatus: string;
  sourceKind: "official_bill" | "official_legislation_structure" | "secondary_commentary" | "taxcomp_rule";
  sourceKindLabel: string;
  url: string | null;
  verification: string;
  note: string;
}
const SOURCE_KIND_LABEL: Readonly<Record<SourceItem["sourceKind"], string>> = {
  official_bill: "Official primary source: the Bill as published by Parliament",
  official_legislation_structure: "Official legislation structure (2024 revised edition; heading only)",
  secondary_commentary: "Secondary commentary (not the law)",
  taxcomp_rule: "TaxComp calculation rule (pending verification)",
};

/** Plain legal status from the law register; a Bill is never described as law. */
export function legalStatus(billStatus: string, assentDate: string | null, verified: boolean): string {
  const tail = verified ? "" : "; awaiting official verification";
  switch (billStatus) {
    case "bill": return "Proposed Bill (not law)";
    case "passed": return "Passed by Parliament; assent not confirmed";
    case "returned": return "Returned by the President; not law until assented";
    case "assented": return `Assent reported${assentDate ? ` (${assentDate})` : ""}${tail}`;
    case "in_force": return `Recorded as in force${assentDate ? `; assent ${assentDate}` : ""}${tail}`;
    default: return `Status not established${tail}`;
  }
}

async function statuteRow(db: Database, id: string) {
  return db.prepare(`SELECT id, title, bill_status AS "billStatus", assent_date AS "assentDate", commencement_date AS "commencementDate", verification_status AS "verificationStatus" FROM law_statutes WHERE id = ?`).bind(id).first<Row>();
}

async function sourcesFor(db: Database, a: AmendmentRecord): Promise<SourceItem[]> {
  const statute = await statuteRow(db, a.amendingStatuteId);
  const actVerified = statute?.verificationStatus === "verified";
  const status = a.evidence === "bill_only"
    ? "In the published Bill only; enactment not confirmed"
    : legalStatus(String(statute?.billStatus ?? ""), statute?.assentDate ? String(statute.assentDate) : null, actVerified && a.verificationStatus === "verified");
  const items: SourceItem[] = [{
    title: a.amendingTitle, provision: `${a.principalAct}, ${a.provision}`, legalStatus: status,
    sourceKind: "official_bill", sourceKindLabel: SOURCE_KIND_LABEL.official_bill, url: a.billUrl,
    verification: a.verificationStatus === "verified" && a.verifiedAt ? `Verified ${a.verifiedAt.slice(0, 10)}` : `${a.verificationLabel}; not yet checked against the enacted Act`,
    note: `${a.billReference}.${a.note ? ` ${a.note}` : ""}`,
  }];
  if (a.secondarySources) {
    items.push({ title: "Reports of the enacted Act", provision: a.provision, legalStatus: "Reported; not an official source", sourceKind: "secondary_commentary", sourceKindLabel: SOURCE_KIND_LABEL.secondary_commentary, url: null, verification: "Not a primary source", note: a.secondarySources });
  }
  if (a.lawId && a.sectionNumber) {
    const s = await db.prepare(`SELECT s.heading, s.verification_status AS "status", v.official_title AS "title", v.chapter FROM legislation_sections s JOIN legislation_law_versions v ON v.id = s.law_version_id
      WHERE v.law_id = ? AND s.section_number = ? ORDER BY v.edition_id DESC LIMIT 1`).bind(a.lawId, a.sectionNumber).first<Row>();
    if (s) items.push({ title: `${String(s.title)}${s.chapter ? ` (${String(s.chapter)})` : ""}`, provision: `s.${a.sectionNumber} ${String(s.heading)}`, legalStatus: "Principal Act (2024 revised edition, as at FY 2024/25)",
      sourceKind: "official_legislation_structure", sourceKindLabel: SOURCE_KIND_LABEL.official_legislation_structure, url: null, verification: String(s.status) === "verified" ? "Heading verified" : "Heading unverified; wording not held", note: "Shows what the section is about; not its wording." });
  }
  return items;
}

function figure(text: string | null): number | null {
  const m = text?.match(/UGX\s*([\d,]+)/i);
  return m ? Number(String(m[1]).replace(/,/g, "")) : null;
}

// ------------------------------------------------------------------ the result
export interface Question { key: string; question: string; help: string; type: "amount" | "choice"; options?: Array<{ value: string; label: string }>; suggested?: number | string }
export interface Outcome { label: string; period: string; rule: string; result: string; amount: number | null; basis: string; conflict?: boolean }
export interface Step { label: string; detail: string; amount: number | null }
export interface Action { id: string; title: string; who: string; basis: string; due: string; documents: string[]; consequence: string }
export interface ImpactResult {
  status: "needs_facts" | "assessed" | "not_covered";
  scenario: Scenario | null;
  title: string;
  understanding: string;
  taxHeads: Array<{ id: string; label: string }>;
  userType: UserType | null;
  facts: Record<string, unknown>;
  questions: Question[];
  outcomes: Outcome[];
  steps: Step[];
  assumptions: string[];
  conflicts: string[];
  explanation: { simple: string; professional: string } | null;
  actions: Action[];
  sources: SourceItem[];
  limits: string[];
  taxYear: string | null;
}

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const base = (i: Interpretation, scenario: Scenario | null, userType: UserType | null, facts: Record<string, unknown>): ImpactResult => ({
  status: "needs_facts", scenario, title: scenario ? SCENARIOS[scenario] : "Your question", understanding: i.understanding, taxHeads: i.taxHeads, userType, facts,
  questions: [], outcomes: [], steps: [], assumptions: [], conflicts: [], explanation: null, actions: [], sources: [], taxYear: null,
  limits: ["TaxComp's calculations are estimates from rules pending verification against the official legislation; they are not approved for filing.", "No deadline is stated unless TaxComp has verified it."],
});

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : undefined);
const yn = (v: unknown): "yes" | "no" | undefined => (v === "yes" || v === "no" ? v : undefined);

async function amendment(db: Database, id: string): Promise<AmendmentRecord> {
  const found = (await listAmendments(db, {})).find((a) => a.id === id);
  if (!found) throw new ImpactError(503, "The 2026 amendments register is not available.");
  return found;
}

// --- VAT registration ------------------------------------------------------
async function vatRegistration(db: Database, calc: Calculator, r: ImpactResult): Promise<ImpactResult> {
  const f = r.facts;
  const supplies = num(f.taxableSupplies12m);
  const three = num(f.taxableSupplies3m);
  if (supplies === undefined) {
    const stated = num(f.statedAmount);
    r.questions.push({
      key: "taxableSupplies12m", type: "amount", suggested: stated !== undefined && f.statedPeriod === "year" ? stated : stated !== undefined && f.statedPeriod === "month" ? stated * 12 : undefined,
      question: stated !== undefined ? `You mentioned ${ugx(stated)}${f.statedPeriod ? ` a ${f.statedPeriod === "three_months" ? "quarter" : f.statedPeriod}` : ""}. What is the value of your taxable supplies over 12 months?` : "What is the value of your taxable supplies over 12 months?",
      help: "Taxable supplies are sales of goods and services that are not exempt (TaxComp's VAT calculator also counts zero-rated sales). Annual revenue can include exempt sales or other income that do not count, so check before using it. Use the last 12 months, or what you expect in the next 12 months.",
    });
  }
  if (r.questions.length) return r;
  const a = await amendment(db, "vat-2026-s7-registration-threshold");
  const before = figure(a.previousFigure);
  const bill = figure(a.billFigure);
  const reported = figure(a.reportedFigure);
  const s = supplies as number;
  const over = (t: number | null) => (t === null ? null : s > t);
  const say = (t: number | null) => (t === null ? "Threshold not held" : s > t ? "Above the threshold: registration indicated" : s === t ? "Exactly at the threshold: check the exact test in the Act" : "Below the threshold: registration not indicated on this test");
  r.taxYear = "FY 2026/27 (from 1 July 2026), compared with the earlier threshold";
  r.outcomes.push(
    { label: "Before the 2026 amendment", period: "Up to 30 June 2026", rule: before === null ? "Not held" : `${ugx(before)} a year`, result: say(before), amount: before, basis: `${a.principalAct}, ${a.provision} as it stood before the amendment (figure as reported)` },
    { label: "After: figure in the published Bill", period: `From ${a.effectiveFrom ?? "a date not confirmed"}`, rule: bill === null ? "Not held" : `${ugx(bill)} a year`, result: say(bill), amount: bill, basis: `${a.amendingTitle}: Bill as published`, conflict: a.figuresDiffer },
    { label: "After: figure reported as enacted", period: `From ${a.effectiveFrom ?? "a date not confirmed"}`, rule: reported === null ? "Not held" : `${ugx(reported)} a year`, result: say(reported), amount: reported, basis: `${a.amendingTitle}: reports of the enacted Act`, conflict: a.figuresDiffer },
  );
  const vat = calc.calculateVat({ standardRatedSales: 0, annualTaxableTurnover: s, ...(three !== undefined ? { threeMonthTaxableTurnover: three } : {}) });
  r.steps.push(
    { label: "Taxable supplies over 12 months (your figure)", detail: "Entered by you", amount: s },
    ...[["Earlier threshold", before], ["Threshold in the published Bill", bill], ["Threshold reported as enacted", reported]].map(([label, t]) => ({ label: String(label), detail: t === null ? "Not held" : `${ugx(s)} ${s > (t as number) ? ">" : "≤"} ${ugx(t as number)}`, amount: t as number | null })),
    { label: "TaxComp VAT calculator (FY 2026/27 rule set)", detail: `Registration indicated: ${vat.registrationRequired ? "yes" : "no"}${three !== undefined ? ` (also tests your 3-month figure of ${ugx(three)})` : ""}. Rule status: ${vat.taxRuleSet.approvalStatus}.`, amount: null },
  );
  r.assumptions.push("Your figure is the value of taxable supplies over 12 months, as you confirmed.", "TaxComp compares 'more than' the threshold, as its VAT calculator does; the exact test in section 7 (including any shorter-period test) is not held by TaxComp and must be read in the Act.");
  if (a.figuresDiffer) r.conflicts.push(`The published Bill says ${a.billFigure}; reports of the enacted Act say ${a.reportedFigure}. TaxComp shows both and does not choose; confirm in the gazetted Act.`);
  const afterBill = over(bill);
  const afterReported = over(reported);
  const nowRequired = afterBill && afterReported;
  const nowNot = afterBill === false && afterReported === false;
  const wasRequired = over(before);
  const conclusion = nowRequired ? "registration is indicated on either 2026 figure" : nowNot ? "registration is not indicated on the 12-month test on either 2026 figure" : "the answer depends on which figure the enacted Act contains";
  r.explanation = {
    simple: `Your taxable sales of ${ugx(s)} a year ${nowRequired ? "are above" : nowNot ? "are below" : "fall between"} the new VAT registration ${a.figuresDiffer ? "limits (both the Bill figure and the reported figure)" : "limit"}. From 1 July 2026, ${conclusion}.${wasRequired && nowNot ? ` Before the change, the same sales were above the old limit of ${before === null ? "the earlier threshold" : ugx(before)}, so the change helps you.` : ""}${afterBill !== afterReported ? ` The Bill said ${a.billFigure} but reports of the final law say ${a.reportedFigure}; check which is in the law before deciding.` : ""} If you are already registered, whether you can cancel is a separate question: ask URA or an adviser.`,
    professional: `${a.principalAct}, ${a.provision}, as amended by the ${a.amendingTitle}: ${amendmentFigures(a)} On taxable supplies of ${ugx(s)} over 12 months, ${conclusion}${wasRequired !== null ? `; under the earlier threshold registration ${wasRequired ? "was" : "was not"} indicated` : ""}. Section 7's full conditions (including any shorter-period test) are not held by TaxComp; read them before advising. Evidence: ${a.evidenceLabel}; ${a.verificationLabel.toLowerCase()}.`,
  };
  r.actions.push({ id: "vat-monitor", title: "Keep a running total of your taxable supplies", who: "Any business near the threshold", basis: `${a.principalAct}, ${a.provision}`, due: "Ongoing", documents: ["Sales records or invoices, split into standard-rated, zero-rated and exempt"], consequence: "Not stated by TaxComp" });
  if (nowRequired || (!nowNot && f.vatRegistered !== "yes")) {
    r.actions.push({ id: "vat-register", title: nowRequired ? "Apply to URA for VAT registration" : "Confirm the enacted threshold, then decide whether to apply for VAT registration", who: "A business whose taxable supplies exceed the threshold", basis: `${a.principalAct}, ${a.provision}`, due: "Deadline not verified by TaxComp: confirm with URA", documents: ["TIN", "Sales records for the period", "Business registration documents"], consequence: "Not stated by TaxComp (penalties not verified)" });
  }
  r.sources = await sourcesFor(db, a);
  r.status = "assessed";
  return r;
}

// --- PAYE --------------------------------------------------------------------
async function payeChange(db: Database, calc: Calculator, r: ImpactResult): Promise<ImpactResult> {
  const f = r.facts;
  const pay = num(f.monthlyPay);
  if (pay === undefined) r.questions.push({ key: "monthlyPay", type: "amount", question: "What is the monthly taxable pay from this employer?", help: "Gross pay plus taxable benefits, before PAYE. If you know only the annual figure, divide it by 12." });
  if (!yn(f.resident)) r.questions.push({ key: "resident", type: "choice", options: YES_NO, question: "Is the employee resident in Uganda for tax purposes?", help: "Usually yes if they live in Uganda or spend 183 days or more there in the year. If unsure, answer yes and check later." });
  if (!yn(f.primaryEmployer)) r.questions.push({ key: "primaryEmployer", type: "choice", options: YES_NO, question: "Is this the employee's main (primary) employer?", help: "Pay from a second employer is withheld differently. Answer yes if this is the only or main job." });
  if (r.questions.length) return r;
  const a = await amendment(db, "ita-2026-sch4-individual-rates");
  const resident = f.resident === "yes";
  if (f.primaryEmployer === "no") {
    r.status = "assessed";
    r.explanation = { simple: "Pay from a second employer is withheld at a flat rate, not with the bands. Use the PAYE calculator and choose 'Secondary employment'.", professional: "Secondary employment withholding is estimated at 40% in TaxComp's FY 2026/27 rule set (reported URA clarification, pending verification); the band change does not apply to it. Use the PAYE calculator." };
    r.actions.push({ id: "paye-secondary", title: "Use the PAYE calculator for secondary employment", who: "Employer of a secondary employee", basis: "Income Tax Act, Cap. 338", due: "Not stated by TaxComp", documents: ["Payroll records"], consequence: "Not stated by TaxComp" });
    r.sources = await sourcesFor(db, a);
    return r;
  }
  const years = calc.comparePayeAcrossFinancialYears(pay as number, resident);
  const current = years.find((y) => y.financialYear === "2026/27");
  const earlier = years.find((y) => y.financialYear === "2025/26");
  if (!current) throw new ImpactError(500, "The PAYE calculator returned no FY 2026/27 result.");
  r.taxYear = earlier ? "FY 2026/27 compared with FY 2025/26" : "FY 2026/27";
  if (earlier) r.outcomes.push({ label: "Before: FY 2025/26 bands", period: "July 2025 to June 2026", rule: "Nil to 2.82m a year, then 10%, 20% and 30%; 10% more above 120m", result: `${ugx(earlier.monthlyTax)} a month`, amount: earlier.monthlyTax, basis: "Income Tax Act, Cap. 338, Schedule 4, Part I before 1 July 2026 (pending verification)" });
  r.outcomes.push({ label: "After: FY 2026/27 bands", period: `From ${a.effectiveFrom ?? "1 July 2026"}`, rule: "Nil to 4.02m a year, then 20%, 25% and 30%; 10% more above 120m", result: `${ugx(current.monthlyTax)} a month`, amount: current.monthlyTax, basis: `${a.principalAct}, ${a.provision}, as amended by the ${a.amendingTitle}` });
  for (const y of years) for (const b of y.breakdown) if (b.tax > 0) r.steps.push({ label: `FY ${y.financialYear}: ${b.label}`, detail: `${Math.round(b.rate * 100)}% of the pay in this band (monthly share of the annual band)`, amount: b.tax });
  if (earlier) r.steps.push({ label: "Change in monthly PAYE", detail: `${ugx(current.monthlyTax)} − ${ugx(earlier.monthlyTax)}`, amount: current.monthlyTax - earlier.monthlyTax }, { label: "Change over a full year", detail: "Monthly change × 12", amount: (current.monthlyTax - earlier.monthlyTax) * 12 });
  r.assumptions.push("The same taxable pay every month for 12 months.", "One primary employer and no other income.", resident ? "Resident employee." : "Non-resident employee: TaxComp holds only FY 2026/27 bands for non-residents, so no comparison is shown.");
  const diff = earlier ? current.monthlyTax - earlier.monthlyTax : 0;
  r.explanation = {
    simple: earlier
      ? `On ${ugx(pay as number)} a month, PAYE ${diff < 0 ? "falls" : diff > 0 ? "rises" : "stays the same"}${diff ? ` by ${ugx(Math.abs(diff))} a month (${ugx(Math.abs(diff) * 12)} a year)` : ""} from July 2026: ${ugx(earlier.monthlyTax)} before, ${ugx(current.monthlyTax)} after. The first UGX 335,000 a month is now tax-free (it was UGX 235,000).`
      : `On ${ugx(pay as number)} a month, PAYE from July 2026 is about ${ugx(current.monthlyTax)} a month.`,
    professional: `${a.principalAct}, ${a.provision} (${a.amendingTitle}): ${a.billFigure ?? ""} Monthly PAYE on ${ugx(pay as number)}: ${earlier ? `FY 2025/26 ${ugx(earlier.monthlyTax)}; ` : ""}FY 2026/27 ${ugx(current.monthlyTax)} (marginal rate ${Math.round(current.marginalRate * 100)}%). Evidence: ${a.evidenceLabel}; ${a.verificationLabel.toLowerCase()}; FY 2025/26 bands pending verification.`,
  };
  r.actions.push({ id: "paye-bands", title: "Apply the FY 2026/27 bands to pay from July 2026, and check any month paid on the old bands", who: "Employers", basis: `${a.principalAct}, ${a.provision}`, due: "Monthly PAYE deadline not stated by TaxComp", documents: ["Payroll register", "Employee pay slips"], consequence: "Not stated by TaxComp" });
  r.sources = await sourcesFor(db, a);
  r.status = "assessed";
  return r;
}

// --- Withholding --------------------------------------------------------------
async function withholding(db: Database, calc: Calculator, r: ImpactResult): Promise<ImpactResult> {
  const f = r.facts;
  const type = typeof f.paymentType === "string" && WHT_2026[f.paymentType] ? f.paymentType : undefined;
  const gross = num(f.grossPayment);
  if (!type) r.questions.push({ key: "paymentType", type: "choice", options: Object.entries(WHT_2026).map(([value, v]) => ({ value, label: v.label })), question: "What kind of payment is it?", help: "These are the payments whose withholding changed in 2026." });
  if (gross === undefined) r.questions.push({ key: "grossPayment", type: "amount", question: type === "betting-winnings" ? "What is the payout, including the stake?" : "What is the gross payment?", help: "The amount before any tax is withheld." });
  if (type === "betting-winnings" && num(f.stake) === undefined) r.questions.push({ key: "stake", type: "amount", question: "How much was staked?", help: "Winnings are the payout less the stake." });
  if (r.questions.length) return r;
  const t = type as string;
  const a = await amendment(db, (WHT_2026[t] as { amendment: string }).amendment);
  const result = calc.calculateWithholdingTax(gross as number, t, false, false, num(f.stake) ?? 0, false);
  r.taxYear = "FY 2026/27 (from 1 July 2026)";
  r.outcomes.push(
    { label: "Before the 2026 amendment", period: "Up to 30 June 2026", rule: a.previousFigure ?? "Not set out in the Bill; the earlier treatment is not held by TaxComp", result: a.previousFigure ? "See rule" : "Not calculated", amount: null, basis: "Not held" },
    { label: "After: from 1 July 2026", period: `From ${a.effectiveFrom ?? "1 July 2026"}`, rule: `${Math.round(result.rate * 100)}%${a.billFigure ? ` (Bill: ${a.billFigure}${a.reportedFigure ? `; reported: ${a.reportedFigure}` : ""})` : ""}`, result: `${ugx(result.tax)} to withhold`, amount: result.tax, basis: `${a.principalAct}, ${a.provision}` },
  );
  for (const b of result.breakdown) r.steps.push({ label: b.label, detail: b.rate === null ? "" : `${Math.round(b.rate * 100)}%`, amount: b.amount });
  r.assumptions.push(result.note);
  r.explanation = {
    simple: `For ${result.paymentLabel.toLowerCase()}, the payer keeps back ${Math.round(result.rate * 100)}% and pays it to URA: ${ugx(result.tax)} on ${ugx(result.taxBase)}.`,
    professional: `${a.principalAct}, ${a.provision} (${a.amendingTitle}): ${a.summary} ${amendmentFigures(a)} Withholding on a base of ${ugx(result.taxBase)}: ${ugx(result.tax)}. Evidence: ${a.evidenceLabel}; ${a.verificationLabel.toLowerCase()}.`,
  };
  r.actions.push({ id: "wht-withhold", title: "Withhold the tax when paying, and pay it to URA", who: "The payer", basis: `${a.principalAct}, ${a.provision}`, due: "Deadline not verified by TaxComp: confirm with URA", documents: ["Payment records", "Withholding tax return"], consequence: "Not stated by TaxComp" });
  r.sources = await sourcesFor(db, a);
  r.status = "assessed";
  return r;
}

// ------------------------------------------------------------------ entry point
export interface ImpactInput { question?: unknown; scenario?: unknown; facts?: unknown; userType?: unknown }
const FACT_KEYS = ["statedAmount", "statedPeriod", "taxableSupplies12m", "taxableSupplies3m", "vatRegistered", "monthlyPay", "resident", "primaryEmployer", "paymentType", "grossPayment", "stake"];

export function readImpactInput(body: ImpactInput) {
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
  const scenario = typeof body.scenario === "string" && Object.hasOwn(SCENARIOS, body.scenario) ? (body.scenario as Scenario) : null;
  if (body.scenario !== undefined && body.scenario !== null && !scenario) throw new ImpactError(400, `scenario must be one of: ${Object.keys(SCENARIOS).join(", ")}.`);
  const userType = typeof body.userType === "string" && (USER_TYPES as readonly string[]).includes(body.userType) ? (body.userType as UserType) : null;
  const facts: Record<string, unknown> = {};
  if (body.facts !== undefined && (typeof body.facts !== "object" || body.facts === null || Array.isArray(body.facts))) throw new ImpactError(400, "facts must be an object.");
  for (const [key, value] of Object.entries((body.facts as Record<string, unknown>) ?? {})) {
    if (!FACT_KEYS.includes(key)) throw new ImpactError(400, `Unknown fact: ${key}.`);
    if (value === null || value === "") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0 || value > 1e15) throw new ImpactError(400, `${key} must be a positive amount.`);
      facts[key] = value;
    } else if (typeof value === "string" && value.length <= 60 && /^[a-z0-9_-]+$/i.test(value)) {
      facts[key] = value;
    } else throw new ImpactError(400, `${key} has an invalid value.`);
  }
  if (!question && !scenario) throw new ImpactError(400, "Describe your situation, or choose a scenario.");
  return { question, scenario, userType, facts };
}

export async function assessImpact(db: Database, calc: Calculator, input: ReturnType<typeof readImpactInput>): Promise<ImpactResult> {
  const interpretation = input.question ? interpretQuestion(input.question) : { scenario: null, taxHeads: [], facts: {}, understanding: "" };
  const scenario = input.scenario ?? interpretation.scenario;
  const facts = { ...interpretation.facts, ...input.facts };
  const r = base(interpretation as Interpretation, scenario, input.userType, facts);
  if (scenario && !r.understanding) r.understanding = `This is about ${SCENARIOS[scenario].toLowerCase()}.`;
  if (!scenario) {
    r.status = "not_covered";
    return r;
  }
  if (scenario === "vat_registration") return vatRegistration(db, calc, r);
  if (scenario === "paye_change") return payeChange(db, calc, r);
  return withholding(db, calc, r);
}

// ------------------------------------------------------------------ conversation
/** The sections each scenario rests on (by heading), so the assistant cites them first. */
export const SCENARIO_HEADINGS: Readonly<Record<Scenario, Array<{ law: string; heading: string }>>> = {
  vat_registration: [{ law: "vata", heading: "Persons required or permitted to register" }, { law: "vata", heading: "Registration" }],
  paye_change: [{ law: "ita", heading: "Withholding of tax by employers" }, { law: "ita", heading: "Employment income" }],
  withholding_2026: [{ law: "ita", heading: "Withholding tax" }, { law: "ita", heading: "Withholding as final tax" }],
};

const AMOUNT_KEYS = new Set(["taxableSupplies12m", "taxableSupplies3m", "monthlyPay", "grossPayment", "stake", "statedAmount"]);
const CHOICE_KEYS = new Set(["resident", "primaryEmployer", "vatRegistered"]);

export interface ImpactContext { scenario: Scenario; facts: Record<string, unknown>; pending: string[] }

/** The assessment a chat is in the middle of (sent back by the browser; validated like any input). */
export function readImpactContext(value: unknown): ImpactContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  try {
    const parsed = readImpactInput({ scenario: v.scenario, facts: v.facts ?? {} });
    if (!parsed.scenario) return null;
    const pending = Array.isArray(v.pending) ? v.pending.filter((k): k is string => typeof k === "string" && FACT_KEYS.includes(k)).slice(0, 6) : [];
    return { scenario: parsed.scenario, facts: parsed.facts, pending };
  } catch {
    return null;
  }
}

/** Answers to the pending questions in a follow-up message: "180 million", "yes, resident", "no, a second job". */
export function answersFrom(message: string, pending: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const amounts = amountsIn(message);
  const lower = message.toLowerCase();
  const yesNo = lower.match(/\b(?:yes|yeah|yep|correct|true|no|nope|not)\b/g) ?? [];
  let next = 0;
  for (const key of pending) {
    if (AMOUNT_KEYS.has(key)) {
      const amount = amounts.shift();
      if (amount !== undefined) out[key] = amount;
    } else if (key === "paymentType") {
      const type = interpretQuestion(message).facts.paymentType;
      if (type) out[key] = type;
    } else if (CHOICE_KEYS.has(key)) {
      if (key === "resident" && /non-?resident|live (?:abroad|outside)/.test(lower)) out[key] = "no";
      else if (key === "resident" && /\bresident\b|live in uganda/.test(lower)) out[key] = "yes";
      else if (key === "primaryEmployer" && /\b(?:secondary|second|another|other) (?:job|employer|employment)\b|\bsecondary\b/.test(lower)) out[key] = "no";
      else if (key === "primaryEmployer" && /\b(?:main|primary|only)\b/.test(lower)) out[key] = "yes";
      else if (next < yesNo.length) {
        out[key] = /^(?:no|nope|not)$/.test(yesNo[next] as string) ? "no" : "yes";
        next += 1;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ public API
export interface ImpactEnv {
  UNANSWERED_QUESTIONS?: Database;
  DATABASE_PROVIDER?: string;
  ALLOWED_ORIGIN?: string;
  CHAT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

function respond(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers } });
}

/** POST /api/impact: public (no sign-in, nothing stored), rate-limited, site origin only. */
export async function handleImpactRequest(request: Request, env: ImpactEnv, calc: Calculator): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return respond({ error: "Origin is not allowed." }, 403, {});
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return respond({ error: "Use POST." }, 405, cors);
  const db = env.UNANSWERED_QUESTIONS;
  if (env.DATABASE_PROVIDER !== "supabase" || !db) return respond({ error: "The impact assessment is not available yet." }, 503, cors);
  if (env.CHAT_LIMITER?.limit) {
    try {
      const limit = await env.CHAT_LIMITER.limit({ key: `impact:${request.headers.get("CF-Connecting-IP") || "unknown"}` });
      if (!limit.success) return respond({ error: "Too many requests. Please wait a minute." }, 429, cors);
    } catch { /* limiter outage: no data is stored, continue */ }
  }
  try {
    const text = await request.text();
    if (text.length > 16_000) throw new ImpactError(413, "The request is too large.");
    let body: ImpactInput;
    try { body = JSON.parse(text) as ImpactInput; } catch { throw new ImpactError(400, "Send JSON."); }
    const result = await assessImpact(db, calc, readImpactInput(body));
    return respond({ ...result, options: { scenarios: SCENARIOS, userTypes: USER_TYPE_LABEL } }, 200, cors);
  } catch (error) {
    if (error instanceof ImpactError) return respond({ error: error.message }, error.status, cors);
    if (error instanceof RangeError) return respond({ error: error.message }, 400, cors);
    console.error("Impact request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return respond({ error: "Something went wrong. Please try again." }, 500, cors);
  }
}

/** A short deterministic summary for the AI assistant's evidence (never the model's own figures). */
export function impactEvidence(r: ImpactResult): string {
  if (r.status !== "assessed" || !r.explanation) return "";
  return [
    `TaxComp impact assessment (deterministic, by TaxComp's calculators; quote these figures, do not compute your own): ${r.title}.`,
    ...r.outcomes.map((o) => `- ${o.label} (${o.period}): rule ${o.rule}; result ${o.result}.${o.conflict ? " Figures differ between the Bill and the reported Act." : ""}`),
    `Professional summary: ${r.explanation.professional}`,
    ...r.conflicts.map((c) => `Conflict: ${c}`),
    `Assumptions: ${r.assumptions.join(" ")}`,
  ].join("\n");
}
