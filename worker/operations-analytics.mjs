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
