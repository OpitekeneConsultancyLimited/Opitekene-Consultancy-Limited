// Launch readiness. Two keys must both be turned:
//   1. the deploy-time Worker vars below (a kill switch held by whoever deploys);
//   2. the evidence-based launch gates in taxcomp.launch_gates (launch-gates.mjs),
//      each approved by a named approver, with evidence, and within its review date.
// Neither is ever set automatically.
export const requiredLaunchApprovals = Object.freeze([
  "PHASE11_LEGAL_REVIEW_APPROVED",
  "PHASE11_TAX_CALCULATION_APPROVED",
  "PHASE11_SECURITY_REVIEW_APPROVED",
  "PHASE11_PRIVACY_REVIEW_APPROVED",
  "PHASE11_OPERATIONS_READY",
  "PHASE11_BILLING_PROVIDER_CONFIGURED",
  "PHASE11_SUPPORT_PROCESS_READY",
  "PHASE11_PUBLIC_LAUNCH_APPROVED",
]);

/**
 * @param env Worker vars.
 * @param gates Result of listGates() (with effective statuses), or null when
 *   the gate register could not be read; launch is then never eligible.
 */
export function getCommercialLaunchReadiness(env = {}, gates = null) {
  const missingApprovals = requiredLaunchApprovals.filter((name) => env[name] !== "true");
  const gateRegisterAvailable = Array.isArray(gates) && gates.length > 0;
  const unapprovedGates = gateRegisterAvailable
    ? gates.filter((gate) => gate.status !== "approved").map((gate) => ({ key: gate.key, title: gate.title, status: gate.status, statusLabel: gate.statusLabel }))
    : [];
  const launchEligible = missingApprovals.length === 0 && gateRegisterAvailable && unapprovedGates.length === 0;
  return Object.freeze({
    phase: "Phase 11",
    status: launchEligible ? "approvals-complete" : "blocked",
    launchEligible,
    billingEnabled: false,
    missingApprovals,
    gateRegisterAvailable,
    unapprovedGates,
    limitations: Object.freeze([
      "This gate records deployment approvals only; it does not implement or activate a payment provider.",
      "Tax-law verification and filing approval must be evidenced independently.",
      ...(gateRegisterAvailable ? [] : ["The launch-gate register could not be read, so launch is blocked."]),
    ]),
  });
}
