// Guided answers to the questions ordinary taxpayers ask most.
//
// Plain-language explanations written by TaxComp (not statutory wording),
// each tied to the provisions it rests on, which are resolved by heading
// against the legislative database (never by invented section numbers).
// They state no rate, threshold or deadline that TaxComp has not verified,
// and say so. They answer even when no AI provider is used, and are given to
// the AI as evidence when one is.
import type { Database } from "./store.mts";
import { resolveRefs, type Link } from "./personalise.mts";

interface Ref { law: string; heading?: string; schedule?: string }
export interface Guide {
  id: string;
  pattern: RegExp;
  title: string;
  simple: string;
  professional: string;
  refs: Ref[];
  tool: Link;
}

export const GUIDE_LABEL = "TaxComp general guidance: written by TaxComp, not statutory wording, and not yet verified against the official text.";

export const GUIDES: readonly Guide[] = [
  {
    id: "tin", title: "Do you need a TIN?",
    pattern: /\b(?:tin|tax ?payer identification|tax identification number)\b/i,
    simple: "Yes, in practice. A TIN (Taxpayer Identification Number) is your tax number from URA. A business needs one to register for the taxes that apply to it, file returns and pay tax, and clients, banks and licensing offices commonly ask for it. You apply on the URA web portal: an individual with their National ID, a business with its registration documents. Using someone else's TIN, or a false one, is an offence.",
    professional: "Registration and the TIN are dealt with in the Tax Procedures Code Act (registration; tax identification number; penalty for failing to apply for registration; use of a false TIN). TaxComp holds the headings, not the wording: confirm who must apply and any time limit in the Act.",
    refs: [{ law: "tpca", heading: "Registration" }, { law: "tpca", heading: "Tax identification number" }, { law: "tpca", heading: "Penalty for failing to apply for registration" }, { law: "tpca", heading: "Use of false Tax Identification Number" }],
    tool: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" },
  },
  {
    id: "small-business-taxes", title: "Which taxes apply to a small business?",
    pattern: /\b(?:small business|my business|my shop|sole (?:trader|proprietor))\b.*\b(?:which|what)\b.*\btax(?:es)?\b|\b(?:which|what) tax(?:es)? (?:apply|do i (?:need to )?pay|will i pay|should i pay)\b/i,
    simple: "It depends on what your business does and how big it is. The taxes most small businesses deal with are: income tax on profits (a small business may be able to use the simpler presumptive tax, based on turnover); VAT, only if your taxable sales go above the registration threshold; PAYE, if you employ staff; and withholding tax, if URA designates you or when customers withhold tax from what they pay you. Some businesses also deal with excise duty, stamp duty or local service tax. Answer a few questions in 'Discover my tax obligations' and TaxComp lists the ones your answers point to, with what to do.",
    professional: "Applicable heads turn on the facts: business income (Income Tax Act), the presumptive regime (Income Tax Act, Schedule 3), VAT registration (VAT Act, persons required or permitted to register), employer withholding, and the registration duties in the Tax Procedures Code Act. Use the obligation check to map them against the client's facts.",
    refs: [{ law: "ita", heading: "Business income" }, { law: "ita", schedule: "Schedule 3" }, { law: "vata", heading: "Persons required or permitted to register" }, { law: "ita", heading: "Withholding of tax by employers" }, { law: "tpca", heading: "Registration" }],
    tool: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" },
  },
  {
    id: "paye-employer", title: "Your PAYE obligations as an employer",
    pattern: /\b(?:employees?|staff|employer|workers)\b.*\b(?:paye|obligations?|deduct|tax)\b|\bpaye obligations?\b/i,
    simple: "As an employer you: work out PAYE on each employee's pay using the current bands; deduct it from their pay; pay it to URA and file the PAYE return each month; give employees their pay details; and keep payroll records. NSSF contributions are separate from PAYE. If you do not withhold, the law makes you answerable for it. TaxComp has not verified the monthly due date, so check it on the URA portal. Pay from July 2026 uses the new FY 2026/27 bands.",
    professional: "Employer withholding: Income Tax Act (withholding of tax by employers; payment of tax withheld; failure to withhold tax; record of payments and tax withheld) and the Tax Procedures Code Act (accounts and records). Bands per Schedule 4, Part I as amended from 1 July 2026 (see the 2026 amendments register; unverified).",
    refs: [{ law: "ita", heading: "Withholding of tax by employers" }, { law: "ita", heading: "Payment of tax withheld" }, { law: "ita", heading: "Failure to withhold tax" }, { law: "ita", heading: "Record of payments and tax withheld" }, { law: "tpca", heading: "Accounts and records" }],
    tool: { label: "PAYE calculator", href: "#calc-paye" },
  },
  {
    id: "wht-credit", title: "Claiming tax that was withheld from your payments",
    pattern: /\b(?:withh?olding|wht)\b.*\b(?:credit|claim|certificate|refund|offset)\b|\btax credit certificates?\b/i,
    simple: "When someone withholds tax from a payment to you, they should give you a withholding tax certificate (a tax credit certificate). Keep it. When you file your income tax return for the year, you claim the tax withheld as a credit against the income tax you owe. If your credits are more than the tax you owe, the difference may be refunded or carried forward, after URA's checks. Some withholding is a final tax and cannot be claimed this way, so check the type of payment.",
    professional: "Income Tax Act: tax credit certificates; withholding as final tax; furnishing of return of income. Credits are claimed in the return; final withholding is excluded from the credit.",
    refs: [{ law: "ita", heading: "Tax credit certificates" }, { law: "ita", heading: "Withholding as final tax" }, { law: "ita", heading: "Furnishing of return of income" }, { law: "tpca", heading: "Furnishing of tax returns" }],
    tool: { label: "Withholding calculator", href: "#calc-withholding" },
  },
  {
    id: "dormant-returns", title: "Returns when the business is not operating",
    pattern: /\b(?:not (?:been )?operat(?:ing|ed)|dormant|inactive|no (?:business|activity|income|trading|sales)|stopped (?:trading|operating)|closed (?:down|the business))\b/i,
    simple: "Usually yes. While you are registered with URA, returns are still expected for each period even if the business earned nothing: you file a 'nil' return. If the business has stopped for good, you can apply to URA to deregister instead. Not filing can lead to penalties. TaxComp has not verified the exact rule for each tax, so confirm with URA, especially for VAT and PAYE.",
    professional: "Tax Procedures Code Act: furnishing of tax returns, deregistration, penal tax for default in furnishing a return; Income Tax Act: cases where returns of income are not required; VAT Act: cancellation of registration. The Income Tax (Amendment) Act, 2026 defines 'dormant' for the interest-deduction rule (s.25(5)); that definition does not itself remove filing duties.",
    refs: [{ law: "tpca", heading: "Furnishing of tax returns" }, { law: "tpca", heading: "Deregistration" }, { law: "tpca", heading: "Penal tax for default in furnishing tax return" }, { law: "ita", heading: "Cases where returns of income not required" }, { law: "vata", heading: "Cancellation of registration" }],
    tool: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" },
  },
  {
    id: "late-return", title: "Filing or paying late",
    pattern: /\b(?:late|after the (?:deadline|due date)|missed (?:the )?(?:deadline|due date)|didn'?t file|did not file|failed to file|not filed)\b|\bpenalt(?:y|ies)\b/i,
    simple: "Filing late usually costs you in two ways: a penalty (penal tax) for the late return, and interest on any tax paid late. The amounts depend on the tax and how late you are; TaxComp has not verified the current figures, so it does not state them. File as soon as you can and pay what you owe. If you need more time, ask URA for an extension before the due date. If there was a good reason for the delay, you can ask URA to waive penalties or interest. The 2026 amendments also include waivers for some old debts (see 'Changes made in 2026').",
    professional: "Tax Procedures Code Act: penal tax for default in furnishing a tax return; recovery of interest on unpaid tax; extension of time to furnish a tax return; waiver of interest and penalty. For VAT, also the VAT Act's penal tax and interest on unpaid tax provisions. The 2026 Bill adds waivers (s.47C; s.47D reported) — see the amendments register.",
    refs: [{ law: "tpca", heading: "Penal tax for default in furnishing tax return" }, { law: "tpca", heading: "Recovery of interest on unpaid tax" }, { law: "tpca", heading: "Extension of time to furnish a tax return" }, { law: "tpca", heading: "Waiver of interest and penalty" }, { law: "vata", heading: "Penal tax" }, { law: "vata", heading: "Interest on unpaid tax" }],
    tool: { label: "Changes made in 2026", href: "#kb-laws" },
  },
  {
    id: "deductible-expenses", title: "Which expenses can you deduct?",
    pattern: /\b(?:deduct(?:ible|ion|ions)?|allowable|claim)\b.*\b(?:expenses?|costs?|transport|fuel|travel|vehicles?|car|rent|salar(?:y|ies)|repairs?)\b|\bexpenses?\b.*\b(?:deduct(?:ible)?|allowable)\b/i,
    simple: "Generally, a business can deduct the expenses it incurs to earn its income. So transport costs for business purposes (delivering goods, travelling to clients or suppliers) are usually deductible; private or personal transport is not. Buying a vehicle is a capital cost: it is not deducted at once but through capital allowances (wear and tear) over several years. Where a cost is partly private, only the business part counts. Keep receipts and a record of business use.",
    professional: "Income Tax Act: expenses of deriving income; apportionment of deductions; depreciable assets and the capital allowance classes (the 2026 Bill changes the class referred to in s.34(1); see the amendments register). Private and capital expenditure is excluded from the general deduction.",
    refs: [{ law: "ita", heading: "Expenses of deriving income" }, { law: "ita", heading: "Apportionment of deductions" }, { law: "ita", heading: "Depreciable assets" }],
    tool: { label: "Company tax calculator", href: "#calc-company" },
  },
];

export function matchGuide(question: string): Guide | null {
  const q = question.slice(0, 2000);
  return GUIDES.find((g) => g.pattern.test(q)) ?? null;
}

export interface GuideAnswer {
  id: string;
  title: string;
  simple: string;
  professional: string;
  label: string;
  provisions: Array<{ lawId: string; sectionNumber: string | null; citation: string; heading: string; evidenceLabel: string }>;
  headings: Array<{ law: string; heading: string }>;
  tool: Link;
}

/** The guide with its provisions resolved against the database. */
export async function guideAnswer(db: Database, guide: Guide, question = ""): Promise<GuideAnswer> {
  // The Act the question names comes first (a late VAT return cites the VAT Act's own provisions first).
  const named = /\b(?:vat|value added tax)\b/i.test(question) ? "vata" : /\bpaye|income tax\b/i.test(question) ? "ita" : null;
  const refs = named ? [...guide.refs].sort((a, b) => Number(b.law === named) - Number(a.law === named)) : guide.refs;
  guide = { ...guide, refs };
  const resolved = await resolveRefs(db, guide.refs as Parameters<typeof resolveRefs>[1]);
  const provisions = guide.refs.map((ref) => resolved.get(`${ref.law}|${ref.heading ?? ""}|${ref.schedule ?? ""}`)).filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ lawId: p.lawId, sectionNumber: p.sectionNumber, citation: p.citation, heading: p.heading, evidenceLabel: p.evidenceLabel }));
  return {
    id: guide.id, title: guide.title, simple: guide.simple, professional: guide.professional, label: GUIDE_LABEL, provisions,
    headings: guide.refs.filter((r) => r.heading).map((r) => ({ law: r.law, heading: r.heading as string })), tool: guide.tool,
  };
}

export function guideText(g: GuideAnswer, professional: boolean): string {
  const basis = g.provisions.length ? `Legal basis (headings from TaxComp's legislative database): ${g.provisions.map((p) => p.citation + " – " + p.heading).join("; ")}.` : "";
  return [`${g.title}`, professional ? g.professional : g.simple, basis, `Next step: ${g.tool.label}.`, g.label].filter(Boolean).join("\n");
}

export function guideEvidence(g: GuideAnswer): string {
  return `TaxComp guided answer (non-statutory guidance written by TaxComp; use it, do not add rates or deadlines it does not state): ${g.title}.\nPlain: ${g.simple}\nProfessional: ${g.professional}`;
}
