import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationsAnalyticsService,
  createUsageAnalyticsRepository,
} from "./operations-analytics.mjs";

class AnalyticsD1Fake {
  statements = [];

  prepare(sql) {
    const statement = {
      bind: (...values) => ({
        run: async () => {
          this.statements.push({ sql, values });
          return { meta: { changes: 2 } };
        },
      }),
    };
    return statement;
  }
}

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

test("usage analytics aggregate only allowlisted metrics and organization-scoped counts", async () => {
  const db = new AnalyticsD1Fake();
  const repository = createUsageAnalyticsRepository({
    db,
    enabled: true,
    clock: () => new Date("2026-11-07T16:25:00.000Z"),
  });

  const result = await repository.record({
    organizationId: "synthetic-org-a",
    metricName: "calculation_completed",
    eventCount: 3,
    clientId: "must-not-be-persisted",
    taxData: { income: 100 },
  });

  assert.deepEqual(result, { status: "recorded" });
  assert.deepEqual(db.statements[0].values, [
    "synthetic-org-a",
    "2026-11-07",
    "calculation_completed",
    3,
    "2026-11-07T16:25:00.000Z",
  ]);
  assert.doesNotMatch(db.statements[0].sql, /clientId|taxData|income/i);
});

test("usage analytics fail closed when disabled and reject unapproved or malformed events", async () => {
  const disabledDb = new AnalyticsD1Fake();
  const disabled = createUsageAnalyticsRepository({ db: disabledDb });
  assert.deepEqual(await disabled.record({
    organizationId: "synthetic-org-a",
    metricName: "calculation_completed",
  }), { status: "disabled" });
  assert.deepEqual(await disabled.deleteExpired({
    organizationId: "synthetic-org-a",
    retentionDays: 30,
  }), { status: "disabled", deletedRows: 0 });
  assert.equal(disabledDb.statements.length, 0);

  const enabled = createUsageAnalyticsRepository({ db: new AnalyticsD1Fake(), enabled: true });
  await assert.rejects(() => enabled.record({
    organizationId: "synthetic-org-a",
    metricName: "raw_tax_return",
  }), /not allowlisted/);
  await assert.rejects(() => enabled.record({
    organizationId: "",
    metricName: "api_error",
  }), /organization ID/);
  await assert.rejects(() => enabled.record({
    organizationId: "synthetic-org-a",
    metricName: "api_error",
    eventCount: -1,
  }), /positive safe integer/);
});

test("analytics retention deletes only expired rows for the requested organization", async () => {
  const db = new AnalyticsD1Fake();
  const repository = createUsageAnalyticsRepository({
    db,
    enabled: true,
    clock: () => new Date("2026-11-07T16:25:00.000Z"),
  });

  assert.deepEqual(await repository.deleteExpired({
    organizationId: "synthetic-org-a",
    retentionDays: 30,
  }), { status: "deleted", deletedRows: 2 });
  assert.deepEqual(db.statements[0].values, ["synthetic-org-a", "2026-10-08"]);
  assert.match(db.statements[0].sql, /WHERE organization_id = \? AND metric_date < \?/);
  await assert.rejects(() => repository.deleteExpired({
    organizationId: "synthetic-org-a",
    retentionDays: 0,
  }), /between 1 and 3650/);
});
