import assert from "node:assert/strict";
import test from "node:test";
import { createOperationsAnalyticsService } from "./operations-analytics.mjs";

test("phase 10 analytics stay disabled until the governance gate is enabled", () => {
  const analytics = createOperationsAnalyticsService({ enabled: false }).summarize({
    pendingDocuments: 2,
    reportsAwaitingReview: 1,
    overdueTasks: 1,
  });

  assert.equal(analytics.enabled, false);
  assert.equal(analytics.status, "disabled");
  assert.equal(analytics.workflowHealth, "hold");
  assert.equal(analytics.reviewQueue, 0);
});

test("phase 10 analytics raise a review signal when the practice queue is active", () => {
  const analytics = createOperationsAnalyticsService({ enabled: true }).summarize({
    totalClients: 12,
    activeClients: 8,
    totalObligations: 22,
    overdueTasks: 2,
    pendingDocuments: 4,
    pendingEngagements: 3,
    reportsAwaitingReview: 3,
  });

  assert.equal(analytics.enabled, true);
  assert.equal(analytics.status, "requires-review");
  assert.equal(analytics.workflowHealth, "attention-required");
  assert.equal(analytics.reviewQueue, 7);
  assert.ok(analytics.riskIndicators.some((item) => item.includes("overdue")));
});
