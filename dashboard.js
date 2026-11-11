// Phase 12: personalised dashboard (Workspace → My dashboard).
//
// Onboarding (every question can be skipped), Simple / Professional mode,
// recommendations with the data they come from, the Tax Companion, modules
// chosen for the user's category, and "Discover my tax obligations".
// Everything comes from /api/challenge/profile (signed-in users only).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.taxCompDashboard = api;
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => api.initialize());
      else api.initialize();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  // ------------------------------------------------------------------ Tax Companion (pure)
  // Natural-language requests mapped to TaxComp tools. Anything else goes to
  // the AI assistant with the user's profile as context.
  const INTENTS = [
    { id: "start", pattern: /\b(?:new to tax|where (?:do|should) i start|start(?:ing)?|beginner|don'?t know (?:anything|where)|no (?:tax )?knowledge)\b/i,
      simple: "Start by answering a few questions about yourself. TaxComp will show which taxes may apply to you and what to do first.",
      professional: "Run the obligation check to map potentially applicable heads of tax with statutory references.", action: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" } },
    { id: "assessment", pattern: /\b(?:assessment|ura (?:letter|notice|demand)|objection|object to|dispute|penal tax|received .* from ura)\b/i,
      simple: "Upload or type in the URA assessment. TaxComp explains what URA is asking for, how many days you have to object, and helps you prepare a response.",
      professional: "Open Challenge an Assessment: deadline computation, item analysis, Tribunal case law and response pack.", action: { label: "Challenge an assessment", href: "#challenge" } },
    { id: "small-business", pattern: /\b(?:small business|my business|what taxes (?:might|may|do|will) apply|which taxes|taxes .* apply)\b/i,
      simple: "It depends on your business. Answer a few questions and TaxComp lists the taxes that may apply and why, without assuming you have every tax.",
      professional: "Obligation discovery by facts: registration, income tax, VAT, PAYE, withholding, presumptive tax and others, with provisions.", action: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" } },
    { id: "vat", pattern: /\b(?:vat|value added tax)\b/i,
      simple: "The VAT calculator works out VAT on a price, and explains whether you may need to register.",
      professional: "VAT calculator; registration, returns, input tax and invoices are covered by the VAT Act sections in the legislation library.", action: { label: "VAT calculator", href: "#calc-vat" } },
    { id: "tin", pattern: /\b(?:tin|tax identification|register (?:for|with) (?:tax|ura)|registration)\b/i,
      simple: "A TIN (Taxpayer Identification Number) is your tax number. You apply on the URA portal. The obligation check tells you whether you need one now.",
      professional: "Registration and TIN: Tax Procedures Code Act, Part II.", action: { label: "Discover my tax obligations", href: "#ws-dashboard-discover" } },
    { id: "employees", pattern: /\b(?:employees?|staff|payroll|workers|employer)\b/i,
      simple: "If you employ people, you usually take PAYE from their pay and pay it to URA. The PAYE calculator works out the amount.",
      professional: "Employer withholding (Income Tax Act s.126), NSSF and Local Service Tax; see the obligation check.", action: { label: "PAYE calculator", href: "#calc-paye" } },
    { id: "paye", pattern: /\b(?:paye|salary|payslip|pay as you earn)\b/i,
      simple: "The PAYE calculator shows the tax taken from a salary each month.", professional: "PAYE calculator (rules labelled with their verification status).", action: { label: "PAYE calculator", href: "#calc-paye" } },
    { id: "rental", pattern: /\b(?:rent|rental|landlord|tenant)\b/i,
      simple: "The rental calculator estimates the tax on rent you receive.", professional: "Rental tax (Income Tax Act s.5 and Part XIII).", action: { label: "Rental tax calculator", href: "#calc-rental" } },
    { id: "withholding", pattern: /\b(?:withholding|wht)\b/i,
      simple: "Withholding tax is tax a payer keeps back from a payment. The calculator shows how it works.", professional: "Withholding tax calculator and Income Tax Act Part XIV.", action: { label: "Withholding calculator", href: "#calc-withholding" } },
  ];

  /** The best tool for a request, or null (then the AI assistant answers). */
  function companionIntent(text) {
    const value = String(text || "");
    return INTENTS.find((intent) => intent.pattern.test(value)) || null;
  }

  // ------------------------------------------------------------------ API
  let state = { data: null, editing: false, busy: false, message: "", discovery: null };

  function apiBase() {
    try {
      const meta = root.document?.querySelector('meta[name="taxcomp-chat-endpoint"]');
      return meta ? new URL(meta.content, root.location.href).origin : "";
    } catch {
      return "";
    }
  }

  async function call(path, { method = "GET", body } = {}) {
    const token = await root.TaxCompAccount?.getAccessToken?.();
    if (!token) { const e = new Error("Sign in to see your dashboard."); e.status = 401; throw e; }
    const response = await fetch(`${apiBase()}${path}`, {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error(data.error || "TaxComp could not load your dashboard."); e.status = response.status; throw e; }
    return data;
  }

  /** Profile values the AI assistant may use (enumerated values only). */
  function chatProfile() {
    const p = state.data?.profile;
    if (!p) return null;
    return { userCategory: p.userCategory, businessType: p.businessType, experienceMode: p.experienceMode };
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
    for (const child of [].concat(children)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }
  const link = (l) => h("a", { href: l.href, className: "dash-link", text: l.label });

  async function act(fn) {
    if (state.busy) return;
    state.busy = true;
    state.message = "";
    try { await fn(); } catch (error) { state.message = error.message; } finally { state.busy = false; render(); }
  }

  const QUESTIONS = {
    userCategory: { label: "1. What best describes you?", options: null },
    purpose: { label: "2. Are you using TaxComp for personal or business tax?", options: [["personal", "Personal"], ["business", "Business"], ["both", "Both"]] },
    businessType: { label: "3. What type of business do you operate? (if any)", options: [["sole_trader", "Sole trader (just me)"], ["partnership", "Partnership"], ["company", "Company"], ["ngo", "NGO or charity"], ["other", "Other"]] },
    knowledgeLevel: { label: "4. How much do you know about tax?", options: [["none", "Nothing yet: explain everything simply"], ["some", "A little"], ["professional", "I work in tax or accounting"]] },
  };
  const INTEREST_LABEL = { paye: "PAYE and salary", income_tax: "Income tax", vat: "VAT", withholding: "Withholding tax", corporation_tax: "Company tax", rental: "Rental income",
    presumptive: "Small business tax", excise: "Excise duty", stamp_duty: "Stamp duty", international: "Income from abroad", assessments: "URA assessments", registration: "Registering for tax" };

  function select(name, label, options, value) {
    const id = `dash-q-${name}`;
    return h("div", { className: "field" }, [h("label", { for: id, text: label }),
      h("select", { id, name }, [h("option", { value: "", text: "Skip this question" }), ...options.map(([v, t]) => h("option", { value: v, text: t, selected: v === value }))])]);
  }

  function onboarding() {
    const p = state.data.profile;
    const categories = Object.entries(state.data.options.categories);
    const form = h("form", { className: "dash-onboarding", "aria-labelledby": "dash-onboarding-title" }, [
      h("h3", { id: "dash-onboarding-title", text: state.data.exists ? "Your profile" : "Welcome to TaxComp. Let's set up your dashboard." }),
      h("p", { className: "dash-muted", text: "Five short questions. Skip any you like; you can change your answers later." }),
      select("userCategory", QUESTIONS.userCategory.label, categories, p.userCategory),
      select("purpose", QUESTIONS.purpose.label, QUESTIONS.purpose.options, p.purpose),
      select("businessType", QUESTIONS.businessType.label, QUESTIONS.businessType.options, p.businessType),
      select("knowledgeLevel", QUESTIONS.knowledgeLevel.label, QUESTIONS.knowledgeLevel.options, p.knowledgeLevel),
      h("fieldset", { className: "dash-interests" }, [h("legend", { text: "5. What would you like help with?" }),
        ...state.data.options.interests.map((id) => h("label", { className: "dash-check" }, [h("input", { type: "checkbox", name: "interests", value: id, checked: p.interests.includes(id) }), ` ${INTEREST_LABEL[id] || id}`]))]),
      h("div", { className: "dash-actions" }, [
        h("button", { type: "submit", className: "btn btn-primary", text: "Save and show my dashboard" }),
        h("button", { type: "button", className: "btn btn-secondary", text: state.data.exists ? "Cancel" : "Skip for now",
          onclick: () => act(async () => { if (!state.data.exists) state.data = await call("/api/challenge/profile", { method: "POST", body: { completeOnboarding: true } }); state.editing = false; }) }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      act(async () => {
        state.data = await call("/api/challenge/profile", { method: "POST", body: {
          userCategory: data.get("userCategory") || null, purpose: data.get("purpose") || null, businessType: data.get("businessType") || null,
          knowledgeLevel: data.get("knowledgeLevel") || null, interests: data.getAll("interests"), completeOnboarding: true,
        } });
        state.editing = false;
      });
    });
    return form;
  }

  function modeSwitch() {
    const mode = state.data.profile.experienceMode;
    const button = (value, text) => h("button", { type: "button", className: "chip", "aria-pressed": String(mode === value), disabled: state.busy,
      onclick: () => act(async () => { state.data = await call("/api/challenge/profile", { method: "POST", body: { experienceMode: value } }); }), text });
    return h("div", { className: "dash-mode", role: "group", "aria-label": "Explanation style" }, [h("span", { className: "dash-muted", text: "Explanations: " }), button("simple", "Simple"), button("professional", "Professional")]);
  }

  function recommendationsCard() {
    const recs = state.data.recommendations;
    if (!recs.length) return null;
    return h("section", { className: "dash-card dash-recs", "aria-labelledby": "dash-recs-title" }, [
      h("h3", { id: "dash-recs-title", text: "Suggested for you" }),
      h("ul", {}, recs.map((r) => h("li", { "data-rec": r.id }, [
        h("p", { className: "dash-rec-text", text: r.text }),
        h("p", { className: "dash-muted", text: `Why: ${r.evidence}` }),
        r.action.href === "#ws-dashboard-profile"
          ? h("button", { type: "button", className: "btn btn-small", text: r.action.label, onclick: () => { state.editing = true; render(); } })
          : link(r.action),
      ]))),
    ]);
  }

  function companion() {
    const simple = state.data.profile.experienceMode === "simple";
    const input = h("input", { id: "dash-companion-input", type: "text", maxlength: "500", autocomplete: "off", placeholder: "e.g. I operate a small business. What taxes might apply to me?" });
    const out = h("div", { id: "dash-companion-answer", "aria-live": "polite" });
    const suggestions = ["I am new to taxation. Where should I start?", "I operate a small business. What taxes might apply to me?", "I have received a URA assessment. What should I do?",
      "How do I calculate VAT?", "How do I register for a TIN?", "What tax obligations apply to my employees?"];
    const answer = (question) => {
      const intent = companionIntent(question);
      if (intent) {
        out.replaceChildren(h("p", { text: simple ? intent.simple : intent.professional }), link(intent.action),
          h("p", { className: "dash-muted", text: "Want a fuller answer? " }, [h("button", { type: "button", className: "btn btn-small btn-secondary", text: "Ask the AI assistant", onclick: () => askAssistant(question) })]));
      } else {
        askAssistant(question);
      }
    };
    const form = h("form", { className: "dash-companion-form", role: "search" }, [h("label", { for: "dash-companion-input", text: "Ask the Tax Companion" }), input, h("button", { type: "submit", className: "btn btn-primary", text: "Ask" })]);
    form.addEventListener("submit", (event) => { event.preventDefault(); if (input.value.trim()) answer(input.value.trim()); });
    return h("section", { className: `dash-card dash-companion${state.data.dashboard.companionProminent ? " is-prominent" : ""}`, "aria-labelledby": "dash-companion-title" }, [
      h("h3", { id: "dash-companion-title", text: "Tax Companion" }),
      h("p", { className: "dash-muted", text: simple ? "Ask in your own words. I'll point you to the right tool, or ask the AI assistant for you." : "Natural-language routing to TaxComp tools; other questions go to the assistant with your profile as context." }),
      form,
      h("div", { className: "chip-row" }, suggestions.map((s) => h("button", { type: "button", className: "chip", text: s, onclick: () => { input.value = s; answer(s); } }))),
      out,
    ]);
  }

  /** Opens the AI assistant with the question (the chat sends the profile as context). */
  function askAssistant(question) {
    root.location.hash = "assistant";
    setTimeout(() => {
      const input = document.querySelector("#tax-chat-input");
      const form = document.querySelector("#tax-chat-form");
      if (!input || !form) return;
      input.value = question;
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    }, 150);
  }

  function modules() {
    const simple = state.data.profile.experienceMode === "simple";
    return h("section", { className: "dash-modules", "aria-label": "Your dashboard" }, state.data.dashboard.modules.map((m) => h("article", { className: "dash-card", "data-module": m.id }, [
      h("h3", { text: m.title }), h("p", { text: simple ? m.simple : m.professional }), h("div", { className: "dash-links" }, m.links.map(link)),
    ])));
  }

  const FACT_QUESTIONS = [
    ["employed", "Are you employed (paid a salary)?", ["individual", "employee", "self_employed", null]],
    ["selfEmployed", "Do you work for yourself or run a business?", ["individual", "employee", "self_employed", "small_business", null]],
    ["employsStaff", "Do you employ staff?", ["self_employed", "small_business", "company", "finance_manager", null]],
    ["vatRegistered", "Are you registered for VAT?", ["self_employed", "small_business", "company", "finance_manager", null]],
    ["smallTurnover", "Are your yearly sales small (a micro or small business)?", ["self_employed", "small_business", null]],
    ["rentalIncome", "Do you receive rent from property?", null],
    ["paysSuppliers", "Do you pay suppliers or professionals (for example consultants)?", ["self_employed", "small_business", "company", "finance_manager", null]],
    ["paysNonResidents", "Do you make payments to people or companies outside Uganda?", ["small_business", "company", "finance_manager", "consultant", "accountant", null]],
    ["foreignIncome", "Do you receive income from outside Uganda?", null],
    ["excisableGoods", "Do you make, import or sell goods like drinks, fuel, cement or sugar?", ["small_business", "company", "finance_manager", null]],
    ["instruments", "Do you sign documents like leases, land transfers or loan agreements?", null],
  ];

  function discovery() {
    const p = state.data.profile;
    const category = p.userCategory;
    const questions = FACT_QUESTIONS.filter(([, , who]) => !who || who.includes(category) || (category === null));
    const form = h("form", { className: "dash-discover-form" }, [
      ...questions.map(([key, label]) => {
        const id = `dash-fact-${key}`;
        return h("div", { className: "field" }, [h("label", { for: id, text: label }), h("select", { id, name: key }, [
          h("option", { value: "", text: "Not answered" }), ...[["yes", "Yes"], ["no", "No"], ["unknown", "I don't know"]].map(([v, t]) => h("option", { value: v, text: t, selected: p.facts[key] === v })),
        ])]);
      }),
      h("button", { type: "submit", className: "btn btn-primary", text: "Check my obligations", disabled: state.busy }),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const facts = {};
      for (const [key] of questions) facts[key] = form.elements.namedItem(key).value || null;
      act(async () => { const data = await call("/api/challenge/profile/discover", { method: "POST", body: { facts } }); state.data = data; });
    });
    const result = p.discovery;
    const simple = p.experienceMode === "simple";
    return h("section", { id: "dash-discover", className: "dash-card dash-discover", "aria-labelledby": "dash-discover-title" }, [
      h("h3", { id: "dash-discover-title", text: "Discover my tax obligations" }),
      h("p", { className: "dash-muted", text: simple ? "Answer what you can. TaxComp only lists taxes your answers point to, and says which ones need checking." : "Facts-based obligation mapping against the legislative database; statuses distinguish facts-based obligations from those needing verification." }),
      form,
      result ? h("div", { className: "dash-obligations" }, [
        h("p", { className: "dash-muted", text: `Checked ${new Date(result.generatedAt).toLocaleString("en-UG")}. ${result.obligations.length} item${result.obligations.length === 1 ? "" : "s"}.` }),
        ...result.obligations.map((o) => h("article", { className: `dash-obligation is-${o.status}`, "data-obligation": o.id }, [
          h("h4", {}, [o.title, " ", h("span", { className: `dash-badge is-${o.status}`, text: o.statusLabel })]),
          h("p", { text: simple ? o.what : o.professional }),
          o.why.length ? h("p", { className: "dash-muted", text: `Why: ${o.why.join(" ")}` }) : null,
          o.provisions.length ? h("ul", { className: "dash-provisions", "aria-label": "Legal provisions" }, o.provisions.map((pr) => h("li", { text: `${pr.citation} – ${pr.heading} (${pr.evidenceLabel})` }))) : null,
          o.missingLaw ? h("p", { className: "dash-warn", text: o.missingLaw }) : null,
          h("p", { text: `What to do: ${o.todo.join(" ")}` }),
          h("p", { className: "dash-muted", text: `When: ${o.when}` }),
          o.documents.length ? h("p", { className: "dash-muted", text: `Documents: ${o.documents.join(", ")}` }) : null,
          o.tool ? link(o.tool) : null,
        ])),
        h("ul", { className: "dash-notes" }, result.notes.map((n) => h("li", { text: n }))),
      ]) : null,
    ]);
  }

  let rootNode = null;
  function render() {
    if (!rootNode) return;
    if (!state.data) return;
    const d = state.data;
    const parts = [];
    if (state.message) parts.push(h("p", { className: "form-error", role: "alert", text: state.message }));
    if (state.editing || !d.profile.onboardingCompletedAt) {
      parts.push(onboarding());
    } else {
      parts.push(h("div", { className: "dash-head" }, [
        h("div", {}, [h("p", { className: "eyebrow section-eyebrow", text: d.dashboard.categoryLabel.toUpperCase() }), h("h2", { id: "dash-title", text: "Your TaxComp dashboard" })]),
        h("div", { className: "dash-head-actions" }, [modeSwitch(), h("button", { type: "button", className: "btn btn-small btn-secondary", text: "Edit my profile", onclick: () => { state.editing = true; render(); } })]),
      ]));
      if (d.dashboard.companionProminent) parts.push(companion());
      parts.push(recommendationsCard());
      parts.push(modules());
      if (!d.dashboard.companionProminent) parts.push(companion());
      parts.push(discovery());
    }
    rootNode.replaceChildren(...parts.filter(Boolean));
  }

  async function load() {
    try {
      state.data = await call("/api/challenge/profile");
      state.message = "";
    } catch (error) {
      rootNode?.replaceChildren(h("p", { className: "ws-empty", text: error.status === 401 ? "Sign in to see your personalised dashboard." : [404, 503].includes(error.status) ? "Your personalised dashboard is not switched on yet. Your other workspace sections still work." : error.message }));
      return;
    }
    render();
    focusFromHash();
  }

  function focusFromHash() {
    const hash = root.location?.hash || "";
    if (hash === "#ws-dashboard-discover") document.querySelector(".dash-discover")?.scrollIntoView({ block: "start" });
    if (hash === "#ws-dashboard-profile" && state.data && !state.editing) { state.editing = true; render(); }
  }

  function initialize() {
    rootNode = document.querySelector("#dashboard-root");
    if (!rootNode) return;
    const maybeLoad = () => { if (/^#(?:workspace|ws-dashboard)/.test(root.location.hash)) { if (state.data) focusFromHash(); else load(); } };
    root.addEventListener("hashchange", maybeLoad);
    root.TaxCompAccount?.onChange?.(() => { state = { data: null, editing: false, busy: false, message: "", discovery: null }; maybeLoad(); });
    maybeLoad();
  }

  return { initialize, companionIntent, chatProfile, INTENTS };
});
