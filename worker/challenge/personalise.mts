// Phase 12: personalisation service. Profile validation, the dashboard for
// each kind of user, "Discover my tax obligations" and recommendations.
//
// Rules: obligations come only from facts the user gave; each one cites the
// provisions it rests on, retrieved from the legislative database, with their
// verification status. Nothing here states a rate, threshold or deadline that
// TaxComp has not verified; recommendations name the data they come from.
import type { Database } from "./store.mts";
import { amendmentFigures, listAmendments } from "./legislation.mts";

export const CATEGORIES = ["individual", "employee", "self_employed", "small_business", "company", "accountant", "consultant", "finance_manager", "tax_administrator"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = {
  individual: "Individual taxpayer", employee: "Salaried employee", self_employed: "Self-employed", small_business: "Small business owner",
  company: "Medium or large company", accountant: "Accountant", consultant: "Tax consultant", finance_manager: "Finance manager", tax_administrator: "Tax administrator",
};
const PURPOSES = ["personal", "business", "both"] as const;
const BUSINESS_TYPES = ["sole_trader", "partnership", "company", "ngo", "other"] as const;
const SECTORS = ["retail", "services", "manufacturing", "agriculture", "construction", "hospitality", "transport", "professional", "property", "import_export", "gaming", "other"] as const;
const KNOWLEDGE = ["none", "some", "professional"] as const;
const MODES = ["simple", "professional"] as const;
export const INTERESTS = ["paye", "income_tax", "vat", "withholding", "corporation_tax", "rental", "presumptive", "excise", "stamp_duty", "international", "assessments", "registration"] as const;
const YES_NO = ["yes", "no", "unknown"] as const;
export const FACT_KEYS = ["employed", "selfEmployed", "employsStaff", "vatRegistered", "rentalIncome", "paysSuppliers", "paysNonResidents", "excisableGoods", "instruments", "foreignIncome", "smallTurnover"] as const;
export type FactKey = (typeof FACT_KEYS)[number];
export type Facts = Partial<Record<FactKey, (typeof YES_NO)[number]>>;
export const PROGRESS = ["not_started", "in_progress", "done"] as const;
export type ProgressStatus = (typeof PROGRESS)[number];
export const PROGRESS_LABEL: Readonly<Record<ProgressStatus, string>> = { not_started: "Not started", in_progress: "In progress", done: "Done" };

export interface Profile {
  userId: string;
  userCategory: Category | null;
  purpose: (typeof PURPOSES)[number] | null;
  businessType: (typeof BUSINESS_TYPES)[number] | null;
  businessSector: (typeof SECTORS)[number] | null;
  knowledgeLevel: (typeof KNOWLEDGE)[number] | null;
  experienceMode: (typeof MODES)[number];
  interests: string[];
  facts: Facts;
  /** Compliance Action Centre: the user's own progress on each obligation (by rule id). */
  progress: Partial<Record<string, ProgressStatus>>;
  discovery: DiscoveryResult | null;
  discoveredAt: string | null;
  onboardingCompletedAt: string | null;
  updatedAt: string | null;
}

export class ProfileError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function pick<T extends readonly string[]>(list: T, value: unknown, label: string): T[number] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!(list as readonly string[]).includes(String(value))) throw new ProfileError(400, `${label} is not one of the options.`);
  return String(value) as T[number];
}

/** Applies a partial update (any question may be skipped) to a profile. */
export function applyProfileUpdate(current: Profile, body: Record<string, unknown>): Profile {
  const next: Profile = { ...current, facts: { ...current.facts }, progress: { ...current.progress }, interests: [...current.interests] };
  const set = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => { if (value !== undefined) next[key] = value; };
  set("userCategory", pick(CATEGORIES, body.userCategory, "What best describes you"));
  set("purpose", pick(PURPOSES, body.purpose, "Personal or business"));
  set("businessType", pick(BUSINESS_TYPES, body.businessType, "Type of business"));
  set("businessSector", pick(SECTORS, body.businessSector, "Business sector"));
  set("knowledgeLevel", pick(KNOWLEDGE, body.knowledgeLevel, "Tax knowledge"));
  const mode = pick(MODES, body.experienceMode, "Experience mode");
  if (mode) next.experienceMode = mode;
  else if (body.experienceMode === undefined && next.knowledgeLevel && !current.onboardingCompletedAt && body.completeOnboarding === true) {
    next.experienceMode = next.knowledgeLevel === "professional" ? "professional" : "simple";
  }
  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.length > INTERESTS.length) throw new ProfileError(400, "Interests must be a list.");
    const interests = body.interests.map(String);
    if (interests.some((i) => !(INTERESTS as readonly string[]).includes(i))) throw new ProfileError(400, "Unknown tax topic in interests.");
    next.interests = [...new Set(interests)];
  }
  if (body.facts !== undefined) {
    if (!body.facts || typeof body.facts !== "object" || Array.isArray(body.facts)) throw new ProfileError(400, "Facts must be an object.");
    for (const [key, value] of Object.entries(body.facts as Record<string, unknown>)) {
      if (!(FACT_KEYS as readonly string[]).includes(key)) throw new ProfileError(400, `Unknown fact: ${key}.`);
      const answer = pick(YES_NO, value, key);
      if (answer === null || answer === undefined) delete next.facts[key as FactKey];
      else next.facts[key as FactKey] = answer;
    }
  }
  if (body.progress !== undefined) {
    if (!body.progress || typeof body.progress !== "object" || Array.isArray(body.progress)) throw new ProfileError(400, "Progress must be an object.");
    const ids = new Set(RULES.map((r) => r.id));
    for (const [key, value] of Object.entries(body.progress as Record<string, unknown>)) {
      if (!ids.has(key)) throw new ProfileError(400, `Unknown obligation: ${key.slice(0, 40)}.`);
      const status = pick(PROGRESS, value, "Progress");
      if (status === null || status === undefined || status === "not_started") delete next.progress[key];
      else next.progress[key] = status;
    }
  }
  return next;
}

