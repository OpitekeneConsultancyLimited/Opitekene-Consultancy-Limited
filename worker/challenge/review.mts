// Professional review gate and pack tiers (brief Section 8.3). Pure.
import type { DeadlineResult } from "./deadlines.mts";
import type { Reconciliation } from "./classify.mts";
import type { CaseRow, ConfirmableField, FieldConfirmation } from "./types.mts";

export const DEFAULT_REVIEW_THRESHOLD_UGX = 50_000_000;
export const LOW_CONFIDENCE = 0.6;
const KEY_FIELDS: ReadonlySet<ConfirmableField> = new Set([
  "tax_head", "period_start", "period_end", "principal", "penal_tax", "interest",
]);

export type Tier = "free" | "self-service" | "reviewed" | "managed";
const TIER_RANK: Record<Tier, number> = { free: 0, "self-service": 1, reviewed: 2, managed: 3 };

export interface ReviewGate {
  required: boolean;
  reasons: Array<{ code: string; text: string }>;
  status: CaseRow["reviewStatus"];
  /** True when a reviewer signed off THIS version of the case. */
  signedOff: boolean;
}

export function disputedPrincipal(row: CaseRow): number | null {
  if (row.principal === null) return null;
  return Math.max(0, row.principal - (row.taxAccepted ?? 0));
}

export function reviewGate(
  row: CaseRow,
  deadlines: DeadlineResult,
  reconciliation: Reconciliation,
  confirmations: FieldConfirmation[],
  thresholdUgx: number = DEFAULT_REVIEW_THRESHOLD_UGX,
): ReviewGate {
  const reasons: ReviewGate["reasons"] = [];
  const disputed = disputedPrincipal(row);
  if (disputed !== null && disputed > thresholdUgx) {
    reasons.push({ code: "above-threshold", text: `The tax in dispute is above UGX ${thresholdUgx.toLocaleString("en-US")}.` });
  }
  if (reconciliation.items.some((item) => item.outcome === "procedural_issue")) {
    reasons.push({ code: "procedural-issue", text: "An item may raise a procedural issue." });
  }
  if (deadlines.lateObjection.offered) {
    reasons.push({ code: "deadline-lapsed", text: "The time to object has possibly lapsed; a late objection needs review." });
  }
  if (row.preparingTat || row.decisionServedOn || row.status === "tat") {
    reasons.push({ code: "tat-application", text: "You are preparing an application to the Tax Appeals Tribunal." });
  }
  const weak = confirmations.filter((field) => KEY_FIELDS.has(field.fieldName) && field.status === "unconfirmable" && (field.confidence === null || field.confidence < LOW_CONFIDENCE));
  if (weak.length) {
    reasons.push({ code: "unconfirmed-field", text: `Some key figures could not be confirmed: ${weak.map((field) => field.fieldName.replace(/_/g, " ")).join(", ")}.` });
  }
  const signedOff = row.reviewStatus === "approved" && row.reviewedCaseVersion === row.caseVersion;
  return { required: reasons.length > 0, reasons, status: reasons.length === 0 ? "not_required" : signedOff ? "approved" : row.reviewStatus === "changes_requested" ? "changes_requested" : "pending", signedOff };
}

export interface PackAccess {
  tier: Tier;
  freeOutputs: true;
  fullPack: boolean;
  blockedBecause: Array<"plan" | "review">;
}

export function packAccess(tier: Tier, gate: ReviewGate): PackAccess {
  const blocked: PackAccess["blockedBecause"] = [];
  if (TIER_RANK[tier] < TIER_RANK["self-service"]) blocked.push("plan");
  if (gate.required && !gate.signedOff) blocked.push("review");
  return { tier, freeOutputs: true, fullPack: blocked.length === 0, blockedBecause: blocked };
}

export function highestTier(tiers: Tier[]): Tier {
  return tiers.reduce<Tier>((best, tier) => (TIER_RANK[tier] > TIER_RANK[best] ? tier : best), "free");
}
