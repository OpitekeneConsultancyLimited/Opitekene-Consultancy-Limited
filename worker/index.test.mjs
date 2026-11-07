import assert from "node:assert/strict";
import test from "node:test";
import worker, { freshnessStatus, handleRequest, limits } from "./index.mjs";
import { retrieveKnowledge } from "./knowledge.mjs";

const origin = "https://opitekeneconsultancylimited.github.io";
const testAdminToken = "test-admin-token-with-at-least-32-characters";
const env = {
  ALLOWED_ORIGIN: origin,
  GEMINI_API_KEY: "test-key-not-a-real-secret",
  GEMINI_MODEL: "gemini-test",
  CHAT_LIMITER: { limit: async () => ({ success: true }) },
};

test("retrieves scoped international-tax notes and relevant references", () => {
  const treaty = retrieveKnowledge("Can a treaty reduce Uganda withholding for a nonresident?");
  const transferPricing = retrieveKnowledge("How should related-party transfer pricing be documented?");

  assert.ok(treaty.guidance.some((item) => item.title === "Tax treaties and non-resident withholding"));
  assert.ok(treaty.calculators.includes("international"));
  assert.ok(treaty.sources.some((source) => source.url.endsWith("/corporate/withholding-taxes")));
  assert.ok(transferPricing.guidance.some((item) => item.title === "International transfer pricing"));
  assert.ok(transferPricing.sources.some((source) => source.url.includes("transfer-pricing")));
});

test("Phase 6 API is routed through authentication at the Worker entry point", async () => {
  const response = await handleRequest(request(undefined, {
    path: "/api/phase6/clients",
    method: "GET",
  }), {
    ...env,
    PHASE6_OPERATIONS_ENABLED: "true",
    PHASE6_SECURITY_REVIEWED: "true",
    PHASE6_DATA_AT_REST_REVIEWED: "true",
    PHASE6_BACKUP_RESTORE_VERIFIED: "true",
    UNANSWERED_QUESTIONS: {
      prepare: () => { throw new Error("Unauthenticated request must not query the database."); },
      batch: async () => { throw new Error("Unauthenticated request must not write the database."); },
    },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "Authentication required.");
  assert.equal(response.headers.get("Cache-Control"), "no-store, private");
});

test("does not apply current-period notes to an unrepresented historical financial year", () => {
  const historical = retrieveKnowledge(
    "What were the VAT registration thresholds for FY 2020/21?",
  );
  const current = retrieveKnowledge(
    "What are the VAT registration thresholds for FY 2026/27?",
  );

  assert.equal(historical.requestedFinancialYear, "2020/21");
  assert.equal(historical.sufficient, false);
  assert.deepEqual(historical.guidance, []);
  assert.deepEqual(historical.cases, []);
  assert.ok(current.guidance.some((item) => item.title === "VAT registration thresholds"));
});

test("scopes the Worker fallback to the user-selected historical tax period", async () => {
  const response = await handleRequest(
    request({ message: "What are the VAT registration thresholds?", taxPeriod: "2020/21" }),
    { ...env, GEMINI_API_KEY: "" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.webGrounded, false);
  assert.match(body.answer, /FY 2020\/21/);
  assert.match(body.answer, /could not find a reviewed TaxComp local note/i);
});

function request(body, options = {}) {
  return new Request(`https://worker.example${options.path || "/chat"}`, {
    method: options.method || "POST",
    headers: {
      Origin: options.origin || origin,
      "Content-Type": options.contentType || "application/json",
      "CF-Connecting-IP": "192.0.2.1",
      ...(options.authorization ? { Authorization: options.authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify({ providerConsent: true, ...body }),
  });
}

function legalSourceDatabase() {
  const records = new Map();
  const audit = [];
  return {
    records,
    audit,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes("INSERT INTO legal_sources")) {
                const [sourceId, recordJson, status, reviewHistoryJson, createdAt, updatedAt] = values;
                if (records.has(sourceId)) throw new Error("duplicate source");
                records.set(sourceId, { sourceId, recordJson, status, reviewHistoryJson, createdAt, updatedAt });
              } else if (sql.includes("UPDATE legal_sources")) {
                const [recordJson, status, reviewHistoryJson, updatedAt, sourceId] = values;
                const current = records.get(sourceId);
                if (!current || current.status !== "pending-review") return { meta: { changes: 0 } };
                records.set(sourceId, { ...current, recordJson, status, reviewHistoryJson, updatedAt });
              } else if (sql.includes("INSERT INTO legal_source_audit")) {
                const [id, sourceId, action, actor, notes, createdAt] = values;
                audit.push({ id, sourceId, action, actor, notes, createdAt });
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              const row = records.get(values[0]);
              return row ? { ...row, reviewHistoryJson: row.reviewHistoryJson } : null;
            },
          };
        },
        async all() {
          return { results: [...records.values()].map((row) => ({ ...row })) };
        },
      };
    },
  };
}

