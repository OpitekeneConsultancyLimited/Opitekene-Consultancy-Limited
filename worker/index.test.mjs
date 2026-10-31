import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "./index.mjs";
import { retrieveKnowledge } from "./knowledge.mjs";

const origin = "https://opitekeneconsultancylimited.github.io";
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

function request(body, options = {}) {
  return new Request("https://worker.example/chat", {
    method: options.method || "POST",
    headers: {
      Origin: options.origin || origin,
      "Content-Type": options.contentType || "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

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

test("rejects malformed, oversized and unsupported requests before calling Gemini", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Gemini must not be called for invalid requests");
  };
  try {
    const invalid = await handleRequest(request({ message: "" }), env);
    assert.equal(invalid.status, 400);

    const wrongType = await handleRequest(
      request({ message: "VAT" }, { contentType: "text/plain" }),
      env,
    );
    assert.equal(wrongType.status, 415);

    const unknown = await handleRequest(request({ message: "weather tomorrow" }), env);
    assert.equal(unknown.status, 200);
    assert.match((await unknown.json()).answer, /cannot verify|could not find/i);
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
  let upstreamRequest;
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: "The threshold is described in the reviewed note [1], not [99]." }] },
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
    assert.equal(upstreamRequest.options.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    assert.equal(new URL(upstreamRequest.url).search, "");
    const sentBody = JSON.parse(upstreamRequest.options.body);
    const systemPrompt = sentBody.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /Answer only from the evidence notes/);
    assert.match(systemPrompt, /Guidance note \[1, 2\]: VAT registration thresholds/);
    assert.match(systemPrompt, /\[1\] PwC Uganda VAT and other taxes/);
    assert.match(systemPrompt, /\[2\] Uganda Revenue Authority/);
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

test("does not expose provider details or key when Gemini fails", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("provider diagnostic", { status: 500 });
  try {
    const response = await handleRequest(request({ message: "VAT threshold" }), env);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(body), /provider diagnostic|test-key/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
