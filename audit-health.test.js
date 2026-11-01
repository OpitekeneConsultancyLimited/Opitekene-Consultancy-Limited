const assert = require("node:assert/strict");
const test = require("node:test");
const { createReport, getItems, modes, summarize } = require("./audit-health.js");

test("provides substantial audit and tax health check coverage", () => {
  assert.ok(getItems("audit").length >= 20);
  assert.ok(getItems("health").length >= 20);
  for (const mode of Object.keys(modes)) {
    for (const item of getItems(mode)) {
      assert.ok(item.id);
      assert.ok(item.title);
      assert.ok(item.evidence);
      assert.ok(item.action);
      assert.ok(["high", "medium", "low"].includes(item.priority));
    }
  }
});

test("summarizes progress without presenting a compliance score", () => {
  const items = getItems("health");
  const responses = {
    [items[0].id]: "ready",
    [items[1].id]: "action",
    [items[2].id]: "na",
  };
  const result = summarize("health", responses);

  assert.equal(result.total, items.length);
  assert.equal(result.reviewed, 3);
  assert.equal(result.counts.ready, 1);
  assert.equal(result.counts.action, 1);
  assert.equal(result.counts.na, 1);
  assert.equal(result.counts.unreviewed, items.length - 3);
  assert.equal(result.actions[0].id, items[1].id);
  assert.equal("complianceScore" in result, false);
});

test("prioritizes high-risk follow-ups ahead of medium-priority ones", () => {
  const responses = {
    "audit-scope": "action",
    "audit-notice": "action",
  };
  const result = summarize("audit", responses);

  assert.deepEqual(result.actions.map((item) => item.id), ["audit-notice", "audit-scope"]);
});

test("ignores unknown statuses and returns an actionable, caveated report", () => {
  const item = getItems("audit")[0];
  const report = createReport("audit", {
    [item.id]: "action",
    forged: "ready",
    [getItems("audit")[1].id]: "unknown",
  }, "FY 2026/27\nInjected text");

  assert.match(report, /TaxComp Audit readiness report/);
  assert.match(report, /FY 2026\/27 Injected text/);
  assert.match(report, /not a tax filing, compliance certificate, audit opinion or legal advice/i);
  assert.match(report, /\[ACTION\]/);
  assert.match(report, /Follow up:/);
  assert.doesNotMatch(report, /forged/);
  assert.throws(() => summarize("unsupported"), RangeError);
});
