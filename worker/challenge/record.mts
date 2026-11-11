// Builds the one shared case record that both the owner view and the
// professional view render (brief Section 5). Pure: database rows in, view out.
// Only confirmed figures are used: the case columns hold confirmed values,
// extracted values live in field confirmations until the user confirms them.
import { computeDeadlines, type DeadlineResult } from "./deadlines.mts";
import { formatDate, formatUgx } from "./dates.mts";
import { reconcile, type Reconciliation } from "./classify.mts";
import { approvedFormula, resolveLaw, TOPICS_FOR_CATEGORY, type Citation, type LawResolution } from "./law.mts";
import { packAccess, reviewGate, type PackAccess, type ReviewGate, type Tier } from "./review.mts";
import { scrubSentences } from "./safety.mts";
import { searchCases, TAGS_FOR_CATEGORY } from "./search.mts";
import type { CaseLaw, CaseRow, ConfirmableField, DisputedItem, FieldConfirmation, IsoDate, ProvisionVersion, PublicHoliday, RuleSet, Statute } from "./types.mts";
import { STANDING_DISCLAIMER, TAX_HEAD_LABEL, TAX_HEAD_PLAIN, joinList } from "./wording.mts";

export const REQUIRED_FIELDS: ConfirmableField[] = ["tax_head", "period_start", "period_end", "principal"];

export interface ChecklistItem {
  key: string;
  text: string;
  why: string;
  status: "needed" | "received" | "not-available";
}

export interface ResearchEntry {
  itemId: string;
  description: string;
  provisions: Citation[];
  cases: Array<{
    citation: string; parties: string; decisionDate: IsoDate | null; sourceUrl: string; matchedTags: string[];
    summary: { background: string | null; legalQuestion: string | null; decision: string | null; principle: string | null } | null;
    summaryLabel: string; appealStatus: CaseLaw["appealStatus"];
  }>;
}

export interface CaseView {
  case: CaseRow;
  confirmations: FieldConfirmation[];
  pendingFields: ConfirmableField[];
  readyForAnalysis: boolean;
  explanation: { owner: string[]; professional: string[] };
  deadlines: DeadlineResult;
  law: LawResolution | null;
  reconciliation: Reconciliation;
  research: ResearchEntry[];
  review: ReviewGate;
  access: PackAccess;
  checklist: ChecklistItem[];
  nextStep: string;
  disclaimer: string;
  documents: Array<{ id: string; docType: string; fileName: string; sizeBytes: number; uploadedAt: string }>;
}

export interface ViewInputs {
  row: CaseRow;
  confirmations: FieldConfirmation[];
  items: DisputedItem[];
  documents: CaseView["documents"];
  statutes: Statute[];
  versions: ProvisionVersion[];
  ruleSet: RuleSet;
  /** Listed public holidays; optional so older callers keep working. */
  holidays?: PublicHoliday[];
  caseLaw: CaseLaw[];
  tier: Tier;
  today: IsoDate;
  reviewThresholdUgx: number;
}

const BASE_CHECKLIST: Array<{ key: string; text: string; why: string }> = [
  { key: "notice", text: "The full assessment notice, with any attached schedules", why: "Every objection" },
  { key: "proof-of-receipt", text: "Proof of the day you received the notice (email, delivery book, portal record or envelope)", why: "The time to object counts from this day" },
  { key: "returns", text: "The returns you filed for the period, with their acknowledgements", why: "Every objection" },
  { key: "payments", text: "Payment slips and receipts for tax already paid", why: "Every objection" },
  { key: "correspondence", text: "Letters and emails with URA about this period", why: "Every objection" },
];

function checklistFor(row: CaseRow, reconciliation: Reconciliation): ChecklistItem[] {
  const items = new Map<string, Omit<ChecklistItem, "status">>();
  for (const base of BASE_CHECKLIST) items.set(base.key, base);
  for (const item of reconciliation.items) {
    for (const [index, doc] of item.evidenceGap.entries()) {
      const key = `item-${item.itemId}-${index}`;
      items.set(key, { key, text: doc.charAt(0).toUpperCase() + doc.slice(1), why: `For: ${item.description}` });
    }
  }
  return [...items.values()].map((entry) => ({ ...entry, status: row.checklist[entry.key] ?? "needed" }));
}