function sourceFixture(overrides = {}) {
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
    keywords: ["input tax", "credit"],
    ...overrides,
  };
}

test("advisor route returns source-checked structured fallback and downloadable reports", async () => {
  const response = await handleRequest(request({
    message: "Can I claim input VAT on this purchase?",
    taxPeriod: "2025/26",
    providerConsent: false,
  }, { path: "/advisor" }), { ...env, GEMINI_API_KEY: "" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answerSource, "advisor");
  assert.equal(body.providerStatus, "not-configured");
  assert.equal(body.advisorMode, "fallback-provider-not-configured");
  assert.equal(body.structuredAnswer.taxPeriod, "2025/26");
  assert.ok(body.clarification.missingFacts.length > 0);
  assert.equal(body.structuredAnswer.verificationStatus.adequateVerifiedPrimaryAuthority, false);
  assert.match(body.answer, /No adequate verified primary authority/);
  assert.match(body.reportHtml, /not a formal legal opinion/i);
  assert.match(body.citationCsv, /Citation ID/);
});

test("legal-source ingestion is authenticated and forces pending-review before admin approval", async () => {
  const database = legalSourceDatabase();
  const adminEnv = { ...env, UNANSWERED_QUESTIONS: database, ADMIN_DASHBOARD_TOKEN: testAdminToken };
  const draftResponse = await handleRequest(request({
    record: sourceFixture(),
    submittedBy: "Admin reviewer",
  }, {
    path: "/admin/legal-sources/api",
    method: "POST",
    authorization: `Bearer ${testAdminToken}`,
  }), adminEnv);
  const draftBody = await draftResponse.json();

  assert.equal(draftResponse.status, 201);
  assert.equal(draftBody.source.verificationStatus, "pending-review");
  assert.equal(draftBody.source.reviewer, null);

  const updatedDraftResponse = await handleRequest(request({
    updatedBy: "Admin reviewer",
    updates: { title: "Reviewed fixture title", sourceId: "forged-id", verificationStatus: "verified" },
  }, {
    path: "/admin/legal-sources/vat-act-section-27",
    method: "PUT",
    authorization: `Bearer ${testAdminToken}`,
  }), adminEnv);
  const updatedDraft = await updatedDraftResponse.json();
  assert.equal(updatedDraftResponse.status, 200, JSON.stringify(updatedDraft));
  assert.equal(updatedDraft.source.sourceId, "vat-act-section-27");
  assert.equal(updatedDraft.source.verificationStatus, "pending-review");
  assert.equal(updatedDraft.source.title, "Reviewed fixture title");

  const review = await handleRequest(request({
    decision: "verified",
    reviewer: "Legal reviewer",
    reviewDate: "2026-11-02",
    notes: "Compared to official document and checked the effective period.",
  }, {
    path: "/admin/legal-sources/vat-act-section-27/review",
    authorization: `Bearer ${testAdminToken}`,
  }), adminEnv);
  const reviewBody = await review.json();
  assert.equal(review.status, 200);
  assert.equal(reviewBody.source.verificationStatus, "verified");
  assert.equal(database.audit.length, 3);

  const advisorResponse = await handleRequest(request({
    message: "Can I claim input VAT on this purchase?",
    taxPeriod: "2025/26",
    providerConsent: false,
  }, { path: "/advisor" }), { ...adminEnv, GEMINI_API_KEY: "" });
  const advisorBody = await advisorResponse.json();
  assert.equal(advisorResponse.status, 200);
  assert.equal(advisorBody.structuredAnswer.verificationStatus.adequateVerifiedPrimaryAuthority, true);
  assert.ok(advisorBody.citations.some((citation) => citation.sourceId === "vat-act-section-27"));

  const unauthenticated = await handleRequest(request(undefined, {
    path: "/admin/legal-sources/api",
    method: "GET",
  }), adminEnv);
  assert.equal(unauthenticated.status, 401);
  const loginPage = await handleRequest(request(undefined, {
    path: "/admin/legal-sources",
    method: "GET",
  }), adminEnv);
  assert.equal(loginPage.status, 200);
  assert.match(await loginPage.text(), /Legal source review/);
});

test("advisor handles missing provider credentials and provider errors without exposing drafts", async () => {
  const missingCredentials = await handleRequest(request({
    message: "What VAT treatment applies to this purchase?",
    providerConsent: true,
  }, { path: "/advisor" }), { ...env, GEMINI_API_KEY: "" });
  const missingBody = await missingCredentials.json();
  assert.equal(missingBody.providerStatus, "not-configured");
  assert.equal(missingBody.advisorMode, "fallback-provider-not-configured");

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { status: "UNAUTHENTICATED", message: "sensitive provider diagnostic" },
  }), { status: 401 });
  try {
    const failed = await handleRequest(request({
      message: "What VAT treatment applies to this purchase?",
      providerConsent: true,
    }, { path: "/advisor" }), env);
    const body = await failed.json();
    assert.equal(body.providerStatus, "unavailable");
    assert.equal(body.providerDraft, undefined);
    assert.doesNotMatch(JSON.stringify(body), /sensitive provider diagnostic/);
    assert.match(body.answer, /No adequate verified primary authority/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("handles preflight only for the configured TaxComp origin", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/chat", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }),
    env,
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);

  const rejected = await handleRequest(request({}, { origin: "https://example.com" }), env);
  assert.equal(rejected.status, 403);
});

