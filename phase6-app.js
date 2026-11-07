(() => {
  "use strict";

  const root = document.querySelector("#phase6-root");
  const status = document.querySelector("#phase6-status");
  const endpointMeta = document.querySelector('meta[name="taxcomp-phase6-api"]');
  if (!root || !status || !endpointMeta) return;

  let apiBase = endpointMeta.content.trim().replace(/\/+$/, "");
  let csrfToken = "";
  let principal = null;
  let activeTab = "dashboard";
  let selectedClientId = "";
  let clientFilters = {};
  let selectedScenarioId = "";
  let selectedDocumentId = "";
  let message = "";
  let messageKind = "notice";
  let busy = false;
  let fieldSequence = 0;

  function element(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === null) continue;
      if (name === "className") node.className = value;
      else if (name === "htmlFor") node.htmlFor = value;
      else if (name === "text") node.textContent = value;
      else if (name === "checked") node.checked = Boolean(value);
      else if (name === "value") node.value = value;
      else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value);
      else node.setAttribute(name, String(value));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child instanceof Node) node.append(child);
      else if (child !== undefined && child !== null) node.append(document.createTextNode(String(child)));
    }
    return node;
  }

  function actionButton(label, action, className = "secondary-button") {
    return element("button", {
      type: "button",
      className,
      text: label,
      disabled: busy,
      onclick: action,
    });
  }

  function setMessage(text, kind = "notice") {
    message = text;
    messageKind = kind;
    render();
  }

  function buildField(label, name, type = "text", options = {}) {
    const id = `phase6-${name}-${++fieldSequence}`;
    const control = type === "select"
      ? element("select", { id, name, required: options.required ?? false },
        options.choices.map(([value, title]) => element("option", { value, text: title })))
      : type === "textarea"
        ? element("textarea", { id, name, required: options.required ?? false, maxlength: options.maxlength || 2000 })
        : element("input", {
          id,
          name,
          type,
          required: options.required ?? false,
          min: options.min,
          max: options.max,
          maxlength: options.maxlength,
          accept: options.accept,
        });
    if (options.value !== undefined) control.value = options.value;
    if (options.checked !== undefined) control.checked = options.checked;
    return element("div", { className: options.wide ? "phase6-field phase6-field--wide" : "phase6-field" }, [
      element("label", { htmlFor: id, text: label }), control,
    ]);
  }

  function table(headers, rows) {
    const tableNode = element("table", { className: "phase6-table" });
    tableNode.append(element("thead", {}, element("tr", {}, headers.map((header) => element("th", { scope: "col", text: header })) )));
    const body = element("tbody");
    for (const row of rows) body.append(element("tr", {}, row.map((cell) => cell instanceof Node ? element("td", {}, cell) : element("td", { text: cell ?? "" }))));
    tableNode.append(body);
    return element("div", { className: "phase6-table-wrap" }, tableNode);
  }

  function form(fields, submitLabel, onSubmit, className = "phase6-form") {
    const formNode = element("form", { className });
    for (const field of fields) formNode.append(field);
    const actions = element("div", { className: "phase6-actions" });
    const submit = element("button", { type: "submit", className: "primary-button", text: submitLabel, disabled: busy });
    actions.append(submit);
    formNode.append(actions);
    formNode.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      render();
      try {
        await onSubmit(new FormData(formNode));
      } catch (error) {
        message = error.message || "The request could not be completed.";
        messageKind = "error";
      } finally {
        busy = false;
        render();
      }
    });
    return formNode;
  }

  function value(data, key, fallback = "") {
    const result = data.get(key);
    return result == null ? fallback : String(result).trim();
  }

  function numberValue(data, key) {
    const raw = value(data, key);
    if (!raw) return 0;
    const number = Number(raw);
    if (!Number.isFinite(number)) throw new Error(`${key} must be a finite number.`);
    return number;
  }

  async function api(path, { method = "GET", body, formData = null, auth = true } = {}) {
    if (!apiBase) throw new Error("Phase 6 API endpoint is not configured.");
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: formData || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const payload = (response.headers.get("Content-Type") || "").includes("application/json")
      ? await response.json()
      : null;
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
    return payload;
  }

  async function download(path, filename) {
    const response = await fetch(`${apiBase}${path}`, { credentials: "include", cache: "no-store" });
    if (!response.ok) {
      let detail = `Download failed (${response.status}).`;
      try { detail = (await response.json()).error || detail; } catch { /* non-JSON error */ }
      throw new Error(detail);
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = element("a", { href: objectUrl, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function authPanel() {
    const panel = element("div", { className: "phase6-auth-panel" });
    panel.append(element("h3", { text: "Sign in to the practice workspace" }));
    panel.append(element("p", { className: "phase6-empty", text: "Client records are not stored in this browser. Sign-in requires the configured Phase 6 API." }));
    panel.append(form([
      buildField("Organization ID", "organizationId", "text", { required: true, maxlength: 120 }),
      buildField("Email", "email", "email", { required: true, maxlength: 254 }),
      buildField("Password", "password", "password", { required: true, maxlength: 128 }),
    ], "Sign in", async (data) => {
      const result = await api("/auth/login", {
        method: "POST",
        auth: false,
        body: { organizationId: value(data, "organizationId"), email: value(data, "email"), password: value(data, "password") },
      });
      csrfToken = result.csrfToken;
      principal = result.principal;
      selectedClientId = "";
      message = "Signed in. Data shown below is loaded from the authorized API.";
      messageKind = "success";
      await render();
    }));

    const resetPanel = element("details");
    resetPanel.append(element("summary", { text: "Request a password reset" }));
    resetPanel.append(form([
      buildField("Account email", "email", "email", { required: true, maxlength: 254 }),
    ], "Send reset link", async (data) => {
      await api("/auth/password-reset/request", { method: "POST", auth: false, body: { email: value(data, "email") } });
      setMessage("If the account exists and email delivery is configured, a reset link will be sent.", "success");
    }, "phase6-form"));
    panel.append(resetPanel);

    const bootstrapPanel = element("details");
    bootstrapPanel.append(element("summary", { text: "Set up the first practice administrator" }));
    bootstrapPanel.append(element("p", { className: "phase6-empty", text: "One-time setup requires the server-side bootstrap secret. Do not use this form unless you administer the Worker." }));
    bootstrapPanel.append(form([
      buildField("Practice name", "organizationName", "text", { required: true, maxlength: 160 }),
      buildField("Administrator email", "email", "email", { required: true, maxlength: 254 }),
      buildField("Initial password", "password", "password", { required: true, maxlength: 128 }),
      buildField("One-time bootstrap secret", "bootstrapSecret", "password", { required: true, maxlength: 256 }),
    ], "Create practice", async (data) => {
      const secret = value(data, "bootstrapSecret");
      const result = await fetch(`${apiBase}/auth/bootstrap`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Phase6-Bootstrap": secret },
        body: JSON.stringify({
          organizationName: value(data, "organizationName"),
          email: value(data, "email"),
          password: value(data, "password"),
        }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error || `Setup failed (${result.status}).`);
      const organizationId = payload.organization.organizationId;
      message = `Practice created. Organization ID: ${organizationId}. Sign in with the administrator account.`;
      messageKind = "success";
      render();
      const input = root.querySelector('[name="organizationId"]');
      if (input) input.value = organizationId;
    }));
    panel.append(bootstrapPanel);
    return panel;
  }

  function tableForClients(clients) {
    if (!clients.length) return element("p", { className: "phase6-empty", text: "No client records are available in this authorized scope." });
    return table(["Client", "TIN", "Registration", "Entity", "Status", "Action"], clients.map((client) => [
      client.legalBusinessName,
      client.tin || "Not recorded",
      client.registrationNumber || "Not recorded",
      `${client.entityType} · ${client.taxpayerCategory}`,
      client.status,
      actionButton("Open", async () => { selectedClientId = client.clientId; await render(); }, "phase6-button-link"),
    ]));
  }

  async function dashboardView(container) {
    const query = selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : "";
    const data = await api(`/dashboard${query}`);
    const metrics = [
      ["Total clients", data.totalClients], ["Active clients", data.activeClients],
      ["Upcoming deadlines", data.upcomingDeadlines], ["Overdue tasks", data.overdueTasks],
      ["Pending documents", data.pendingDocuments], ["Completed engagements", data.completedEngagements],
      ["Pending engagements", data.pendingEngagements], ["Reports awaiting review", data.reportsAwaitingReview],
    ];
    container.append(element("div", { className: "phase6-metrics" }, metrics.map(([label, count]) => element("div", { className: "phase6-metric" }, [
      element("span", { text: label }), element("strong", { text: count ?? 0 }),
    ]))));
    container.append(element("p", { className: "phase6-alert", text: data.deadlineCaveat }));
    container.append(element("h4", { text: "Client classifications" }));
    container.append(table(["Taxpayer category", "Count"], (data.classifications || []).map((item) => [item.category, item.count])));
    if (data.consultantWorkload?.length) {
      container.append(element("h4", { text: "Consultant workload" }));
      container.append(table(["Consultant ID", "Active engagements"], data.consultantWorkload.map((item) => [item.consultantId || "Unassigned", item.activeEngagements])));
    }
    if (data.organizationActivity?.length) {
      container.append(element("h4", { text: "Recent organization activity" }));
      container.append(table(["Action", "Resource", "Time"], data.organizationActivity.map((item) => [item.action, item.resourceType, item.occurredAt])));
    }
  }

  async function clientsView(container) {
    const filterParams = new URLSearchParams(Object.entries(clientFilters).filter(([, value]) => value));
    const data = await api(`/clients${filterParams.size ? `?${filterParams.toString()}` : ""}`);
    const clients = data.clients || [];
    container.append(element("div", { className: "phase6-view-heading" }, [element("h3", { text: "Clients" }), actionButton("Refresh", () => render())]));
    container.append(form([
      buildField("Name contains", "name", "search", { maxlength: 120, value: clientFilters.name || "" }),
      buildField("TIN", "tin", "search", { maxlength: 40, value: clientFilters.tin || "" }),
      buildField("Entity type", "entityType", "select", { value: clientFilters.entityType || "", choices: [["", "Any entity type"], ["individual", "Individual"], ["company", "Company"], ["partnership", "Partnership"], ["ngo", "NGO"], ["trust", "Trust"], ["other", "Other"]] }),
      buildField("Status", "status", "select", { value: clientFilters.status || "", choices: [["", "Any status"], ["active", "Active"], ["archived", "Archived"]] }),
    ], "Search and filter", async (filters) => {
      clientFilters = Object.fromEntries(["name", "tin", "entityType", "status"].map((key) => [key, value(filters, key)]));
    }, "phase6-form"));
    container.append(actionButton("Clear filters", async () => { clientFilters = {}; await render(); }));
    container.append(form([
      buildField("Legal or individual name", "legalBusinessName", "text", { required: true, maxlength: 200 }),
      buildField("TIN", "tin", "text", { maxlength: 40 }),
      buildField("Registration number", "registrationNumber", "text", { maxlength: 80 }),
      buildField("Entity type", "entityType", "select", { choices: [["individual", "Individual"], ["company", "Company"], ["partnership", "Partnership"], ["ngo", "NGO"], ["trust", "Trust"], ["other", "Other"]] }),
      buildField("Taxpayer category", "taxpayerCategory", "select", { choices: [["individual", "Individual"], ["company", "Company"], ["ngo", "NGO"], ["sme", "SME"], ["other", "Other"]] }),
    ], "Register client", async (data) => {
      const result = await api("/clients", { method: "POST", body: {
        legalBusinessName: value(data, "legalBusinessName"),
        tin: value(data, "tin") || null,
        registrationNumber: value(data, "registrationNumber") || null,
        entityType: value(data, "entityType"),
        taxpayerCategory: value(data, "taxpayerCategory"),
      } });
      selectedClientId = result.client.clientId;
      setMessage("Client record created in the authenticated practice database.", "success");
    }));
    container.append(tableForClients(clients));
    if (selectedClientId) await clientDetailView(container, selectedClientId);
  }

  async function clientDetailView(container, clientId) {
    const client = (await api(`/clients/${encodeURIComponent(clientId)}`)).client;
    container.append(element("div", { className: "phase6-view-heading" }, [
      element("h3", { text: client.legalBusinessName }),
      actionButton("Back to client list", () => { selectedClientId = ""; render(); }),
      actionButton("Archive", async () => {
        await api(`/clients/${encodeURIComponent(clientId)}`, { method: "DELETE" });
        selectedClientId = "";
        setMessage("Client archived.", "success");
      }),
    ]));
    container.append(element("p", { className: "phase6-empty", text: `TIN: ${client.tin || "Not recorded"} · Registration: ${client.registrationNumber || "Not recorded"} · ${client.entityType} / ${client.taxpayerCategory}` }));
    container.append(form([
      buildField("Legal or individual name", "legalBusinessName", "text", { required: true, maxlength: 200, value: client.legalBusinessName }),
      buildField("TIN", "tin", "text", { maxlength: 40, value: client.tin || "" }),
      buildField("Registration number", "registrationNumber", "text", { maxlength: 80, value: client.registrationNumber || "" }),
      buildField("Entity type", "entityType", "select", { value: client.entityType, choices: [["individual", "Individual"], ["company", "Company"], ["partnership", "Partnership"], ["ngo", "NGO"], ["trust", "Trust"], ["other", "Other"]] }),
      buildField("Taxpayer category", "taxpayerCategory", "select", { value: client.taxpayerCategory, choices: [["individual", "Individual"], ["company", "Company"], ["ngo", "NGO"], ["sme", "SME"], ["other", "Other"]] }),
    ], "Save client details", async (data) => {
      await api(`/clients/${encodeURIComponent(clientId)}`, { method: "PATCH", body: {
        legalBusinessName: value(data, "legalBusinessName"),
        tin: value(data, "tin") || null,
        registrationNumber: value(data, "registrationNumber") || null,
        entityType: value(data, "entityType"),
        taxpayerCategory: value(data, "taxpayerCategory"),
      } });
      setMessage("Client details updated.", "success");
    }));
    container.append(element("div", { className: "phase6-actions" }, [
      ...[["Compliance", "compliance"], ["Documents", "documents"], ["Engagements", "engagements"], ["Scenarios", "scenarios"], ["Reports", "reports"]].map(([label, tab]) => actionButton(label, async () => { activeTab = tab; render(); })),
    ]));
    const profileData = await api(`/clients/${encodeURIComponent(clientId)}/tax-profile`);
    const profile = profileData.profile || {};
    container.append(form([
      buildField("VAT registration status", "vatRegistrationStatus", "select", { value: profile.vatRegistrationStatus || "not_registered", choices: [["not_registered", "Not registered"], ["voluntarily_registered", "Voluntarily registered"], ["mandatory_registered", "Mandatory registered"], ["cancelled", "Cancelled"]] }),
      buildField("VAT effective date", "vatRegistrationEffectiveDate", "date", { value: profile.vatRegistrationEffectiveDate || "" }),
      buildField("Taxpayer type", "taxpayerType", "select", { value: profile.taxpayerType || (client.entityType === "company" ? "company" : "individual"), choices: [["individual", "Individual"], ["company", "Company"]] }),
      buildField("Filing frequency", "filingFrequency", "select", { value: profile.filingFrequency || "monthly", choices: [["monthly", "Monthly"], ["quarterly", "Quarterly"], ["semi-annually", "Semi-annually"], ["annually", "Annually"]] }),
      buildField("PAYE obligation", "payeObligation", "checkbox", { checked: profile.payeObligation ?? false }),
      buildField("Withholding tax agent", "whtAgentStatus", "checkbox", { checked: profile.whtAgentStatus ?? false }),
      buildField("Rental income tax", "rentalIncomeTaxApplicable", "checkbox", { checked: profile.rentalIncomeTaxApplicable ?? false }),
      buildField("Excise duty", "exciseDutyApplicable", "checkbox", { checked: profile.exciseDutyApplicable ?? false }),
      buildField("Customs obligations", "customsObligationsApplicable", "checkbox", { checked: profile.customsObligationsApplicable ?? false }),
      buildField("Notes", "notes", "textarea", { value: profile.notes || "", wide: true }),
    ], "Save tax profile", async (data) => {
      await api(`/clients/${encodeURIComponent(clientId)}/tax-profile`, { method: "PUT", body: {
        vatRegistrationStatus: value(data, "vatRegistrationStatus"),
        vatRegistrationEffectiveDate: value(data, "vatRegistrationEffectiveDate") || null,
        taxpayerType: value(data, "taxpayerType"),
        filingFrequency: value(data, "filingFrequency"),
        payeObligation: data.has("payeObligation"),
        whtAgentStatus: data.has("whtAgentStatus"),
        rentalIncomeTaxApplicable: data.has("rentalIncomeTaxApplicable"),
        exciseDutyApplicable: data.has("exciseDutyApplicable"),
        customsObligationsApplicable: data.has("customsObligationsApplicable"),
        notes: value(data, "notes"),
      } });
      setMessage("Tax profile saved. Entries are client-provided facts and are not legal verification.", "success");
    }));
  }

  async function complianceView(container) {
    const clients = (await api("/clients")).clients || [];
    const data = await api(`/compliance${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`);
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Compliance obligations" })));
    container.append(element("p", { className: "phase6-alert", text: "Deadlines entered here are user-provided and remain unverified. No statutory dates are generated and no filing or payment is submitted." }));
    container.append(form([
      buildField("Client", "clientId", "select", { required: true, value: selectedClientId, choices: clients.map((client) => [client.clientId, client.legalBusinessName]) }),
      buildField("Tax type", "taxObligationType", "select", { choices: [["vat", "VAT"], ["paye", "PAYE"], ["corporate-income-tax", "Corporate income tax"], ["individual-income-tax", "Individual income tax"], ["rental-income-tax", "Rental income tax"], ["withholding-tax", "Withholding tax"], ["excise-duty", "Excise duty"], ["customs-duty", "Customs duty"], ["capital-gains-tax", "Capital gains tax"], ["capital-allowances", "Capital allowances"], ["stamp-duty", "Stamp duty"], ["presumptive-tax", "Presumptive tax"]] }),
      buildField("Tax period (YYYY/YY)", "taxPeriod", "text", { required: true, maxlength: 7 }),
      buildField("Description", "description", "text", { maxlength: 500 }),
      buildField("Filing deadline", "filingDeadline", "date"),
      buildField("Payment deadline", "paymentDeadline", "date"),
      buildField("Outstanding amount (UGX)", "outstandingAmount", "number", { min: 0 }),
      buildField("Responsible officer ID", "responsibleUserId", "text", { maxlength: 120 }),
      buildField("Supporting document IDs (comma-separated)", "supportingDocuments", "text", { maxlength: 2400, wide: true }),
    ], "Add obligation", async (data) => {
      await api("/compliance", { method: "POST", body: {
        clientId: value(data, "clientId"),
        taxObligationType: value(data, "taxObligationType"),
        taxPeriod: value(data, "taxPeriod"),
        description: value(data, "description"),
        filingDeadline: value(data, "filingDeadline") || null,
        paymentDeadline: value(data, "paymentDeadline") || null,
        outstandingAmount: numberValue(data, "outstandingAmount"),
        responsibleUserId: value(data, "responsibleUserId") || null,
        supportingDocuments: value(data, "supportingDocuments").split(",").map((id) => id.trim()).filter(Boolean),
      } });
      setMessage("Obligation recorded with unverified deadline status.", "success");
    }));
    const rows = (data.obligations || []).map((item) => [
      item.taxObligationType, item.taxPeriod, item.filingDeadline || "Not set", item.paymentDeadline || "Not set",
      `${item.filingStatus} / ${item.paymentStatus}`, item.deadlineVerificationStatus,
      actionButton("Prepare", async () => {
        await api(`/compliance/${encodeURIComponent(item.obligationId)}`, { method: "PATCH", body: { filingStatus: "prepared" } });
        render();
      }),
    ]);
    container.append(table(["Tax type", "Period", "Filing date", "Payment date", "Status", "Deadline source", "Action"], rows));
  }

  async function documentsView(container) {
    const clients = (await api("/clients")).clients || [];
    const docs = (await api(`/documents${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`)).documents || [];
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Documents" })));
    container.append(element("p", { className: "phase6-alert", text: "Files are uploaded only to configured private object storage after malware scanning. Each new file requires human review; extracted values remain proposals until accepted or corrected." }));
    container.append(form([
      buildField("Client", "clientId", "select", { required: true, value: selectedClientId, choices: clients.map((client) => [client.clientId, client.legalBusinessName]) }),
      buildField("Document type", "documentType", "select", { choices: [["sales-invoice", "Sales invoice"], ["purchase-invoice", "Purchase invoice"], ["receipt", "Receipt"], ["credit-note", "Credit note"], ["debit-note", "Debit note"], ["bank-statement", "Bank statement"], ["payroll-record", "Payroll record"], ["tax-return", "Tax return"], ["tax-payment-receipt", "Tax payment receipt"], ["wht-certificate", "WHT certificate"], ["contract", "Contract"], ["customs-document", "Customs document"], ["asset-purchase", "Asset purchase"], ["rental-agreement", "Rental agreement"], ["supporting-tax-document", "Supporting tax document"], ["other", "Other"]] }),
      buildField("Tax period (optional)", "taxPeriod", "text", { maxlength: 7 }),
      buildField("Transaction date (optional)", "transactionDate", "date"),
      buildField("File", "file", "file", { required: true, accept: ".pdf,.xlsx,.xls,.csv,.jpeg,.jpg,.png,.gif,.bmp,.tiff", wide: true }),
    ], "Upload for review", async (data) => {
      const multipart = new FormData();
      multipart.set("clientId", value(data, "clientId"));
      multipart.set("documentType", value(data, "documentType"));
      multipart.set("taxPeriod", value(data, "taxPeriod"));
      multipart.set("transactionDate", value(data, "transactionDate"));
      multipart.set("file", data.get("file"));
      await api("/documents", { method: "POST", formData: multipart });
      setMessage("Document uploaded to private storage and queued for review.", "success");
    }));
    container.append(table(["File", "Client", "Type", "Tax period", "Status", "Actions"], docs.map((item) => [
      item.fileName, item.clientId, item.documentType, item.taxPeriod || "Not specified", item.status,
      element("div", { className: "phase6-actions" }, [
        actionButton("Download", async () => download(`/documents/${encodeURIComponent(item.documentId)}/download`, item.fileName), "phase6-button-link"),
        item.status === "pending-review" ? actionButton("Mark reviewed", async () => {
          await api(`/documents/${encodeURIComponent(item.documentId)}/review`, { method: "POST", body: { decision: "reviewed", notes: "Reviewed in practice workspace." } });
          render();
        }, "phase6-button-link") : null,
        actionButton("Propose amount", async () => {
          selectedDocumentId = item.documentId;
          await render();
        }, "phase6-button-link"),
        actionButton("Versions", async () => {
          selectedDocumentId = item.documentId;
          await render();
        }, "phase6-button-link"),
      ]),
    ])));
    if (selectedDocumentId) {
      const selectedDocument = docs.find((item) => item.documentId === selectedDocumentId);
      if (selectedDocument) {
        const history = await api(`/documents/${encodeURIComponent(selectedDocumentId)}/versions`);
        container.append(element("h4", { text: `Version history · ${selectedDocument.fileName}` }));
        container.append(table(["Version", "File", "Size", "SHA-256", "Created", "Download"], (history.versions || []).map((version) => [
          version.version,
          version.fileName,
          `${version.sizeBytes} bytes`,
          version.sha256,
          version.createdAt,
          actionButton("Download", async () => download(`/documents/${encodeURIComponent(selectedDocumentId)}/versions/${version.version}/download`, version.fileName), "phase6-button-link"),
        ])));
        container.append(form([
          buildField("Replacement file", "file", "file", { required: true, accept: ".pdf,.xlsx,.xls,.csv,.jpeg,.jpg,.png,.gif,.bmp,.tiff" }),
        ], "Upload new version for review", async (data) => {
          const multipart = new FormData();
          multipart.set("file", data.get("file"));
          await api(`/documents/${encodeURIComponent(selectedDocumentId)}/versions`, { method: "POST", formData: multipart });
          setMessage("New document version stored and queued for review.", "success");
        }));
      }
      container.append(element("h4", { text: "Extraction proposal" }));
      container.append(form([
        buildField("Tax head", "taxHead", "text", { required: true, value: "value-added-tax" }),
        buildField("Field", "field", "text", { required: true, value: "invoice.amount" }),
        buildField("Proposed value", "proposedValue", "text", { required: true }),
        buildField("Page number", "sourcePage", "number", { required: true, min: 1, value: 1 }),
        buildField("Confidence (0-1)", "confidence", "number", { required: true, min: 0, max: 1, value: 0.5 }),
      ], "Save proposal", async (data) => {
        const raw = value(data, "proposedValue");
        const numeric = Number(raw);
        const proposedValue = raw !== "" && Number.isFinite(numeric) ? numeric : raw;
        await api(`/documents/${encodeURIComponent(selectedDocumentId)}/proposals`, { method: "POST", body: {
          taxPeriod: null,
          taxHead: value(data, "taxHead"),
          field: value(data, "field"),
          proposedValue,
          sourcePage: numberValue(data, "sourcePage"),
          confidence: numberValue(data, "confidence"),
        } });
        selectedDocumentId = "";
        setMessage("Proposal saved for human review; it has not changed a calculation.", "success");
      }));
    }
  }

  async function engagementsView(container) {
    const clients = (await api("/clients")).clients || [];
    const data = await api(`/engagements${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`);
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Engagements" })));
    container.append(form([
      buildField("Client", "clientId", "select", { required: true, value: selectedClientId, choices: clients.map((client) => [client.clientId, client.legalBusinessName]) }),
      buildField("Engagement title", "title", "text", { required: true, maxlength: 200 }),
      buildField("Service type", "serviceType", "text", { required: true, maxlength: 120 }),
      buildField("Assigned consultant ID (optional)", "assignedConsultantId", "text", { maxlength: 120 }),
    ], "Create engagement", async (data) => {
      await api("/engagements", { method: "POST", body: {
        clientId: value(data, "clientId"),
        title: value(data, "title"),
        serviceType: value(data, "serviceType"),
        assignedConsultantId: value(data, "assignedConsultantId") || null,
      } });
      setMessage("Engagement created in pending status.", "success");
    }));
    container.append(table(["Title", "Client", "Service", "Assigned consultant", "Status", "Action"], (data.engagements || []).map((item) => [
      item.title, item.clientId, item.serviceType, item.assignedConsultantId || "Unassigned", item.status,
      item.status === "pending" ? actionButton("Activate", async () => { await api(`/engagements/${encodeURIComponent(item.engagementId)}`, { method: "PATCH", body: { status: "active" } }); render(); }, "phase6-button-link") : item.status === "active" ? actionButton("Complete", async () => { await api(`/engagements/${encodeURIComponent(item.engagementId)}`, { method: "PATCH", body: { status: "completed" } }); render(); }, "phase6-button-link") : "",
    ])));
  }

  async function scenariosView(container) {
    const clients = (await api("/clients")).clients || [];
    const data = await api(`/scenarios${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`);
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Tax scenarios" })));
    container.append(element("p", { className: "phase6-alert", text: "Scenario calculations use existing provisional calculator logic. No legal conclusion or consolidated payable is produced." }));
    container.append(form([
      buildField("Client", "clientId", "select", { required: true, value: selectedClientId, choices: clients.map((client) => [client.clientId, client.legalBusinessName]) }),
      buildField("Tax period (optional)", "taxPeriod", "text", { maxlength: 7 }),
      buildField("Scenario", "scenario", "select", { choices: [["other", "Other transaction"], ["professional-services", "Professional services"], ["employment", "Employment"], ["commercial-rental", "Commercial rental"], ["property", "Property"], ["imported-machinery", "Imported machinery"], ["share-transfer", "Share transfer"], ["industrial-building", "Industrial building"]] }),
      buildField("Event date", "eventDate", "date", { required: true }),
      buildField("Amount (UGX)", "amount", "number", { required: true, min: 0 }),
      buildField("Direction", "direction", "select", { choices: [["income", "Income"], ["purchase", "Purchase"], ["sale", "Sale"], ["payment", "Payment"], ["other", "Other"]] }),
      buildField("Party type", "partyType", "select", { choices: [["company", "Company"], ["individual", "Individual"], ["unknown", "Unknown"]] }),
      buildField("Supplier VAT status", "supplierVat", "select", { choices: [["unknown", "Unknown"], ["registered", "Registered"], ["not-registered", "Not registered"]] }),
      buildField("VAT treatment", "vatTreatment", "select", { choices: [["unknown", "Unknown"], ["standard", "Standard"], ["zero-rated", "Zero-rated"], ["exempt", "Exempt"], ["out-of-scope", "Out of scope"]] }),
      buildField("Employment relationship", "employmentRelationship", "select", { choices: [["unknown", "Unknown"], ["yes", "Yes"], ["no", "No"]] }),
      buildField("Supporting document IDs (comma-separated)", "documentIds", "text", { maxlength: 2400, wide: true }),
    ], "Run and save scenario", async (data) => {
      const result = await api("/scenarios", { method: "POST", body: {
        clientId: value(data, "clientId"),
        taxPeriod: value(data, "taxPeriod") || null,
        documentIds: value(data, "documentIds").split(",").map((id) => id.trim()).filter(Boolean),
        inputSnapshot: {
          scenario: value(data, "scenario"), eventDate: value(data, "eventDate"), amount: numberValue(data, "amount"),
          direction: value(data, "direction"), partyType: value(data, "partyType"), supplierVat: value(data, "supplierVat"),
          vatTreatment: value(data, "vatTreatment"), employmentRelationship: value(data, "employmentRelationship"),
        },
      } });
      selectedScenarioId = result.scenario.scenarioId;
      setMessage("Scenario saved with results from the existing multi-tax engine.", "success");
    }));
    container.append(table(["Tax period", "Scenario", "Status", "Tax heads", "Review"], (data.scenarios || []).map((item) => [
      item.taxPeriod || "Not specified",
      item.inputSnapshot.scenario,
      item.status,
      item.taxHeads.join(", "),
      item.status === "draft" ? actionButton("Submit for review", async () => { await api(`/scenarios/${encodeURIComponent(item.scenarioId)}`, { method: "PATCH", body: { status: "under-review" } }); render(); }, "phase6-button-link") : item.status,
    ])));
    if (selectedScenarioId) {
      const scenario = (data.scenarios || []).find((item) => item.scenarioId === selectedScenarioId);
      if (scenario) {
        container.append(element("h4", { text: "Latest scenario result" }));
        container.append(element("p", { className: "phase6-alert", text: `Final tax payable: ${scenario.resultSnapshot.finalTaxPayable ?? "Not consolidated"}. Existing calculator outputs remain provisional and separately reviewed.` }));
        container.append(table(["Tax head", "Status", "Result / review"], (scenario.resultSnapshot.taxHeads || []).map((head) => [head.label, head.status, head.reason])));
      }
    }
  }

  async function reportsView(container) {
    const scenarios = (await api(`/scenarios${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`)).scenarios || [];
    const data = await api(`/reports${selectedClientId ? `?clientId=${encodeURIComponent(selectedClientId)}` : ""}`);
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Reports" })));
    container.append(element("p", { className: "phase6-alert", text: "Generated reports are review-required and do not establish tax-law verification, filing approval, or a formal legal opinion." }));
    container.append(form([
      buildField("Scenario", "scenarioId", "select", { required: true, choices: scenarios.map((scenario) => [scenario.scenarioId, `${scenario.inputSnapshot.scenario} · ${scenario.taxPeriod || "No period"}`]) }),
      buildField("Report question", "question", "textarea", { required: true, wide: true, maxlength: 1200 }),
    ], "Generate review draft", async (data) => {
      const result = await api("/reports", { method: "POST", body: {
        scenarioId: value(data, "scenarioId"),
        question: value(data, "question"),
        facts: {},
      } });
      setMessage(`Report ${result.report.reportId} created for professional review.`, "success");
    }));
    container.append(table(["Report", "Period", "Status", "Version", "Actions"], (data.reports || []).map((item) => [
      item.reportType, item.taxPeriod || "Not specified", item.status, item.version,
      element("div", { className: "phase6-actions" }, [
        actionButton("HTML", async () => download(`/reports/${encodeURIComponent(item.reportId)}/download?format=html`, `tax-report-${item.reportId}.html`), "phase6-button-link"),
        actionButton("CSV", async () => download(`/reports/${encodeURIComponent(item.reportId)}/download?format=csv`, `tax-report-${item.reportId}.csv`), "phase6-button-link"),
        item.status === "review-required" ? actionButton("Approve", async () => { await api(`/reports/${encodeURIComponent(item.reportId)}/review`, { method: "POST", body: { decision: "approve", notes: "Reviewed in practice workspace." } }); render(); }, "phase6-button-link") : item.status,
      ]),
    ])));
  }

  async function usersView(container) {
    const data = await api("/users");
    container.append(element("div", { className: "phase6-view-heading" }, element("h3", { text: "Users and assignments" })));
    container.append(element("p", { className: "phase6-alert", text: "Invitations require the configured email delivery service. New users remain pending until they set a password through the emailed one-time link." }));
    container.append(form([
      buildField("Email", "email", "email", { required: true, maxlength: 254 }),
      buildField("Role", "role", "select", { choices: [
        ...(principal.role === "system-admin" ? [["system-admin", "System administrator"], ["practice-admin", "Practice administrator"]] : []),
        ["tax-consultant", "Tax consultant"], ["accountant", "Accountant"], ["reviewer", "Reviewer"], ["client", "Client"],
      ] }),
      buildField("Assigned client IDs (comma-separated)", "clientIds", "text", { maxlength: 2000, wide: true }),
    ], "Invite user", async (data) => {
      await api("/users", { method: "POST", body: {
        email: value(data, "email"),
        role: value(data, "role"),
        clientIds: value(data, "clientIds").split(",").map((id) => id.trim()).filter(Boolean),
      } });
      setMessage("Invitation sent; account remains pending until the invite link is used.", "success");
    }));
    container.append(table(["Email", "Role", "Status", "Joined", "Client access", "Actions"], (data.users || []).map((item) => {
      const roleChoices = [
        ...(principal.role === "system-admin" ? [["system-admin", "System administrator"], ["practice-admin", "Practice administrator"]] : []),
        ["tax-consultant", "Tax consultant"], ["accountant", "Accountant"], ["reviewer", "Reviewer"], ["client", "Client"],
      ];
      const roleSelect = element("select", { "aria-label": `Role for ${item.email}` }, roleChoices.map(([role, label]) => element("option", { value: role, text: label })));
      roleSelect.value = item.role;
      const assignmentInput = element("input", { type: "text", value: (item.clientIds || []).join(", "), "aria-label": `Client IDs assigned to ${item.email}` });
      const actions = element("div", { className: "phase6-actions" }, [
        actionButton("Save role", async () => {
          await api(`/users/${encodeURIComponent(item.userId)}`, { method: "PATCH", body: { role: roleSelect.value } });
          setMessage("User role updated.", "success");
        }, "phase6-button-link"),
        actionButton("Save client access", async () => {
          await api(`/users/${encodeURIComponent(item.userId)}/clients`, { method: "PUT", body: {
            clientIds: assignmentInput.value.split(",").map((id) => id.trim()).filter(Boolean),
          } });
          setMessage("Client access assignments updated.", "success");
        }, "phase6-button-link"),
        item.membershipStatus === "active" ? actionButton("Deactivate", async () => {
          await api(`/users/${encodeURIComponent(item.userId)}`, { method: "PATCH", body: { status: "inactive" } });
          render();
        }, "phase6-button-link") : actionButton("Reactivate", async () => {
          await api(`/users/${encodeURIComponent(item.userId)}`, { method: "PATCH", body: { status: "active" } });
          render();
        }, "phase6-button-link"),
      ]);
      return [item.email, roleSelect, `${item.status} / ${item.membershipStatus}`, item.createdAt, assignmentInput, actions];
    })));
  }

  async function loadView(container) {
    const views = {
      dashboard: dashboardView,
      clients: clientsView,
      compliance: complianceView,
      documents: documentsView,
      engagements: engagementsView,
      scenarios: scenariosView,
      reports: reportsView,
      users: usersView,
    };
    await views[activeTab](container);
  }

  async function render() {
    if (!root) return;
    root.replaceChildren();
    if (message) root.append(element("p", { className: "phase6-alert", "data-kind": messageKind, role: "status", text: message }));
    if (!apiBase) {
      status.textContent = "API not configured";
      root.append(element("p", { className: "phase6-alert", text: "The Phase 6 API endpoint is not configured. This workspace has no mock or browser-local client data. Configure the HTTPS API endpoint and server-side identity/storage bindings before use." }));
      return;
    }
    status.textContent = principal ? `Signed in · ${principal.role}` : "Sign-in required";
    if (!principal) {
      root.append(authPanel());
      return;
    }
    const tabs = [
      ["dashboard", "Dashboard"], ["clients", "Clients"], ["compliance", "Compliance"],
      ["documents", "Documents"], ["engagements", "Engagements"], ["scenarios", "Scenarios"],
      ["reports", "Reports"], ["users", "Users"],
    ];
    const workspace = element("div", { className: "phase6-workspace-panel" });
    const top = element("div", { className: "phase6-view-heading" }, [
      element("p", { text: `${principal.email} · Organization ${principal.organizationId}` }),
      actionButton("Sign out", async () => {
        await api("/auth/logout", { method: "POST", body: {} });
        principal = null;
        csrfToken = "";
        selectedClientId = "";
        message = "Signed out.";
        messageKind = "success";
        render();
      }),
    ]);
    workspace.append(top);
    workspace.append(element("nav", { className: "phase6-tabs", "aria-label": "Practice workspace" }, tabs.map(([id, label]) => element("button", {
      type: "button",
      className: "phase6-tab",
      "aria-current": activeTab === id ? "page" : null,
      text: label,
      onclick: async () => { activeTab = id; message = ""; await render(); },
    }))));
    const view = element("div", { className: "phase6-view" });
    workspace.append(view);
    root.append(workspace);
    try {
      await loadView(view);
    } catch (error) {
      view.append(element("p", { className: "phase6-alert", "data-kind": "error", role: "alert", text: error.message || "Could not load this view." }));
    }
  }

  function configureEndpoint() {
    if (!apiBase) return;
    try {
      const endpoint = new URL(apiBase, window.location.href);
      if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
        apiBase = "";
        setMessage("The Phase 6 API must use HTTPS outside localhost.", "error");
      } else {
        apiBase = endpoint.toString().replace(/\/+$/, "");
      }
    } catch {
      apiBase = "";
      setMessage("The Phase 6 API endpoint is invalid.", "error");
    }
  }

  const url = new URL(window.location.href);
  const resetToken = url.searchParams.get("phase6Reset");
  configureEndpoint();
  if (resetToken) {
    url.searchParams.delete("phase6Reset");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    if (apiBase) {
      root.append(form([
        buildField("New password", "password", "password", { required: true, maxlength: 128 }),
      ], "Set password", async (data) => {
        await api("/auth/password-reset/confirm", { method: "POST", auth: false, body: { token: resetToken, password: value(data, "password") } });
        setMessage("Password updated. Sign in with your new password.", "success");
      }, "phase6-auth-panel"));
      status.textContent = "Set account password";
    } else {
      render();
    }
  } else render();
})();
