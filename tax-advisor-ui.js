(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.taxCompAdvisorUI = api;
    api.initialize();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const classifierApi = typeof module === "object" && module.exports
    ? require("./tax-question-classifier.js")
    : root.taxCompQuestionClassifier;
  const clarificationApi = typeof module === "object" && module.exports
    ? require("./tax-clarification.js")
    : root.taxCompClarification;
  const clarificationEngine = clarificationApi?.createTaxClarificationEngine();

  function buildReviewModel(question, taxPeriod = "") {
    if (!classifierApi || !clarificationEngine) {
      throw new Error("Question classifier and clarification engine are unavailable.");
    }
    const classification = classifierApi.classifyTaxQuestion({
      question,
      taxPeriod: taxPeriod || undefined,
    });
    const clarification = clarificationEngine.identifyMissingFacts({ question, classification });
    return {
      taxHeads: classification.taxHeads,
      topics: classification.topics,
      intents: classification.intents,
      primaryIntent: classification.primaryIntent,
      taxPeriod: classification.taxPeriod,
      taxPeriodSource: classification.taxPeriodSource,
      isHistoricalPeriod: classification.isHistoricalPeriod,
      isMultiTaxHead: classification.isMultiTaxHead,
      missingFacts: clarification.missingFacts,
    };
  }

  function serializeConversation(entries) {
    if (!Array.isArray(entries)) throw new TypeError("Conversation entries must be an array.");
    return entries
      .filter((entry) => entry && ["user", "assistant", "model"].includes(entry.role) &&
        typeof entry.text === "string" && entry.text.trim())
      .map((entry) => `${entry.role === "user" ? "User" : "TaxComp"}:\n${entry.text.trim()}`)
      .join("\n\n");
  }

  function initialize() {
    if (!root.document) return;
    const form = root.document.querySelector("#tax-chat-form");
    const input = root.document.querySelector("#tax-chat-input");
    const period = root.document.querySelector("#tax-chat-period");
    const review = root.document.querySelector("#tax-advisor-review");
    const headsOutput = root.document.querySelector("#tax-advisor-review-heads");
    const intentOutput = root.document.querySelector("#tax-advisor-review-intent");
    const periodOutput = root.document.querySelector("#tax-advisor-review-period");
    const questionsOutput = root.document.querySelector("#tax-advisor-review-questions");
    const messages = root.document.querySelector("#tax-chat-messages");
    const status = root.document.querySelector("#tax-chat-status");
    const copyButton = root.document.querySelector("#tax-chat-copy");
    const downloadButton = root.document.querySelector("#tax-chat-download");
    const reportButton = root.document.querySelector("#tax-chat-report-html");
    const citationCsvButton = root.document.querySelector("#tax-chat-citations-csv");
    if (!form || !input || !review || !messages) return;
    let latestReportHtml = null;
    let latestCitationCsv = null;

    function downloadText(content, fileName, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = root.URL.createObjectURL(blob);
      const link = root.document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    }

    root.document.addEventListener("taxcomp:answer", (event) => {
      latestReportHtml = typeof event.detail?.result?.reportHtml === "string"
        ? event.detail.result.reportHtml
        : null;
      latestCitationCsv = typeof event.detail?.result?.citationCsv === "string"
        ? event.detail.result.citationCsv
        : null;
      if (reportButton) reportButton.disabled = !latestReportHtml;
      if (citationCsvButton) citationCsvButton.disabled = !latestCitationCsv;
    });

    root.document.addEventListener("taxcomp:cleared", () => {
      latestReportHtml = null;
      latestCitationCsv = null;
      if (reportButton) reportButton.disabled = true;
      if (citationCsvButton) citationCsvButton.disabled = true;
    });

    form.addEventListener("submit", () => {
      const question = input.value.trim();
      if (!question) return;
      try {
        const model = buildReviewModel(question, period?.value || "");
        headsOutput.textContent = model.taxHeads.length
          ? model.taxHeads.map((head) => `${head.label}${head.confidence === "possible" ? " (possible)" : ""}`).join(" · ")
          : "No tax head identified";
        intentOutput.textContent = model.intents.join(" · ") || "General tax information";
        periodOutput.textContent = model.taxPeriod
          ? `${model.taxPeriod}${model.isHistoricalPeriod ? " · historical period" : ""}`
          : "Not specified";
        questionsOutput.replaceChildren();
        for (const fact of model.missingFacts.slice(0, 5)) {
          const item = root.document.createElement("li");
          const questionText = root.document.createElement("strong");
          questionText.textContent = fact.question;
          const reason = root.document.createElement("span");
          reason.textContent = fact.why;
          item.append(questionText, reason);
          questionsOutput.append(item);
        }
        if (model.missingFacts.length > 5) {
          const item = root.document.createElement("li");
          item.textContent = `${model.missingFacts.length - 5} additional relevant details are needed.`;
          questionsOutput.append(item);
        }
        if (model.missingFacts.length === 0) {
          const item = root.document.createElement("li");
          item.textContent = "No transaction-specific follow-up facts were identified for this question.";
          questionsOutput.append(item);
        }
        review.hidden = false;
      } catch {
        review.hidden = true;
      }
    });

    function currentConversation() {
      return [...messages.querySelectorAll(".tax-chat-message")].map((article) => ({
        role: article.classList.contains("tax-chat-message-user") ? "user" : "assistant",
        text: article.innerText || article.textContent || "",
      }));
    }

    copyButton?.addEventListener("click", async () => {
      const content = serializeConversation(currentConversation());
      if (!content) {
        if (status) status.textContent = "There is no conversation to copy.";
        return;
      }
      try {
        await root.navigator.clipboard.writeText(content);
        if (status) status.textContent = "Conversation copied to the clipboard.";
      } catch {
        if (status) status.textContent = "Clipboard access is unavailable in this browser.";
      }
    });

    downloadButton?.addEventListener("click", () => {
      const content = serializeConversation(currentConversation());
      if (!content) {
        if (status) status.textContent = "There is no conversation to download.";
        return;
      }
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = root.URL.createObjectURL(blob);
      const link = root.document.createElement("a");
      link.href = url;
      link.download = `taxcomp-conversation-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
      if (status) status.textContent = "Conversation downloaded as a text file.";
    });

    reportButton?.addEventListener("click", () => {
      if (!latestReportHtml) return;
      downloadText(latestReportHtml, `taxcomp-research-report-${new Date().toISOString().slice(0, 10)}.html`, "text/html;charset=utf-8");
      if (status) status.textContent = "Printable research report downloaded. Use the browser print dialog to save it as PDF.";
    });

    citationCsvButton?.addEventListener("click", () => {
      if (!latestCitationCsv) return;
      downloadText(latestCitationCsv, `taxcomp-source-register-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
      if (status) status.textContent = "Citation register downloaded as CSV for spreadsheet review.";
    });
  }

  return Object.freeze({ buildReviewModel, serializeConversation, initialize });
});
