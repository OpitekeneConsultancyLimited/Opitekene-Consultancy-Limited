// Shared types for Challenge an Assessment. Pure data; no I/O.

export type IsoDate = string; // YYYY-MM-DD

/** PAYE and withholding tax are both charged under the Income Tax Act. */
export type TaxHead = "income_tax" | "vat" | "paye" | "wht";
export const TAX_HEADS: readonly TaxHead[] = Object.freeze(["income_tax", "vat", "paye", "wht"]);
export type AssessmentType = "original" | "additional" | "other";
export type ServiceMethod = "hand" | "email" | "ura-portal" | "post" | "other";

export type Outcome =
  | "correct"
  | "computational_error"
  | "insufficient_evidence"
  | "arguable_legal_ground"
  | "procedural_issue";

export type ItemCategory =
  | "income" | "expense" | "input_vat" | "output_vat" | "penal_tax" | "interest" | "credit" | "procedural" | "other"
  // PAYE: whether a payment to staff is taxable employment income.
  | "employment_income"
  // WHT: tax the business should have taken off a payment it made (as withholding agent).
  | "withholding";

export const ITEM_CATEGORIES: readonly ItemCategory[] = Object.freeze([
  "income", "expense", "input_vat", "output_vat", "penal_tax", "interest", "credit", "procedural", "other", "employment_income", "withholding",
]);

export type ConfirmableField =
  | "tin" | "tax_head" | "assessment_type" | "period_start" | "period_end" | "date_issued"
  | "principal" | "penal_tax" | "interest" | "ura_reasons" | "provisions_cited"
  | "interest_rate_percent_per_month" | "interest_months" | "penal_tax_percent";

export interface ProcedureRule {
  ruleKey: "objection" | "late_objection" | "objection_decision" | "tat_application" | "tat_payment" | "adr";
  label: string;
  triggerEvent: string;
  periodDays: number | null;
  urgentDays: number | null;
  excludeTriggerDay: boolean;
  weekendHolidayRule: "calendar" | "next_business_day";
  countingTodoVerify: boolean;
  paymentFraction: number | null;
  description: string;
  sourceUrl: string | null;
}

/** A Uganda public holiday (taxcomp.public_holidays). */
export interface PublicHoliday {
  date: IsoDate;
  name: string;
  /** Checked by a reviewer. Only verified holidays can move a deadline later. */
  verified: boolean;
  sourceUrl: string | null;
  note: string;
}

export interface RuleSet {
  version: string;
  title: string;
  approvedForComputation: boolean;
  sources: string[];
  rules: ProcedureRule[];
}

export interface Statute {
  id: string;
  title: string;
  chapter: string | null;
  kind: "principal" | "amendment";
  parentId: string | null;
  billStatus: "bill" | "passed" | "returned" | "assented" | "in_force";
  returnedDate: IsoDate | null;
  assentDate: IsoDate | null;
  commencementDate: IsoDate | null;
  appliesFromPeriod: IsoDate | null;
  sourceUrl: string | null;
  note: string;
}

export interface ComputationFormula {
  kind?: "simple-monthly" | "percent-of-principal";
  ratePercentPerMonth?: number | null;
  percent?: number | null;
  todo?: string;
}

export interface ProvisionVersion {
  id: string;
  statuteId: string;
  topic: string;
  section: string;
  heading: string;
  textOrSummary: string;
  textVerified: boolean;
  billStatus: Statute["billStatus"];
  assentDate: IsoDate | null;
  commencementDate: IsoDate | null;
  appliesFromPeriod: IsoDate | null;
  appliesToPeriod: IsoDate | null;
  amendedByStatuteId: string | null;
  computation: ComputationFormula;
  approvedForComputation: boolean;
  sourceUrl: string | null;
  note: string;
}

export interface CaseLaw {
  id: string;
  citation: string;
  parties: string;
  decisionDate: IsoDate | null;
  forum: "TAT";
  background: string | null;
  legalQuestion: string | null;
  decision: string | null;
  principle: string | null;
  summaryStatus: "none" | "draft" | "approved";
  summarySource: "ai" | "staff" | null;
  issueTags: string[];
  searchTerms: string;
  sourceUrl: string;
  appealStatus: "unverified" | "final" | "appealed" | "overturned" | "upheld";
}

export interface DisputedItemFacts {
  /** The user has the records that support their own figure. */
  hasRecords?: boolean;
  /** Plain-language names of documents still missing (e.g. "supplier invoices"). */
  missingDocuments?: string[];
  /** A reason the user or reviewer believes URA read the law wrongly. */
  legalArgument?: string;
  /** Service, time-limit or validity concern. */
  proceduralConcern?: string;
  /** What the payment was for and how it helped earn money (owner's own words). */
  ownerExplanation?: string;
  /** Interest / penal tax: URA's stated basis, from the notice. */
  uraRatePercentPerMonth?: number;
  uraMonths?: number;
  uraPercent?: number;
  /** Base amount URA applied the rate to (defaults to the confirmed principal). */
  baseAmount?: number;
}

export interface DisputedItem {
  id: string;
  position: number;
  category: ItemCategory;
  description: string;
  uraAmount: number | null;
  taxpayerAmount: number | null;
  facts: DisputedItemFacts;
  documentIds: string[];
  reviewerOutcome: Outcome | null;
  keepInObjection: boolean;
}

export interface FieldConfirmation {
  fieldName: ConfirmableField;
  extractedValue: string | null;
  confirmedValue: string | null;
  confidence: number | null;
  source: "ai-claude" | "ai-gemini" | "text-reader" | "user";
  status: "pending" | "confirmed" | "corrected" | "unconfirmable";
}

export interface CaseRow {
  id: string;
  ownerUserId: string;
  taxHead: TaxHead | null;
  assessmentType: AssessmentType | null;
  tin: string | null;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dateIssued: IsoDate | null;
  dateServed: IsoDate | null;
  serviceMethod: ServiceMethod | null;
  principal: number | null;
  penalTax: number | null;
  interest: number | null;
  taxAccepted: number | null;
  uraReasons: string;
  provisionsCited: string[];
  noticeTerms: { interestRatePercentPerMonth?: number; interestMonths?: number; penalTaxPercent?: number };
  status: "draft" | "confirming" | "active" | "objection_filed" | "decision_received" | "tat" | "closed";
  objectionFiledOn: IsoDate | null;
  decisionServedOn: IsoDate | null;
  preparingTat: boolean;
  lateReason: string;
  checklist: Record<string, "received" | "not-available">;
  reviewStatus: "not_required" | "pending" | "approved" | "changes_requested";
  assignedReviewerId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  reviewedCaseVersion: number | null;
  caseVersion: number;
  createdAt: string;
  updatedAt: string;
}
