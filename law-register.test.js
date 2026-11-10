"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLawRegister, SEED_TIME_LIMITS, addMonths } = require("./law-register.js");

const verified = { verificationStatus: "verified" };
const instruments = [
  { id: "tpca", shortTitle: "Tax Procedures Code Act", legislativeStatus: "commenced", commencementDate: "2016-07-01", ...verified },
  { id: "tpca-amendment-2026", shortTitle: "Tax Procedures Code (Amendment) Act, 2026", legislativeStatus: "commenced", commencementDate: "2026-07-01", ...verified },
  { id: "tpca-amendment-bill-2027", shortTitle: "Tax Procedures Code (Amendment) Bill, 2027", legislativeStatus: "bill", verificationStatus: "pending-review" },
  { id: "ita-amendment-2026", shortTitle: "Income Tax (Amendment) Act, 2026", legislativeStatus: "unconfirmed", verificationStatus: "pending-review" },
];
const provisions = [
  { id: "p1", instrumentId: "tpca", provisionKey: "tpca:s24(1)", versionNo: 1, effectiveFrom: "2016-07-01", effectiveTo: "2026-06-30", textContent: "original text", ...verified },
  { id: "p2", instrumentId: "tpca", introducedByInstrumentId: "tpca-amendment-2026", provisionKey: "tpca:s24(1)", versionNo: 2, effectiveFrom: "2026-07-01", textContent: "amended text", ...verified },
  { id: "p3", instrumentId: "tpca", provisionKey: "tpca:s99", versionNo: 1, effectiveFrom: "2016-07-01", textContent: "unverified text", verificationStatus: "pending-review" },
  { id: "p4", instrumentId: "ita", introducedByInstrumentId: "ita-amendment-2026", provisionKey: "ita:s19", versionNo: 2, effectiveFrom: "2026-07-01", textContent: "unconfirmed amendment", verificationStatus: "pending-review" },
];
const amendments = [
  { id: "a1", amendingInstrumentId: "tpca-amendment-2026", targetProvisionKey: "tpca:s24(1)", changeKind: "substitute", effectiveFrom: "2026-07-01" },
  { id: "a2", amendingInstrumentId: "tpca-amendment-bill-2027", targetProvisionKey: "tpca:s24(1)", changeKind: "amend", summary: "Proposed change" },
];

test("resolves the version in force on a date (point in time)", () => {
  const register = createLawRegister({ instruments, provisions, amendments });
  assert.equal(register.resolveProvision("tpca:s24(1)", "2025-01-15").provision.textContent, "original text");
  const current = register.resolveProvision("tpca:s24(1)", "2026-11-10");
  assert.equal(current.status, "in-force");
  assert.equal(current.provision.textContent, "amended text");
});

test("a bill is reported as a pending change and never applied", () => {
  const register = createLawRegister({ instruments, provisions, amendments });
  const result = register.resolveProvision("tpca:s24(1)", "2026-11-10");
  assert.equal(result.provision.id, "p2");
  assert.deepEqual(result.pendingChanges.map((change) => change.amendmentId), ["a2"]);
  assert.match(result.pendingChanges[0].label, /not law/);
  // Before 1 July 2026 the 2026 Act itself is also only pending.
  assert.deepEqual(register.resolveProvision("tpca:s24(1)", "2026-06-01").pendingChanges.map((c) => c.amendmentId).sort(), ["a1", "a2"]);
});

test("unverified text and unconfirmed amendment Acts are not treated as law", () => {
  const register = createLawRegister({ instruments, provisions, amendments });
  const unverified = register.resolveProvision("tpca:s99", "2026-11-10");
  assert.equal(unverified.status, "unverified");
  assert.match(unverified.warnings[0], /not been verified/);
  const unconfirmed = register.resolveProvision("ita:s19", "2026-11-10");
  assert.notEqual(unconfirmed.status, "in-force");
  assert.equal(register.resolveProvision("ita:s1", "2026-11-10").status, "not-found");
});

test("rejects unknown legislative statuses and bad dates", () => {
  assert.throws(() => createLawRegister({ instruments: [{ id: "x", legislativeStatus: "law" }] }), /unknown legislative status/);
  assert.throws(() => createLawRegister().resolveProvision("tpca:s24(1)", "10/11/2026"), /YYYY-MM-DD/);
});

test("seeded objection limit gives a PROVISIONAL date counted from the day after service", () => {
  const register = createLawRegister({ timeLimits: SEED_TIME_LIMITS });
  const result = register.computeTimeLimit("objection-to-assessment", "2026-10-01", { today: "2026-11-10" });
  assert.equal(result.dueDate, "2026-11-15");
  assert.equal(result.daysRemaining, 5);
  assert.equal(result.provisional, true);
  assert.match(result.warnings[0], /PROVISIONAL/);
});

test("a verified limit is not provisional; withdrawn limits cannot be used", () => {
  const register = createLawRegister({ timeLimits: [
    { ...SEED_TIME_LIMITS[0], verificationStatus: "verified" },
    { ...SEED_TIME_LIMITS[2], verificationStatus: "withdrawn" },
  ] });
  assert.equal(register.computeTimeLimit("objection-to-assessment", "2026-10-01").provisional, false);
  assert.throws(() => register.computeTimeLimit("tat-application", "2026-10-01"), /withdrawn/);
  assert.throws(() => register.computeTimeLimit("nope", "2026-10-01"), /Unknown/);
});

test("month arithmetic clamps to the end of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});
