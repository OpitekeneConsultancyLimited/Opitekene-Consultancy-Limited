const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPendingLegislationCatalog,
  createPhase8LegalIntelligence,
} = require("./phase8-legal-intelligence.js");

function source(overrides = {}) {
  return {
    sourceId: "historical-vat-source",
    sourceType: "legislation",
    title: "Test VAT Act",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Test VAT Act",
    documentReference: "Reviewed official document",
    provision: "Test provision",
    publicationDate: "2024-01-01",
    effectiveDate: "2024-07-01",
    endDate: "2025-06-30",
    applicableTaxPeriods: ["2024/25"],
    officialSourceUrl: "https://example.invalid/test-vat-act",
    verificationStatus: "pending-review",
    lastVerificationDate: null,
    reviewer: null,
    relatedTaxHeads: ["value-added-tax"],
    ruleIds: [],
    primaryAuthority: true,
    version: "test-v1",
    historicalVersion: true,
    ...overrides,
  };
}

test("phase 8 catalogs legislation without invented dates, URLs, or verified status", () => {
  const catalog = createPendingLegislationCatalog();
  const repo = createPhase8LegalIntelligence();

  assert.ok(catalog.some((entry) => entry.title.includes("Income Tax Act")));
  assert.ok(catalog.some((entry) => entry.title.includes("East African Community Customs")));
  assert.ok(catalog.every((entry) => entry.verificationStatus === "pending-review"));
  assert.ok(catalog.every((entry) => entry.effectiveDate === null && entry.officialSourceUrl === null));
  assert.deepEqual(repo.findAuthoritativeSources({ date: "2026-11-07" }), []);
});

test("phase 8 separates authoritative sources from administrative guidance", () => {
  const guidance = source({
    sourceId: "ura-guidance",
    sourceType: "ura_guidance",
    title: "URA administrative guidance",
    legislation: null,
    primaryAuthority: false,
  });
  const repo = createPhase8LegalIntelligence({ legislation: [source()], guidance: [guidance] });
  const legal = repo.findAuthoritativeSources({ taxHead: "value-added-tax", taxPeriod: "2024/25" });
  const administrative = repo.findGuidance({ taxHead: "value-added-tax", taxPeriod: "2024/25" });

  assert.equal(legal.length, 1);
  assert.equal(legal[0].primaryAuthority, true);
  assert.equal(administrative.length, 1);
  assert.equal(administrative[0].primaryAuthority, false);
  assert.equal(repo.repositoryStatus.completeness, "not-established");
});

test("historical period resolution reports reviewed dates and amendments without claiming completeness", () => {
  const repo = createPhase8LegalIntelligence({
    legislation: [
      source(),
      source({
        sourceId: "historical-vat-amendment",
        title: "Test VAT Act amendment",
        effectiveDate: "2025-01-01",
        endDate: null,
        verificationStatus: "verified",
        lastVerificationDate: "2026-01-15",
        reviewer: "Qualified reviewer",
        version: "test-v2",
      }),
    ],
  });

  const result = repo.resolveHistoricalPeriod({
    taxHead: "value-added-tax",
    startDate: "2024-07-01",
    endDate: "2025-06-30",
  });

  assert.equal(result.sources.length, 2);
  assert.equal(result.amendmentsDuringPeriod.length, 1);
  assert.equal(result.resolutionStatus, "verified-sources-found");
  assert.equal(result.completeness, "not-established");
  assert.equal(result.filingApproved, false);
  assert.throws(() => repo.resolveHistoricalPeriod({
    startDate: "2025-02-31",
    endDate: "2025-12-31",
  }), RangeError);
});
