const test = require("node:test");
const assert = require("node:assert/strict");
const { historyEntry, trimHistory } = require("./tax-chat.js");

test("chat history keeps only safe, small copies of each message", () => {
  const entry = historyEntry("assistant", "Answer", [
    { label: "URA", url: "https://ura.go.ug/en/" },
    { label: "bad", url: "javascript:alert(1)" },
    { label: "plain http", url: "http://example.org" },
  ], ["paye", "not-a-calculator"], { answerSource: "local", webGrounded: false, secret: "dropped" });
  assert.deepEqual(entry.sources, [{ label: "URA", url: "https://ura.go.ug/en/" }]);
  assert.deepEqual(entry.calculators, ["paye"]);
  assert.deepEqual(entry.meta, { answerSource: "local", webGrounded: false });
  assert.equal(historyEntry("system", "x").role, "user", "only user and assistant roles");
  assert.equal(historyEntry("user", "y".repeat(20000)).text.length, 12000);
});

test("history is trimmed to the newest messages and never starts with an orphan reply", () => {
  const list = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: String(i) }));
  const kept = trimHistory(list, 40);
  assert.equal(kept[0].role, "user");
  assert.equal(kept.at(-1).text, "49");
  assert.ok(kept.length <= 40);
  assert.deepEqual(trimHistory([{ role: "assistant", text: "a" }], 40), []);
});
