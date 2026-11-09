// Claude (Opus 5.5 + web search) as the web-research provider, with Gemini as
// backup. The Anthropic API is faked through the SDK's `fetch` option.
import test from "node:test";
import assert from "node:assert/strict";
import { callClaude, extractCitedAnswer, CLAUDE_MODEL } from "./claude-research.mjs";
import { handleRequest } from "./index.mjs";

const evidence = {
  text: "TaxComp notes:\n[1] VAT registration threshold note",
  sources: [{ label: "TaxComp VAT note", url: "https://taxcomp.example/notes/vat", sourceType: "taxcomp_note" }],
};
const SYSTEM = "You are TaxComp. For tax questions, use Google Search to check current information.";

function message(content, stop_reason = "end_turn", extra = {}) {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`, type: "message", role: "assistant", model: CLAUDE_MODEL,
    content, stop_reason, stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300, server_tool_use: { web_search_requests: 1 } },
    ...extra,
  };
}

const citedContent = [
  { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Uganda VAT registration threshold" } },
  { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [
    { type: "web_search_result", url: "https://www.ura.go.ug/en/vat/", title: "URA VAT", encrypted_content: "enc", page_age: "2026" },
  ] },
  { type: "text", text: "Uganda's VAT registration threshold is set by the VAT Act", citations: [
    { type: "web_search_result_location", url: "https://www.ura.go.ug/en/vat/", title: "URA VAT", cited_text: "threshold", encrypted_index: "idx" },
    { type: "web_search_result_location", url: "https://www.ura.go.ug/en/vat/", title: "URA VAT duplicate", cited_text: "threshold", encrypted_index: "idx2" },
  ] },
  { type: "text", text: ", as TaxComp's notes also state [1]", citations: [
    { type: "web_search_result_location", url: "http://insecure.example/vat", title: "Insecure", cited_text: "x", encrypted_index: "idx3" },
    { type: "web_search_result_location", url: "https://parliament.go.ug/vat-act", title: "VAT Act", cited_text: "x", encrypted_index: "idx4" },
  ] },
  { type: "text", text: "." },
];

function fakeAnthropic(responses) {
  const requests = [];
  return {
    requests,
    async fetch(url, init) {
      requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
      const next = responses.shift();
      if (typeof next === "number") {
        return new Response(JSON.stringify({ type: "error", error: { type: next === 401 ? "authentication_error" : "api_error", message: "fake" } }), {
          status: next, headers: { "Content-Type": "application/json" },
        });
      }
      return Response.json(next);
    },
  };
}

test("extractCitedAnswer numbers web sources after TaxComp notes, https only, without duplicates", () => {
  const { answer, sources, webGrounded } = extractCitedAnswer(citedContent, evidence.sources);
  assert.equal(webGrounded, true);
  assert.deepEqual(sources.map((s) => s.url), ["https://taxcomp.example/notes/vat", "https://www.ura.go.ug/en/vat/", "https://parliament.go.ug/vat-act"]);
  assert.equal(answer, "Uganda's VAT registration threshold is set by the VAT Act [2], as TaxComp's notes also state [1] [3].");
});

test("callClaude sends Opus 5.5 with web search, effort and the refusal fallback, and returns cited sources", async () => {
  const api = fakeAnthropic([message(citedContent)]);
  const result = await callClaude({
    question: "What is the VAT registration threshold?", evidence, systemInstruction: SYSTEM, effort: "low",
    env: { ANTHROPIC_API_KEY: "sk-ant-test-key", ANTHROPIC_FETCH: api.fetch },
  });
  assert.equal(result.fallback, undefined);
  assert.equal(result.provider, "claude");
  assert.equal(result.answerSource, "web");
  assert.equal(result.webGrounded, true);
  assert.equal(result.sources.length, 3);

  const [sent] = api.requests;
  assert.match(sent.url, /\/v1\/messages/);
  // @anthropic-ai/sdk 1.x sends API keys as a Bearer token (no x-api-key header).
  assert.equal(sent.headers.get("authorization"), "Bearer sk-ant-test-key");
  assert.match(sent.headers.get("anthropic-beta"), /server-side-fallback-2026-07-01/);
  assert.equal(sent.body.model, "claude-opus-5-5");
  assert.equal(sent.body.fallbacks, "default");
  assert.deepEqual(sent.body.output_config, { effort: "low" });
  assert.equal(sent.body.tools[0].type, "web_search_20260318");
  assert.equal(sent.body.tools[0].max_uses, 3);
  assert.deepEqual(sent.body.tools[0].user_location, { type: "approximate", timezone: "Africa/Kampala" });
  assert.match(sent.body.system, /TaxComp notes/);
  assert.doesNotMatch(sent.body.system, /Google Search/);
  assert.equal(sent.body.thinking, undefined, "Opus 5.5 thinking is adaptive by default; never sent disabled");
  assert.deepEqual(sent.body.messages.at(-1), { role: "user", content: "What is the VAT registration threshold?" });
});

test("chat history is converted to Claude turns and paused search turns are resumed", async () => {
  const paused = message([{ type: "server_tool_use", id: "srvtoolu_p", name: "web_search", input: { query: "q" } }], "pause_turn");
  const api = fakeAnthropic([paused, message(citedContent)]);
  const history = [
    { role: "model", parts: [{ text: "orphan assistant turn is dropped" }] },
    { role: "user", parts: [{ text: "Hi" }] },
    { role: "model", parts: [{ text: "Hello" }] },
  ];
  const result = await callClaude({ question: "PAYE?", history, evidence, systemInstruction: SYSTEM, env: { ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: api.fetch } });
  assert.equal(result.provider, "claude");
  assert.equal(api.requests.length, 2);
  assert.deepEqual(api.requests[0].body.messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.deepEqual(api.requests[1].body.messages.at(-1), { role: "assistant", content: paused.content }, "paused content sent back unchanged");
});

test("refusals, uncited answers, auth errors and a missing key fall back", async () => {
  const call = (responses, env = {}) => {
    const api = fakeAnthropic(responses);
    return callClaude({ question: "VAT?", evidence, systemInstruction: SYSTEM, env: { ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: api.fetch, ...env } });
  };
  assert.deepEqual(await call([message([], "refusal", { stop_details: { type: "refusal", category: "cyber", explanation: "x" } })]), { fallback: true, reason: "refusal" });
  assert.deepEqual(await call([message([{ type: "text", text: "An answer without any web citation." }])]), { fallback: true, reason: "grounding_unavailable" });
  assert.equal((await call([401])).reason, "authentication");
  assert.deepEqual(await callClaude({ question: "VAT?", evidence, systemInstruction: SYSTEM, env: {} }), { fallback: true, reason: "missing_api_key" });
});

test("site search uses Claude first and Gemini when Claude's key is rejected", async () => {
  const origin = "https://taxcomp.example.invalid";
  const base = { ALLOWED_ORIGIN: origin, CHAT_LIMITER: { limit: async () => ({ success: true }) } };
  const search = (env) => handleRequest(new Request("https://worker.example/search", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.9" },
    body: JSON.stringify({ message: "VAT registration threshold", kind: "guidance" }),
  }), env);

  const claudeApi = fakeAnthropic([message(citedContent)]);
  const viaClaude = await (await search({ ...base, ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: claudeApi.fetch, GEMINI_API_KEY: "g" })).json();
  assert.equal(viaClaude.status, "ok");
  assert.match(viaClaude.summary, /VAT registration threshold/);
  assert.ok(viaClaude.sources.some((s) => s.url === "https://www.ura.go.ug/en/vat/"));
  assert.equal(claudeApi.requests[0].body.output_config.effort, "low");

  const originalFetch = globalThis.fetch;
  let geminiCalls = 0;
  globalThis.fetch = async () => {
    geminiCalls += 1;
    const text = "Gemini summary of the VAT registration threshold.";
    return Response.json({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
      groundingChunks: [{ web: { uri: "https://www.ura.go.ug/en/vat/", title: "URA VAT" } }],
      groundingSupports: [{ segment: { endIndex: text.length }, groundingChunkIndices: [0] }],
    } }] });
  };
  try {
    const rejected = fakeAnthropic([401]);
    const viaGemini = await (await search({ ...base, ANTHROPIC_API_KEY: "bad", ANTHROPIC_FETCH: rejected.fetch, GEMINI_API_KEY: "g", GEMINI_MODEL: "gemini-test" })).json();
    assert.equal(viaGemini.status, "ok");
    assert.match(viaGemini.summary, /Gemini summary/);
    assert.equal(geminiCalls, 1, "Gemini used only after Claude failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
