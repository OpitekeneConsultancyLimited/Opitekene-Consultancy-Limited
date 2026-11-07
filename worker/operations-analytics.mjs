const ALLOWED_USAGE_METRICS = new Set([
  "calculator_opened",
  "calculation_completed",
  "advisor_request_completed",
  "report_generated",
  "api_error",
]);

function isValidOrganizationId(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function getUtcDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError("Analytics clock must return a valid Date.");
  }
  return date.toISOString().slice(0, 10);
}

export function createUsageAnalyticsRepository({
  db,
  enabled = false,
  clock = () => new Date(),
} = {}) {
  if (typeof clock !== "function") {
    throw new TypeError("Analytics clock must be a function.");
  }

  return Object.freeze({
    async record({ organizationId, metricName, eventCount = 1 } = {}) {
      if (!enabled) return Object.freeze({ status: "disabled" });
      if (!db || typeof db.prepare !== "function") {
        throw new TypeError("Analytics database binding is required when analytics are enabled.");
      }
      if (!isValidOrganizationId(organizationId)) {
        throw new TypeError("A valid organization ID is required.");
      }
      if (!ALLOWED_USAGE_METRICS.has(metricName)) {
        throw new RangeError("Analytics metric is not allowlisted.");
      }
      if (!Number.isSafeInteger(eventCount) || eventCount < 1) {
        throw new RangeError("Analytics event count must be a positive safe integer.");
      }

      const now = clock();
      const metricDate = getUtcDate(now);
      await db.prepare(
        `INSERT INTO phase10_usage_daily
          (organization_id, metric_date, metric_name, event_count, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (organization_id, metric_date, metric_name)
         DO UPDATE SET event_count = phase10_usage_daily.event_count + excluded.event_count,
           updated_at = excluded.updated_at`,
      ).bind(organizationId, metricDate, metricName, eventCount, now.toISOString()).run();
      return Object.freeze({ status: "recorded" });
    },

    async deleteExpired({ organizationId, retentionDays } = {}) {
      if (!enabled) return Object.freeze({ status: "disabled", deletedRows: 0 });
      if (!db || typeof db.prepare !== "function") {
        throw new TypeError("Analytics database binding is required when analytics are enabled.");
      }
      if (!isValidOrganizationId(organizationId)) {
        throw new TypeError("A valid organization ID is required.");
      }
      if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
        throw new RangeError("Analytics retention must be between 1 and 3650 days.");
      }

      const now = clock();
      const cutoff = new Date(now.getTime());
      cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
      const result = await db.prepare(
        "DELETE FROM phase10_usage_daily WHERE organization_id = ? AND metric_date < ?",
      ).bind(organizationId, getUtcDate(cutoff)).run();
      return Object.freeze({ status: "deleted", deletedRows: Number(result?.meta?.changes || 0) });
    },
  });
}

export function createOperationsAnalyticsService({
  enabled = false,
  reviewQueueThreshold = 5,
} = {}) {
  const normalizeCount = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  return Object.freeze({
    enabled,
    summarize(metrics = {}) {
      const values = {
        totalClients: normalizeCount(metrics.totalClients),
        activeClients: normalizeCount(metrics.activeClients),
        totalObligations: normalizeCount(metrics.totalObligations),
        overdueTasks: normalizeCount(metrics.overdueTasks),
        pendingDocuments: normalizeCount(metrics.pendingDocuments),
        pendingEngagements: normalizeCount(metrics.pendingEngagements),
        reportsAwaitingReview: normalizeCount(metrics.reportsAwaitingReview),
      };

      if (!enabled) {
        return Object.freeze({
          enabled: false,
          phase: "Phase 10",
          status: "disabled",
          summary: "Operations analytics are disabled until the governance gate is reviewed.",
          workflowHealth: "hold",
          reviewQueue: 0,
          totalTrackedWork: 0,
          riskIndicators: ["Operations analytics are not active."],
          counts: values,
        });
      }

      const reviewQueue = values.pendingDocuments + values.reportsAwaitingReview;
      const riskIndicators = [];
      if (values.overdueTasks > 0) {
        riskIndicators.push(`${values.overdueTasks} overdue obligations require attention.`);
      }
      if (values.pendingDocuments > 0) {
        riskIndicators.push(`${values.pendingDocuments} documents require review.`);
      }
      if (values.reportsAwaitingReview > 0) {
        riskIndicators.push(`${values.reportsAwaitingReview} reports await review.`);
      }
      if (reviewQueue === 0 && values.overdueTasks === 0) {
        riskIndicators.push("No active review queue.");
      }

      const workflowHealth = reviewQueue >= reviewQueueThreshold || values.overdueTasks > 0
        ? "attention-required"
        : "healthy";

      return Object.freeze({
        enabled: true,
        phase: "Phase 10",
        status: workflowHealth === "healthy" ? "healthy" : "requires-review",
        summary: "Operations analytics reflect current client workload, document review pressure, and reporting backlog.",
        workflowHealth,
        reviewQueue,
        totalTrackedWork: values.pendingDocuments + values.reportsAwaitingReview + values.overdueTasks + values.pendingEngagements,
        riskIndicators,
        counts: values,
      });
    },
  });
}
