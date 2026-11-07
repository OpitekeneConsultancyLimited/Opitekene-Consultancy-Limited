export const requiredLaunchApprovals = Object.freeze([
  "PHASE11_LEGAL_REVIEW_APPROVED",
  "PHASE11_SECURITY_REVIEW_APPROVED",
  "PHASE11_PRIVACY_REVIEW_APPROVED",
  "PHASE11_OPERATIONS_READY",
  "PHASE11_BILLING_PROVIDER_CONFIGURED",
  "PHASE11_SUPPORT_PROCESS_READY",
  "PHASE11_PUBLIC_LAUNCH_APPROVED",
]);

export function getCommercialLaunchReadiness(env = {}) {
  const missingApprovals = requiredLaunchApprovals.filter((name) => env[name] !== "true");
  return Object.freeze({
    phase: "Phase 11",
    status: missingApprovals.length === 0 ? "approvals-complete" : "blocked",
    launchEligible: missingApprovals.length === 0,
    billingEnabled: false,
    missingApprovals,
    limitations: Object.freeze([
      "This gate records deployment approvals only; it does not implement or activate a payment provider.",
      "Tax-law verification and filing approval must be evidenced independently.",
    ]),
  });
}
