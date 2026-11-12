// The assistant handles the brief's example questions properly without an AI
// provider: none rejected, each answered in plain words with the provisions it
// rests on (resolved from the database), no invented rates or deadlines, and
// follow-up replies complete a pending calculation.
import test from "node:test";
import assert from "node:assert/strict";
import { GUIDES, matchGuide } from "./challenge/guides.mts";
import { answersFrom, readImpactContext } from "./challenge/impact.mts";
import { handleRequest } from "./index.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

const origin = "https://taxcomp.example.invalid";
const BRIEF = [
  ["Do I need a TIN to operate my business?", "tin", "Tax identification number"],
  ["I have a small business. Which taxes apply to me?", "small-business-taxes", "Business income"],
  ["I have employees. What are my PAYE obligations?", "paye-employer", "Withholding of tax by employers"],
  ["I received a withholding tax credit. How do I claim it?", "wht-credit", "Tax credit certificates"],
  ["My company has not been operating. Do I still need to file returns?", "dormant-returns", "Furnishing of tax returns"],
  ["What happens if I submit a VAT return late?", "late-return", "Penal tax"],
  ["Can I deduct transport expenses when calculating corporation tax?", "deductible-expenses", "Expenses of deriving income"],
];

test("guides: plain answers that state no rate, amount or deadline", () => {
  for (const g of GUIDES) {
    assert.doesNotMatch(`${g.simple} ${g.professional}`, /\d+\s?%|UGX\s?\d|\b\d{1,2}(?:st|nd|rd|th)\b|\bwithin \d+ days\b/, g.id);
    assert.ok(g.refs.length >= 2, `${g.id} rests on provisions`);
  }
  for (const [q, id] of BRIEF) assert.equal(matchGuide(q)?.id, id, q);
  assert.equal(matchGuide("How does the new VAT threshold affect my business?"), null, "calculable questions go to the impact engine");
});

test("follow-up replies are read as answers to the pending questions", () => {
  assert.deepEqual(answersFrom("about 180 million a year", ["taxableSupplies12m"]), { taxableSupplies12m: 180_000_000 });
  assert.deepEqual(answersFrom("yes resident, main employer", ["resident", "primaryEmployer"]), { resident: "yes", primaryEmployer: "yes" });
  assert.deepEqual(answersFrom("non-resident, it's a second job", ["resident", "primaryEmployer"]), { resident: "no", primaryEmployer: "no" });
  assert.deepEqual(answersFrom("no and yes", ["resident", "primaryEmployer"]), { resident: "no", primaryEmployer: "yes" });
  assert.deepEqual(answersFrom("what is VAT?", ["taxableSupplies12m"]), {}, "an unrelated message is not an answer");
  assert.equal(readImpactContext({ scenario: "hack", facts: {} }), null);
  assert.equal(readImpactContext({ scenario: "paye_change", facts: { evil: 1 } }), null);
  assert.deepEqual(readImpactContext({ scenario: "paye_change", facts: { monthlyPay: 1 }, pending: ["resident", "nonsense"] })?.pending, ["resident"]);
});

test("advisor: the brief's example questions are answered, with the right provisions, without an AI provider", async () => {
  const { pg, db } = await createMigratedDatabase();
  const env = { UNANSWERED_QUESTIONS: db, DATABASE_PROVIDER: "supabase", ALLOWED_ORIGIN: origin, CHAT_LIMITER: { limit: async () => ({ success: true }) }, GEMINI_API_KEY: "", PREMIUM_ACCESS_CHECK: async () => true };
  const ask = async (path, message, extra = {}) => (await handleRequest(new Request(`https://worker.example${path}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" }, body: JSON.stringify({ message, providerConsent: false, ...extra }),
  }), env)).json();
  for (const [q, id, heading] of BRIEF) {
    for (const path of ["/advisor", "/chat"]) {
      const r = await ask(path, q);
      assert.doesNotMatch(r.answer, /Please ask me about a tax topic/, `${path}: ${q}`);
      assert.equal(r.guide?.id, id, `${path}: ${q}`);
      assert.ok(r.guide.provisions.some((p) => p.heading === heading), `${path}: ${q} cites ${heading}`);
      assert.ok(r.legislation.provisions.every((p) => p.lawId !== "eacop"), `${path}: ${q} does not cite the pipeline Act`);
      assert.match(r.answer, /not statutory wording/);
      assert.equal(r.verificationRequired, true);
    }
  }
  const late = await ask("/advisor", "What happens if I submit a VAT return late?");
  assert.equal(late.guide.provisions[0].lawId, "vata", "the named Act's provisions come first");
  const pro = await ask("/advisor", "Do I need a TIN to operate my business?", { profile: { experienceMode: "professional" } });
  assert.match(pro.answer, /Tax Procedures Code Act/);

  // A conversation: the threshold question, then the answer in a reply.
  const first = await ask("/advisor", "How does the new VAT threshold affect my business?");
  assert.equal(first.impact.status, "needs_facts");
  assert.deepEqual(first.legislation.provisions.map((p) => p.sectionNumber), ["7", "8"], "registration sections, not unrelated VAT sections");
  const context = { scenario: first.impact.scenario, facts: first.impact.facts, pending: first.impact.questions.map((q) => q.key) };
  const second = await ask("/advisor", "about 180 million a year", { impactContext: context });
  assert.equal(second.impact.status, "assessed");
  assert.match(second.answer, /below the new VAT registration limits/);
  assert.match(second.answer, /does not choose/);
  const chat = await ask("/chat", "about 180 million a year", { impactContext: context });
  assert.equal(chat.impact.status, "assessed", "the chat endpoint continues the assessment too");
  const unrelated = await ask("/advisor", "Do I need a TIN to operate my business?", { impactContext: context });
  assert.equal(unrelated.guide?.id, "tin", "a new question is answered as a new question");
  await pg.close();
});