// ------------------------------------------------------------------ storage
type Row = Record<string, unknown>;
const json = <T,>(value: unknown, fallback: T): T => { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export function emptyProfile(userId: string): Profile {
  return { userId, userCategory: null, purpose: null, businessType: null, businessSector: null, knowledgeLevel: null, experienceMode: "simple", interests: [], facts: {}, progress: {}, discovery: null, discoveredAt: null, onboardingCompletedAt: null, updatedAt: null };
}

export async function loadProfile(db: Database, userId: string): Promise<Profile | null> {
  const r = await db.prepare(`SELECT user_id AS "userId", user_category AS "userCategory", purpose, business_type AS "businessType", business_sector AS "businessSector",
    knowledge_level AS "knowledgeLevel", experience_mode AS "experienceMode", interests_json AS "interestsJson", facts_json AS "factsJson", obligation_status_json AS "progressJson", discovery_json AS "discoveryJson",
    discovered_at AS "discoveredAt", onboarding_completed_at AS "onboardingCompletedAt", updated_at AS "updatedAt" FROM user_profiles WHERE user_id = ?`).bind(userId).first<Row>();
  if (!r) return null;
  return {
    userId: String(r.userId), userCategory: (r.userCategory ?? null) as Category | null, purpose: (r.purpose ?? null) as Profile["purpose"], businessType: (r.businessType ?? null) as Profile["businessType"],
    businessSector: (r.businessSector ?? null) as Profile["businessSector"], knowledgeLevel: (r.knowledgeLevel ?? null) as Profile["knowledgeLevel"], experienceMode: String(r.experienceMode) as Profile["experienceMode"],
    interests: json<string[]>(r.interestsJson, []), facts: json<Facts>(r.factsJson, {}), progress: json<Profile["progress"]>(r.progressJson, {}), discovery: json<DiscoveryResult | null>(r.discoveryJson, null),
    discoveredAt: (r.discoveredAt ?? null) as string | null, onboardingCompletedAt: (r.onboardingCompletedAt ?? null) as string | null, updatedAt: (r.updatedAt ?? null) as string | null,
  };
}

export async function saveProfile(db: Database, p: Profile, now: string, { completeOnboarding = false } = {}) {
  await db.prepare(`INSERT INTO user_profiles (user_id, user_category, purpose, business_type, business_sector, knowledge_level, experience_mode, interests_json, facts_json, obligation_status_json, discovery_json, discovered_at, onboarding_completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET user_category = EXCLUDED.user_category, purpose = EXCLUDED.purpose, business_type = EXCLUDED.business_type, business_sector = EXCLUDED.business_sector,
      knowledge_level = EXCLUDED.knowledge_level, experience_mode = EXCLUDED.experience_mode, interests_json = EXCLUDED.interests_json, facts_json = EXCLUDED.facts_json, obligation_status_json = EXCLUDED.obligation_status_json,
      discovery_json = EXCLUDED.discovery_json, discovered_at = EXCLUDED.discovered_at, onboarding_completed_at = COALESCE(user_profiles.onboarding_completed_at, EXCLUDED.onboarding_completed_at), updated_at = EXCLUDED.updated_at`)
    .bind(p.userId, p.userCategory, p.purpose, p.businessType, p.businessSector, p.knowledgeLevel, p.experienceMode, JSON.stringify(p.interests), JSON.stringify(p.facts), JSON.stringify(p.progress ?? {}),
      p.discovery ? JSON.stringify(p.discovery) : null, p.discoveredAt, completeOnboarding ? (p.onboardingCompletedAt ?? now) : p.onboardingCompletedAt, now, now).run();
}

// ------------------------------------------------------------------ dashboards
export interface Link { label: string; href: string }
export interface Module { id: string; title: string; simple: string; professional: string; links: Link[] }

const M: Record<string, Module> = {
  personalOverview: { id: "personal-overview", title: "Your tax at a glance", simple: "Answer a few questions and TaxComp shows which taxes may apply to you, in plain words.", professional: "Profile-driven overview of potentially applicable heads of tax, with statutory references.", links: [{ label: "Discover my tax obligations", href: "#ws-dashboard-discover" }] },
  employment: { id: "employment", title: "Employment income and PAYE", simple: "If you are employed, your employer takes PAYE (income tax) out of your salary each month and pays it to URA.", professional: "Employment income (Income Tax Act s.19) and employer withholding (s.126); verify the bands for the period.", links: [{ label: "PAYE calculator", href: "#calc-paye" }, { label: "Individual income tax", href: "#calc-individual" }] },
  obligations: { id: "obligations", title: "Your tax obligations", simple: "A checklist of what you may need to register for, file and pay, and why.", professional: "Obligation discovery against the legislative database, distinguishing facts-based obligations from those needing verification.", links: [{ label: "Discover my tax obligations", href: "#ws-dashboard-discover" }] },
  calculators: { id: "calculators", title: "Tax calculators", simple: "Work out an estimate. Each calculator explains what it assumes.", professional: "Calculators with period-specific rules; rules pending primary-source verification are labelled.", links: [{ label: "All calculators", href: "#tools" }] },
  dates: { id: "dates", title: "Important dates", simple: "Deadlines from your own cases and records appear here. TaxComp does not guess deadlines it has not verified.", professional: "Deadlines from assessment cases and client obligations; statutory due dates are shown only where verified.", links: [{ label: "My assessments", href: "#ws-assessments" }] },
  documents: { id: "documents", title: "Your documents", simple: "Keep payslips, invoices, receipts and URA letters together.", professional: "Records retention and supporting documents (Tax Procedures Code Act s.15).", links: [{ label: "Financial records", href: "#ws-records" }] },
  faq: { id: "faq", title: "Questions people ask", simple: "Short, plain answers to common tax questions.", professional: "Guides and worked examples with sources.", links: [{ label: "Tax guides", href: "#kb-guides" }, { label: "Ask the assistant", href: "#assistant" }] },
  businessOverview: { id: "business-overview", title: "Business tax compliance", simple: "See which business taxes may apply, based on what you tell us about your business.", professional: "Compliance overview by head of tax, with statutory references and verification status.", links: [{ label: "Discover my tax obligations", href: "#ws-dashboard-discover" }] },
  vat: { id: "vat", title: "VAT", simple: "Not every business must register for VAT. It depends on your taxable sales; TaxComp helps you check.", professional: "VAT registration (VAT Act ss.7–8), returns (s.31), input tax credit (s.28) and tax invoices (s.29).", links: [{ label: "VAT calculator", href: "#calc-vat" }] },
  corporationTax: { id: "corporation-tax", title: "Corporation income tax", simple: "Companies pay income tax on their profits and file a return each year.", professional: "Company rate (Income Tax Act s.7), residence (s.10), returns (s.118), provisional tax (s.121).", links: [{ label: "Company tax calculator", href: "#calc-company" }, { label: "Capital allowances", href: "#calc-capital-allowances" }] },
  withholding: { id: "withholding", title: "Withholding tax", simple: "Some payers must keep back part of certain payments and pay it to URA.", professional: "Domestic and international withholding (Income Tax Act Part XIV and ss.82–88).", links: [{ label: "Withholding calculator", href: "#calc-withholding" }] },
  payeEmployer: { id: "paye-employer", title: "PAYE for your employees", simple: "If you employ staff, you take PAYE from their pay and pay it to URA.", professional: "Employer withholding (Income Tax Act s.126); NSSF contributions (NSSF Act s.10).", links: [{ label: "PAYE calculator", href: "#calc-paye" }] },
  provisional: { id: "provisional", title: "Provisional (instalment) tax", simple: "Some businesses pay income tax in instalments during the year instead of all at the end.", professional: "Provisional tax (Income Tax Act s.121); penal tax for understated estimates (Tax Procedures Code Act s.60).", links: [{ label: "Multi-tax analysis", href: "#multi-tax-analysis" }] },
  payments: { id: "payments", title: "Tax payments and outstanding amounts", simple: "Amounts URA says you owe, from your assessment cases.", professional: "Outstanding assessed amounts from Challenge an Assessment cases.", links: [{ label: "My assessments", href: "#ws-assessments" }] },
  reports: { id: "reports", title: "Reports", simple: "Download summaries of your calculations and cases.", professional: "Client and engagement reports.", links: [{ label: "Reports", href: "#ws-reports" }] },
  clients: { id: "clients", title: "Client portfolio and compliance", simple: "Your clients and their filing status.", professional: "Practice workspace: clients, obligations (filing and payment status), engagements and documents.", links: [{ label: "Practice workspace", href: "#ws-overview" }] },
  computation: { id: "computation", title: "Computation workspace", simple: "Calculators for working out tax.", professional: "Multi-tax analysis, company tax, capital allowances, capital gains and international scenarios with working.", links: [{ label: "Multi-tax analysis", href: "#multi-tax-analysis" }, { label: "International tax", href: "#international-tax" }] },
  legislation: { id: "legislation", title: "Tax legislation", simple: "The tax Acts, section by section.", professional: "Legislative database: Acts by edition, sections, schedules, relations and verification status.", links: [{ label: "Structure of the tax Acts", href: "#kb-laws" }] },
  assessments: { id: "assessments", title: "Assessments, objections and disputes", simple: "Got a URA assessment? TaxComp explains it and helps you respond on time.", professional: "Challenge an Assessment: deadlines, item analysis, case law and response packs.", links: [{ label: "Challenge an assessment", href: "#challenge" }] },
  research: { id: "research", title: "Tax research", simple: "Search guides, laws and cases.", professional: "Legislation search, Tax Appeals Tribunal decisions and the evidence-first advisor.", links: [{ label: "Knowledge Centre", href: "#knowledge" }, { label: "Case law", href: "#kb-cases" }, { label: "Advisor", href: "#assistant" }] },
  planning: { id: "planning", title: "Tax planning resources", simple: "Compare options lawfully.", professional: "Structure comparison, international principles and anti-avoidance provisions (Income Tax Act Part XI).", links: [{ label: "International tax and structures", href: "#international-tax" }] },
  exposure: { id: "exposure", title: "Tax exposure and liabilities", simple: "What URA has assessed and what is still disputed.", professional: "Assessed and disputed amounts from assessment cases; audit-readiness checks.", links: [{ label: "My assessments", href: "#ws-assessments" }, { label: "Audit health check", href: "#audit-health" }] },
  provisions: { id: "provisions", title: "Tax provisions and reporting", simple: "Estimate the tax to set aside.", professional: "Current tax estimates for provisioning; capital allowances and deferred items to review.", links: [{ label: "Company tax calculator", href: "#calc-company" }, { label: "Reports", href: "#ws-reports" }] },
  admin: { id: "admin", title: "Legislation and review queues", simple: "Review work assigned to you.", professional: "Legislation verification, legislative watch, knowledge base drafts and the case review queue (reviewer access required).", links: [{ label: "Law and cases admin", href: "#challenge" }] },
  learning: { id: "learning", title: "Learn the basics", simple: "Start here: what tax is, who pays it and what a TIN is.", professional: "Guides and worked examples.", links: [{ label: "Tax guides", href: "#kb-guides" }] },
};

const LAYOUT: Readonly<Record<Category, string[]>> = {
  individual: ["personalOverview", "employment", "obligations", "calculators", "dates", "documents", "faq"],
  employee: ["personalOverview", "employment", "obligations", "calculators", "dates", "documents", "faq"],
  self_employed: ["businessOverview", "obligations", "provisional", "vat", "withholding", "dates", "payments", "documents", "faq"],
  small_business: ["businessOverview", "obligations", "vat", "corporationTax", "withholding", "payeEmployer", "provisional", "dates", "payments", "reports"],
  company: ["businessOverview", "obligations", "corporationTax", "vat", "withholding", "payeEmployer", "provisional", "dates", "payments", "reports"],
  accountant: ["clients", "computation", "obligations", "legislation", "assessments", "dates", "reports", "documents"],
  consultant: ["clients", "research", "computation", "assessments", "planning", "legislation", "reports"],
  finance_manager: ["businessOverview", "exposure", "corporationTax", "payments", "provisions", "dates", "reports", "legislation"],
  tax_administrator: ["admin", "legislation", "research", "assessments"],
};

export function dashboardFor(profile: Profile) {
  const category: Category = profile.userCategory ?? (profile.purpose === "business" ? "small_business" : "individual");
  let ids = [...LAYOUT[category]];
  // Business facts: drop modules the user's answers rule out; never assume every tax applies.
  if (profile.facts.vatRegistered === "no" && ["self_employed", "small_business"].includes(category)) ids = ids.filter((id) => id !== "vat").concat("vat"); // kept, but last: registration may still need checking
  if (profile.facts.employsStaff === "no") ids = ids.filter((id) => id !== "payeEmployer");
  if (category === "small_business" && profile.businessType && profile.businessType !== "company") ids = ids.filter((id) => id !== "corporationTax");
  // The mode the user chose wins; onboarding sets it from their tax knowledge.
  const beginner = profile.experienceMode === "simple";
  if (beginner && !ids.includes("learning")) ids.unshift("learning");
  return {
    category, categoryLabel: CATEGORY_LABEL[category], mode: profile.experienceMode, beginner,
    modules: [...new Set(ids)].map((id) => M[id]).filter((m): m is Module => Boolean(m)),
    companionProminent: beginner,
  };
}

// ------------------------------------------------------------------ obligations
export type ObligationStatus = "applies_on_facts" | "needs_verification";
export const OBLIGATION_STATUS_LABEL: Readonly<Record<ObligationStatus, string>> = {
  applies_on_facts: "Applies on the facts you gave",
  needs_verification: "May apply: needs more facts or a check",
};

type Ref = { law: string; heading?: string; schedule?: string };
interface Rule {
  id: string;
  tax: string;
  title: string;
  status: (f: Facts, p: Profile) => ObligationStatus | null;
  why: (f: Facts, p: Profile) => string[];
  what: string;
  professional: string;
  todo: string[];
  when: string;
  documents: string[];
  refs: Ref[];
  tool?: Link;
  gap?: string;
}

const yes = (v: string | undefined) => v === "yes";
const isBusiness = (f: Facts, p: Profile) => yes(f.selfEmployed) || ["self_employed", "small_business", "company", "finance_manager"].includes(p.userCategory ?? "") || p.purpose === "business" || p.purpose === "both" || Boolean(p.businessType);
const isCompany = (p: Profile) => p.businessType === "company" || p.userCategory === "company";
const NO_DEADLINE = "TaxComp does not yet hold a verified due date for this; check the cited provision or URA before relying on a date.";

export const RULES: Rule[] = [
  { id: "registration", tax: "Registration", title: "Register for tax and get a TIN",
    status: (f, p) => (isBusiness(f, p) || yes(f.employsStaff) || yes(f.rentalIncome) ? "applies_on_facts" : yes(f.employed) ? "needs_verification" : null),
    why: (f, p) => [isBusiness(f, p) ? "You run a business or work for yourself." : "", yes(f.employsStaff) ? "You employ staff." : "", yes(f.rentalIncome) ? "You earn rental income." : "", yes(f.employed) && !isBusiness(f, p) ? "You are employed; your employer may already have registered you." : ""].filter(Boolean),
    what: "A Taxpayer Identification Number (TIN) identifies you to URA. You need one to file returns and pay tax.",
    professional: "Registration and TIN under the Tax Procedures Code Act; penalty for failing to apply for registration.",
    todo: ["Apply for a TIN on the URA portal (individuals and non-individuals have separate forms).", "Keep your TIN certificate."], when: "Before you start trading or receiving income that is taxed.",
    documents: ["National ID or passport", "Business registration documents (for a business)"], refs: [{ law: "tpca", heading: "Registration" }, { law: "tpca", heading: "Tax identification number" }, { law: "tpca", heading: "Penalty for failing to apply for registration" }], tool: { label: "Tax guides", href: "#kb-guides" } },
  { id: "paye-employee", tax: "PAYE", title: "PAYE on your salary",
    status: (f) => (yes(f.employed) ? "applies_on_facts" : null), why: () => ["You told us you are employed."],
    what: "Your employer deducts income tax (PAYE) from your salary every month and pays it to URA. You usually do not pay it yourself.",
    professional: "Employment income and employer withholding; check whether a return is still required where there is other income.",
    todo: ["Check that your payslip shows PAYE.", "If you have other income (rent, business, foreign income), check whether you must file a return."], when: "Each pay period (deducted by your employer).",
    documents: ["Payslips", "Employment contract"], refs: [{ law: "ita", heading: "Employment income" }, { law: "ita", heading: "Withholding of tax by employers" }, { law: "ita", heading: "Cases where returns of income not required" }], tool: { label: "PAYE calculator", href: "#calc-paye" } },
  { id: "paye-employer", tax: "PAYE", title: "Withhold PAYE for your employees",
    status: (f) => (yes(f.employsStaff) ? "applies_on_facts" : null), why: () => ["You told us you employ staff."],
    what: "As an employer you must take PAYE out of your employees' pay and pay it to URA, with a return.",
    professional: "Employer withholding obligation on employment income; record keeping; payroll reconciliation.",
    todo: ["Run payroll with PAYE for each employee.", "File the PAYE return and pay URA.", "Keep payroll records."], when: `Every month you pay salaries. ${NO_DEADLINE}`,
    documents: ["Payroll register", "Employment contracts", "Payslips"], refs: [{ law: "ita", heading: "Withholding of tax by employers" }, { law: "ita", heading: "Employment income" }, { law: "tpca", heading: "Accounts and records" }], tool: { label: "PAYE calculator", href: "#calc-paye" } },
  { id: "nssf", tax: "NSSF", title: "NSSF contributions for employees",
    status: (f) => (yes(f.employsStaff) ? "needs_verification" : null), why: () => ["You employ staff; whether you must register depends on the NSSF Act's eligibility rules."],
    what: "Employers may have to register with NSSF and pay contributions for their employees.",
    professional: "Compulsory registration and standard contributions; confirm current eligibility and any amendments.",
    todo: ["Check whether your business and employees must register with NSSF.", "If so, register and pay contributions."], when: NO_DEADLINE,
    documents: ["Employee list", "Payroll records"], refs: [{ law: "nssf", heading: "Compulsory registration of employers and eligible employees" }, { law: "nssf", heading: "Payment of standard contribution by employers" }] },
  { id: "local-service-tax", tax: "Local Service Tax", title: "Local Service Tax on employees",
    status: (f) => (yes(f.employsStaff) || yes(f.employed) ? "needs_verification" : null), why: (f) => [yes(f.employsStaff) ? "You employ staff." : "You are employed."],
    what: "Local Service Tax is a local government tax that employers may deduct from employees.",
    professional: "Local Governments Act, Cap. 138 (extract). Not in TaxComp's legislative database.",
    todo: ["Check with your local government whether Local Service Tax applies."], when: NO_DEADLINE, documents: ["Payslips"], refs: [], gap: "ug-local-service-tax" },
  { id: "income-tax-return", tax: "Income tax", title: "File an income tax return",
    status: (f, p) => (isBusiness(f, p) || yes(f.rentalIncome) || yes(f.foreignIncome) ? "applies_on_facts" : null),
    why: (f, p) => [isBusiness(f, p) ? "You earn business income." : "", yes(f.rentalIncome) ? "You earn rental income." : "", yes(f.foreignIncome) ? "You receive income from abroad." : ""].filter(Boolean),
    what: "You report your income to URA once a year in a return, and pay any tax due.",
    professional: "Furnishing of returns; cases where returns are not required; failure to furnish returns.",
    todo: ["Keep records of income and expenses through the year.", "File the annual return on the URA portal."], when: `Once a year. ${NO_DEADLINE}`,
    documents: ["Income records", "Expense receipts", "Bank statements"], refs: [{ law: "ita", heading: "Furnishing of return of income" }, { law: "ita", heading: "Cases where returns of income not required" }, { law: "tpca", heading: "Furnishing of tax returns" }], tool: { label: "Individual income tax", href: "#calc-individual" } },
  { id: "provisional-tax", tax: "Income tax", title: "Provisional (instalment) tax",
    status: (f, p) => (isBusiness(f, p) ? "needs_verification" : null), why: () => ["You earn business income; whether instalments apply depends on your expected income and the Act."],
    what: "Some taxpayers estimate their tax and pay it in instalments during the year.",
    professional: "Provisional tax and penal tax for understating estimates.", todo: ["Check whether you must make a provisional return and instalments."], when: NO_DEADLINE,
    documents: ["Estimated income and expenses"], refs: [{ law: "ita", heading: "Payment of provisional tax" }, { law: "tpca", heading: "Penal tax for understating provisional tax estimates" }] },
  { id: "corporation-tax", tax: "Corporation income tax", title: "Corporation income tax",
    status: (_f, p) => (isCompany(p) ? "applies_on_facts" : null), why: () => ["You told us your business is a company."],
    what: "A company pays income tax on its profits and files a return each year.",
    professional: "Company rate, residence, chargeable income, returns and provisional tax.", todo: ["Prepare accounts and the tax computation.", "File the company return and pay the tax due."], when: `Each year of income. ${NO_DEADLINE}`,
    documents: ["Financial statements", "Tax computation", "Fixed asset register"], refs: [{ law: "ita", heading: "Rate of income tax for companies" }, { law: "ita", heading: "Resident company" }, { law: "ita", heading: "Chargeable income" }, { law: "ita", heading: "Furnishing of return of income" }], tool: { label: "Company tax calculator", href: "#calc-company" } },
  { id: "vat", tax: "VAT", title: "VAT returns and invoices",
    status: (f) => (yes(f.vatRegistered) ? "applies_on_facts" : null), why: () => ["You told us you are registered for VAT."],
    what: "As a VAT-registered business you charge VAT on taxable sales, claim VAT on purchases and file VAT returns.",
    professional: "Returns, tax invoices and input tax credit; electronic invoicing.", todo: ["Issue tax invoices for taxable supplies.", "File VAT returns and pay the VAT due."], when: `Each VAT period. ${NO_DEADLINE}`,
    documents: ["Sales and purchase invoices", "EFRIS records"], refs: [{ law: "vata", heading: "Returns" }, { law: "vata", heading: "Tax invoices" }, { law: "vata", heading: "Credit for input tax" }], tool: { label: "VAT calculator", href: "#calc-vat" } },
  { id: "vat-registration", tax: "VAT", title: "Check whether you must register for VAT",
    status: (f, p) => (isBusiness(f, p) && !yes(f.vatRegistered) ? "needs_verification" : null),
    why: (f) => [f.vatRegistered === "no" ? "You are not registered for VAT." : "We do not know whether you are registered for VAT.", "Registration depends on your taxable sales compared with the registration threshold, which TaxComp has not verified for the current period."],
    what: "Businesses whose taxable sales pass a set level must register for VAT. Smaller businesses may choose to register.",
    professional: "Persons required or permitted to register; registration; the threshold must be confirmed for the period.", todo: ["Add up your taxable sales.", "Compare them with the current VAT registration threshold published by URA."], when: NO_DEADLINE,
    documents: ["Sales records"], refs: [{ law: "vata", heading: "Persons required or permitted to register" }, { law: "vata", heading: "Registration" }], tool: { label: "VAT calculator", href: "#calc-vat" } },
  { id: "efris", tax: "Electronic invoicing", title: "Electronic receipting and invoicing (EFRIS)",
    status: (f) => (yes(f.vatRegistered) ? "needs_verification" : null), why: () => ["VAT-registered businesses and other designated taxpayers may have to issue e-invoices or e-receipts."],
    what: "Some businesses must issue receipts and invoices through URA's electronic system (EFRIS).", professional: "Electronic receipting and invoicing; offences for failure to use it.",
    todo: ["Check whether you are designated to use EFRIS."], when: NO_DEADLINE, documents: ["EFRIS invoices"], refs: [{ law: "tpca", heading: "Electronic receipting and electronic invoicing" }, { law: "tpca", heading: "Failure to use electronic receipting or invoicing" }] },
  { id: "presumptive", tax: "Presumptive tax", title: "Small business (presumptive) tax",
    status: (f, p) => (isBusiness(f, p) && !isCompany(p) && f.smallTurnover !== "no" ? "needs_verification" : null),
    why: () => ["Small businesses below a turnover limit may pay tax at fixed amounts or rates instead of on profit; the limit must be checked."],
    what: "Very small businesses may pay a simpler 'presumptive' tax based on turnover.", professional: "Small business taxpayers' rates (Income Tax Act schedule); eligibility to be confirmed.",
    todo: ["Check whether your turnover is within the small business limit for the year."], when: NO_DEADLINE, documents: ["Sales records"], refs: [{ law: "ita", schedule: "Schedule 3" }], tool: { label: "Presumptive tax calculator", href: "#calc-presumptive" } },
  { id: "rental", tax: "Rental tax", title: "Tax on rental income",
    status: (f) => (yes(f.rentalIncome) ? "applies_on_facts" : null), why: () => ["You told us you earn rental income."],
    what: "Rent you receive is taxed. Individuals and companies are treated differently.", professional: "Rental tax imposed; procedure relating to rental tax.",
    todo: ["Keep records of rent received and allowable costs.", "File the rental return and pay the tax."], when: NO_DEADLINE,
    documents: ["Tenancy agreements", "Rent receipts"], refs: [{ law: "ita", heading: "Rental tax imposed" }, { law: "ita", heading: "Rental tax" }], tool: { label: "Rental tax calculator", href: "#calc-rental" } },
  { id: "withholding-agent", tax: "Withholding tax", title: "Withholding tax on payments you make",
    status: (f) => (yes(f.paysSuppliers) ? "needs_verification" : null), why: () => ["You pay suppliers or professionals; only certain payers (for example designated withholding agents) must withhold."],
    what: "Some payers must keep back part of a payment to a supplier or professional and pay it to URA.", professional: "Withholding on professional fees and on payments for goods and services by designated agents; withholding as final tax.",
    todo: ["Check whether you are a designated withholding agent.", "If so, withhold, file the return and give certificates."], when: NO_DEADLINE,
    documents: ["Supplier invoices", "Withholding tax certificates"], refs: [{ law: "ita", heading: "Withholding tax from professional fees" }, { law: "ita", heading: "Payment for goods and services" }, { law: "ita", heading: "Withholding as final tax" }], tool: { label: "Withholding calculator", href: "#calc-withholding" } },
  { id: "wht-nonresident", tax: "Withholding tax", title: "Tax on payments to non-residents",
    status: (f) => (yes(f.paysNonResidents) ? "needs_verification" : null), why: () => ["You make payments to people or companies outside Uganda; exemptions and treaties may change the result."],
    what: "Payments to non-residents (for example for services, royalties or interest) may require you to withhold tax.", professional: "Tax on international payments; withholding on international payments; international agreements.",
    todo: ["Check the type of payment and the recipient's country.", "Check whether a tax treaty applies."], when: NO_DEADLINE,
    documents: ["Contracts", "Invoices", "Residence certificates"], refs: [{ law: "ita", heading: "Tax on international payments" }, { law: "ita", heading: "International payments" }, { law: "ita", heading: "International agreements" }], tool: { label: "International tax guide", href: "#international-tax" } },
  { id: "foreign-income", tax: "Income tax", title: "Income from abroad",
    status: (f) => (yes(f.foreignIncome) ? "needs_verification" : null), why: () => ["You receive income from outside Uganda; residence, the type of income and any treaty decide the result."],
    what: "If you live in Uganda, income from abroad may be taxed here, with credit for tax paid abroad.", professional: "Source of income, foreign-source employment income, foreign tax credit.",
    todo: ["Use the guided international question to work through your facts."], when: NO_DEADLINE, documents: ["Foreign payslips or invoices", "Proof of foreign tax paid"],
    refs: [{ law: "ita", heading: "Source of income" }, { law: "ita", heading: "Foreign source employment income" }, { law: "ita", heading: "Foreign tax credit" }], tool: { label: "International tax guide", href: "#international-tax" } },
  { id: "excise", tax: "Excise duty", title: "Excise duty",
    status: (f) => (yes(f.excisableGoods) ? "needs_verification" : null), why: () => ["You make, import or supply goods or services that may be excisable."],
    what: "Excise duty applies to certain goods and services (for example drinks, fuel, cement).", professional: "Imposition of excise duty; registration of manufacturers, importers and providers.",
    todo: ["Check whether your products are listed as excisable.", "Register if required."], when: NO_DEADLINE, documents: ["Product list", "Import documents"], refs: [{ law: "eda", heading: "Imposition of excise duty" }, { law: "eda", heading: "Registration of manufacturers, importers and providers of excisable goods and services" }] },
  { id: "stamp-duty", tax: "Stamp duty", title: "Stamp duty on documents",
    status: (f) => (yes(f.instruments) ? "needs_verification" : null), why: () => ["You sign documents such as leases, transfers or agreements that may attract stamp duty."],
    what: "Stamp duty is paid on certain legal documents, such as transfers and leases.", professional: "Instruments chargeable with duty; rates by instrument in the schedule.",
    todo: ["Check whether your document is chargeable and the duty due."], when: "Usually around the time the document is signed. " + NO_DEADLINE, documents: ["The signed document"], refs: [{ law: "sda", heading: "Instruments chargeable with duty" }] },
  { id: "gaming", tax: "Gaming tax", title: "Tax on gaming and betting",
    status: (_f, p) => (p.businessSector === "gaming" ? "applies_on_facts" : null), why: () => ["You told us your business is in gaming or betting."],
    what: "Casinos, gaming and betting businesses pay a special tax.", professional: "Tax on casinos, gaming or betting; collection, interest and penal tax.",
    todo: ["Check your licence and the tax returns required."], when: NO_DEADLINE, documents: ["Licence", "Gaming records"], refs: [{ law: "lga", heading: "Tax on casinos, gaming or betting" }] },
  { id: "records", tax: "Records", title: "Keep proper records",
    status: (f, p) => (isBusiness(f, p) || yes(f.employsStaff) || yes(f.rentalIncome) ? "applies_on_facts" : null), why: () => ["You have a business, employees or rental income."],
    what: "You must keep records that support your returns, so URA can check them.", professional: "Accounts and records; penal tax for failing to maintain proper records.",
    todo: ["Keep invoices, receipts, contracts and bank statements.", "Keep them for as long as the law requires."], when: "Always.", documents: ["All financial records"],
    refs: [{ law: "tpca", heading: "Accounts and records" }, { law: "tpca", heading: "Penal tax for failing to maintain proper records" }], tool: { label: "Financial records", href: "#ws-records" } },
];

export interface ProvisionRef { citation: string; heading: string; lawId: string; sectionNumber: string | null; verificationStatus: string; evidenceLabel: string; editionLabel: string }
export interface Obligation {
  id: string; tax: string; title: string; status: ObligationStatus; statusLabel: string; why: string[]; what: string; professional: string;
  todo: string[]; when: string; documents: string[]; provisions: ProvisionRef[]; missingLaw: string | null; tool: Link | null;
}
export interface DiscoveryResult {
  generatedAt: string; obligations: Obligation[]; unanswered: FactKey[]; notes: string[];
}

/** Looks up the cited provisions in the legislative database (latest edition). */
export async function resolveRefs(db: Database, refs: Ref[]): Promise<Map<string, ProvisionRef>> {
  const out = new Map<string, ProvisionRef>();
  if (!refs.length) return out;
  const edition = await db.prepare(`SELECT id, label FROM legislation_editions WHERE jurisdiction = 'UG' ORDER BY effective_from DESC LIMIT 1`).first<Row>();
  if (!edition) return out;
  for (const ref of refs) {
    const key = `${ref.law}|${ref.heading ?? ""}|${ref.schedule ?? ""}`;
    if (out.has(key)) continue;
    if (ref.heading) {
      const r = await db.prepare(`SELECT s.section_number AS n, s.heading AS h, s.verification_status AS st, v.official_title AS t, v.chapter AS c, l.category AS cat
        FROM legislation_sections s JOIN legislation_law_versions v ON v.id = s.law_version_id JOIN legislation_laws l ON l.id = v.law_id
        WHERE v.edition_id = ? AND v.law_id = ? AND lower(s.heading) = lower(?) ORDER BY s.position LIMIT 1`).bind(edition.id, ref.law, ref.heading).first<Row>();
      if (r) out.set(key, { citation: `${String(r.t)}${r.c ? ` (${String(r.c)})` : ""}, ${r.cat === "act" ? "s." : "reg. "}${String(r.n)}`, heading: String(r.h), lawId: ref.law, sectionNumber: String(r.n), verificationStatus: String(r.st), evidenceLabel: r.st === "verified" ? "Verified heading; no wording held" : "Unverified heading; no wording held", editionLabel: String(edition.label) });
    } else if (ref.schedule) {
      const r = await db.prepare(`SELECT sc.label AS lb, sc.title AS ti, sc.verification_status AS st, v.official_title AS t, v.chapter AS c FROM legislation_schedules sc JOIN legislation_law_versions v ON v.id = sc.law_version_id
        WHERE v.edition_id = ? AND v.law_id = ? AND sc.label = ? LIMIT 1`).bind(edition.id, ref.law, ref.schedule).first<Row>();
      if (r) out.set(key, { citation: `${String(r.t)}${r.c ? ` (${String(r.c)})` : ""}, ${String(r.lb)}`, heading: String(r.ti ?? ""), lawId: ref.law, sectionNumber: null, verificationStatus: String(r.st), evidenceLabel: r.st === "verified" ? "Verified heading; no wording held" : "Unverified heading; no wording held", editionLabel: String(edition.label) });
    }
  }
  return out;
}

/** "Discover my tax obligations": only obligations the facts support, each with its legal basis. */
export async function discoverObligations(db: Database, profile: Profile, now: string): Promise<DiscoveryResult> {
  const facts = { ...profile.facts };
  if (profile.userCategory === "employee" && !facts.employed) facts.employed = "yes";
  if (profile.userCategory === "self_employed" && !facts.selfEmployed) facts.selfEmployed = "yes";
  const matched = RULES.map((rule) => ({ rule, status: rule.status(facts, profile) })).filter((m): m is { rule: Rule; status: ObligationStatus } => m.status !== null);
  const resolved = await resolveRefs(db, matched.flatMap((m) => m.rule.refs));
  const obligations = matched.map(({ rule, status }) => ({
    id: rule.id, tax: rule.tax, title: rule.title, status, statusLabel: OBLIGATION_STATUS_LABEL[status], why: rule.why(facts, profile), what: rule.what, professional: rule.professional,
    todo: rule.todo, when: rule.when, documents: rule.documents,
    provisions: rule.refs.map((ref) => resolved.get(`${ref.law}|${ref.heading ?? ""}|${ref.schedule ?? ""}`)).filter((p): p is ProvisionRef => Boolean(p)),
    missingLaw: rule.gap ? "This law is not in TaxComp's legislative database yet." : null,
    tool: rule.tool ?? null,
  }));
  obligations.sort((a, b) => (a.status === b.status ? 0 : a.status === "applies_on_facts" ? -1 : 1));
  const unanswered = FACT_KEYS.filter((k) => !facts[k]);
  return {
    generatedAt: now, obligations, unanswered,
    notes: [
      "This is guidance based on your answers, not a ruling that you are liable. Obligations marked 'May apply' need more facts or a check.",
      "The provisions cited are section headings from TaxComp's legislative database (the 2024 revised edition as at FY 2024/25). They are unverified and may have been changed by the 2025 and 2026 amendments.",
      "TaxComp does not state due dates, rates or thresholds it has not verified.",
    ],
  };
}

// ------------------------------------------------------------------ recommendations
export interface Recommendation { id: string; text: string; evidence: string; action: Link; kind: "profile" | "obligation" | "case" | "client" | "legislation" | "change_2026"; conflict?: boolean }

const PERSONAL = ["individual", "employee"];
const BUSINESS = ["self_employed", "small_business", "company"];
const PROFESSIONAL = ["accountant", "consultant", "finance_manager", "tax_administrator"];

/**
 * 2026 changes from the amendments register that the user's category or answers
 * point to. Text and figures come from the register (both figures where the
 * Bill and the reported Act differ), never from this code.
 */
export async function changes2026(db: Database, profile: Profile | null): Promise<Recommendation[]> {
  if (!profile?.userCategory && !Object.keys(profile?.facts ?? {}).length) return [];
  const category = profile?.userCategory ?? "";
  const facts = profile?.facts ?? {};
  const wanted: Array<[string, string, Link]> = [];
  const employer = facts.employsStaff === "yes" || (facts.employsStaff !== "no" && ["small_business", "company", "finance_manager", "accountant"].includes(category));
  if (PERSONAL.includes(category) || facts.employed === "yes") wanted.push(["ita-2026-sch4-individual-rates", "Your income tax bands changed from 1 July 2026.", { label: "PAYE calculator", href: "#calc-paye" }]);
  else if (employer) wanted.push(["ita-2026-sch4-individual-rates", "Payroll from July 2026 uses new PAYE bands; months before July use the old ones.", { label: "PAYE calculator", href: "#calc-paye" }]);
  if (BUSINESS.includes(category) || PROFESSIONAL.includes(category) || facts.vatRegistered === "yes" || facts.selfEmployed === "yes") {
    wanted.push(["vat-2026-s7-registration-threshold", "The VAT registration threshold was raised in 2026.", { label: "VAT calculator", href: "#calc-vat" }]);
  }
  if (facts.vatRegistered === "yes") wanted.push(["vat-2026-s5-withholding-einvoice", "VAT withholding changed for supplies with an e-invoice or e-receipt.", { label: "Changes made in 2026", href: "#kb-laws" }]);
  if (facts.excisableGoods === "yes") wanted.push(["eda-2026-motor-spirit", "Excise duty rates changed in 2026, for example on fuel, cement, sugar and cooking oil.", { label: "Changes made in 2026", href: "#kb-laws" }]);
  if (facts.rentalIncome === "yes") wanted.push(["ita-2026-s124-rental-monthly", "Individuals with rental income may now file monthly provisional rental returns.", { label: "Rental tax calculator", href: "#calc-rental" }]);
  if (!wanted.length) return [];
  const register = new Map((await listAmendments(db, {})).map((a) => [a.id, a]));
  const out: Recommendation[] = [];
  for (const [id, text, action] of wanted) {
    const a = register.get(id);
    if (!a) continue;
    const figures = amendmentFigures(a);
    out.push({
      id: `change-${id}`, kind: "change_2026", text, action, conflict: a.figuresDiffer,
      evidence: `${a.principalAct}, ${a.provision}: ${a.summary}${figures ? ` ${figures}` : ""} ${a.evidenceLabel}; ${a.verificationLabel.toLowerCase()}.`,
    });
  }
  if (PROFESSIONAL.includes(category)) {
    const all = [...register.values()];
    const differ = all.filter((a) => a.figuresDiffer).length;
    out.push({ id: "change-register", kind: "change_2026", text: `${all.length} changes made by the 2026 amendments are in TaxComp's register; ${differ} have different figures in the Bill and the reported Act.`,
      evidence: "From TaxComp's 2026 amendments register: the Bills as published by Parliament and reports of the enacted Acts, not yet verified against the gazetted Acts.", action: { label: "Changes made in 2026", href: "#kb-laws" }, conflict: differ > 0 });
  }
  return out;
}

export async function recommendations(db: Database, profile: Profile | null, userId: string, today: string): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  if (!profile || !profile.onboardingCompletedAt) {
    recs.push({ id: "onboarding", text: "Tell TaxComp a little about yourself so your dashboard shows what matters to you.", evidence: "You have not completed your profile yet.", action: { label: "Set up my profile", href: "#ws-dashboard-profile" }, kind: "profile" });
  }
  const category = profile?.userCategory ?? null;
  if (profile && !profile.discovery && !["accountant", "consultant", "tax_administrator"].includes(category ?? "")) {
    const personal = ["individual", "employee"].includes(category ?? "") || profile.purpose === "personal";
    recs.push({ id: "discover", text: personal ? "Let's establish whether you have any personal income tax obligations." : "Find out which taxes may apply to your business.", evidence: `Your profile says: ${category ? CATEGORY_LABEL[category] : profile.purpose ?? "no category yet"}. You have not run the obligation check.`, action: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" }, kind: "profile" });
  }
  const applies = new Set((profile?.discovery?.obligations ?? []).filter((o) => o.status === "applies_on_facts").map((o) => o.id));
  if (applies.has("corporation-tax")) recs.push({ id: "cit", text: "You may need to review your corporation income tax obligations for the current year.", evidence: "Your obligation check found corporation income tax applies on the facts you gave (your business is a company).", action: { label: "Company tax calculator", href: "#calc-company" }, kind: "obligation" });
  if (applies.has("paye-employer")) recs.push({ id: "paye", text: "Review your PAYE obligations and employee payroll records before the next filing deadline.", evidence: "You told us you employ staff.", action: { label: "PAYE calculator", href: "#calc-paye" }, kind: "obligation" });
  if (applies.has("vat")) recs.push({ id: "vat", text: "Check your VAT invoices and input tax claims before your next VAT return.", evidence: "You told us you are registered for VAT.", action: { label: "VAT calculator", href: "#calc-vat" }, kind: "obligation" });
  if (applies.has("rental")) recs.push({ id: "rental", text: "Work out the tax on your rental income.", evidence: "You told us you earn rental income.", action: { label: "Rental tax calculator", href: "#calc-rental" }, kind: "obligation" });
  const verify = (profile?.discovery?.obligations ?? []).filter((o) => o.status === "needs_verification").length;
  if (verify) recs.push({ id: "verify", text: `${verify} possible obligation${verify === 1 ? " needs" : "s need"} more facts or a check.`, evidence: "From your last obligation check.", action: { label: "See my obligations", href: "#ws-dashboard-discover" }, kind: "obligation" });

  // Assessment cases (Challenge an Assessment).
  const cases = await db.prepare(`SELECT count(*)::int AS n, sum(CASE WHEN principal IS NOT NULL THEN principal ELSE 0 END)::float AS total FROM challenge_cases WHERE owner_user_id = ?`).bind(userId).first<Row>();
  if (Number(cases?.n ?? 0) > 0) recs.push({ id: "cases", text: `You have ${Number(cases?.n)} URA assessment case${Number(cases?.n) === 1 ? "" : "s"} in TaxComp. Check the objection deadline on each.`, evidence: "From your Challenge an Assessment cases.", action: { label: "My assessments", href: "#ws-assessments" }, kind: "case" });

  // Client compliance tasks (practice workspace) for professionals.
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const until = horizon.toISOString().slice(0, 10);
  const tasks = await db.prepare(`SELECT count(*)::int AS n, min(COALESCE(o.filing_deadline, o.payment_deadline)) AS next FROM phase6_obligations o
    JOIN phase6_memberships m ON m.organization_id = o.organization_id AND m.user_id = ? AND m.status = 'active' AND m.role <> 'client'
    WHERE (o.filing_status <> 'filed' OR o.payment_status <> 'paid') AND COALESCE(o.filing_deadline, o.payment_deadline) IS NOT NULL AND COALESCE(o.filing_deadline, o.payment_deadline) <= ?`).bind(userId, until).first<Row>();
  if (Number(tasks?.n ?? 0) > 0) recs.push({ id: "clients", text: `You have ${Number(tasks?.n)} client tax compliance task${Number(tasks?.n) === 1 ? "" : "s"} approaching ${Number(tasks?.n) === 1 ? "its deadline" : "their deadlines"} (the next on ${String(tasks?.next)}).`, evidence: "From client obligations in your practice workspace due within 30 days or overdue.", action: { label: "Practice workspace", href: "#ws-overview" }, kind: "client" });

  // Legislation: what the knowledge base can and cannot tell professional users.
  if (["accountant", "consultant", "finance_manager", "tax_administrator", "company"].includes(category ?? "")) {
    const bills = await db.prepare(`SELECT count(*)::int AS n FROM law_watch_bills WHERE last_changed_at >= ?`).bind(new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString()).first<Row>();
    if (Number(bills?.n ?? 0) > 0) recs.push({ id: "bills", text: `${Number(bills?.n)} tax Bill${Number(bills?.n) === 1 ? "" : "s"} changed stage in Parliament in the last 30 days.`, evidence: "From TaxComp's legislative watch of Parliament's Bill Tracker.", action: { label: "Tax legislation", href: "#kb-laws" }, kind: "legislation" });
    recs.push({ id: "law-edition", text: "TaxComp's legislation database holds the FY 2024/25 section headings; the six Acts amended in 2026 are marked for amendment review.", evidence: "From the legislative database and the 2026 amendments register.", action: { label: "Structure of the tax Acts", href: "#kb-laws" }, kind: "legislation" });
  }
  return [...await changes2026(db, profile), ...recs];
}

/** Short profile context for the AI assistant (enumerated values only). */
export function profileContext(profile: Profile | null): string {
  if (!profile) return "";
  const parts = [profile.userCategory ? `The user describes themselves as: ${CATEGORY_LABEL[profile.userCategory]}.` : "",
    profile.businessType ? `Business type: ${profile.businessType.replace("_", " ")}.` : "",
    profile.experienceMode === "simple" ? "Explain in plain everyday language, avoid jargon, give steps and say what to do next." : "The user is a professional: be technical and cite provisions.",
  ].filter(Boolean);
  return parts.join(" ");
}