function explanation(row: CaseRow): CaseView["explanation"] {
  if (row.taxHead === null || row.principal === null) {
    return {
      owner: ["Confirm the figures from your notice so we can explain what URA is asking for."],
      professional: ["Awaiting confirmed tax head and principal."],
    };
  }
  const total = (row.principal ?? 0) + (row.penalTax ?? 0) + (row.interest ?? 0);
  const period = row.periodStart && row.periodEnd ? ` for ${formatDate(row.periodStart)} to ${formatDate(row.periodEnd)}` : "";
  const parts = [`tax of ${formatUgx(row.principal)}`];
  if (row.penalTax) parts.push(`a penalty of ${formatUgx(row.penalTax)}`);
  if (row.interest) parts.push(`interest of ${formatUgx(row.interest)} for paying late`);
  const reasons = row.uraReasons ? scrubSentences(row.uraReasons).text : "";
  const owner = [
    `URA says you owe ${formatUgx(total)} in ${TAX_HEAD_PLAIN[row.taxHead]}${period}.`,
    `That is made up of ${joinList(parts)}.`,
    reasons ? `URA's reason, in its own words: “${reasons}”` : "The notice does not give URA's reason. You can ask URA for it in your objection.",
  ];
  if (row.taxAccepted !== null) owner.push(`You told us you accept ${formatUgx(row.taxAccepted)} of the tax.`);
  const professional = [
    `${TAX_HEAD_LABEL[row.taxHead]} ${row.assessmentType ?? "assessment"}${row.tin ? `, TIN ${row.tin}` : ""}${period}.`,
    `Principal ${formatUgx(row.principal)}; penal tax ${formatUgx(row.penalTax ?? 0)}; interest ${formatUgx(row.interest ?? 0)}; total ${formatUgx(total)}.`,
    `Provisions cited by URA: ${row.provisionsCited.length ? row.provisionsCited.join("; ") : "none stated"}.`,
    `Issued ${row.dateIssued ? formatDate(row.dateIssued) : "date not confirmed"}; received ${row.dateServed ? formatDate(row.dateServed) : "date not given"}${row.serviceMethod ? ` (${row.serviceMethod})` : ""}.`,
  ];
  return { owner, professional };
}

function nextStep(view: Pick<CaseView, "deadlines" | "readyForAnalysis" | "review">, row: CaseRow): string {
  const objection = view.deadlines.objection;
  if (!view.readyForAnalysis) return "Check the figures we read from your notice and confirm or correct each one.";
  if (objection.state === "unknown") return "Tell us the date you received the notice, so we can show how long you have to object.";
  if (row.decisionServedOn) return "Upload URA's decision. If you disagree with it, a professional should help you apply to the Tax Appeals Tribunal in time.";
  if (row.objectionFiledOn) return "Wait for URA's decision on your objection. We will show when its time to decide runs out.";
  if (view.deadlines.lateObjection.offered) return "Your time to object may have passed. Ask a professional to help you request a late objection, with your reason for the delay.";
  return `Gather the documents on your checklist and lodge your objection by ${objection.dueDate ? formatDate(objection.dueDate) : "the deadline"}.`;
}

export function buildCaseView(input: ViewInputs): CaseView {
  const { row } = input;
  const pending = input.confirmations.filter((field) => field.status === "pending").map((field) => field.fieldName);
  const readyForAnalysis = REQUIRED_FIELDS.every((field) => {
    const confirmation = input.confirmations.find((item) => item.fieldName === field);
    return confirmation ? confirmation.status !== "pending" : false;
  }) && row.taxHead !== null && row.principal !== null && row.periodStart !== null && row.periodEnd !== null;

  const law = readyForAnalysis && row.taxHead && row.periodStart && row.periodEnd
    ? resolveLaw({ taxHead: row.taxHead, periodStart: row.periodStart, periodEnd: row.periodEnd }, input.statutes, input.versions)
    : null;
  const context = {
    principal: row.principal,
    noticeTerms: row.noticeTerms,
    interestFormula: law ? approvedFormula(input.versions, law, "interest") : null,
    penalFormula: law ? approvedFormula(input.versions, law, "penal-tax") : null,
  };
  const reconciliation = reconcile(input.items, context);
  const deadlines = computeDeadlines({
    today: input.today,
    dateServed: row.dateServed,
    objectionFiledOn: row.objectionFiledOn,
    decisionServedOn: row.decisionServedOn,
    taxAssessed: row.principal,
    taxNotInDispute: row.taxAccepted,
    holidays: input.holidays ?? [],
  }, input.ruleSet);
  const review = reviewGate(row, deadlines, reconciliation, input.confirmations, input.reviewThresholdUgx);

  const research: ResearchEntry[] = reconciliation.grounds.map((item) => {
    const topics = TOPICS_FOR_CATEGORY[item.category];
    const provisions = law ? topics.flatMap((topic) => law.byTopic[topic] ?? []) : [];
    const matches = searchCases(input.caseLaw, `${item.description} ${item.reason}`, { limit: 5, tags: TAGS_FOR_CATEGORY[item.category] });
    return {
      itemId: item.itemId,
      description: item.description,
      provisions,
      cases: matches.map(({ caseLaw, matchedTags }) => ({
        citation: caseLaw.citation, parties: caseLaw.parties, decisionDate: caseLaw.decisionDate, sourceUrl: caseLaw.sourceUrl, matchedTags,
        summary: caseLaw.summaryStatus === "none" ? null : { background: caseLaw.background, legalQuestion: caseLaw.legalQuestion, decision: caseLaw.decision, principle: caseLaw.principle },
        summaryLabel: caseLaw.summaryStatus === "approved" ? "Reviewed summary" : caseLaw.summaryStatus === "draft" ? (caseLaw.summarySource === "ai" ? "AI summary, unreviewed" : "Staff summary, unreviewed") : "No summary yet: read the decision on ULII",
        appealStatus: caseLaw.appealStatus,
      })),
    };
  });

  const partial = { deadlines, readyForAnalysis, review };
  return {
    case: row,
    confirmations: input.confirmations,
    pendingFields: pending,
    readyForAnalysis,
    explanation: explanation(row),
    deadlines,
    law,
    reconciliation,
    research,
    review,
    access: packAccess(input.tier, review),
    checklist: checklistFor(row, reconciliation),
    nextStep: nextStep(partial, row),
    disclaimer: STANDING_DISCLAIMER,
    documents: input.documents,
  };
}
