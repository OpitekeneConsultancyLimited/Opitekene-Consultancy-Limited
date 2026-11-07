const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createLegalSourceRegistry,
  classifySourceType,
  validateSourceRecord,
  citationIntegrity,
} = require("./legal-source-registry.js");

function fixture(overrides = {}) {
  return {
    sourceId: "fixture-vat-section-27",
    sourceType: "legislation",
    title: "Fixture VAT Act section 27",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Fixture VAT Act",
    caseReference: null,
    provision: "Section 27",
    publicationDate: "2024-02-15",
    effectiveDate: "2024-07-01",
    endDate: null,
    applicableTaxPeriods: ["2024/25", "2025/26"],
    officialSourceUrl: "https://example.invalid/fixture-vat-act-section-27",
    documentReference: "Fixture legislative bulletin 2024",
    verificationStatus: "verified",
    lastVerificationDate: "2026-01-15",
    reviewer: "Test reviewer",
    relatedTaxHeads: ["value-added-tax", "input-vat"],
    ruleIds: ["ug-vat-standard-rate-fy2026-27"],
    primaryAuthority: true,
    version: "2024-v1",
    historicalVersion: false,
    ...overrides,
  };
}

test("source classification distinguishes primary and secondary authority types", () => {
  assert.equal(classifySourceType("legislation"), "legislation");
  assert.equal(classifySourceType("URA guidance"), "ura_guidance");
  assert.equal(classifySourceType("judicial decision"), "judicial_decision");
  assert.equal(classifySourceType("secondary commentary"), "secondary_commentary");
  assert.throws(() => classifySourceType("made-up authority"), { name: "RangeError" });
});

test("valid sources are registered and historical versions remain distinct", () => {
  const registry = createLegalSourceRegistry([
    fixture(),
    fixture({
      sourceId: "fixture-vat-section-27-historical",
      title: "Fixture VAT Act section 27 (historical edition)",
      effectiveDate: "2023-07-01",
      endDate: "2024-06-30",
      applicableTaxPeriods: ["2023/24"],
      version: "2023-v1",
      historicalVersion: true,
      ruleIds: ["fixture-vat-historical-rule"],
    }),
  ]);

  const active = registry.resolveSourcesForPeriod({
    taxHead: "value-added-tax",
    taxPeriod: "2025/26",
  });
  const historical = registry.resolveSourcesForPeriod({
    taxHead: "value-added-tax",
    taxPeriod: "2023/24",
  });

  assert.equal(active.length, 1);
  assert.equal(active[0].sourceId, "fixture-vat-section-27");
  assert.equal(historical.length, 1);
  assert.equal(historical[0].sourceId, "fixture-vat-section-27-historical");
  assert.equal(historical[0].historicalVersion, true);
});

test("unverified legal sources cannot be represented as verified authority", () => {
  assert.throws(() => validateSourceRecord(fixture({
    verificationStatus: "verified",
    lastVerificationDate: undefined,
    reviewer: undefined,
    officialSourceUrl: "http://example.invalid/not-secure",
  })), RangeError);

  const pending = validateSourceRecord(fixture({
    verificationStatus: "pending-review",
    officialSourceUrl: "https://example.invalid/source",
    lastVerificationDate: "2026-01-15",
    reviewer: "Test reviewer",
  }));
  assert.equal(pending.verificationStatus, "pending-review");
});

test("source validation rejects malformed URLs and non-matching citation metadata", () => {
  const malformed = fixture({
    officialSourceUrl: "ftp://example.invalid/not-allowed",
    documentReference: null,
    provision: null,
  });

  const integrity = citationIntegrity(malformed);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.issues.some((issue) => issue.includes("https")));
  assert.ok(integrity.issues.some((issue) => issue.includes("document reference")));

  assert.throws(() => validateSourceRecord(fixture({
    sourceType: "judicial_decision",
    legislation: null,
    caseReference: null,
    provision: null,
  })), RangeError);

  assert.throws(() => validateSourceRecord(fixture({
    officialSourceUrl: "https://",
    publicationDate: "2026-02-31",
  })), RangeError);
});

test("registry keeps tax-rule and source records separate while retaining rule linkage", () => {
  const registry = createLegalSourceRegistry([
    fixture({
      sourceId: "fixture-primary-source",
      sourceType: "legislation",
      title: "Fixture primary source",
      issuingAuthority: "Parliament of Uganda",
      legislation: "Fixture VAT Act",
      provision: "Section 27",
      officialSourceUrl: "https://example.invalid/fixture-primary-source",
      documentReference: "Fixture legislative bulletin 2024",
      verificationStatus: "verified",
      lastVerificationDate: "2026-01-15",
      reviewer: "Test reviewer",
      relatedTaxHeads: ["value-added-tax"],
      ruleIds: ["ug-vat-standard-rate-fy2026-27"],
      primaryAuthority: true,
    }),
    fixture({
      sourceId: "fixture-ura-guidance",
      sourceType: "ura_guidance",
      title: "Fixture URA guidance on VAT input credits",
      issuingAuthority: "Uganda Revenue Authority",
      legislation: null,
      provision: "Guidance note on input credits",
      officialSourceUrl: "https://example.invalid/ura-guidance",
      documentReference: "URA guidance note 2026",
      verificationStatus: "verified",
      primaryAuthority: false,
      relatedTaxHeads: ["value-added-tax"],
      ruleIds: ["ug-vat-standard-rate-fy2026-27"],
    }),
  ]);

  const result = registry.getSourceById("fixture-ura-guidance");
  assert.equal(result.sourceType, "ura_guidance");
  assert.equal(result.primaryAuthority, false);
  assert.deepEqual(result.relatedTaxHeads, ["value-added-tax"]);
  assert.ok(result.ruleIds.includes("ug-vat-standard-rate-fy2026-27"));
  assert.equal(registry.getVerifiedSources().length, 2);
});