test("rejects malformed requests and keeps unrelated questions in scope", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Gemini must not be called for invalid requests");
  };
  try {
    const invalid = await handleRequest(request({ message: "" }), env);
    assert.equal(invalid.status, 400);

    const invalidPeriod = await handleRequest(request({ message: "VAT", taxPeriod: "2025/27" }), env);
    assert.equal(invalidPeriod.status, 400);

    const wrongPeriodType = await handleRequest(request({ message: "VAT", taxPeriod: 202526 }), env);
    assert.equal(wrongPeriodType.status, 400);

    const wrongConsentType = await handleRequest(request({ message: "VAT", providerConsent: "yes" }), env);
    assert.equal(wrongConsentType.status, 400);

    const wrongType = await handleRequest(
      request({ message: "VAT" }, { contentType: "text/plain" }),
      env,
    );
    assert.equal(wrongType.status, 415);

    const unrelated = await handleRequest(request({ message: "weather tomorrow" }), env);
    assert.equal(unrelated.status, 200);
    assert.match((await unrelated.json()).answer, /Uganda tax/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("does not call Gemini or send history without explicit provider consent", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("No provider request is allowed without consent.");
  };
  try {
    const response = await handleRequest(request({
      message: "VAT threshold",
      providerConsent: false,
      history: [{ role: "user", text: "Private prior context" }],
    }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 0);
    assert.equal(body.providerStatus, "consent-required");
    assert.equal(body.sourceIndicators.find((item) => item.kind === "ai_provider").used, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("limits questions per IP and returns a clear response", async () => {
  const limitedEnv = {
    ...env,
    CHAT_LIMITER: { limit: async () => ({ success: false }) },
  };
  const response = await handleRequest(request({ message: "VAT threshold" }), limitedEnv);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /Too many questions/);
});

test("uses Gemini with a server-side key and returns curated source links", async () => {
  const previousFetch = globalThis.fetch;
  const answer = "The threshold is described in the reviewed note [1], not [99].";
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer }] },
        groundingMetadata: {
          groundingChunks: [{
            web: { uri: "https://www.ura.go.ug/en/vat/", title: "URA VAT" },
          }],
          groundingSupports: [{
            segment: { endIndex: answer.length },
            groundingChunkIndices: [0],
          }],
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await handleRequest(request({
      message: "What is the VAT registration threshold?",
      history: [{ role: "user", text: "Previous question" }],
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.answer, /reviewed note/);
    assert.match(body.answer, /\[1\]/);
    assert.doesNotMatch(body.answer, /\[99\]/);
    assert.ok(body.calculators.includes("vat"));
    assert.ok(body.sources.some((source) => source.url === "https://www.ura.go.ug/"));
    assert.equal(body.webGrounded, true);
    assert.equal(body.answerSource, "web");
    assert.equal(upstreamRequest.options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    assert.equal(new URL(upstreamRequest.url).search, "");
    assert.match(upstreamRequest.url, /\/v1beta\/models\/gemini-test:generateContent$/);
    const sentBody = JSON.parse(upstreamRequest.options.body);
    const systemPrompt = sentBody.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /use Google Search to check current information/i);
    assert.match(systemPrompt, /Prefer current primary sources/);
    assert.match(systemPrompt, /Guidance note \[1, 2\]: VAT registration thresholds/);
    assert.match(systemPrompt, /\[1\] PwC Uganda VAT and other taxes/);
    assert.match(systemPrompt, /\[2\] Uganda Revenue Authority/);
    assert.deepEqual(sentBody.tools, [{ google_search: {} }]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns only cited HTTPS Google Search sources with inline grounded citations", async () => {
  const previousFetch = globalThis.fetch;
  const answer = "URA published current VAT guidance.";
  globalThis.fetch = async (_url, options) => {
    const sentBody = JSON.parse(options.body);
    assert.deepEqual(sentBody.tools, [{ google_search: {} }]);
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: "https://www.ura.go.ug/en/domestic-taxes/vat/", title: "URA VAT" } },
            { web: { uri: "http://insecure.example/rates", title: "Insecure result" } },
            { web: { uri: "https://www.ura.go.ug/en/domestic-taxes/vat/", title: "Duplicate URA result" } },
            { web: { uri: "https://example.com/uncited", title: "Uncited result" } },
          ],
          groundingSupports: [{
            segment: { startIndex: 0, endIndex: answer.length, text: answer },
            groundingChunkIndices: [0, 1, 2],
          }],
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await handleRequest(request({
      message: "What is the current VAT registration threshold?",
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.webGrounded, true);
    const sourceIndex = body.sources.findIndex(
      (source) => source.url === "https://www.ura.go.ug/en/domestic-taxes/vat/",
    ) + 1;
    assert.ok(sourceIndex > 0);
    assert.match(body.answer, new RegExp(`\\[${sourceIndex}\\]`));
    for (const [, citation] of body.answer.matchAll(/\[(\d+)\]/g)) {
      assert.ok(Number(citation) <= body.sources.length);
    }
    assert.equal(
      body.sources.filter((source) => source.url === "https://www.ura.go.ug/en/domestic-taxes/vat/").length,
      1,
    );
    assert.ok(body.sources.every((source) => source.url.startsWith("https://")));
    assert.ok(body.sources.every((source) => !source.url.includes("/uncited")));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("uses Google Search for tax questions without a matching curated note", async () => {
  const previousFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async (_url, options) => {
    upstreamCalled = true;
    assert.deepEqual(JSON.parse(options.body).tools, [{ google_search: {} }]);
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "I could not verify a current official source." }] },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await handleRequest(request({
      message: "What recent tax circular changed the new levy?",
    }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(upstreamCalled, true);
    assert.equal(body.webGrounded, false);
    assert.equal(body.answerSource, "local");
    assert.match(body.answer, /no Google Search was performed/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("provides the wear-and-tear classes and their source as grounded evidence", async () => {
  const previousFetch = globalThis.fetch;
  let sentPrompt = "";
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sentPrompt = body.systemInstruction.parts[0].text;
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "The notes list statutory classes [1]." }] },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await handleRequest(request({
      message: "What are the wear and tear asset classes and rates?",
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(sentPrompt, /Class 1.*40%.*Class 2.*30%.*Class 3.*20%/);
    assert.match(sentPrompt, /\[1\] PwC Uganda capital allowances/);
    assert.ok(body.sources.some((source) => source.url.endsWith("/corporate/deductions")));
    assert.ok(body.calculators.includes("capital-allowances"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns a local fallback and redacts private data from provider logs", async () => {
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  let logOutput = "";
  let calls = 0;
  console.error = (...args) => { logOutput += JSON.stringify(args); };
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: {
        status: "INTERNAL",
        message: `provider diagnostic ${env.GEMINI_API_KEY} VAT threshold`,
      },
    }), { status: 500 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Gemini-Upstream-Status"), "500");
    assert.equal(response.headers.get("X-TaxComp-Answer-Source"), "local");
    assert.equal(body.answerSource, "local");
    assert.equal(calls, 2);
    assert.match(body.answer, /reviewed TaxComp local notes only/i);
    assert.doesNotMatch(JSON.stringify(body), /provider diagnostic|test-key/);
    assert.doesNotMatch(logOutput, /test-key-not-a-real-secret|VAT threshold/);
    assert.match(logOutput, /provider diagnostic/);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
  }
});

test("falls back on invalid API credentials without exposing Google's error", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: { status: "UNAUTHENTICATED", message: "API key is invalid" },
    }), { status: 401 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("X-Gemini-Upstream-Status"), "401");
    assert.equal(body.answerSource, "local");
    assert.doesNotMatch(JSON.stringify(body), /invalid|UNAUTHENTICATED/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("rejects an invalid configured model without making an upstream request", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("Invalid model configuration must not call Google");
  };
  try {
    const invalidModelEnv = { ...env, GEMINI_MODEL: "models/not/a/model" };
    const response = await handleRequest(
      request({ message: "VAT threshold" }),
      invalidModelEnv,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 0);
    assert.equal(body.answerSource, "local");
    assert.match(body.answer, /VAT registration thresholds/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("checks accessible models after a model 404 and tries only a listed low-cost model", async () => {
  const previousFetch = globalThis.fetch;
  const previousInfo = console.info;
  let logOutput = "";
  const calls = [];
  console.info = (...args) => { logOutput += JSON.stringify(args); };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        error: {
          status: "NOT_FOUND",
          message: "models/gemini-test is not found for API version v1beta",
        },
      }), { status: 404 });
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({
        models: [
          {
            name: "models/gemini-3.8-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.5-transcribe",
            supportedGenerationMethods: ["transcribe"],
          },
        ],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      error: {
        status: "FAILED_PRECONDITION",
        message: "Google Search grounding is unavailable on this API tier",
      },
    }), { status: 400 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.answerSource, "local");
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /models\/gemini-test:generateContent$/);
    assert.match(calls[1].url, /\/v1beta\/models\?pageSize=1000$/);
    assert.equal(calls[1].options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    assert.match(calls[2].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.match(logOutput, /gemini-3.5-flash-lite/);
    assert.doesNotMatch(logOutput, /test-key-not-a-real-secret/);
    assert.match(body.answer, /no Google Search was performed/i);
  } finally {
    globalThis.fetch = previousFetch;
    console.info = previousInfo;
  }
});

test("falls back without retrying when the API key cannot list an unavailable model", async () => {
  const previousFetch = globalThis.fetch;
  const previousInfo = console.info;
  let calls = 0;
  let logOutput = "";
  console.info = (...args) => { logOutput += JSON.stringify(args); };
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({
        error: { status: "MODEL_NOT_FOUND", message: "Model not found" },
      }), { status: 404 })
      : new Response(JSON.stringify({
        error: {
          status: "PERMISSION_DENIED",
          message: `API key ${env.GEMINI_API_KEY} has no access`,
        },
      }), { status: 403 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal(body.answerSource, "local");
    assert.equal(response.headers.get("X-Gemini-Upstream-Status"), "404");
    assert.match(logOutput, /API key \[redacted\] has no access/);
    assert.doesNotMatch(logOutput, /test-key-not-a-real-secret/);
  } finally {
    globalThis.fetch = previousFetch;
    console.info = previousInfo;
  }
});

test("retries a transient Google service error once and accepts a grounded answer", async () => {
  const previousFetch = globalThis.fetch;
  const answer = "URA states the current VAT threshold.";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: { status: "UNAVAILABLE", message: "Temporary service outage" },
      }), { status: 503 });
    }
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer }] },
        groundingMetadata: {
          groundingChunks: [{
            web: { uri: "https://www.ura.go.ug/en/vat/", title: "URA VAT" },
          }],
          groundingSupports: [{
            segment: { endIndex: answer.length },
            groundingChunkIndices: [0],
          }],
        },
      }],
    }), { status: 200 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal(body.answerSource, "web");
    assert.equal(body.webGrounded, true);
    assert.equal(body.sourceIndicators.find((item) => item.kind === "live_web").used, true);
    assert.equal(body.sourceIndicators.find((item) => item.kind === "ai_interpretation").used, true);
    assert.match(
      body.sourceIndicators.find((item) => item.kind === "ura_publication").detail,
      /Cited by live research/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("retries Google rate limiting once, then accepts a grounded response", async () => {
  const previousFetch = globalThis.fetch;
  const answer = "URA states the current VAT threshold.";
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: { status: "RESOURCE_EXHAUSTED", message: "Please retry shortly" },
      }), {
        status: 429,
        headers: { "Retry-After": "0.01" },
      });
    }
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: answer }] },
        groundingMetadata: {
          groundingChunks: [{
            web: { uri: "https://www.ura.go.ug/en/vat/", title: "URA VAT" },
          }],
          groundingSupports: [{
            segment: { endIndex: answer.length },
            groundingChunkIndices: [0],
          }],
        },
      }],
    }), { status: 200 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal(body.answerSource, "web");
    assert.equal(body.webGrounded, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("does not retry an exhausted Google quota", async () => {
  const previousFetch = globalThis.fetch;
  const previousError = console.error;
  let calls = 0;
  let logOutput = "";
  console.error = (...args) => { logOutput += JSON.stringify(args); };
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "You exceeded your current quota; check your plan and billing details.",
      },
    }), {
      status: 429,
      headers: { "Retry-After": "30" },
    });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("X-Gemini-Upstream-Status"), "429");
    assert.equal(body.answerSource, "local");
    assert.match(logOutput, /quota_exceeded/);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousError;
  }
});

