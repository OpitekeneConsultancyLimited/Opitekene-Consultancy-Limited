// F1 provider chain with fake Anthropic / Gemini HTTP APIs (no network, no cost).
import test from "node:test";
import assert from "node:assert/strict";
import { OUTPUT_SCHEMA, readNotice, UnreadableNoticeError } from "./challenge/ai.mts";

const VALID = {
  tin: { value: "1000123456", confidence: 0.98 }, tax_head: { value: "income_tax", confidence: 0.95 }, assessment_type: { value: "original", confidence: 0.9 },
  period_start: { value: "2026-07-01", confidence: 0.9 }, period_end: { value: "2026-07-31", confidence: 0.9 }, date_issued: { value: "2026-09-15", confidence: 0.9 },
  principal: { value: 5000000, confidence: 0.97 }, penal_tax: { value: 1000000, confidence: 0.95 }, interest: { value: 200000, confidence: 0.95 },
  interest_rate_percent_per_month: { value: 2, confidence: 0.8 }, interest_months: { value: 2, confidence: 0.8 }, penal_tax_percent: { value: 20, confidence: 0.8 },
  ura_reasons: { value: "Unsupported expenses.", confidence: 0.8 }, provisions_cited: { value: [], confidence: 0 },
};

function fakeAnthropic(reply, calls = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const { text, stop = "end_turn", status = 200 } = typeof reply === "function" ? reply(body) : reply;
    if (status !== 200) return new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "busy" } }), { status, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const pdf = { kind: "file", bytes: new TextEncoder().encode("%PDF-1.7 synthetic"), contentType: "application/pdf" };

test("Claude reads a PDF with structured JSON output and the result is validated", async () => {
  const calls = [];
  const result = await readNotice(pdf, { ANTHROPIC_API_KEY: "test-key", ANTHROPIC_FETCH: fakeAnthropic({ text: JSON.stringify(VALID) }, calls) });
  assert.equal(result.extraction.source, "ai-claude");
  assert.equal(result.extraction.fields.find((f) => f.fieldName === "principal").value, "5000000");
  assert.equal(calls[0].model, "claude-opus-5-5");
  assert.deepEqual(calls[0].output_config.format.type, "json_schema");
  assert.equal(calls[0].messages[0].content[0].type, "document");
  assert.equal(calls[0].messages[0].content[0].source.media_type, "application/pdf");
  assert.ok(!JSON.stringify(OUTPUT_SCHEMA).includes("$ref"), "schema is inlined");
});

test("malformed or refused output is never used; text falls back to the built-in reader", async () => {
  const text = { kind: "text", text: "NOTICE OF ASSESSMENT - INCOME TAX\nTax period: 01/07/2026 to 31/07/2026\nPrincipal tax: UGX 5,000,000\nInterest: UGX 200,000\n" };
  const malformed = await readNotice(text, { ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: fakeAnthropic({ text: "{\"tin\": 5}" }) });
  assert.equal(malformed.extraction.source, "text-reader");
  assert.deepEqual(malformed.attempts.map((a) => `${a.provider}:${a.outcome}`), ["claude:malformed_output", "gemini:missing_api_key", "text-reader:ok"]);
  const refused = await readNotice(text, { ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: fakeAnthropic({ text: "", stop: "refusal" }) });
  assert.equal(refused.attempts[0].outcome, "refusal");
  await assert.rejects(readNotice(pdf, { ANTHROPIC_API_KEY: "k", ANTHROPIC_FETCH: fakeAnthropic({ text: "not json" }) }), UnreadableNoticeError);
});

test("Gemini is used only when the owner has confirmed a paid tier", async () => {
  let geminiCalls = 0;
  const gemini = async (url, init) => {
    geminiCalls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.contents[0].parts[0].inline_data, "the PDF is sent inline");
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(VALID) }] } }] });
  };
  await assert.rejects(readNotice(pdf, { GEMINI_API_KEY: "g", GEMINI_FETCH: gemini }), (error) => error.attempts.some((a) => a.outcome === "gemini_not_paid_tier"));
  assert.equal(geminiCalls, 0, "free-tier Gemini never receives taxpayer documents");
  const result = await readNotice(pdf, { GEMINI_API_KEY: "g", GEMINI_FETCH: gemini, CHALLENGE_GEMINI_PAID_TIER: "true" });
  assert.equal(result.extraction.source, "ai-gemini");
  assert.equal(geminiCalls, 1);
});
