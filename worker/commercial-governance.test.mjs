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

test("complete launch approvals do not activate billing automatically", () => {
  const approvals = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, "true"]));
  const readiness = getCommercialLaunchReadiness(approvals);

  assert.equal(readiness.status, "approvals-complete");
  assert.equal(readiness.launchEligible, true);
  assert.equal(readiness.billingEnabled, false);
});

test("approval flags require literal true values", () => {
  const approvals = Object.fromEntries(requiredLaunchApprovals.map((name) => [name, true]));
  const readiness = getCommercialLaunchReadiness(approvals);

  assert.equal(readiness.launchEligible, false);
  assert.equal(readiness.missingApprovals.length, requiredLaunchApprovals.length);
});
