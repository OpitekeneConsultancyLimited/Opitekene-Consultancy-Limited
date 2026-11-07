const assert = require("node:assert/strict");
const test = require("node:test");
const { createLegalSourceRegistry } = require("./legal-source-registry.js");
const { createLegalRetrievalEngine } = require("./legal-retrieval.js");

function source(overrides = {}) {
  return {
    sourceId: "vat-act-section-27",
    sourceType: "legislation",
    title: "Value Added Tax Act input tax deduction",
    issuingAuthority: "Parliament of Uganda",
    legislation: "Value Added Tax Act",
    provision: "Section 27",
    publicationDate: "2024-02-15",
    effectiveDate: "2024-07-01",
    endDate: null,
    applicableTaxPeriods: ["2024/25", "2025/26"],
    officialSourceUrl: "https://example.invalid/vat-act-section-27",
    documentReference: "Fixture official legislative copy, section 27",
    verificationStatus: "verified",
    lastVerificationDate: "2026-01-15",
    reviewer: "Test reviewer",
    relatedTaxHeads: ["value-added-tax"],
    keywords: ["input tax", "deduction", "credit"],
    ruleIds: ["ug-vat-standard-rate-fy2026-27"],
    primaryAuthority: true,
    version: "2024-v1",
    ...overrides,
  };
}

function engineFor(sources) {
  return createLegalRetrievalEngine({
    sourceRegistry: createLegalSourceRegistry(sources),
  });
}

test("retrieval ranks primary authority and returns traceable provision citations", () => {
  const engine = engineFor([
    source({
      sourceId: "vat-guidance-input-tax",
      sourceType: "ura_guidance",
      title: "URA guidance on input tax deduction",
      issuingAuthority: "Uganda Revenue Authority",
      legislation: null,
      provision: "Input tax guidance note",
      documentReference: "Fixture URA guidance note",
      officialSourceUrl: "https://example.invalid/ura-input-tax",
      primaryAuthority: false,
    }),
    source(),
    source({
      sourceId: "vat-act-section-28",
      title: "Value Added Tax Act input tax adjustment",
      provision: "Section 28",
      documentReference: "Fixture official legislative copy, section 28",
      keywords: ["input tax", "adjustment"],
    }),
  ]);

  const result = engine.retrieveLegalSources({
    question: "Can a registered business deduct input tax?",
    taxHead: "value-added-tax",
    taxPeriod: "2025/26",
  });

  assert.equal(result.adequateVerifiedAuthorityAvailable, true);
  assert.equal(result.sources[0].sourceId, "vat-act-section-27");
  assert.equal(result.citations.length, 3);
  assert.equal(result.citations[0].sourceId, "vat-act-section-27");
  assert.equal(result.citations[0].provision, "Section 27");
  assert.equal(result.citations[0].documentReference, "Fixture official legislative copy, section 27");
  assert.equal(result.citations[0].verificationStatus, "verified");
});

test("historical periods select applicable source versions and flag out-of-period evidence", () => {
  const engine = engineFor([
    source({
      sourceId: "vat-old-section-27",
      title: "Historical Value Added Tax Act input tax deduction",
      effectiveDate: "2023-07-01",
      endDate: "2024-06-30",
      applicableTaxPeriods: ["2023/24"],
      verificationStatus: "verified",
      historicalVersion: true,
    }),
    source(),
  ]);

  const result = engine.retrieveLegalSources({
    question: "input tax deduction",
    taxHead: "value-added-tax",
    taxPeriod: "2023/24",
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].sourceId, "vat-old-section-27");
  assert.equal(result.sources[0].periodMatch, true);
  assert.equal(result.sources[0].outdated, false);
  assert.equal(result.adequateVerifiedAuthorityAvailable, true);
  assert.ok(result.diagnostics.outdatedSourceIds.includes("vat-act-section-27"));
});

test("pending incomplete sources are returned as unverified, not as adequate authority", () => {
  const engine = engineFor([
    source({
      sourceId: "draft-vat-guidance",
      sourceType: "ura_guidance",
      title: "Draft input tax guidance",
      issuingAuthority: "Uganda Revenue Authority",
      provision: null,
      publicationDate: null,
      effectiveDate: null,
      applicableTaxPeriods: [],
      officialSourceUrl: null,
      documentReference: null,
      verificationStatus: "pending-review",
      lastVerificationDate: null,
      reviewer: null,
      primaryAuthority: false,
    }),
  ]);

  const result = engine.retrieveLegalSources({
    question: "input tax guidance",
    taxHead: "value-added-tax",
    taxPeriod: "2025/26",
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].unverified, true);
  assert.equal(result.sources[0].incomplete, true);
  assert.equal(result.citations.length, 0);
  assert.equal(result.adequateVerifiedAuthorityAvailable, false);
  assert.ok(result.diagnostics.incompleteSourceIds.includes("draft-vat-guidance"));
  assert.ok(result.diagnostics.unverifiedSourceIds.includes("draft-vat-guidance"));
});

test("explicit conflict metadata is surfaced without inferring legal conflicts", () => {
  const engine = engineFor([
    source({
      sourceId: "vat-source-a",
      conflictGroup: "vat-input-treatment-review",
    }),
    source({
      sourceId: "vat-source-b",
      sourceType: "ura_guidance",
      title: "URA input tax treatment guidance",
      issuingAuthority: "Uganda Revenue Authority",
      legislation: null,
      provision: "Input tax guidance note",
      documentReference: "Fixture guidance note",
      officialSourceUrl: "https://example.invalid/input-tax-guidance",
      primaryAuthority: false,
      conflictGroup: "vat-input-treatment-review",
    }),
  ]);

  const result = engine.retrieveLegalSources({
    question: "input tax treatment",
    taxHead: "value-added-tax",
    taxPeriod: "2025/26",
  });

  assert.equal(result.diagnostics.conflicts.length, 1);
  assert.deepEqual(result.diagnostics.conflicts[0].sourceIds.sort(), ["vat-source-a", "vat-source-b"]);
});

test("retrieval reports when no matching verified authority exists", () => {
  const engine = engineFor([source()]);
  const result = engine.retrieveLegalSources({
    question: "withholding on dividends",
    taxHead: "withholding-tax",
    taxPeriod: "2025/26",
  });

  assert.equal(result.sources.length, 0);
  assert.equal(result.adequateVerifiedAuthorityAvailable, false);
  assert.equal(result.status, "verified-authority-unavailable");
  assert.match(result.message, /No adequate verified legal authority/);
});

test("retrieval requires a question and rejects invalid result limits", () => {
  const engine = engineFor([]);
  assert.throws(() => engine.retrieveLegalSources({ taxHead: "value-added-tax" }), TypeError);
  assert.throws(() => engine.retrieveLegalSources({ question: "x".repeat(1601) }), RangeError);
  assert.throws(() => engine.retrieveLegalSources({ question: "VAT", limit: 0 }), RangeError);
});
