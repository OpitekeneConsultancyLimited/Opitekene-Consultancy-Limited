// Tax Impact Assessment: interpretation, missing facts, deterministic results
// checked against independent reference calculations, conflicting sources,
// legal status, the public API, saved assessments, compliance progress and the
// assistant's use of the engine.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { amountsIn, assessImpact, impactEvidence, interpretQuestion, legalStatus, readImpactInput } from "./challenge/impact.mts";
import { handleRequest } from "./index.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const require = createRequire(import.meta.url);
const calc = require("../tax-calculator.js");
const origin = "https://taxcomp.example.invalid";
const run = (db, body) => assessImpact(db, calc, readImpactInput(body));
const EXAMPLE = "My business earns UGX 180 million annually. How do the 2026 VAT amendments affect my registration obligations?";

// Independent reference: resident monthly PAYE, written from the published bands, not from tax-calculator.js.
function referencePaye(monthly, year) {
  const m = monthly;
  let tax;
  if (year === "2026/27") {
    tax = m <= 335_000 ? 0 : m <= 410_000 ? (m - 335_000) * 0.2 : m <= 485_000 ? 15_000 + (m - 410_000) * 0.25 : 33_750 + (m - 485_000) * 0.3;
  } else {
    tax = m <= 235_000 ? 0 : m <= 335_000 ? (m - 235_000) * 0.1 : m <= 410_000 ? 10_000 + (m - 335_000) * 0.2 : 25_000 + (m - 410_000) * 0.3;
  }
  if (m > 10_000_000) tax += (m - 10_000_000) * 0.1;
  return tax;
}

test("interpretation: ordinary language to a scenario, tax heads and the facts already given", () => {
  assert.deepEqual(amountsIn("UGX 180 million, 1.5m, 2,000,000 and 12 months in 2026"), [180_000_000, 1_500_000, 2_000_000]);
  const i = interpretQuestion(EXAMPLE);
  assert.equal(i.scenario, "vat_registration");
  assert.deepEqual([i.facts.statedAmount, i.facts.statedPeriod], [180_000_000, "year"]);
  assert.ok(i.taxHeads.some((h) => h.id === "vat"));
  assert.equal(interpretQuestion("How much PAYE on a salary of 2,000,000 a month?").facts.monthlyPay, 2_000_000);
  assert.equal(interpretQuestion("I pay betting winnings of 1m").facts.paymentType, "betting-winnings");
  const other = interpretQuestion("Can I deduct transport expenses when calculating corporation tax?");
  assert.equal(other.scenario, null);
  assert.ok(other.taxHeads.some((h) => h.id === "corporation"));
});

