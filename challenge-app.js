// Challenge an Assessment (#challenge). Plain JavaScript, same style as account.js.
// Every figure, deadline and outcome comes from the Worker's case record; this
// file only renders it. The owner view and the professional view are two
// renderings of the same record. Nothing here is stored in the browser.
(() => {
  "use strict";

  const rootEl = document.querySelector("#challenge-root");
  if (!rootEl) return;
  const meta = (name) => (document.querySelector(`meta[name="${name}"]`)?.content || "").trim();
  let apiBase = "";
  try { apiBase = meta("taxcomp-chat-endpoint") ? new URL(meta("taxcomp-chat-endpoint"), location.href).origin : ""; } catch { apiBase = ""; }

  const MAX_BYTES = 10 * 1024 * 1024;
  const FIELD_LABELS = {
    tax_head: ["Which tax is it?", "Tax head"], assessment_type: ["What kind of assessment?", "Assessment type"], tin: ["Your TIN", "TIN"],
    period_start: ["Period from", "Period start"], period_end: ["Period to", "Period end"], date_issued: ["Date printed on the notice", "Date issued"],
    principal: ["Tax URA says you owe (UGX)", "Principal tax (UGX)"], penal_tax: ["Penalty (UGX)", "Penal tax (UGX)"], interest: ["Interest (UGX)", "Interest (UGX)"],
    interest_rate_percent_per_month: ["Interest rate shown (% per month)", "Interest rate (% per month)"], interest_months: ["Months of interest shown", "Interest months"],
    penal_tax_percent: ["Penalty rate shown (%)", "Penal tax rate (%)"], ura_reasons: ["URA's reason, as written", "URA's stated reasons"], provisions_cited: ["Laws URA mentions", "Provisions cited"],
  };
  const FIELD_ORDER = ["tax_head", "assessment_type", "tin", "period_start", "period_end", "date_issued", "principal", "penal_tax", "interest", "interest_rate_percent_per_month", "interest_months", "penal_tax_percent", "ura_reasons", "provisions_cited"];
  const CATEGORY_LABELS = {
    expense: ["A business cost URA did not allow", "Expense disallowed"], income: ["Money URA counted as income or sales", "Income added"],
    input_vat: ["VAT you paid on business purchases", "Input VAT"], output_vat: ["VAT on your sales", "Output VAT"], credit: ["Tax already taken off or already paid", "Credit (WHT / payments)"],
    interest: ["Interest on the notice", "Interest"], penal_tax: ["Penalty on the notice", "Penal tax"], procedural: ["How or when you received the notice", "Procedural"],
    other: ["Something else", "Other"],
  };
  const DOC_TYPES = [["assessment", "The assessment notice"], ["return", "A tax return"], ["ledger", "Accounts or ledger"], ["invoice", "Invoices or receipts"], ["bank_statement", "Bank statement"], ["correspondence", "Letters or emails with URA"], ["objection_decision", "URA's decision on an objection"], ["other", "Something else"]];
  const STEPS = [["notice", "1. Your notice"], ["figures", "2. Check the figures"], ["dates", "3. Dates"], ["records", "4. Your records"], ["results", "5. Where you stand"], ["pack", "6. Your pack"]];

  const state = { me: null, view: null, role: "owner", step: "notice", pro: false, busy: false, message: "", messageKind: "notice", queue: null, law: null, panel: "cases", confirmDelete: false };

  // ------------------------------------------------------------- helpers
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }
  const ugx = (n) => (n === null || n === undefined ? "—" : `UGX ${Math.round(n).toLocaleString("en-UG")}`);
  const date = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
  const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const link = (label, href) => (href ? h("a", { href, target: "_blank", rel: "noopener noreferrer", text: label }) : h("span", { text: label }));
  const lbl = (pair) => (state.pro ? pair[1] : pair[0]);

  async function call(path, { method = "GET", body, raw, headers = {} } = {}) {
    const token = await window.TaxCompAccount?.getAccessToken?.();
    if (!token) throw new Error("Please sign in again.");
    const init = { method, credentials: "omit", cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...headers } };
    if (raw) { init.body = raw; } else if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    let response;
    try { response = await fetch(`${apiBase}${path}`, init); } catch { throw new Error("We could not reach TaxComp. Check your internet connection and try again."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `Something went wrong (${response.status}).`); error.status = response.status; error.data = data; throw error; }
    return data;
  }

  function say(text, kind = "notice") { state.message = text; state.messageKind = kind; }

  async function act(fn, success) {
    if (state.busy) return;
    // Keep what the user typed across the "Working…" redraw and after a failure.
    const snapshot = [...rootEl.querySelectorAll("input[id], select[id], textarea[id]")]
      .filter((el) => el.type !== "file")
      .map((el) => [el.id, el.type === "checkbox" ? el.checked : el.value]);
    state.busy = true; say(""); state.restore = snapshot; render();
    try { await fn(); if (success) say(success, "success"); }
    catch (error) { say(error.message || "Something went wrong.", "error"); state.restore = snapshot; }
    finally { state.busy = false; render(); }
  }

  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ------------------------------------------------------------- data
  async function loadMe() {
    state.me = await call("/api/challenge/me");
    const pane = document.querySelector("#ws-assessments-root");
    if (pane) renderWorkspaceList(pane);
  }
  async function openCase(id, step) {
    const data = await call(`/api/challenge/cases/${id}`);
    state.view = data.view; state.role = data.role; state.pro = data.role === "reviewer" || state.pro;
    state.step = step || (data.view.pendingFields.length || !data.view.confirmations.length ? (data.view.confirmations.length ? "figures" : "notice") : "results");
    state.confirmDelete = false;
  }
  function setView(view) { if (view) state.view = view; }

  // ------------------------------------------------------------- screens
  function banner(b, provisionalLabel) {
    if (!b) return null;
    const tone = { urgent: "warn", possibly_lapsed: "danger", unknown: "info", on_track: "ok", waiting: "info", passed: "danger" }[b.state] || "info";
    return h("div", { className: `ch-banner ch-${tone}`, role: b.state === "urgent" || b.state === "possibly_lapsed" ? "alert" : "status" }, [
      h("strong", { text: b.title }),
      b.message ? h("p", { text: b.message }) : null,
      h("p", { className: "ch-rule" }, [`Rule: ${b.ruleLabel} (${b.ruleSetVersion}) · `, link("source", b.sourceUrl)]),
      provisionalLabel ? h("p", { className: "ch-provisional", text: provisionalLabel }) : null,
      state.pro && b.assumptions?.length ? h("ul", { className: "ch-assumptions" }, b.assumptions.map((a) => h("li", { text: a }))) : null,
    ]);
  }

  function consentScreen() {
    return h("section", { className: "ch-card", "aria-labelledby": "ch-consent-title" }, [
      h("h3", { id: "ch-consent-title", text: "Before you upload anything" }),
      h("ul", { className: "ch-list" }, [
        h("li", { text: "What we store: the notice and any records you upload, the figures you confirm, and your answers." }),
        h("li", { text: "Where: TaxComp's private Supabase database and file storage (EU, Ireland). Files are never public." }),
        h("li", { text: "Who can see it: you, and an Opitekene reviewer only if your case is assigned to them. Every time a reviewer views, changes or downloads it, that is recorded." }),
        h("li", { text: "Reading the notice: when you ask, the file or text is sent to Anthropic's Claude to read the figures (Google Gemini's paid service only if Opitekene has turned it on as a backup). Neither uses it to train its models. It is not sent anywhere else." }),
        h("li", { text: "How long: until you delete the case. You can delete a case and all its files at any time with one button." }),
        h("li", { text: "Don't upload passwords, PINs or bank login details." }),
      ]),
      h("p", {}, ["Read the full ", h("a", { href: "#privacy", text: "privacy policy" }), "."]),
      h("button", { className: "btn btn-primary", type: "button", disabled: state.busy, onclick: () => act(async () => { await call("/api/challenge/consent", { method: "POST", body: { version: state.me.consentVersion, accept: true } }); await loadMe(); }, "Thank you. You can start a case now.") , text: "I agree, continue" }),
    ]);
  }

  function homeScreen() {
    const me = state.me;
    const parts = [
      h("div", { className: "ch-intro" }, [
        h("p", { text: "Upload or type in your URA income tax or VAT assessment. We explain what URA is asking for, show how many days you have to object, compare URA's figures with your records and prepare a draft response pack." }),
        h("p", { className: "ch-muted", text: "This is a preliminary position to help you prepare, not a decision on your case." }),
      ]),
    ];
    if (me.reviewer) {
      parts.push(h("div", { className: "ch-tabs", role: "tablist" }, [["cases", "My cases"], ["queue", "Review queue"], ["law", "Law and cases admin"]].map(([key, text]) =>
        h("button", { type: "button", role: "tab", "aria-selected": String(state.panel === key), className: "chip", onclick: () => act(async () => { state.panel = key; if (key === "queue") state.queue = (await call("/api/challenge/review/queue")).cases; if (key === "law") state.law = await call("/api/challenge/law"); }), text }))));
      if (state.panel === "queue") return [...parts, queueScreen()];
      if (state.panel === "law") return [...parts, lawAdminScreen()];
    }
    if (!me.consented) return [...parts, consentScreen()];
    parts.push(h("button", { className: "btn btn-primary", type: "button", disabled: state.busy, onclick: () => act(async () => { const created = await call("/api/challenge/cases", { method: "POST" }); state.view = created.view; state.role = "owner"; state.step = "notice"; await loadMe(); }), text: "Start a new case" }));
    parts.push(h("h3", { text: "Your cases" }));
    parts.push(me.cases.length ? h("ul", { className: "ch-case-list" }, me.cases.map((c) => h("li", {}, [
      h("button", { type: "button", className: "ch-link", onclick: () => act(() => openCase(c.id)), text: `${c.taxHead === "vat" ? "VAT" : c.taxHead === "income_tax" ? "Income tax" : "New case"}${c.periodStart ? ` · ${date(c.periodStart)} to ${date(c.periodEnd)}` : ""}${c.principal !== null ? ` · ${ugx(c.principal)}` : ""}` }),
      h("span", { className: "ch-muted", text: ` Updated ${date(c.updatedAt.slice(0, 10))}${c.reviewStatus === "pending" ? " · waiting for review" : c.reviewStatus === "approved" ? " · reviewed" : ""}` }),
    ]))) : h("p", { className: "ch-muted", text: "No cases yet." }));
    return parts;
  }

  function noticeStep() {
    const me = state.me;
    const fileInput = h("input", { id: "ch-file", type: "file", accept: "application/pdf,image/jpeg,image/png,image/webp,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" });
    const text = h("textarea", { id: "ch-text", rows: "8", maxlength: "100000", placeholder: "Or paste the text of the notice here" });
    async function readFile() {
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Choose a file, or paste the text instead.");
      if (file.size > MAX_BYTES) throw new Error("That file is bigger than 10 MB. Try a smaller photo or a PDF.");
      const isDocx = /\.docx$/i.test(file.name) || file.type.includes("wordprocessingml");
      if (/\.doc$/i.test(file.name)) throw new Error("Older Word (.doc) files cannot be read. Save it as PDF or .docx, or take a photo.");
      const type = isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : file.type || "application/octet-stream";
      let documentId = null;
      if (me.uploadsEnabled) {
        const uploaded = await call(`/api/challenge/cases/${state.view.case.id}/documents`, { method: "POST", raw: file, headers: { "Content-Type": type, "X-Document-Type": "assessment", "X-File-Name": encodeURIComponent(file.name) } });
        documentId = uploaded.document.id;
      }
      let result;
      if (isDocx || type === "text/plain") {
        const textValue = isDocx ? await window.TaxCompDocx.readDocxText(await file.arrayBuffer()) : await file.text();
        result = await call(`/api/challenge/cases/${state.view.case.id}/read`, { method: "POST", body: { text: textValue } });
      } else if (documentId) {
        result = await call(`/api/challenge/cases/${state.view.case.id}/read`, { method: "POST", body: { documentId } });
      } else {
        throw new Error("Photo and PDF uploads are not switched on yet. Paste the text of the notice, upload a .docx, or type the figures in yourself.");
      }
      setView(result.view); state.step = "figures";
      return result;
    }
    return h("section", { className: "ch-card", "aria-labelledby": "ch-notice-title" }, [
      h("h3", { id: "ch-notice-title", text: "Add your assessment notice" }),
      h("p", { text: me.uploadsEnabled ? "Upload a PDF, a clear photo taken with your phone, or a Word file. You can also paste the text." : "Paste the text of the notice or upload a Word (.docx) file. Photo and PDF uploads are not switched on yet." }),
      h("label", { for: "ch-file", text: "Notice file (PDF, photo or Word, up to 10 MB)" }), fileInput,
      h("button", { className: "btn btn-primary", type: "button", disabled: state.busy, onclick: () => act(async () => { const r = await readFile(); say(r.warnings?.length ? r.warnings.join(" ") : "We read your notice. Check each figure below.", "notice"); }), text: "Read the file" }),
      h("label", { for: "ch-text", text: "Notice text" }), text,
      h("button", { className: "btn btn-secondary", type: "button", disabled: state.busy, onclick: () => act(async () => { const r = await call(`/api/challenge/cases/${state.view.case.id}/read`, { method: "POST", body: { text: text.value } }); setView(r.view); state.step = "figures"; say((r.warnings || []).join(" ") || "Check each figure below."); }), text: "Read the text" }),
      h("p", {}, [h("button", { type: "button", className: "ch-link", onclick: () => { state.step = "figures"; render(); }, text: "Or type the figures in yourself" })]),
    ]);
  }

  function figuresStep() {
    const view = state.view;
    const byName = Object.fromEntries(view.confirmations.map((c) => [c.fieldName, c]));
    const rows = FIELD_ORDER.map((name) => {
      const c = byName[name] || { fieldName: name, extractedValue: null, confirmedValue: null, confidence: null, status: "pending" };
      const current = c.status === "pending" ? c.extractedValue : c.confirmedValue;
      const shown = name === "provisions_cited" && current ? JSON.parse(current).join("; ") : current ?? "";
      const id = `ch-f-${name}`;
      let input;
      if (name === "tax_head") input = h("select", { id }, [h("option", { value: "", text: "Not shown" }), h("option", { value: "income_tax", text: "Income tax", selected: shown === "income_tax" }), h("option", { value: "vat", text: "VAT", selected: shown === "vat" })]);
      else if (name === "assessment_type") input = h("select", { id }, [h("option", { value: "", text: "Not shown" }), ...["original", "additional", "other"].map((v) => h("option", { value: v, text: v[0].toUpperCase() + v.slice(1), selected: shown === v }))]);
      else if (name === "ura_reasons") input = h("textarea", { id, rows: "3", maxlength: "4000" });
      else input = h("input", { id, type: /period|date/.test(name) ? "date" : "text", inputmode: /principal|penal|interest/.test(name) ? "decimal" : null, autocomplete: "off" });
      if ("value" in input && input.tagName !== "SELECT") input.value = shown;
      const unconfirmable = h("input", { type: "checkbox", id: `${id}-x`, checked: c.status === "unconfirmable" });
      const confidence = c.confidence === null || c.status !== "pending" ? null : c.confidence >= 0.85 ? "High" : c.confidence >= 0.6 ? "Medium" : "Low";
      return { name, c, input, unconfirmable, shown, el: h("div", { className: `ch-field${c.status === "pending" && c.extractedValue !== null ? " is-pending" : ""}` }, [
        h("label", { for: id, text: lbl(FIELD_LABELS[name]) }), input,
        h("div", { className: "ch-field-meta" }, [
          confidence ? h("span", { className: `ch-conf ch-conf-${confidence.toLowerCase()}`, text: `We read this with ${confidence.toLowerCase()} confidence` }) : null,
          c.status !== "pending" ? h("span", { className: "ch-muted", text: c.status === "unconfirmable" ? "Marked as not confirmed" : "Confirmed" }) : null,
          h("label", { className: "ch-inline", for: `${id}-x` }, [unconfirmable, " I can't confirm this"]),
        ]),
      ]) };
    });
    const save = () => act(async () => {
      const fields = [];
      for (const row of rows) {
        let value = row.input.value.trim();
        if (row.name === "provisions_cited") value = value ? JSON.stringify(value.split(";").map((s) => s.trim()).filter(Boolean)) : "";
        if (/principal|penal_tax$|^interest$/.test(row.name)) value = value.replace(/[^\d]/g, "");
        if (row.unconfirmable.checked) { if (row.c.status !== "unconfirmable") fields.push({ field: row.name, action: "unconfirmable" }); continue; }
        const original = row.name === "provisions_cited" ? (row.shown ? JSON.stringify(String(row.shown).split(";").map((s) => s.trim()).filter(Boolean)) : "") : String(row.shown ?? "");
        if (row.c.status === "pending" && row.c.extractedValue !== null && value === original) fields.push({ field: row.name, action: "confirm" });
        else if (value !== original || (row.c.status === "pending" && value)) fields.push({ field: row.name, action: "correct", value });
      }
      if (!fields.length) { state.step = "dates"; return; }
      for (let i = 0; i < fields.length; i += 20) setView((await call(`/api/challenge/cases/${state.view.case.id}/fields`, { method: "POST", body: { fields: fields.slice(i, i + 20) } })).view);
      state.step = state.view.readyForAnalysis ? "dates" : "figures";
    }, "Figures saved.");
    return h("section", { className: "ch-card", "aria-labelledby": "ch-fig-title" }, [
      h("h3", { id: "ch-fig-title", text: "Check every figure against your notice" }),
      h("p", { text: "We only use a figure after you confirm it. Correct anything that is wrong. Leave a box empty if it is not on your notice." }),
      h("div", { className: "ch-fields" }, rows.map((r) => r.el)),
      h("button", { className: "btn btn-primary", type: "button", disabled: state.busy, onclick: save, text: "Save and continue" }),
    ]);
  }

  function datesStep() {
    const c = state.view.case;
    const served = h("input", { id: "ch-served", type: "date", max: today(), value: c.dateServed || "" });
    const method = h("select", { id: "ch-method" }, [["", "Choose"], ["hand", "Handed to me"], ["email", "By email"], ["ura-portal", "On the URA portal"], ["post", "By post"], ["other", "Another way"]].map(([v, t]) => h("option", { value: v, text: t, selected: (c.serviceMethod || "") === v })));
    const accepted = h("input", { id: "ch-accepted", type: "text", inputmode: "numeric", value: c.taxAccepted ?? "" });
    const filed = h("input", { id: "ch-filed", type: "date", max: today(), value: c.objectionFiledOn || "" });
    const decision = h("input", { id: "ch-decision", type: "date", max: today(), value: c.decisionServedOn || "" });
    const tat = h("input", { id: "ch-tat", type: "checkbox", checked: c.preparingTat });
    const late = h("textarea", { id: "ch-late", rows: "3", maxlength: "2000" }); late.value = c.lateReason || "";
    return h("section", { className: "ch-card", "aria-labelledby": "ch-dates-title" }, [
      h("h3", { id: "ch-dates-title", text: "When did you receive the notice?" }),
      h("p", { text: "The time to object counts from the day you received it, not the date printed on it." }),
      h("div", { className: "ch-fields" }, [
        h("div", { className: "ch-field" }, [h("label", { for: "ch-served", text: "Date you received it" }), served]),
        h("div", { className: "ch-field" }, [h("label", { for: "ch-method", text: "How you received it" }), method]),
        h("div", { className: "ch-field" }, [h("label", { for: "ch-accepted", text: state.pro ? "Tax not in dispute (UGX)" : "How much of the tax do you agree you owe? (UGX, optional)" }), accepted]),
        h("div", { className: "ch-field" }, [h("label", { for: "ch-filed", text: "Date you lodged your objection (if you have)" }), filed]),
        h("div", { className: "ch-field" }, [h("label", { for: "ch-decision", text: "Date you received URA's decision on it (if any)" }), decision]),
        h("div", { className: "ch-field" }, [h("label", { className: "ch-inline", for: "ch-tat" }, [tat, " I want to take this to the Tax Appeals Tribunal"])]),
        state.view.deadlines.lateObjection.offered ? h("div", { className: "ch-field ch-wide" }, [h("label", { for: "ch-late", text: `Why were you late? (${(state.me.lateReasons || []).join(", ")})` }), late]) : null,
      ]),
      h("button", { className: "btn btn-primary", type: "button", disabled: state.busy, onclick: () => act(async () => {
        const body = { dateServed: served.value || null, serviceMethod: method.value || null, taxAccepted: accepted.value.replace(/[^\d]/g, "") || null, objectionFiledOn: filed.value || null, decisionServedOn: decision.value || null, preparingTat: tat.checked };
        if (state.view.deadlines.lateObjection.offered) body.lateReason = late.value;
        setView((await call(`/api/challenge/cases/${c.id}`, { method: "PATCH", body })).view);
        state.step = "records";
      }, "Saved."), text: "Save and continue" }),
    ]);
  }

  function recordsStep() {
    const view = state.view;
    const questions = state.me.questions || {};
    const items = view.reconciliation.items.map((i) => ({ ...i }));
    const editors = [];
    function editor(item, index) {
      const id = `ch-i${index}`;
      const category = h("select", { id: `${id}-cat` }, Object.entries(CATEGORY_LABELS).map(([v, pair]) => h("option", { value: v, text: lbl(pair), selected: item.category === v })));
      const description = h("input", { id: `${id}-desc`, type: "text", maxlength: "500", value: item.description || "" });
      const ura = h("input", { id: `${id}-ura`, type: "text", inputmode: "numeric", value: item.uraAmount ?? "" });
      const mine = h("input", { id: `${id}-mine`, type: "text", inputmode: "numeric", value: item.taxpayerAmount ?? "" });
      const facts = item.facts || {};
      const has = h("select", { id: `${id}-has` }, [["", "Not sure"], ["yes", "Yes, I have them"], ["no", "No, some are missing"]].map(([v, t]) => h("option", { value: v, text: t, selected: (facts.hasRecords === true ? "yes" : facts.hasRecords === false ? "no" : "") === v })));
      const missing = h("input", { id: `${id}-missing`, type: "text", maxlength: "400", value: (facts.missingDocuments || []).join("; ") });
      const explain = h("textarea", { id: `${id}-explain`, rows: "2", maxlength: "2000" }); explain.value = facts.ownerExplanation || "";
      const legal = h("textarea", { id: `${id}-legal`, rows: "2", maxlength: "2000" }); legal.value = facts.legalArgument || "";
      const procedural = h("textarea", { id: `${id}-proc`, rows: "2", maxlength: "2000" }); procedural.value = facts.proceduralConcern || "";
      const rate = h("input", { id: `${id}-rate`, type: "text", inputmode: "decimal", value: facts.uraRatePercentPerMonth ?? facts.uraPercent ?? "" });
      const months = h("input", { id: `${id}-months`, type: "text", inputmode: "numeric", value: facts.uraMonths ?? "" });
      const keep = h("input", { id: `${id}-keep`, type: "checkbox", checked: item.keepInObjection !== false });
      const outcome = state.role === "reviewer" ? h("select", { id: `${id}-outcome` }, [h("option", { value: "", text: "Use the computed outcome" }), ...Object.entries(state.me.outcomeLabels || {}).map(([v, t]) => h("option", { value: v, text: t, selected: item.reviewerOutcome === v }))]) : null;
      const qs = questions[item.category] || [];
      const fieldset = h("fieldset", { className: "ch-item" }, [
        h("legend", { text: `Item ${index + 1}` }),
        qs.length && !state.pro ? h("ul", { className: "ch-questions" }, qs.map((q) => h("li", { text: q }))) : null,
        h("div", { className: "ch-fields" }, [
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-cat`, text: "What kind of item?" }), category]),
          h("div", { className: "ch-field ch-wide" }, [h("label", { for: `${id}-desc`, text: "Describe it in your own words" }), description]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-ura`, text: "URA's figure (UGX)" }), ura]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-mine`, text: "Figure in your records (UGX)" }), mine]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-has`, text: "Do you have the papers that support your figure?" }), has]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-missing`, text: "Which papers are missing? (separate with ;)" }), missing]),
          h("div", { className: "ch-field ch-wide" }, [h("label", { for: `${id}-explain`, text: "Your explanation" }), explain]),
          h("div", { className: "ch-field ch-wide" }, [h("label", { for: `${id}-legal`, text: state.pro ? "Legal argument" : "Do you think URA got the rules wrong? Why? (optional)" }), legal]),
          h("div", { className: "ch-field ch-wide" }, [h("label", { for: `${id}-proc`, text: state.pro ? "Procedural concern" : "Anything wrong with how or when you received the notice? (optional)" }), procedural]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-rate`, text: "For interest or a penalty: rate shown on the notice (%)" }), rate]),
          h("div", { className: "ch-field" }, [h("label", { for: `${id}-months`, text: "For interest: months shown" }), months]),
          outcome ? h("div", { className: "ch-field" }, [h("label", { for: `${id}-outcome`, text: "Reviewer outcome" }), outcome]) : null,
          h("div", { className: "ch-field" }, [h("label", { className: "ch-inline", for: `${id}-keep` }, [keep, " Keep in the objection"])]),
        ]),
        h("button", { type: "button", className: "ch-link", onclick: () => { editors.splice(editors.indexOf(entry), 1); fieldset.remove(); }, text: "Remove this item" }),
      ]);
      const num = (input) => (input.value.trim() === "" ? null : Number(input.value.replace(/[^\d.]/g, "")));
      const entry = { fieldset, read: () => {
        const cat = category.value;
        const r = num(rate);
        return {
          id: item.itemId, category: cat, description: description.value.trim(), uraAmount: num(ura), taxpayerAmount: num(mine), keepInObjection: keep.checked,
          ...(outcome ? { reviewerOutcome: outcome.value || null } : {}),
          facts: {
            hasRecords: has.value === "yes" ? true : has.value === "no" ? false : undefined,
            missingDocuments: missing.value.split(";").map((s) => s.trim()).filter(Boolean),
            ownerExplanation: explain.value, legalArgument: legal.value, proceduralConcern: procedural.value,
            ...(cat === "interest" ? { uraRatePercentPerMonth: r ?? undefined, uraMonths: num(months) ?? undefined } : {}),
            ...(cat === "penal_tax" ? { uraPercent: r ?? undefined } : {}),
          },
        };
      } };
      editors.push(entry);
      return fieldset;
    }
    const list = h("div", { className: "ch-items" }, items.map((item, i) => editor({ ...item, facts: item.facts || {} }, i)));
    return h("section", { className: "ch-card", "aria-labelledby": "ch-rec-title" }, [
      h("h3", { id: "ch-rec-title", text: "Compare URA's figures with your records" }),
      h("p", { text: "Add one item for each figure you think is wrong, including the interest and penalty if they look wrong. Upload supporting papers below." }),
      list,
      h("button", { type: "button", className: "btn btn-secondary", onclick: () => list.append(editor({ category: "expense", description: "", uraAmount: null, taxpayerAmount: null, facts: {}, keepInObjection: true }, editors.length)), text: "Add an item" }),
      h("button", { type: "button", className: "btn btn-primary", disabled: state.busy, onclick: () => act(async () => {
        const body = { items: editors.map((e) => e.read()).filter((i) => i.description) };
        setView((await call(`/api/challenge/cases/${view.case.id}/items`, { method: "PUT", body })).view);
        state.step = "results";
      }, "Saved. Here is where you stand."), text: "Save and see where you stand" }),
      supportingUploads(),
    ]);
  }

  function supportingUploads() {
    if (!state.me.uploadsEnabled || state.role !== "owner") return null;
    const file = h("input", { id: "ch-support", type: "file", accept: "application/pdf,image/*,.docx,.xlsx,text/plain,text/csv" });
    const type = h("select", { id: "ch-support-type" }, DOC_TYPES.map(([v, t]) => h("option", { value: v, text: t })));
    return h("div", { className: "ch-upload" }, [
      h("h4", { text: "Supporting papers" }),
      h("label", { for: "ch-support", text: "File (up to 10 MB)" }), file,
      h("label", { for: "ch-support-type", text: "What is it?" }), type,
      h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(async () => {
        const f = file.files?.[0];
        if (!f) throw new Error("Choose a file first.");
        if (f.size > MAX_BYTES) throw new Error("That file is bigger than 10 MB.");
        const contentType = /\.docx$/i.test(f.name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : /\.xlsx$/i.test(f.name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : f.type;
        await call(`/api/challenge/cases/${state.view.case.id}/documents`, { method: "POST", raw: f, headers: { "Content-Type": contentType, "X-Document-Type": type.value, "X-File-Name": encodeURIComponent(f.name) } });
        await openCase(state.view.case.id, state.step);
      }, "Uploaded."), text: "Upload" }),
      state.view.documents.length ? h("ul", { className: "ch-list" }, state.view.documents.map((d) => h("li", {}, [
        h("button", { type: "button", className: "ch-link", onclick: () => act(async () => {
          const token = await window.TaxCompAccount.getAccessToken();
          const r = await fetch(`${apiBase}/api/challenge/cases/${state.view.case.id}/documents/${d.id}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!r.ok) throw new Error("Could not download that file.");
          download(new Uint8Array(await r.arrayBuffer()), d.fileName, r.headers.get("Content-Type") || "application/octet-stream");
        }), text: d.fileName }),
        h("span", { className: "ch-muted", text: ` · ${DOC_TYPES.find(([v]) => v === d.docType)?.[1] || d.docType}` }),
      ]))) : null,
    ]);
  }

  function resultsStep() {
    const v = state.view;
    const d = v.deadlines;
    const parts = [h("h3", { text: state.pro ? "Assessment analysis" : "What URA is asking for" })];
    parts.push(h("div", { className: "ch-explain" }, (state.pro ? v.explanation.professional : v.explanation.owner).map((t) => h("p", { text: t }))));
    parts.push(banner(d.decision, d.provisionalLabel), banner(d.tatApplication, d.provisionalLabel));
    if (d.lateObjection.offered) parts.push(h("div", { className: "ch-banner ch-danger" }, [h("strong", { text: "You can ask URA to accept a late objection" }), h("p", { text: d.lateObjection.description }), h("p", {}, [link("Source", d.lateObjection.sourceUrl)])]));
    if (d.tatPayment.amount !== null && (v.case.preparingTat || v.case.decisionServedOn || state.pro)) {
      parts.push(h("div", { className: "ch-banner ch-warn" }, [h("strong", { text: `Before the Tribunal: about ${ugx(d.tatPayment.amount)} to pay first` }), h("p", { text: d.tatPayment.basis }), h("p", {}, [link("Source", d.tatPayment.sourceUrl)])]));
    }
    parts.push(h("p", { className: "ch-muted" }, [d.adr.description, " ", link("Source", d.adr.sourceUrl)]));

    if (v.reconciliation.items.length) {
      if (state.pro) {
        parts.push(h("h4", { text: "Reconciliation and classification" }));
        // Focusable and labelled so keyboard users can scroll it on a phone (WCAG 2.1.1).
        parts.push(h("div", { className: "ch-table-wrap", tabindex: "0", role: "region", "aria-label": "Reconciliation and classification table" }, h("table", { className: "ch-table" }, [
          h("thead", {}, h("tr", {}, ["Item", "URA", "Records", "Difference", "Outcome", "Schedule", "Reason"].map((t) => h("th", { scope: "col", text: t })))),
          h("tbody", {}, v.reconciliation.items.map((i) => h("tr", {}, [i.description, ugx(i.uraAmount), ugx(i.taxpayerAmount), i.difference === null ? "—" : ugx(i.difference), `${i.outcomeLabel}${i.setByReviewer ? " (reviewer)" : ""}`, i.schedule, `${i.reason}${i.recomputation ? ` Working: ${i.recomputation.workings}` : ""}`].map((t) => h("td", { text: t }))))),
        ])));
      } else {
        parts.push(h("h4", { text: "Item by item" }));
        parts.push(h("ul", { className: "ch-outcomes" }, v.reconciliation.items.map((i) => h("li", { className: `ch-outcome ch-o-${i.outcome}` }, [h("strong", { text: i.description }), h("p", { text: i.ownerText }), i.recomputation && i.outcome === "computational_error" ? h("p", { className: "ch-muted", text: i.recomputation.workings }) : null]))));
      }
    } else {
      parts.push(h("p", { className: "ch-muted" }, ["Add the figures you disagree with in ", h("button", { type: "button", className: "ch-link", onclick: () => { state.step = "records"; render(); }, text: "Your records" }), "."]));
    }

    if (v.law) {
      parts.push(h("h4", { text: state.pro ? "Law applied to this period" : "The law for your period" }));
      parts.push(h("ul", { className: "ch-list" }, v.law.statutes.map((s) => h("li", {}, [link(`${s.title}${s.chapter ? ` ${s.chapter}` : ""}`, s.sourceUrl)]))));
      if (v.law.amendmentsApplied.length) parts.push(h("p", { text: `Amendments applied: ${v.law.amendmentsApplied.map((a) => a.title).join("; ")}.` }));
      for (const note of v.law.notes) parts.push(h("p", { className: "ch-note" }, [note.text, " ", link("Source", note.sourceUrl)]));
      if (state.pro && v.law.amendmentsNotApplied.length) parts.push(h("p", { className: "ch-muted", text: `Not applied: ${v.law.amendmentsNotApplied.map((a) => `${a.title} (${a.reason})`).join("; ")}` }));
    }
    if (v.research.length) {
      parts.push(h("h4", { text: state.pro ? "Authorities by issue" : "Law and Tribunal decisions linked to your items" }));
      for (const r of v.research) {
        parts.push(h("div", { className: "ch-research" }, [
          h("strong", { text: r.description }),
          r.provisions.length ? h("ul", { className: "ch-list" }, r.provisions.map((p) => h("li", {}, [link(p.label, p.sourceUrl), ` · ${p.heading}`, state.pro ? h("span", { className: "ch-muted", text: ` · text ${p.textVerified ? "verified" : "not yet verified (TODO_VERIFY)"}; ${p.approvedForComputation ? "approved for computation" : "not approved for computation"}` }) : null]))) : h("p", { className: "ch-muted", text: "No provision in the register yet for this issue." }),
          r.cases.length ? h("ul", { className: "ch-list" }, r.cases.map((c) => h("li", {}, [link(c.citation, c.sourceUrl), ` · ${c.parties}${c.decisionDate ? ` · ${date(c.decisionDate)}` : ""}`,
            state.pro ? h("div", { className: "ch-muted" }, [`${c.summaryLabel}. Appeal status: ${c.appealStatus}.`, c.summary?.legalQuestion ? ` Question: ${c.summary.legalQuestion}` : "", c.summary?.decision ? ` Decision: ${c.summary.decision}` : ""]) : null]))) : null,
        ]));
      }
    }
    if (v.review.required) {
      parts.push(h("div", { className: "ch-banner ch-info" }, [h("strong", { text: v.review.signedOff ? "A reviewer has signed off this case." : "A professional will review this case" }), h("ul", {}, v.review.reasons.map((r) => h("li", { text: r.text }))), v.case.reviewNote ? h("p", { text: `Reviewer's note: ${v.case.reviewNote}` }) : null]));
    }
    if (state.role === "reviewer") parts.push(reviewerControls());
    parts.push(h("p", { className: "ch-muted", text: v.disclaimer }));
    return h("section", { className: "ch-card" }, parts);
  }

  function reviewerControls() {
    const note = h("textarea", { id: "ch-review-note", rows: "3", maxlength: "2000" });
    const tier = h("select", { id: "ch-ent-tier" }, [h("option", { value: "reviewed", text: "Reviewed pack" }), h("option", { value: "managed", text: "Managed dispute" })]);
    const ref = h("input", { id: "ch-ent-ref", type: "text", maxlength: "120" });
    const id = state.view.case.id;
    return h("div", { className: "ch-reviewer" }, [
      h("h4", { text: "Reviewer sign-off" }),
      h("label", { for: "ch-review-note", text: "Note to the taxpayer" }), note,
      h("div", { className: "ch-actions" }, [
        h("button", { type: "button", className: "btn btn-primary", disabled: state.busy, onclick: () => act(async () => setView((await call(`/api/challenge/review/cases/${id}`, { method: "POST", body: { decision: "approve", note: note.value } })).view), "Signed off."), text: "Sign off this version" }),
        h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(async () => setView((await call(`/api/challenge/review/cases/${id}`, { method: "POST", body: { decision: "changes", note: note.value } })).view), "Changes requested."), text: "Request changes" }),
      ]),
      h("h4", { text: "Record a paid review or managed dispute" }),
      h("label", { for: "ch-ent-tier", text: "Service" }), tier, h("label", { for: "ch-ent-ref", text: "Payment reference" }), ref,
      h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(() => call(`/api/challenge/review/cases/${id}/entitlement`, { method: "POST", body: { tier: tier.value, paymentReference: ref.value } }), "Recorded."), text: "Record" }),
    ]);
  }

  function freeSummaryPack() {
    const v = state.view;
    const b = v.deadlines.objection;
    return {
      provisionalNotice: v.deadlines.provisionalLabel,
      documents: [
        { id: "summary", title: "Your assessment explained", blocks: [
          { paragraphs: v.explanation.owner.map((text) => ({ text })) },
          { heading: "Deadline", paragraphs: [{ text: `${b.title}. ${b.message}`, citations: [{ label: `${b.ruleLabel} (${b.ruleSetVersion})`, sourceUrl: b.sourceUrl }] }] },
          { heading: "Next step", paragraphs: [{ text: v.nextStep }] },
          { paragraphs: [{ text: v.disclaimer }] },
        ] },
        { id: "evidence-checklist", title: "Evidence checklist", blocks: [{ table: { headers: ["Document", "Why", "Status"], rows: v.checklist.map((i) => [i.text, i.why, i.status === "needed" ? "Still needed" : i.status === "received" ? "Have it" : "Not available"]) } }] },
      ],
    };
  }

  function printPack(pack) {
    const area = document.querySelector("#challenge-print");
    if (!area) return;
    area.replaceChildren(...[pack.provisionalNotice ? h("p", { className: "ch-provisional", text: pack.provisionalNotice }) : null, ...pack.documents.map((doc) => h("article", { className: "ch-print-doc" }, [
      h("h1", { text: doc.title }),
      ...doc.blocks.flatMap((block) => [
        block.heading ? h("h2", { text: block.heading }) : null,
        ...(block.paragraphs || []).flatMap((p) => [h("p", { text: p.text }), p.citations?.length ? h("p", { className: "ch-cite", text: `Source: ${p.citations.map((c) => (c.sourceUrl ? `${c.label} (${c.sourceUrl})` : c.label)).join("; ")}` }) : null]),
        block.bullets ? h("ul", {}, block.bullets.map((t) => h("li", { text: t }))) : null,
        block.table ? h("table", {}, [h("thead", {}, h("tr", {}, block.table.headers.map((t) => h("th", { text: t })))), h("tbody", {}, block.table.rows.map((r) => h("tr", {}, r.map((t) => h("td", { text: t })))))]) : null,
      ]),
    ]))].filter(Boolean));
    document.documentElement.classList.add("ch-printing");
    const done = () => { document.documentElement.classList.remove("ch-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1500);
  }

  function packStep() {
    const v = state.view;
    const caseId = v.case.id;
    const access = v.access;
    const blocked = access.blockedBecause.includes("review") ? "A reviewer must sign off this case before the full pack can be downloaded. Your explanation, deadline and checklist are below and free."
      : access.blockedBecause.includes("plan") ? "The full response pack (draft objection letter, schedules and management briefing) needs a paid plan. Your explanation, deadline and checklist are free." : null;
    const getPack = async () => (await call(`/api/challenge/cases/${caseId}/pack`)).pack;
    const checklist = h("ul", { className: "ch-checklist" }, v.checklist.map((item) => {
      const select = h("select", { "aria-label": `Status: ${item.text}`, "data-key": item.key }, [["needed", "Still needed"], ["received", "I have it"], ["not-available", "Not available"]].map(([val, t]) => h("option", { value: val, text: t, selected: item.status === val })));
      return h("li", {}, [h("span", {}, [h("strong", { text: item.text }), h("small", { text: ` ${item.why}` })]), select]);
    }));
    const confirmBox = state.confirmDelete ? h("div", { className: "ch-banner ch-danger", role: "alert" }, [
      h("strong", { text: "Delete this case and every file in it? This cannot be undone." }),
      h("div", { className: "ch-actions" }, [
        h("button", { type: "button", className: "btn btn-primary", onclick: () => act(async () => { await call(`/api/challenge/cases/${caseId}`, { method: "DELETE" }); state.view = null; await loadMe(); }, "The case and its files were deleted."), text: "Yes, delete it" }),
        h("button", { type: "button", className: "btn btn-secondary", onclick: () => { state.confirmDelete = false; render(); }, text: "Keep it" }),
      ]),
    ]) : null;
    return h("section", { className: "ch-card", "aria-labelledby": "ch-pack-title" }, [
      h("h3", { id: "ch-pack-title", text: "Your response pack" }),
      h("h4", { text: "Evidence checklist" }), checklist,
      h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(async () => {
        const entries = Object.fromEntries([...checklist.querySelectorAll("select")].filter((s) => s.value !== "needed").map((s) => [s.dataset.key, s.value]));
        setView((await call(`/api/challenge/cases/${caseId}`, { method: "PATCH", body: { checklist: entries } })).view);
      }, "Checklist saved."), text: "Save checklist" }),
      h("h4", { text: "Free downloads" }),
      h("div", { className: "ch-actions" }, [
        h("button", { type: "button", className: "btn btn-secondary", onclick: () => download(window.TaxCompDocx.packToDocx(freeSummaryPack()), "TaxComp-assessment-summary.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), text: "Summary and checklist (Word)" }),
        h("button", { type: "button", className: "btn btn-secondary", onclick: () => printPack(freeSummaryPack()), text: "Print or save as PDF" }),
      ]),
      h("h4", { text: "Full pack: draft objection, schedules and briefing" }),
      blocked ? h("p", { className: "ch-banner ch-info", text: blocked }) : h("div", { className: "ch-actions" }, [
        h("button", { type: "button", className: "btn btn-primary", disabled: state.busy, onclick: () => act(async () => download(window.TaxCompDocx.packToDocx(await getPack()), "TaxComp-response-pack.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "Pack downloaded. Edit it in Word before you use it."), text: "Download the pack (Word)" }),
        h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(async () => printPack(await getPack())), text: "Print or save the pack as PDF" }),
      ]),
      state.role === "owner" ? h("p", {}, [h("button", { type: "button", className: "ch-link ch-danger-text", onclick: () => { state.confirmDelete = true; render(); }, text: "Delete this case" })]) : null,
      confirmBox,
    ]);
  }

  function caseScreen() {
    const v = state.view;
    const body = { notice: noticeStep, figures: figuresStep, dates: datesStep, records: recordsStep, results: resultsStep, pack: packStep }[state.step]();
    return [
      h("div", { className: "ch-case-head" }, [
        h("button", { type: "button", className: "ch-link", onclick: () => act(async () => { state.view = null; await loadMe(); }), text: "← All cases" }),
        h("div", { className: "ch-toggle", role: "group", "aria-label": "View" }, [
          h("button", { type: "button", "aria-pressed": String(!state.pro), onclick: () => { state.pro = false; render(); }, text: "Plain English" }),
          h("button", { type: "button", "aria-pressed": String(state.pro), onclick: () => { state.pro = true; render(); }, text: "Professional" }),
        ]),
      ]),
      banner(v.deadlines.objection, v.deadlines.provisionalLabel),
      h("p", { className: "ch-next" }, [h("strong", { text: "Next step: " }), v.nextStep]),
      h("nav", { className: "ch-steps", "aria-label": "Steps" }, STEPS.map(([key, text]) => h("button", { type: "button", "aria-current": state.step === key ? "step" : null, disabled: (key === "results" || key === "pack") && !v.readyForAnalysis, onclick: () => { state.step = key; render(); document.querySelector("#challenge-root h3")?.focus?.(); }, text }))),
      body,
    ];
  }

  function queueScreen() {
    const list = state.queue || [];
    return h("section", { className: "ch-card" }, [
      h("h3", { text: "Cases assigned to you" }),
      list.length ? h("ul", { className: "ch-case-list" }, list.map((c) => h("li", {}, [
        h("button", { type: "button", className: "ch-link", onclick: () => act(() => openCase(c.id, "results")), text: `${c.taxHead === "vat" ? "VAT" : "Income tax"} · ${ugx(c.principal)} · ${c.reviewStatus}` }),
        h("ul", { className: "ch-muted" }, (c.reasons || []).map((r) => h("li", { text: r }))),
      ]))) : h("p", { className: "ch-muted", text: "Nothing waiting for you." }),
    ]);
  }

  function lawAdminScreen() {
    const law = state.law;
    if (!law) return h("p", { text: "Loading…" });
    const rows = law.versions.map((p) => {
      const text = h("textarea", { rows: "3", "aria-label": `Official text for ${p.id}` }); text.value = /TODO_VERIFY/.test(p.textOrSummary) ? "" : p.textOrSummary;
      const section = h("input", { type: "text", "aria-label": `Section for ${p.id}`, value: p.section === "TODO_VERIFY" ? "" : p.section });
      const formula = h("input", { type: "text", "aria-label": `Formula for ${p.id}`, value: Object.keys(p.computation || {}).length ? JSON.stringify(p.computation) : "" });
      return h("li", { className: "ch-law-row" }, [
        h("strong", { text: `${p.id} · ${p.heading}` }),
        h("span", { className: "ch-muted", text: ` ${p.textVerified ? "text verified" : "TODO_VERIFY"} · ${p.approvedForComputation ? "approved" : "not approved"}` }),
        section, text,
        h("button", { type: "button", className: "btn btn-small", disabled: state.busy, onclick: () => act(async () => { await call(`/api/challenge/review/law/${p.id}`, { method: "POST", body: { text: text.value, section: section.value || undefined } }); state.law = await call("/api/challenge/law"); }, "Text saved as verified."), text: "Save verified text" }),
        state.me.canApproveLaw ? formula : null,
        state.me.canApproveLaw ? h("button", { type: "button", className: "btn btn-small", disabled: state.busy, onclick: () => act(async () => { await call(`/api/challenge/review/law/${p.id}/approve`, { method: "POST", body: formula.value ? { computation: JSON.parse(formula.value) } : {} }); state.law = await call("/api/challenge/law"); }, "Approved for computation."), text: "Approve for computation" }) : null,
      ]);
    });
    const reloadLaw = async () => { state.law = await call("/api/challenge/law"); };
    const todayIso = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // Kampala date
    const upcoming = (law.holidays || []).filter((day) => day.date >= todayIso);
    const holidayRows = upcoming.map((day) => {
      const source = h("input", { type: "url", "aria-label": `Source link confirming ${day.name} ${day.date}`, value: day.sourceUrl || "", placeholder: "https://… (Gazette notice or Act)" });
      return h("li", { className: "ch-law-row" }, [
        h("strong", { text: `${day.date} · ${day.name}` }),
        h("span", { className: "ch-muted", text: day.verified ? " · confirmed" : " · not yet confirmed" }),
        state.me.canApproveLaw && !day.verified ? source : null,
        state.me.canApproveLaw && !day.verified ? h("button", { type: "button", className: "btn btn-small", disabled: state.busy, onclick: () => act(async () => { await call("/api/challenge/review/holidays/verify", { method: "POST", body: { date: day.date, name: day.name, sourceUrl: source.value.trim() } }); await reloadLaw(); }, "Holiday confirmed."), text: "Confirm date" }) : null,
      ]);
    });
    const hol = { date: h("input", { type: "date", "aria-label": "Holiday date" }), name: h("input", { "aria-label": "Holiday name" }), url: h("input", { type: "url", "aria-label": "Source link (optional)" }) };
    const cl = { id: h("input", { "aria-label": "Case id (lowercase-with-hyphens)" }), citation: h("input", { "aria-label": "Citation" }), parties: h("input", { "aria-label": "Parties" }), date: h("input", { type: "date", "aria-label": "Decision date" }), url: h("input", { "aria-label": "ULII link" }), tags: h("input", { "aria-label": "Issue tags separated by ;" }), terms: h("input", { "aria-label": "Search words" }) };
    return h("section", { className: "ch-card" }, [
      h("h3", { text: "Deadline rules" }),
      h("p", { text: `${law.ruleSet.version}: ${law.ruleSet.approvedForComputation ? "approved" : "pending legal review"}.` }),
      state.me.canApproveLaw && !law.ruleSet.approvedForComputation ? h("button", { type: "button", className: "btn btn-secondary", onclick: () => act(async () => { await call(`/api/challenge/review/rules/${law.ruleSet.version}/approve`, { method: "POST", body: {} }); state.law = await call("/api/challenge/law"); }, "Rules approved."), text: "Approve these rules (legal approver)" }) : null,
      h("h3", { text: "Public holidays" }),
      h("p", { className: "ch-muted", text: "When a deadline falls on a weekend or a listed holiday, users are told to lodge by the working day before. Only confirmed holidays can move a deadline later, and only if the deadline rules say a deadline moves to the next working day. Add Eid al-Fitr and Eid al-Adha each year once they are gazetted." }),
      h("details", { className: "ch-holidays" }, [
        h("summary", { text: `Upcoming holidays: ${upcoming.length} listed, ${upcoming.filter((day) => day.verified).length} confirmed` }),
        h("ul", { className: "ch-law-list" }, holidayRows),
        h("div", { className: "ch-fields" }, Object.values(hol).map((input) => h("div", { className: "ch-field" }, [h("label", { text: input.getAttribute("aria-label") }), input]))),
        h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(async () => { await call("/api/challenge/review/holidays", { method: "POST", body: { date: hol.date.value, name: hol.name.value, sourceUrl: hol.url.value.trim() || null } }); await reloadLaw(); }, "Holiday added."), text: "Add holiday" }),
      ]),
      h("h3", { text: "Statute text (paste the official text from ULII)" }),
      h("ul", { className: "ch-law-list" }, rows),
      h("h3", { text: "Add a Tax Appeals Tribunal decision" }),
      h("div", { className: "ch-fields" }, Object.values(cl).map((input) => h("div", { className: "ch-field" }, [h("label", { text: input.getAttribute("aria-label") }), input]))),
      h("button", { type: "button", className: "btn btn-secondary", disabled: state.busy, onclick: () => act(() => call("/api/challenge/review/case-law", { method: "POST", body: { id: cl.id.value.trim(), citation: cl.citation.value, parties: cl.parties.value, decisionDate: cl.date.value || null, sourceUrl: cl.url.value.trim(), issueTags: cl.tags.value.split(";").map((s) => s.trim()).filter(Boolean), searchTerms: cl.terms.value } }), "Decision saved."), text: "Save decision" }),
    ]);
  }

  function render() {
    const children = [];
    if (state.message) children.push(h("p", { className: `ch-message ch-${state.messageKind}`, role: state.messageKind === "error" ? "alert" : "status", text: state.message }));
    if (state.busy) children.push(h("p", { className: "ch-muted", role: "status", text: "Working…" }));
    if (!state.me) children.push(h("p", { className: "ch-muted", text: "Loading your cases…" }));
    else if (state.view) children.push(...caseScreen());
    else children.push(...[].concat(homeScreen()));
    rootEl.replaceChildren(...children.filter(Boolean));
    if (state.restore) {
      for (const [id, value] of state.restore) {
        const el = rootEl.querySelector(`#${CSS.escape(id)}`);
        if (!el) continue;
        if (el.type === "checkbox") el.checked = Boolean(value); else el.value = value;
      }
      state.restore = null;
    }
  }

  function renderWorkspaceList(pane) {
    const cases = state.me?.cases || [];
    pane.replaceChildren(
      cases.length ? h("ul", { className: "ch-case-list" }, cases.map((c) => h("li", {}, [h("a", { href: "#challenge", "data-case": c.id, text: `${c.taxHead === "vat" ? "VAT" : c.taxHead === "income_tax" ? "Income tax" : "New case"}${c.principal !== null ? ` · ${ugx(c.principal)}` : ""}` }), h("span", { className: "ch-muted", text: ` · ${c.status.replace(/_/g, " ")}` })]))) : h("p", { className: "ws-empty", text: "No assessments yet." }),
      h("a", { className: "btn btn-primary", href: "#challenge", text: "Challenge an assessment" }),
    );
  }
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("a[data-case]");
    if (target) act(() => openCase(target.dataset.case));
  });

  // ------------------------------------------------- knowledge centre feeds
  async function loadKnowledgePanels() {
    const lawRoot = document.querySelector("#kb-law-register");
    const caseRoot = document.querySelector("#kb-case-register");
    if (!lawRoot && !caseRoot) return;
    try {
      if (lawRoot && !lawRoot.dataset.loaded) {
        const law = await call("/api/challenge/law");
        lawRoot.dataset.loaded = "1";
        lawRoot.replaceChildren(h("ul", { className: "link-list" }, law.statutes.map((s) => h("li", {}, [link(`${s.title}${s.chapter ? ` (${s.chapter})` : ""}`, s.sourceUrl),
          h("span", { text: s.kind === "amendment" ? `${s.billStatus === "in_force" ? "In force" : s.billStatus}. ${s.assentDate ? `Assented ${date(s.assentDate)}. ` : ""}${s.appliesFromPeriod ? `Applies from ${date(s.appliesFromPeriod)}.` : ""}` : "Principal Act. Section wording: being verified against ULII." })]))));
      }
      if (caseRoot && !caseRoot.dataset.loaded) {
        const cases = await call("/api/challenge/case-law");
        caseRoot.dataset.loaded = "1";
        caseRoot.replaceChildren(cases.results.length ? h("ul", { className: "link-list" }, cases.results.map((c) => h("li", {}, [link(c.citation, c.sourceUrl), h("span", { text: `${c.parties}${c.decisionDate ? ` · ${date(c.decisionDate)}` : ""} · ${c.issueTags.join(", ")}` })]))) : h("p", { text: "No decisions in the register yet." }));
      }
    } catch (error) {
      for (const node of [lawRoot, caseRoot]) if (node && !node.dataset.loaded) node.replaceChildren(h("p", { className: "ch-muted", text: error.status === 503 ? "The law register is not switched on yet." : "Could not load the register right now." }));
    }
  }

  // ------------------------------------------------------------- start
  let started = false;
  async function start() {
    const hash = location.hash.slice(1);
    if (hash.startsWith("kb-") || hash === "knowledge") loadKnowledgePanels();
    if (!["challenge", "ws-assessments", "workspace"].includes(hash) && !started) return;
    if (!(await window.TaxCompAccount?.getAccessToken?.())) return;
    if (started && state.me) return;
    started = true;
    await act(loadMe);
  }
  window.addEventListener("hashchange", start);
  window.TaxCompAccount?.onChange?.(() => { started = false; state.me = null; state.view = null; start(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
