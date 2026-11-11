// F3 reconciliation + F4 issue classifier + penal tax / interest recomputation.
// Pure. Each disputed item gets exactly one outcome. Rates come only from an
// approved law formula, or (provisionally) from URA's own notice; never from code.
import { formatUgx } from "./dates.mts";
import type { CaseRow, DisputedItem, ItemCategory, Outcome, ProvisionVersion } from "./types.mts";
import { OUTCOME_PROFESSIONAL_LABELS, joinList, ownerOutcomeText } from "./wording.mts";

export interface Recomputation {
  expected: number;
  basis: "approved-law" | "ura-notice";
  provisional: boolean;
  workings: string;
  provisionId: string | null;
}

export interface ClassifiedItem {
  itemId: string;
  category: ItemCategory;
  description: string;
  uraAmount: number | null;
  taxpayerAmount: number | null;
  difference: number | null;
  outcome: Outcome;
  outcomeLabel: string;
  ownerText: string;
  reason: string;
  evidenceGap: string[];
  correctedFigure: number | null;
  recomputation: Recomputation | null;
  schedule: "agreed" | "disputed" | "unexplained";
  keepInObjection: boolean;
  setByReviewer: boolean;
  /** The user's own answers, returned so editors can show them again. */
  facts: DisputedItem["facts"];
  documentIds: string[];
  reviewerOutcome: Outcome | null;
}

export const DEFAULT_DOCUMENTS: Readonly<Record<ItemCategory, string[]>> = Object.freeze({
  expense: ["the supplier invoices or receipts", "proof of payment"],
  input_vat: ["the supplier's EFRIS e-invoices", "proof of payment"],
  income: ["papers showing where the money came from, such as loan agreements or transfer records"],
  credit: ["the withholding tax certificates or payment slips"],
  output_vat: ["your sales records and invoices for the period"],
  interest: ["URA's interest working"],
  penal_tax: ["URA's penalty working"],
  procedural: ["proof of how and when you received the notice"],
  other: ["the records that support your figure"],
  employment_income: ["payslips and payroll records for the period", "employment contracts or letters showing what each payment was for", "receipts for any costs you paid staff back for"],
  withholding: ["the invoices and payment records for the payments URA lists", "your withholding tax returns and payment slips", "any exemption certificates your suppliers held"],
});

/**
 * Recomputes interest or penal tax. Approved law formula first; otherwise the
 * rate URA printed on the notice (provisional, arithmetic check only).
 */
export function recompute(
  item: DisputedItem,
  context: { principal: number | null; noticeTerms: CaseRow["noticeTerms"]; interestFormula: ProvisionVersion | null; penalFormula: ProvisionVersion | null },
): Recomputation | null {
  if (item.category !== "interest" && item.category !== "penal_tax") return null;
  const base = item.facts.baseAmount ?? context.principal;
  if (base === null || base === undefined) return null;

  if (item.category === "interest") {
    const lawRate = context.interestFormula?.approvedForComputation ? context.interestFormula.computation.ratePercentPerMonth ?? null : null;
    const rate = lawRate ?? item.facts.uraRatePercentPerMonth ?? context.noticeTerms.interestRatePercentPerMonth ?? null;
    const months = item.facts.uraMonths ?? context.noticeTerms.interestMonths ?? null;
    if (rate === null || months === null) return null;
    const expected = Math.round(base * (rate / 100) * months);
    return {
      expected,
      basis: lawRate !== null ? "approved-law" : "ura-notice",
      provisional: lawRate === null,
      workings: `${formatUgx(base)} × ${rate}% per month × ${months} month${months === 1 ? "" : "s"} = ${formatUgx(expected)}${lawRate === null ? " (using the rate shown on URA's notice; provisional)" : ""}`,
      provisionId: lawRate !== null ? context.interestFormula?.id ?? null : null,
    };
  }
  const lawPercent = context.penalFormula?.approvedForComputation ? context.penalFormula.computation.percent ?? null : null;
  const percent = lawPercent ?? item.facts.uraPercent ?? context.noticeTerms.penalTaxPercent ?? null;
  if (percent === null) return null;
  const expected = Math.round(base * (percent / 100));
  return {
    expected,
    basis: lawPercent !== null ? "approved-law" : "ura-notice",
    provisional: lawPercent === null,
    workings: `${formatUgx(base)} × ${percent}% = ${formatUgx(expected)}${lawPercent === null ? " (using the rate shown on URA's notice; provisional)" : ""}`,
    provisionId: lawPercent !== null ? context.penalFormula?.id ?? null : null,
  };
}

