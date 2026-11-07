"use strict";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function csvCell(value) {
  const rawText = value == null ? "" : String(value);
  const text = /^[\u0000-\u0020]*[=+@-]/.test(rawText) ? `'${rawText}` : rawText;
  return `"${text.replace(/"/g, '""')}"`;
}

function assertBoundedJson(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must contain JSON-compatible values.`);
  }
  if (typeof serialized !== "string" || serialized.length > 50_000) {
    throw new RangeError(`${label} exceeds the 50000-character report limit.`);
  }
}

function asStrings(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new TypeError(`${label} must be an array of strings.`);
  }
  return values.map((value) => value.trim()).filter(Boolean);
}

function canonicalLegalCitation(citation, registry) {
  const sourceId = citation.sourceId;
  const source = registry.getSourceById(sourceId);
  if (!source || citation.citationId !== `legal-source:${sourceId}`) {
    throw new RangeError(`Report citation ${sourceId || "unknown"} is not registered.`);
  }
  return {
    citationId: `legal-source:${source.sourceId}`,
    sourceId: source.sourceId,
    title: source.title,
    authorityType: source.sourceType,
    issuingAuthority: source.issuingAuthority,
    legislation: source.legislation || null,
    provision: source.provision || null,
    effectiveFrom: source.effectiveDate,
    effectiveTo: source.endDate || null,
    verificationStatus: source.verificationStatus,
    reviewer: source.reviewer || null,
    lastVerificationDate: source.lastVerificationDate || null,
    documentReference: source.documentReference,
    url: source.officialSourceUrl,
    primaryAuthority: source.primaryAuthority,
    applicableTaxPeriods: [...(source.applicableTaxPeriods || [])],
  };
}

function canonicalCaseCitation(caseRecord, registry) {
  const caseId = caseRecord.caseId;
  const registered = registry.getCaseById(caseId);
  if (!registered) throw new RangeError(`Report case ${caseId || "unknown"} is not registered.`);
  return {
    caseId: registered.caseId,
    caseName: registered.caseName || null,
    citation: registered.citation || null,
    court: registered.court || null,
    jurisdiction: registered.jurisdiction || null,
    judgmentDate: registered.judgmentDate || null,
    authorityClass: registered.authorityClass || "unverified",
    verificationStatus: registered.verificationStatus,
    legalPrinciple: registered.verificationStatus === "verified" ? registered.legalPrinciple : null,
    relevantParagraphs: registered.verificationStatus === "verified" ? [...(registered.relevantParagraphs || [])] : [],
    sourceDocument: registered.sourceDocument ? clone(registered.sourceDocument) : null,
  };
}

function createTaxResearchReportService({ legalSourceRegistry, caseLawRegistry, clock = () => new Date() } = {}) {
  if (!legalSourceRegistry || typeof legalSourceRegistry.getSourceById !== "function" ||
      !caseLawRegistry || typeof caseLawRegistry.getCaseById !== "function") {
    throw new TypeError("Legal-source and case-law registries are required to generate reports.");
  }

  function buildResearchReport({
    answer,
    question,
    client = null,
    facts = {},
    risks = [],
    recommendations = [],
    reportDate = clock().toISOString().slice(0, 10),
  } = {}) {
    if (!answer || typeof answer !== "object" || typeof answer.directAnswer !== "string") {
      throw new TypeError("A structured citation-controlled answer is required.");
    }
    if (typeof question !== "string" || !question.trim()) {
      throw new TypeError("A report question is required.");
    }
    if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
      throw new TypeError("Report facts must be supplied as an object.");
    }
    assertBoundedJson(facts, "Report facts");
    if (client !== null) assertBoundedJson(client, "Client details");
    if (!Array.isArray(answer.citations) || !Array.isArray(answer.caseLaw || []) ||
        !Array.isArray(recommendations)) {
      throw new TypeError("Answer citations, case references, and recommendations must be arrays.");
    }
    if (!isIsoDate(reportDate)) throw new RangeError("Report date must use YYYY-MM-DD format.");

    const legalSources = answer.citations.map((citation) => canonicalLegalCitation(citation, legalSourceRegistry));
    const cases = (answer.caseLaw || []).map((record) => canonicalCaseCitation(record, caseLawRegistry));
    const riskItems = [
      ...asStrings(risks, "Risks"),
      ...asStrings(answer.transactionAnalysis?.riskFlags, "Transaction risks"),
    ];
    const recommendationItems = asStrings(recommendations, "Recommendations").map((text) => ({
      text,
      reviewRequired: true,
    }));

    return {
      reportTitle: "Tax Research Report",
      reportDate,
      taxPeriod: answer.taxPeriod || null,
      client: client && typeof client === "object" && !Array.isArray(client) ? clone(client) : null,
      question: question.trim(),
      taxpayerOrTransaction: clone(answer.taxpayerOrTransaction || null),
      issues: [...(answer.applicableTaxHead || [])],
      facts: clone(facts),
      assumptions: [...(answer.assumptions || [])],
      missingInformation: clone(answer.missingInformation || []),
      directAnswer: answer.directAnswer,
      analysis: clone(answer.taxTreatment || []),
      legalBasis: clone(answer.legalBasis || {}),
      legalSources,
      caseLaw: cases,
      computation: clone(answer.computation || null),
      transactionAnalysis: clone(answer.transactionAnalysis || null),
      risks: riskItems,
      recommendations: recommendationItems,
      verificationStatus: clone(answer.verificationStatus || {}),
      limitations: [...(answer.limitations || [])],
      complianceImplications: answer.complianceImplications || null,
      auditTrail: {
        sourceIds: legalSources.map((source) => source.sourceId),
        caseIds: cases.map((record) => record.caseId),
        claimCitationIds: clone(answer.auditTrail?.claimCitationIds || []),
      },
      disclaimer: "This report is an informational research aid, not a formal legal opinion, tax return, filing approval, or URA determination. Verify cited material and its application before relying on it.",
    };
  }

  return Object.freeze({ buildResearchReport });
}

function renderList(items, renderItem = (item) => escapeHtml(item)) {
  if (!items?.length) return "<p>None recorded.</p>";
  return `<ul>${items.map((item) => `<li>${renderItem(item)}</li>`).join("")}</ul>`;
}

function toPrintableHtml(report) {
  if (!report || typeof report !== "object" || !report.reportTitle) {
    throw new TypeError("A generated research report is required.");
  }
  const sources = renderList(report.legalSources, (source) => {
    const url = /^https:\/\//.test(source.url || "")
      ? ` <a href="${escapeHtml(source.url)}">Source document</a>`
      : "";
    return `<strong>${escapeHtml(source.title)}</strong> (${escapeHtml(source.authorityType)}; ${escapeHtml(source.verificationStatus)})${source.provision ? `, ${escapeHtml(source.provision)}` : ""}. ${escapeHtml(source.documentReference)}${url}`;
  });
  const cases = renderList(report.caseLaw, (record) => (
    `<strong>${escapeHtml(record.caseName)}</strong> (${escapeHtml(record.citation)}; ${escapeHtml(record.authorityClass)}, ${escapeHtml(record.verificationStatus)})` +
    (record.sourceDocument?.url && /^https:\/\//.test(record.sourceDocument.url)
      ? ` <a href="${escapeHtml(record.sourceDocument.url)}">Judgment source</a>`
      : "")
  ));
  const recommendations = renderList(report.recommendations, (item) => `${escapeHtml(item.text)} (review required)`);
  const htmlSection = (title, body) => `<section><h2>${escapeHtml(title)}</h2>${body || "<p>None recorded.</p>"}</section>`;

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(report.reportTitle)}</title>
<style>body{font:15px/1.55 Georgia,serif;color:#202923;max-width:900px;margin:36px auto;padding:0 24px}h1{font-size:28px}h2{font:700 16px Arial,sans-serif;border-bottom:1px solid #ccd7cd;padding-bottom:6px;margin-top:26px}p,li{overflow-wrap:anywhere}dl{display:grid;grid-template-columns:170px 1fr;gap:8px}dt{font-weight:bold}dd{margin:0}a{color:#245d3b}.notice{border-left:4px solid #b07827;padding:10px 14px;background:#f6f2e7}@media print{body{max-width:none;margin:0;padding:0}a{color:inherit;text-decoration:none}section{break-inside:avoid}}</style></head>
<body><header><h1>${escapeHtml(report.reportTitle)}</h1><p>Report date: ${escapeHtml(report.reportDate)} · Tax period: ${escapeHtml(report.taxPeriod || "Not specified")}</p></header>
${htmlSection("Client", `<p>${escapeHtml(JSON.stringify(report.client || {}))}</p>`)}
${htmlSection("Question and Scope", `<p>${escapeHtml(report.question)}</p>${renderList(report.issues)}`)}
${htmlSection("Facts and Assumptions", `<h3>Facts</h3><pre>${escapeHtml(JSON.stringify(report.facts, null, 2))}</pre><h3>Assumptions</h3>${renderList(report.assumptions)}<h3>Missing information</h3>${renderList(report.missingInformation, (item) => `${escapeHtml(item.question)} ${escapeHtml(item.why)}`)}`)}
${htmlSection("Analysis", `<p>${escapeHtml(report.directAnswer)}</p>${renderList(report.analysis, (item) => escapeHtml(item.text || JSON.stringify(item)))}`)}
${htmlSection("Legal Research", `<h3>Registered sources</h3>${sources}<h3>Case law</h3>${cases}`)}
${htmlSection("Verification Status", `<pre>${escapeHtml(JSON.stringify(report.verificationStatus, null, 2))}</pre>`)}
${htmlSection("Computation and Transaction Review", `<pre>${escapeHtml(JSON.stringify({ computation: report.computation, transactionAnalysis: report.transactionAnalysis }, null, 2))}</pre>`) }
${htmlSection("Risks and Limitations", `${renderList(report.risks)}${renderList(report.limitations)}<p>${escapeHtml(report.complianceImplications || "No compliance implication recorded.")}</p>`) }
${htmlSection("Recommendations", recommendations)}
<p class="notice">${escapeHtml(report.disclaimer)}</p></body></html>`;
}

function toCitationCsv(report) {
  if (!report || !Array.isArray(report.legalSources) || !Array.isArray(report.caseLaw)) {
    throw new TypeError("A generated research report is required.");
  }
  const headers = [
    "Citation ID", "Source ID", "Title", "Authority Type", "Verification Status",
    "Provision", "Effective From", "Effective To", "Document Reference", "URL",
  ];
  const rows = report.legalSources.map((source) => [
    source.citationId,
    source.sourceId,
    source.title,
    source.authorityType,
    source.verificationStatus,
    source.provision,
    source.effectiveFrom,
    source.effectiveTo,
    source.documentReference,
    source.url,
  ]);
  for (const record of report.caseLaw) {
    rows.push([
      `case-law:${record.caseId}`,
      record.caseId,
      record.caseName,
      "judicial_decision",
      record.verificationStatus,
      (record.relevantParagraphs || []).join("; "),
      record.judgmentDate,
      "",
      record.sourceDocument?.documentReference || record.citation,
      record.sourceDocument?.url,
    ]);
  }
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

module.exports = {
  createTaxResearchReportService,
  toPrintableHtml,
  toCitationCsv,
  escapeHtml,
};