test("VAT registration: asks what the figure is, then shows before, Bill and reported positions without choosing", async () => {
  const { pg, db } = await createMigratedDatabase();
  const first = await run(db, { question: EXAMPLE });
  assert.equal(first.status, "needs_facts", "annual revenue is not assumed to be taxable supplies");
  assert.equal(first.questions[0].key, "taxableSupplies12m");
  assert.equal(first.questions[0].suggested, 180_000_000);
  assert.match(first.questions[0].help, /exempt/);

  const r = await run(db, { question: EXAMPLE, facts: { taxableSupplies12m: 180_000_000 } });
  assert.equal(r.status, "assessed");
  assert.deepEqual(r.outcomes.map((o) => [o.amount, o.result.split(":")[0]]), [[150_000_000, "Above the threshold"], [250_000_000, "Below the threshold"], [300_000_000, "Below the threshold"]]);
  assert.equal(r.conflicts.length, 1);
  assert.match(r.conflicts[0], /UGX 250,000,000.*UGX 300,000,000.*does not choose/);
  assert.match(r.explanation.simple, /below the new VAT registration limits.*not indicated.*helps you/);
  assert.ok(!r.actions.some((a) => a.id === "vat-register"));
  assert.ok(r.actions.every((a) => !/\b\d{1,2}(?:st|nd|rd|th)\b|\bdays?\b/.test(a.due) || /not verified|not stated/i.test(a.due)), "no unverified deadline");
  const bill = r.sources.find((s) => s.sourceKind === "official_bill");
  assert.match(bill.url, /^https:\/\/www\.parliament\.go\.ug\//);
  assert.match(bill.legalStatus, /awaiting official verification/);
  assert.match(bill.verification, /not yet checked/);
  assert.ok(r.sources.some((s) => s.sourceKind === "secondary_commentary" && s.legalStatus === "Reported; not an official source"));
  assert.ok(!JSON.stringify(r).match(/"Verified"|Act \d+ of 2026|Cap\. 349/), "no invented Act numbers, no Cap. 349, no 'Verified' label");

  const between = await run(db, { scenario: "vat_registration", facts: { taxableSupplies12m: 280_000_000 } });
  assert.match(between.explanation.simple, /depends on which figure/);
  assert.match(between.actions.find((a) => a.id === "vat-register").title, /^Confirm the enacted threshold/);
  const above = await run(db, { scenario: "vat_registration", facts: { taxableSupplies12m: 350_000_000 } });
  assert.match(above.explanation.simple, /registration is indicated on either 2026 figure/);
  assert.equal(above.actions.find((a) => a.id === "vat-register").title, "Apply to URA for VAT registration");
  assert.match(impactEvidence(above), /do not compute your own/);
  await pg.close();
});

test("PAYE: both tax years match an independent reference calculation", async () => {
  const { pg, db } = await createMigratedDatabase();
  const missing = await run(db, { question: "What PAYE do I pay on 2,000,000 a month?" });
  assert.deepEqual(missing.questions.map((q) => q.key), ["resident", "primaryEmployer"], "only what is missing is asked");
  for (const pay of [200_000, 335_000, 400_000, 485_000, 1_500_000, 2_000_000, 9_999_999, 12_000_000]) {
    const r = await run(db, { scenario: "paye_change", facts: { monthlyPay: pay, resident: "yes", primaryEmployer: "yes" } });
    const [before, after] = r.outcomes;
    assert.ok(Math.abs(before.amount - referencePaye(pay, "2025/26")) < 0.01, `FY 2025/26 at ${pay}`);
    assert.ok(Math.abs(after.amount - referencePaye(pay, "2026/27")) < 0.01, `FY 2026/27 at ${pay}`);
    const change = r.steps.find((s) => s.label === "Change in monthly PAYE").amount;
    assert.ok(Math.abs(change - (referencePaye(pay, "2026/27") - referencePaye(pay, "2025/26"))) < 0.01);
  }
  const nonResident = await run(db, { scenario: "paye_change", facts: { monthlyPay: 2_000_000, resident: "no", primaryEmployer: "yes" } });
  assert.equal(nonResident.outcomes.length, 1, "no FY 2025/26 non-resident comparison is invented");
  const secondary = await run(db, { scenario: "paye_change", facts: { monthlyPay: 2_000_000, resident: "yes", primaryEmployer: "no" } });
  assert.match(secondary.explanation.simple, /second employer/);
  await pg.close();
});

test("withholding: deterministic tax on the 2026 categories", async () => {
  const { pg, db } = await createMigratedDatabase();
  const asked = await run(db, { question: "I pay betting winnings of UGX 1,000,000" });
  assert.deepEqual(asked.questions.map((q) => q.key), ["stake"]);
  const r = await run(db, { scenario: "withholding_2026", facts: { paymentType: "betting-winnings", grossPayment: 1_000_000, stake: 200_000 } });
  assert.equal(r.outcomes[1].amount, 120_000, "15% of payout less stake");
  const e = await run(db, { scenario: "withholding_2026", facts: { paymentType: "resident-entertainer", grossPayment: 5_000_000 } });
  assert.equal(e.outcomes[1].amount, 300_000);
  assert.match(e.sources[0].provision, /s\.135B/);
  await pg.close();
});

test("inputs are validated; uncovered questions say so; a Bill is never described as law", async () => {
  assert.throws(() => readImpactInput({ scenario: "everything" }), /scenario must be one of/);
  assert.throws(() => readImpactInput({ scenario: "paye_change", facts: { salary: 1 } }), /Unknown fact/);
  assert.throws(() => readImpactInput({ scenario: "paye_change", facts: { monthlyPay: -5 } }), /positive amount/);
  assert.throws(() => readImpactInput({ scenario: "paye_change", facts: { resident: "<script>" } }), /invalid value/);
  assert.throws(() => readImpactInput({}), /Describe your situation/);
  assert.equal(legalStatus("bill", null, false), "Proposed Bill (not law)");
  assert.equal(legalStatus("passed", null, false), "Passed by Parliament; assent not confirmed");
  assert.match(legalStatus("assented", "2026-05-18", false), /Assent reported \(2026-05-18\); awaiting official verification/);
  const { pg, db } = await createMigratedDatabase();
  const other = await run(db, { question: "Can I deduct transport expenses when calculating corporation tax?" });
  assert.equal(other.status, "not_covered");
  await pg.close();
});

test("API: public impact endpoint; saved assessments are recomputed, private and deletable; compliance progress", async () => {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, CHAT_LIMITER: { limit: async () => ({ success: true }) }, SUPABASE_URL: supabase.url, SUPABASE_FETCH: supabase.fetch };
  const call = async (path, { method = "POST", body, token, from = origin, raw } = {}) => {
    const headers = { Origin: from, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await handleRequest(new Request(`https://worker.example${path}`, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) }), env);
    return { status: response.status, json: await response.json().catch(() => null) };
  };
  const ok = await call("/api/impact", { body: { question: EXAMPLE, facts: { taxableSupplies12m: 180_000_000 } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, "assessed");
  assert.ok(ok.json.options.scenarios.vat_registration);
  assert.equal((await call("/api/impact", { body: { question: "x" }, from: "https://evil.example" })).status, 403);
  assert.equal((await call("/api/impact", { method: "GET" })).status, 405);
  assert.equal((await call("/api/impact", { raw: "{not json" })).status, 400);

  const alice = await supabase.issueToken({ email: "alice@example.com" });
  const bob = await supabase.issueToken({ email: "bob@example.com" });
  assert.equal((await call("/api/challenge/assessments", { body: { title: "VAT", input: { question: EXAMPLE } }, token: alice.token })).status, 400, "an incomplete assessment cannot be saved");
  const saved = await call("/api/challenge/assessments", { token: alice.token, body: { title: "VAT threshold check", input: { scenario: "vat_registration", facts: { taxableSupplies12m: 180_000_000 } }, result: { outcomes: [{ amount: 1 }] } } });
  assert.equal(saved.status, 201);
  assert.equal(saved.json.result.outcomes[0].amount, 150_000_000, "the server's result is stored, not the browser's");
  const mine = await call("/api/challenge/assessments", { method: "GET", token: alice.token });
  assert.equal(mine.json.assessments.length, 1);
  assert.match(mine.json.assessments[0].summary, /VAT/);
  assert.equal((await call("/api/challenge/assessments", { method: "GET", token: bob.token })).json.assessments.length, 0, "private to its owner");
  assert.equal((await call(`/api/challenge/assessments/${saved.json.saved}`, { method: "DELETE", token: bob.token })).status, 404);
  assert.equal((await call(`/api/challenge/assessments/${saved.json.saved}`, { method: "DELETE", token: alice.token })).status, 200);
  assert.equal((await call("/api/challenge/assessments", { method: "GET" })).status, 401);

  // Compliance Action Centre: progress on an obligation, validated and kept.
  const progress = await call("/api/challenge/profile", { token: alice.token, body: { progress: { vat: "in_progress" } } });
  assert.equal(progress.status, 200);
  assert.deepEqual(progress.json.profile.progress, { vat: "in_progress" });
  assert.equal((await call("/api/challenge/profile", { token: alice.token, body: { progress: { madeUp: "done" } } })).status, 400);
  assert.equal((await call("/api/challenge/profile", { token: alice.token, body: { progress: { vat: "finished" } } })).status, 400);
  assert.deepEqual((await call("/api/challenge/profile", { method: "GET", token: alice.token })).json.profile.progress, { vat: "in_progress" });
  await pg.close();
});

test("assistant: the impact result goes into the evidence; missing facts become follow-up questions", async () => {
  const { pg, db } = await createMigratedDatabase();
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, CHAT_LIMITER: { limit: async () => ({ success: true }) }, GEMINI_API_KEY: "", PREMIUM_ACCESS_CHECK: async () => true };
  const ask = async (path, message) => (await handleRequest(new Request(`https://worker.example${path}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" }, body: JSON.stringify({ message, providerConsent: false }),
  }), env)).json();
  const chat = await ask("/chat", EXAMPLE);
  assert.equal(chat.impact.status, "needs_facts");
  assert.equal(chat.impact.questions[0].key, "taxableSupplies12m");
  const advisor = await ask("/advisor", "I pay betting winnings: payout UGX 1,000,000. What do I withhold?");
  assert.equal(advisor.impact.status, "needs_facts");
  assert.match(advisor.answer, /How much was staked/);
  const assessed = await ask("/advisor", "What PAYE is due for a non-resident on 2,000,000 a month?");
  assert.equal(assessed.impact.scenario, "paye_change");
  await pg.close();
});