export function classifyItem(
  item: DisputedItem,
  context: Parameters<typeof recompute>[1],
): ClassifiedItem {
  const facts = item.facts;
  const difference = item.uraAmount !== null && item.taxpayerAmount !== null ? item.uraAmount - item.taxpayerAmount : null;
  const recomputation = recompute(item, context);
  const missing = (facts.missingDocuments ?? []).filter(Boolean);

  let outcome: Outcome;
  let reason: string;
  let evidenceGap: string[] = [];
  let correctedFigure: number | null = null;
  let ownerValues: { amount?: number; documents?: string[] } = {};

  if (facts.proceduralConcern || item.category === "procedural") {
    outcome = "procedural_issue";
    reason = `Procedural concern: ${facts.proceduralConcern || item.description}`;
    evidenceGap = missing.length ? missing : DEFAULT_DOCUMENTS.procedural;
  } else if (recomputation && item.uraAmount !== null && Math.abs(recomputation.expected - item.uraAmount) >= 1) {
    outcome = "computational_error";
    correctedFigure = recomputation.expected;
    reason = `URA shows ${formatUgx(item.uraAmount)}; recomputed ${recomputation.workings}.`;
    ownerValues = { amount: item.uraAmount - recomputation.expected };
  } else if (recomputation && item.uraAmount !== null) {
    outcome = "correct";
    reason = `Recomputed figure matches URA: ${recomputation.workings}.`;
  } else if (difference === 0) {
    outcome = "correct";
    reason = "URA's figure equals the figure in your records.";
  } else if (missing.length || facts.hasRecords === false) {
    outcome = "insufficient_evidence";
    evidenceGap = missing.length ? missing : DEFAULT_DOCUMENTS[item.category];
    reason = `Records needed: ${joinList(evidenceGap)}.`;
    ownerValues = { documents: evidenceGap };
  } else if (facts.legalArgument) {
    outcome = "arguable_legal_ground";
    reason = `Legal argument: ${facts.legalArgument}`;
  } else if (difference !== null && facts.hasRecords) {
    outcome = "computational_error";
    correctedFigure = item.taxpayerAmount;
    reason = `URA ${formatUgx(item.uraAmount ?? 0)} vs records ${formatUgx(item.taxpayerAmount ?? 0)}: difference ${formatUgx(Math.abs(difference))}.`;
    ownerValues = { amount: difference };
  } else {
    outcome = "insufficient_evidence";
    evidenceGap = DEFAULT_DOCUMENTS[item.category];
    reason = "Not enough information yet to compare URA's figure with your records.";
    ownerValues = { documents: evidenceGap };
  }

  const setByReviewer = item.reviewerOutcome !== null;
  if (item.reviewerOutcome) {
    outcome = item.reviewerOutcome;
    reason = `Set by the reviewer. Computed reason: ${reason}`;
  }

  const unexplained = difference !== null && difference !== 0 && !facts.hasRecords && !facts.legalArgument && !facts.ownerExplanation && !facts.proceduralConcern;
  const schedule: ClassifiedItem["schedule"] = outcome === "correct" ? "agreed" : unexplained ? "unexplained" : "disputed";

  return {
    itemId: item.id,
    category: item.category,
    description: item.description,
    uraAmount: item.uraAmount,
    taxpayerAmount: item.taxpayerAmount,
    difference,
    outcome,
    outcomeLabel: OUTCOME_PROFESSIONAL_LABELS[outcome],
    ownerText: ownerOutcomeText(outcome, ownerValues),
    reason,
    evidenceGap,
    correctedFigure,
    recomputation,
    schedule,
    keepInObjection: item.keepInObjection,
    setByReviewer,
    facts: item.facts,
    documentIds: item.documentIds,
    reviewerOutcome: item.reviewerOutcome,
  };
}

export interface Reconciliation {
  items: ClassifiedItem[];
  totals: { agreed: number; disputed: number; unexplained: number };
  /** Items that can be raised as grounds; ALL arguable ones are listed (grounds lock at objection). */
  grounds: ClassifiedItem[];
}

export function reconcile(items: DisputedItem[], context: Parameters<typeof recompute>[1]): Reconciliation {
  const classified = [...items].sort((a, b) => a.position - b.position).map((item) => classifyItem(item, context));
  const totals = { agreed: 0, disputed: 0, unexplained: 0 };
  for (const item of classified) totals[item.schedule] += Math.abs(item.difference ?? 0);
  return { items: classified, totals, grounds: classified.filter((item) => item.outcome !== "correct") };
}
