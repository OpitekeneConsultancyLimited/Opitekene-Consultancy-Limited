"use strict";

const { SCHEMA_VERSION, requireIsoDate, requireText } = require("./phase6-domain.js");

function buildClientDashboard({
	practiceId,
	clientId,
	client,
	obligations = [],
	documents = [],
	scenarios = [],
	asOf = new Date(),
} = {}) {
	const scopePracticeId = requireText(practiceId, "authorizedPracticeId", 120);
	const scopeClientId = requireText(clientId, "clientId", 120);
	const asOfDate = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : requireIsoDate(asOf, "asOf");
	if (!client || client.practiceId !== scopePracticeId || client.clientId !== scopeClientId) {
		throw new RangeError("Client does not match the requested dashboard scope.");
	}
	for (const [field, records] of [["obligations", obligations], ["documents", documents], ["scenarios", scenarios]]) {
		if (!Array.isArray(records)) throw new TypeError(`${field} must be an array.`);
		if (records.some((record) => record.practiceId !== scopePracticeId || record.clientId !== scopeClientId)) {
			throw new RangeError(`${field} contains a record outside the requested dashboard scope.`);
		}
	}

	const overdueObligations = obligations.filter((item) =>
		item.filingStatus === "overdue" || item.paymentStatus === "overdue");
	const openObligations = obligations.filter((item) =>
		item.filingStatus !== "filed" || item.paymentStatus !== "paid");

	return {
		schemaVersion: SCHEMA_VERSION,
		practiceId: scopePracticeId,
		clientId: scopeClientId,
		asOf: asOfDate,
		client: {
			legalBusinessName: client.legalBusinessName,
			status: client.status,
		},
		counts: {
			openObligations: openObligations.length,
			overdueObligations: overdueObligations.length,
			documentsPendingReview: documents.filter((item) => item.status === "pending-review").length,
			draftScenarios: scenarios.filter((item) => ["draft", "under-review"].includes(item.status)).length,
		},
	};
}

module.exports = { buildClientDashboard };