test("does not retry Google Search grounding errors and returns local notes", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: {
        status: "FAILED_PRECONDITION",
        message: "Google Search grounding is not available on the free tier",
      },
    }), { status: 400 });
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("X-Gemini-Upstream-Status"), "400");
    assert.equal(body.answerSource, "local");
    assert.match(body.answer, /no Google Search was performed/i);
    assert.match(body.answer, /UGX 300 million/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns local notes after an upstream timeout without retrying", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const error = new Error("The request timed out");
    error.name = "AbortError";
    throw error;
  };
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(body.answerSource, "local");
    assert.match(body.answer, /reviewed TaxComp local notes only/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("returns local guidance when the key is missing", async () => {
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; };
  try {
    const response = await handleRequest(
      request({ message: "VAT threshold" }),
      { ...env, GEMINI_API_KEY: "" },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(called, false);
    assert.equal(body.answerSource, "local");
    assert.match(body.answer, /UGX 300 million/);
    assert.equal(body.verificationRequired, true);
    assert.match(body.legalReferences[0].freshness, /unverified/);
    assert.match(body.answer, /Further verification is required/);
    assert.equal(body.sourceIndicators.find((item) => item.kind === "live_web").used, false);
    assert.equal(body.sourceIndicators.find((item) => item.kind === "client_documents").used, false);
    assert.equal(body.sourceIndicators.find((item) => item.kind === "ura_publication").used, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("requires further verification when no local note covers the requested historical year", async () => {
  const response = await handleRequest(
    request({ message: "What were the VAT registration thresholds for FY 2020/21?" }),
    { ...env, GEMINI_API_KEY: "" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answerSource, "local");
  assert.equal(body.legalReferences.length, 0);
  assert.equal(body.sourceIndicators.find((item) => item.kind === "live_web").used, false);
  assert.match(body.answer, /no Google Search was performed/i);
  assert.match(body.answer, /reviewed TaxComp local note for FY 2020\/21/i);
  assert.match(body.answer, /Further verification is required/i);
  assert.doesNotMatch(body.answer, /UGX 300 million/);
});

test("requires further verification when no local evidence answers a tax question", async () => {
  const response = await handleRequest(
    request({ message: "What tax applies to an alien zorb?" }),
    { ...env, GEMINI_API_KEY: "" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answerSource, "local");
  assert.equal(body.legalReferences.length, 0);
  assert.match(body.answer, /Further verification is required/i);
  assert.match(body.answer, /no Google Search was performed/i);
  assert.equal(body.sourceIndicators.find((item) => item.kind === "live_web").used, false);
});

test("marks legislation outdated after 180 days without verification", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  assert.equal(freshnessStatus("2026-08-04", now), "recently_reviewed");
  assert.equal(freshnessStatus("2026-05-06", now), "review_due");
  assert.equal(freshnessStatus("2025-01-01", now), "outdated");
  assert.equal(freshnessStatus(null, now), "unverified");
  assert.equal(freshnessStatus("2026-02-31", now), "unverified");
  assert.equal(freshnessStatus("2027-01-01", now), "unverified");
  assert.equal(limits.unansweredRetentionDays, 90);
});

test("marks missing local legal citations and verification dates as unverified", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("No Gemini request expected when key is absent");
  };
  try {
    const response = await handleRequest(
      request({ message: "What are the VAT registration thresholds?" }),
      { ...env, GEMINI_API_KEY: "" },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.legalReferences.length > 0);
    assert.ok(body.legalReferences.some((reference) => (
      reference.title === "VAT registration thresholds" &&
      reference.legislation === null &&
      reference.provision === null &&
      reference.effectiveDate === null &&
      reference.lastVerifiedAt === null &&
      reference.freshness === "unverified"
    )));
    assert.equal(body.verificationRequired, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("records an unanswered question only after explicit user consent", async () => {
  const previousFetch = globalThis.fetch;
  const inserts = [];
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          return {
            run: async () => { inserts.push({ statement, values }); },
          };
        },
      };
    },
  };
  globalThis.fetch = async () => {
    throw new Error("No Gemini key should be used in this test");
  };
  try {
    const question = "Tax treatment of an unusual widget transaction";
    const withoutConsent = await handleRequest(
      request({ message: question }),
      {
        ...env,
        GEMINI_API_KEY: "",
        ADMIN_DASHBOARD_TOKEN: testAdminToken,
        UNANSWERED_QUESTIONS: database,
      },
    );
    const noConsentBody = await withoutConsent.json();
    assert.equal(noConsentBody.questionRecordStatus, "not_requested");
    assert.equal(noConsentBody.questionRecordId, null);
    assert.equal(inserts.length, 0);

    const response = await handleRequest(
      request({ message: question, recordUnanswered: true }),
      {
        ...env,
        GEMINI_API_KEY: "",
        ADMIN_DASHBOARD_TOKEN: testAdminToken,
        UNANSWERED_QUESTIONS: database,
      },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.questionRecordStatus, "saved");
    assert.match(body.questionRecordId, /^[a-f0-9-]{36}$/i);
    assert.equal(inserts.length, 2);
    const insert = inserts.find((item) => /INSERT INTO unanswered_questions/.test(item.statement));
    assert.ok(insert);
    assert.match(insert.statement, /consented_at/);
    assert.equal(body.questionRecordId, insert.values[0]);
    assert.equal(insert.values[1], question);
    const created = Date.parse(insert.values[2]);
    const consented = Date.parse(insert.values[3]);
    const expires = Date.parse(insert.values[4]);
    assert.equal(consented, created);
    assert.equal(expires - created, 90 * 86_400_000);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("scheduled retention cleanup deletes records whose expiry has passed", async () => {
  const executions = [];
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          return {
            run: async () => {
              executions.push({ statement, values });
              return { success: true };
            },
          };
        },
      };
    },
  };
  let scheduledCleanup;
  worker.scheduled({}, { UNANSWERED_QUESTIONS: database }, {
    waitUntil(promise) {
      scheduledCleanup = promise;
    },
  });
  await scheduledCleanup;

  assert.equal(executions.length, 1);
  assert.match(
    executions[0].statement,
    /DELETE FROM unanswered_questions WHERE expires_at <= \?/,
  );
  assert.ok(Number.isFinite(Date.parse(executions[0].values[0])));
});

test("does not store opted-in questions until the admin credential is configured", async () => {
  const previousFetch = globalThis.fetch;
  let inserted = false;
  const database = {
    prepare(statement) {
      return {
        bind() {
          return {
            run: async () => {
              if (/INSERT INTO/.test(statement)) inserted = true;
            },
          };
        },
      };
    },
  };
  globalThis.fetch = async () => {
    throw new Error("No Gemini key should be used in this test");
  };
  try {
    const response = await handleRequest(
      request({
        message: "Tax treatment of an unusual widget transaction",
        recordUnanswered: true,
      }),
      { ...env, GEMINI_API_KEY: "", UNANSWERED_QUESTIONS: database },
    );
    const body = await response.json();
    assert.equal(body.questionRecordStatus, "failed");
    assert.equal(inserted, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("rejects an administrator token shorter than 32 characters", async () => {
  const response = await handleRequest(
    new Request("https://worker.example/admin/questions"),
    { ...env, ADMIN_DASHBOARD_TOKEN: "short-admin-token" },
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured safely/i);
});

test("rate limits admin API requests with a separate per-IP key", async () => {
  const keys = [];
  const response = await handleRequest(
    new Request("https://worker.example/admin/questions", {
      headers: { "CF-Connecting-IP": "192.0.2.10" },
    }),
    {
      ...env,
      ADMIN_DASHBOARD_TOKEN: testAdminToken,
      CHAT_LIMITER: {
        limit: async ({ key }) => {
          keys.push(key);
          return { success: false };
        },
      },
    },
  );

  assert.equal(response.status, 429);
  assert.deepEqual(keys, ["admin:192.0.2.10"]);
});

test("protects the unanswered-question dashboard and lists records after authentication", async () => {
  const token = testAdminToken;
  let adminQuery = "";
  const database = {
    prepare(statement) {
      adminQuery = statement;
      const statementResult = {
        bind() {
          return statementResult;
        },
        run: async () => ({ success: true }),
        all: async () => ({
          results: [{
            id: "01234567-89ab-cdef-0123-456789abcdef",
            question: "Test",
            createdAt: "2026-11-02T00:00:00.000Z",
            consentedAt: "2026-11-02T00:00:00.000Z",
          }],
        }),
      };
      return statementResult;
    },
  };
  const adminEnv = {
    ...env,
    ADMIN_DASHBOARD_TOKEN: token,
    UNANSWERED_QUESTIONS: database,
  };
  const unauthorized = await handleRequest(
    new Request("https://worker.example/admin/questions"),
    adminEnv,
  );
  assert.equal(unauthorized.status, 401);

  const dashboard = await handleRequest(
    new Request("https://worker.example/admin"),
    adminEnv,
  );
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Unanswered TaxComp questions/);
  assert.match(dashboardHtml, /\/admin\/efris/);
  assert.match(dashboardHtml, /Consent timestamps are recorded/);

  const authorized = await handleRequest(
    new Request("https://worker.example/admin/questions", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    adminEnv,
  );
  assert.equal(authorized.status, 200);
  assert.match(adminQuery, /consented_at AS consentedAt/);
  const authorizedBody = await authorized.json();
  assert.equal(authorizedBody.questions[0].question, "Test");
  assert.equal(authorizedBody.questions[0].consentedAt, "2026-11-02T00:00:00.000Z");
});

test("serves the EFRIS sign-in page without exposing records and protects its API", async () => {
  const dashboard = await handleRequest(
    new Request("https://worker.example/admin/efris"),
    env,
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get("Cache-Control"), "no-store");
  assert.match(dashboard.headers.get("Content-Security-Policy"), /connect-src 'self'/);
  const html = await dashboard.text();
  assert.match(html, /not connected to URA EFRIS/i);
  assert.match(html, /never submitted or fiscalised/i);
  assert.match(html, /Admin token/);
  assert.doesNotMatch(html, /localStorage/);

  const unauthorized = await handleRequest(
    new Request("https://worker.example/admin/efris/api"),
    { ...env, ADMIN_DASHBOARD_TOKEN: testAdminToken },
  );
  assert.equal(unauthorized.status, 401);
  assert.match((await unauthorized.json()).error, /authentication is required/i);
});

test("loads the EFRIS workspace after authentication and requires JSON for writes", async () => {
  const database = {
    prepare() {
      return {
        bind() {
          return {
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
  const adminEnv = {
    ...env,
    ADMIN_DASHBOARD_TOKEN: testAdminToken,
    UNANSWERED_QUESTIONS: database,
  };
  const authorized = await handleRequest(
    new Request("https://worker.example/admin/efris/api", {
      headers: { Authorization: `Bearer ${testAdminToken}` },
    }),
    adminEnv,
  );
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    clients: [],
    selectedClientId: null,
  });

  const wrongContentType = await handleRequest(
    new Request("https://worker.example/admin/efris/api", {
      method: "POST",
      headers: { Authorization: `Bearer ${testAdminToken}` },
      body: JSON.stringify({ action: "createClient", name: "Test" }),
    }),
    adminEnv,
  );
  assert.equal(wrongContentType.status, 415);
});
