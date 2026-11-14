import assert from "node:assert/strict";
import test from "node:test";
import { getCommercialLaunchReadiness, requiredLaunchApprovals } from "./commercial-governance.mjs";

test("commercial launch stays blocked until every independent approval is recorded", () => {
  const readiness = getCommercialLaunchReadiness({
    PHASE11_LEGAL_REVIEW_APPROVED: "true",
    PHASE11_SECURITY_REVIEW_APPROVED: "true",
  });

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.launchEligible, false);
  assert.equal(readiness.billingEnabled, false);
  assert.equal(readiness.missingApprovals.length, requiredLaunchApprovals.length - 2);
});

const gate = (key, status) => ({ key, title: key, status, statusLabel: status });
const KEYS = ["legal", "tax_calculation", "security", "privacy", "operations", "billing", "support", "public_launch"];

test("complete launch approvals do not activate billing automatically", () => {
  const approvals = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, "true"]));
  const readiness = getCommercialLaunchReadiness(approvals, KEYS.map((key) => gate(key, "approved")));

  assert.equal(readiness.status, "approvals-complete");
  assert.equal(readiness.launchEligible, true);
  assert.equal(readiness.billingEnabled, false);
});

test("deploy flags alone never make launch eligible: the evidence-based gates must be approved too", () => {
  const approvals = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, "true"]));
  const noRegister = getCommercialLaunchReadiness(approvals);
  assert.equal(noRegister.launchEligible, false);
  assert.equal(noRegister.gateRegisterAvailable, false);
  const oneExpired = getCommercialLaunchReadiness(approvals, KEYS.map((key) => gate(key, key === "privacy" ? "expired" : "approved")));
  assert.equal(oneExpired.launchEligible, false);
  assert.deepEqual(oneExpired.unapprovedGates.map((g) => g.key), ["privacy"]);
  assert.ok(requiredLaunchApprovals.includes("PHASE11_TAX_CALCULATION_APPROVED"), "eight gates, including tax calculation");
});

test("approval flags require literal true values", () => {
  const approvals = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, true]));
  const readiness = getCommercialLaunchReadiness(approvals);

  assert.equal(readiness.launchEligible, false);
  assert.equal(readiness.missingApprovals.length, requiredLaunchApprovals.length);
});
