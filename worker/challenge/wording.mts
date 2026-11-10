// Fixed user-facing wording for Challenge an Assessment (brief Section 6).
// Everything a reviewer may want to check is in this one file. Owner-view
// text uses no tax jargon; placeholders are {amount} and {documents}.
import type { ItemCategory, Outcome } from "./types.mts";

export const OUTCOME_OWNER_TEMPLATES: Readonly<Record<Outcome, string>> = Object.freeze({
  correct: "URA's figure for this item looks consistent with your records. Objecting to it is unlikely to help.",
  computational_error: "We found a difference of UGX {amount} between URA's figure and your records. Here is how it arises.",
  insufficient_evidence: "This item may be allowable, but you need {documents} to support it.",
  arguable_legal_ground: "There is an argument that URA applied the law incorrectly. It is arguable, not certain.",
  procedural_issue: "There may be a procedural issue. A professional should review this before you rely on it.",
});

export const OUTCOME_PROFESSIONAL_LABELS: Readonly<Record<Outcome, string>> = Object.freeze({
  correct: "Consistent with records and law",
  computational_error: "Computational error (arithmetic, rate, period or credit mismatch)",
  insufficient_evidence: "Insufficient evidence (records missing)",
  arguable_legal_ground: "Arguable legal ground",
  procedural_issue: "Procedural issue (service, time limit or validity)",
});

export function ownerOutcomeText(outcome: Outcome, values: { amount?: number; documents?: string[] } = {}): string {
  const amount = values.amount === undefined ? "" : Math.round(Math.abs(values.amount)).toLocaleString("en-US");
  const docs = values.documents && values.documents.length ? joinList(values.documents) : "the records that support it";
  return OUTCOME_OWNER_TEMPLATES[outcome].replace("{amount}", amount).replace("{documents}", docs);
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Plain questions the owner view asks per kind of item (never technical). */
export const OWNER_QUESTIONS: Readonly<Record<ItemCategory, string[]>> = Object.freeze({
  expense: [
    "What was this payment for, and how did it help the business earn money?",
    "Do you have the receipts or invoices for it?",
  ],
  income: [
    "Where did this money come from? For example a sale, a loan, or money you moved between your own accounts.",
    "Do you have papers that show where it came from?",
  ],
  input_vat: [
    "Did you buy these goods or services for the business?",
    "Do you have the supplier's invoices (EFRIS e-invoices) for them?",
  ],
  output_vat: ["Did you actually sell these goods or services, and when?"],
  credit: ["Did someone already take tax off a payment to you, or did you already pay part of this tax? Do you have the slips?"],
  interest: ["Does the interest figure on the notice look right to you? We can check the arithmetic."],
  penal_tax: ["Does the penalty figure look right to you? We can check the arithmetic."],
  procedural: ["How and when did you receive this notice? Was anything about it unusual?"],
  other: ["In your own words, why do you think this figure is wrong?"],
});

/** Plain description of what URA is claiming, by tax head. */
export const TAX_HEAD_PLAIN: Readonly<Record<"income_tax" | "vat", string>> = Object.freeze({
  income_tax: "income tax (tax on the profit your business made)",
  vat: "VAT (the tax added to the price of goods and services you sell)",
});

export const STANDING_DISCLAIMER =
  "This is a preliminary position to help you prepare. It is not a decision on your case, and URA or the Tribunal may see it differently.";

export const LATE_OBJECTION_REASONS = Object.freeze([
  "I was outside Uganda",
  "I was sick",
  "Another reasonable cause (explain)",
]);
