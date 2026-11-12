// Tax Tools → Tax Impact Assessment.
//
// The user describes their situation in ordinary words (or picks a check).
// POST /api/impact interprets it, asks for missing facts, and returns
// TaxComp's deterministic result: the position before and after the 2026
// amendment (both figures where the Bill and the reported Act differ), the
// working, the sources with their legal status, and what to do. Changing a
// figure re-runs the assessment ("what if"). Signed-in users can save it.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.taxCompImpact = api;
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => api.initialize());
      else api.initialize();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // The fact a "what if" slider changes, per scenario.
  const WHAT_IF = { vat_registration: { key: "taxableSupplies12m", label: "Taxable supplies over 12 months" }, paye_change: { key: "monthlyPay", label: "Monthly taxable pay" }, withholding_2026: { key: "grossPayment", label: "Gross payment" } };
  const EXAMPLES = [
    "My business earns UGX 180 million annually. How do the 2026 VAT amendments affect my registration obligations?",
    "How did the 2026 changes affect PAYE on a salary of UGX 1,500,000 a month?",
    "I pay betting winnings of UGX 1,000,000. How much tax do I withhold?",
  ];

  /** Merges answers into the facts sent back; empty answers are dropped. (Pure, for tests.) */
  function mergeFacts(facts, answers) {
    const out = { ...facts };
    for (const [key, value] of Object.entries(answers || {})) {
      if (value === "" || value === null || value === undefined) continue;
      const n = typeof value === "string" && /^\s*[\d,]+(?:\.\d+)?\s*$/.test(value) ? Number(value.replace(/[,\s]/g, "")) : value;
      out[key] = n;
    }
    return out;
  }

  const ugx = (n) => (typeof n === "number" ? `UGX ${Math.round(n).toLocaleString("en-US")}` : "—");

  function apiBase() {
    try {
      const meta = root.document?.querySelector('meta[name="taxcomp-chat-endpoint"]');
      return meta ? new URL(meta.content, root.location.href).origin : "";
    } catch {
      return "";
    }
  }

  async function post(path, body, token) {
    const response = await fetch(`${apiBase()}${path}`, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error(data.error || "TaxComp could not complete the assessment."); e.status = response.status; throw e; }
    return data;
  }

  // ------------------------------------------------------------------ rendering
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  const state = { input: null, result: null, mode: "simple", busy: false, error: "", saved: "" };
  let out;
  let whatIfTimer;

  async function assess(input) {
    state.busy = true;
    state.error = "";
    state.saved = "";
    render();
    try {
      state.result = await post("/api/impact", input);
      state.input = { ...input, scenario: state.result.scenario || input.scenario || null, facts: { ...(input.facts || {}), ...(state.result.facts || {}) } };
    } catch (error) {
      state.error = error.status === 503 ? "The impact assessment is not switched on yet." : error.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  function questionsForm(r) {
    const fields = r.questions.map((q) => {
      const id = `impact-q-${q.key}`;
      const control = q.type === "choice"
        ? h("select", { id, name: q.key, required: true }, [h("option", { value: "", text: "Choose…" }), ...q.options.map((o) => h("option", { value: o.value, text: o.label }))])
        : h("input", { id, name: q.key, type: "text", inputmode: "numeric", required: true, autocomplete: "off", value: q.suggested !== undefined && q.suggested !== null ? String(q.suggested) : "", placeholder: "UGX" });
      return h("div", { className: "impact-field" }, [h("label", { for: id, text: q.question }), control, h("p", { className: "impact-help", text: q.help })]);
    });
    const form = h("form", { className: "impact-questions", "aria-labelledby": "impact-q-title" }, [
      h("h3", { id: "impact-q-title", text: "A few facts first" }),
      h("p", { className: "impact-help", text: "TaxComp asks only what it needs to work out the effect for you." }),
      ...fields,
      h("button", { type: "submit", className: "btn btn-small", disabled: state.busy, text: "Continue" }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const answers = Object.fromEntries(new FormData(form).entries());
      assess({ ...state.input, facts: mergeFacts(state.input.facts, answers) });
    });
    return form;
  }

  function outcomesTable(r) {
    return h("div", { className: "impact-table-wrap", tabindex: "0", role: "region", "aria-label": "Before and after" }, [h("table", { className: "impact-table" }, [
      h("caption", { text: "Before and after the change" }),
      h("thead", {}, [h("tr", {}, ["Position", "Period", "Rule", "Result for you"].map((t) => h("th", { scope: "col", text: t })))]),
      h("tbody", {}, r.outcomes.map((o) => h("tr", { className: o.conflict ? "is-conflict" : null }, [
        h("th", { scope: "row", text: o.label }), h("td", { text: o.period }), h("td", { text: o.rule }), h("td", { text: o.result }),
      ]))),
    ])]);
  }

  function whatIf(r) {
    const spec = WHAT_IF[r.scenario];
    if (!spec || typeof r.facts?.[spec.key] !== "number") return null;
    const input = h("input", { id: "impact-whatif", type: "range", min: "0", max: String(Math.max(r.facts[spec.key] * 3, 1_000_000)), step: String(Math.max(Math.round(r.facts[spec.key] / 100), 1000)), value: String(r.facts[spec.key]) });
    const shown = h("output", { for: "impact-whatif", text: ugx(r.facts[spec.key]) });
    input.addEventListener("input", () => {
      shown.textContent = ugx(Number(input.value));
      clearTimeout(whatIfTimer);
      whatIfTimer = setTimeout(() => assess({ ...state.input, facts: { ...state.input.facts, [spec.key]: Number(input.value) } }), 350);
    });
    return h("div", { className: "impact-whatif" }, [h("label", { for: "impact-whatif", text: `What if? ${spec.label}` }), input, shown]);
  }

  function sourcesPanel(r) {
    return h("details", { className: "impact-details" }, [
      h("summary", { text: `Sources and legal status (${r.sources.length})` }),
      h("ul", { className: "impact-sources" }, r.sources.map((s) => h("li", {}, [
        h("p", {}, [h("strong", { text: s.title }), ` – ${s.provision}`]),
        h("dl", {}, [
          h("dt", { text: "Legal status" }), h("dd", { text: s.legalStatus }),
          h("dt", { text: "Kind of source" }), h("dd", { text: s.sourceKindLabel }),
          h("dt", { text: "Verification" }), h("dd", { text: s.verification }),
        ]),
        s.note ? h("p", { className: "impact-help", text: s.note }) : null,
        s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener", text: "Open the source document" }) : null,
      ]))),
    ]);
  }

  function workingPanel(r) {
    return h("details", { className: "impact-details" }, [
      h("summary", { text: "How it was calculated" }),
      r.taxYear ? h("p", { className: "impact-help", text: `Tax year: ${r.taxYear}` }) : null,
      h("ol", { className: "impact-steps" }, r.steps.map((s) => h("li", {}, [h("span", { text: s.label }), s.detail ? h("span", { className: "impact-help", text: ` ${s.detail}` }) : null, s.amount !== null ? h("strong", { text: ` ${ugx(s.amount)}` }) : null]))),
      h("p", { className: "impact-subhead", text: "Assumptions" }),
      h("ul", {}, r.assumptions.map((a) => h("li", { text: a }))),
    ]);
  }

  function actionsPanel(r) {
    if (!r.actions.length) return null;
    return h("section", { className: "impact-actions", "aria-labelledby": "impact-actions-title" }, [
      h("h4", { id: "impact-actions-title", text: "What to do" }),
      h("ul", {}, r.actions.map((a) => h("li", {}, [
        h("p", {}, [h("strong", { text: a.title })]),
        h("p", { className: "impact-help", text: `Who: ${a.who} · Legal basis: ${a.basis} · When: ${a.due}` }),
        a.documents.length ? h("p", { className: "impact-help", text: `Documents: ${a.documents.join(", ")}` }) : null,
      ]))),
    ]);
  }

  function saveControl() {
    if (!root.TaxCompAccount?.getAccessToken) return null;
    const name = h("input", { id: "impact-save-name", type: "text", maxlength: "160", value: state.result.title });
    const button = h("button", { type: "button", className: "btn btn-small btn-secondary", disabled: state.busy, text: "Save to my dashboard" });
    button.addEventListener("click", async () => {
      try {
        const token = await root.TaxCompAccount.getAccessToken();
        if (!token) throw new Error("Sign in to save assessments.");
        await post("/api/challenge/assessments", { title: name.value.trim() || state.result.title, input: state.input }, token);
        state.saved = "Saved. It is listed on your dashboard.";
      } catch (error) {
        state.saved = error.message;
      }
      render();
    });
    return h("div", { className: "impact-save" }, [h("label", { for: "impact-save-name", text: "Name" }), name, button, state.saved ? h("p", { className: "impact-help", role: "status", text: state.saved }) : null]);
  }

  function resultView(r) {
    const parts = [h("p", { className: "impact-understanding", text: r.understanding })];
    if (r.status === "needs_facts") return [...parts, questionsForm(r)];
    if (r.status === "not_covered") {
      return [...parts, h("p", { text: "The impact assessment covers the VAT registration threshold, PAYE across tax years, and withholding on payments changed in 2026. For anything else, ask the assistant: it answers from TaxComp's legislation database." }),
        h("a", { className: "btn btn-small", href: "#assistant", text: "Ask TaxComp" })];
    }
    const modeButton = (mode, label) => h("button", { type: "button", className: "chip", "aria-pressed": String(state.mode === mode), text: label, onclick: () => { state.mode = mode; render(); } });
    return [
      ...parts,
      h("div", { className: "impact-mode", role: "group", "aria-label": "Explanation style" }, [modeButton("simple", "Simple"), modeButton("professional", "Professional")]),
      h("p", { className: "impact-conclusion", text: state.mode === "simple" ? r.explanation.simple : r.explanation.professional }),
      ...r.conflicts.map((c) => h("p", { className: "impact-conflict", role: "note", text: c })),
      outcomesTable(r),
      whatIf(r),
      actionsPanel(r),
      workingPanel(r),
      sourcesPanel(r),
      h("ul", { className: "impact-limits" }, r.limits.map((l) => h("li", { text: l }))),
      saveControl(),
    ];
  }

  function render() {
    if (!out) return;
    const nodes = [];
    if (state.busy) nodes.push(h("p", { className: "impact-help", role: "status", text: "Working…" }));
    if (state.error) nodes.push(h("p", { className: "form-error", role: "alert", text: state.error }));
    if (state.result && !state.error) nodes.push(...resultView(state.result).filter(Boolean));
    const focused = document.activeElement && out.contains(document.activeElement) ? document.activeElement.id : "";
    out.replaceChildren(...nodes);
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }

  function initialize() {
    const form = typeof document !== "undefined" ? document.getElementById("impact-form") : null;
    if (!form) return;
    out = document.getElementById("impact-result");
    const question = document.getElementById("impact-question");
    const scenario = document.getElementById("impact-scenario");
    const userType = document.getElementById("impact-user-type");
    const examples = document.getElementById("impact-examples");
    if (examples) {
      examples.replaceChildren(...EXAMPLES.map((text) => h("li", {}, [h("button", { type: "button", className: "chip", text, onclick: () => { question.value = text; scenario.value = ""; form.requestSubmit(); } })])));
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = { question: question.value.trim(), ...(scenario.value ? { scenario: scenario.value } : {}), ...(userType.value ? { userType: userType.value } : {}), facts: {} };
      if (!input.question && !input.scenario) { state.error = "Describe your situation, or choose a check."; state.result = null; render(); return; }
      assess(input);
    });
  }

  return { initialize, mergeFacts, EXAMPLES, WHAT_IF };
});
