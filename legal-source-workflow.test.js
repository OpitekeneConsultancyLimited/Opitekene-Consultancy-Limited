const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createDraftSource,
  updateDraftSource,
  reviewLegalSource,
} = require("./legal-source-workflow.js");

function completeSource(overrides = {}) {
  return {
    sourceId: "vat-act-section-27",
    sourceType: "legislation",
    title: "Fixture Value Added Tax Act",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Fixture Value Added Tax Act",
    provision: "Section 27",
    publicationDate: "2024-01-01",
    effectiveDate: "2024-07-01",
    endDate: null,
    applicableTaxPeriods: ["2024/25", "2025/26"],
    officialSourceUrl: "https://example.invalid/vat-act-section-27",
    documentReference: "Fixture legislative copy, section 27",
    verificationStatus: "verified",
    lastVerificationDate: "2026-01-15",
    reviewer: "Untrusted incoming reviewer",
    relatedTaxHeads: ["value-added-tax"],
    ruleIds: [],
    primaryAuthority: true,
    ...overrides,
  };
}

const clock = () => new Date("2026-11-03T00:00:00.000Z");

test("ingestion forces new sources into pending review and records the submission", () => {
  const result = createDraftSource(completeSource(), { submittedBy: "Admin reviewer", clock });

  assert.equal(result.record.verificationStatus, "pending-review");
  assert.equal(result.record.reviewer, null);
  assert.equal(result.record.lastVerificationDate, null);
  assert.equal(result.record.reviewHistory[0].action, "submitted");
  assert.equal(result.auditEntry.actor, "Admin reviewer");
});

test("review approval requires complete metadata and reviewer evidence", () => {
  const draft = createDraftSource(completeSource(), { submittedBy: "Admin reviewer", clock }).record;
  const approved = reviewLegalSource(draft, {
    decision: "verified",
    reviewer: "Legal reviewer",
    reviewDate: "2026-11-02",
    notes: "Compared with the official source document.",
  }, { clock });

  assert.equal(approved.record.verificationStatus, "verified");
  assert.equal(approved.record.reviewer, "Legal reviewer");
  assert.equal(approved.record.lastVerificationDate, "2026-11-02");
  assert.equal(approved.record.reviewHistory.at(-1).action, "verified");
  assert.throws(() => reviewLegalSource(draft, {
    decision: "verified",
    reviewer: "Legal reviewer",
    reviewDate: "2026-11-02",
    notes: "Reviewed.",
    updates: { officialSourceUrl: null, documentReference: null },
  }, { clock }), RangeError);
});

test("incomplete sources can be updated while pending but protected identity and status fields cannot change", () => {
  const initial = createDraftSource({
    sourceId: "draft-1",
    sourceType: "ura_guidance",
    primaryAuthority: false,
  }, { submittedBy: "Admin reviewer", clock }).record;
  const updated = updateDraftSource(initial, {
    title: "Fixture URA guidance",
    issuingAuthority: "Uganda Revenue Authority",
    sourceId: "forged-id",
    verificationStatus: "verified",
    officialSourceUrl: "https://example.invalid/ura-note",
  }, { updatedBy: "Admin reviewer", clock });

  assert.equal(updated.sourceId, "draft-1");
  assert.equal(updated.verificationStatus, "pending-review");
  assert.equal(updated.title, "Fixture URA guidance");
  assert.equal(updated.reviewHistory.at(-1).action, "updated-draft");
});

test("rejection is auditable and cannot later be approved", () => {
  const draft = createDraftSource({
    sourceId: "draft-reject",
    sourceType: "legislation",
    primaryAuthority: true,
  }, { submittedBy: "Admin reviewer", clock }).record;
  const rejected = reviewLegalSource(draft, {
    decision: "rejected",
    reviewer: "Legal reviewer",
    reviewDate: "2026-11-02",
    notes: "Duplicate or unusable source record.",
  }, { clock });

  assert.equal(rejected.record.verificationStatus, "rejected");
  assert.equal(rejected.record.reviewHistory.at(-1).action, "rejected");
  assert.throws(() => reviewLegalSource(rejected.record, {
    decision: "verified",
    reviewer: "Legal reviewer",
    reviewDate: "2026-11-02",
    notes: "Retry.",
  }, { clock }), RangeError);
});

test("rejects missing reviewer notes, invalid dates, future reviews, and unsupported decisions", () => {
  const draft = createDraftSource(completeSource(), { submittedBy: "Admin reviewer", clock }).record;
  assert.throws(() => reviewLegalSource(draft, { decision: "verified", reviewer: "Reviewer", reviewDate: "2026-11-02" }, { clock }), RangeError);
  assert.throws(() => reviewLegalSource(draft, { decision: "verified", reviewer: "Reviewer", reviewDate: "2026-11-04", notes: "Future" }, { clock }), RangeError);
  assert.throws(() => reviewLegalSource(draft, { decision: "approve", reviewer: "Reviewer", reviewDate: "2026-11-02", notes: "Unknown" }, { clock }), RangeError);
});
