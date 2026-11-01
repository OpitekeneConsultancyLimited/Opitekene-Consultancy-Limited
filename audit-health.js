(function (root, factory) {
  const auditHealth = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = auditHealth;
  } else {
    root.taxCompAuditHealth = auditHealth;
    auditHealth.initialize();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const storageKey = "taxcomp-audit-health-v1";
  const statuses = ["unreviewed", "ready", "action", "na"];
  const modes = {
    audit: {
      label: "Audit readiness",
      intro: "Organize records and response steps for a tax review. Check the actual notice and applicable deadlines; this checklist does not respond to URA on your behalf.",
      categories: [
        {
          name: "Notice, scope and response",
          items: [
            ["audit-notice", "Read and preserve the notice", "Keep the original notice and attachments; identify the issuing office, contact channel, tax types, periods, scope, requested records, response date and meeting details.", "Confirm receipt and any extension or response procedure with URA or your adviser. Do not ignore a deadline.", "high"],
            ["audit-identity", "Verify the audit contact and secure document channel", "Confirm the officer and request through an independently verified URA contact before sending records or granting system access.", "Do not send passwords, PINs, one-time codes, or unrestricted access to accounting systems.", "high"],
            ["audit-scope", "Build a request and submission register", "Track each request, period, owner, due date, documents collected, reviewer, submission date and proof of delivery.", "Resolve unclear or overly broad requests with the audit contact or a qualified adviser; keep a copy of every submission.", "medium"],
            ["audit-period", "Freeze and back up the relevant records", "Preserve accounting exports, ledgers, invoices, payroll, bank statements, contracts and system logs for the periods under review.", "Use read-only copies where practical; retain the originals and avoid altering historical records.", "high"],
            ["audit-representative", "Assign an authorized coordinator", "Identify who may speak for the business, approve document releases, attend meetings and escalate legal or technical questions.", "Limit access to authorized people and maintain a consistent, factual response log.", "medium"],
          ],
        },
        {
          name: "Accounts and income tax",
          items: [
            ["audit-accounts", "Tie annual accounts to the general ledger and trial balance", "Prepare a clear bridge from signed financial statements to the underlying accounting records for each year in scope.", "Explain material differences and preserve supporting schedules and approvals.", "high"],
            ["audit-income", "Reconcile turnover and other income", "Reconcile sales ledgers, invoices, EFRIS reports where relevant, bank receipts, contracts, credit notes and income-tax returns.", "Investigate timing, completeness, cut-off, related-party and unrecorded-income differences.", "high"],
            ["audit-adjustments", "Support the tax reconciliation", "Prepare schedules for add-backs, exempt income, allowable deductions, capital allowances, losses and tax paid.", "Tie every adjustment to a ledger account, source document and applicable tax-year treatment.", "high"],
            ["audit-assets", "Prepare the fixed-asset and capital-allowance roll-forward", "Reconcile opening tax values, additions, disposals, depreciation, ownership, business use and closing values.", "Keep invoices, import entries, title or registration evidence and disposal proceeds; check asset-class treatment.", "medium"],
            ["audit-losses", "Substantiate carried-forward tax losses and credits", "Keep prior filed returns, assessments, loss schedules, payment receipts and withholding certificates supporting each balance.", "Do not offset an amount solely because it appears in the accounting ledger.", "high"],
          ],
        },
        {
          name: "VAT, EFRIS and customs",
          items: [
            ["audit-vat-returns", "Reconcile VAT returns to sales, purchases and the ledger", "Tie output and input VAT by return period to transaction-level schedules, control accounts and financial records.", "Explain adjustments, credit notes, imports, exempt or zero-rated supplies and timing differences.", "high"],
            ["audit-vat-sales", "Support sales VAT treatment", "Retain sales invoices, EFRIS evidence, contracts, delivery or export evidence and the basis for standard, zero-rated or exempt treatment.", "Confirm the statutory classification and evidence requirements for each material category.", "high"],
            ["audit-vat-purchases", "Substantiate input VAT claims", "Keep supplier tax invoices or EFRIS records, contracts, proof of receipt, payment evidence and business-use details.", "Identify blocked, exempt-use, private-use, late or disputed claims before the audit meeting.", "high"],
            ["audit-customs", "Match customs entries to imports and exports", "Reconcile customs declarations, HS codes, customs value, origin evidence, freight, duty, import VAT and inventory or sales records.", "Preserve certificates of origin, shipping records, broker statements and customs assessments.", "medium"],
            ["audit-stock", "Reconcile inventory and goods movements", "Prepare count sheets, stock movement reports, costing methodology, write-offs and links between purchases and sales.", "Explain quantity, valuation, wastage and cut-off differences using contemporaneous records.", "medium"],
          ],
        },
        {
          name: "PAYE, withholding and statutory payments",
          items: [
            ["audit-payroll", "Reconcile payroll, PAYE and employment benefits", "Tie payroll registers and employee benefits to PAYE returns, general-ledger expenses and payment evidence.", "Support residency, work location, allowances, benefits, termination payments and exemptions with records.", "high"],
            ["audit-nssf", "Reconcile NSSF and other employment contributions", "Compare employee and employer schedules, payroll deductions, submissions, remittances and account statements.", "Investigate late, missing or mismatched periods separately from income tax.", "medium"],
            ["audit-wht", "Reconcile withholding tax obligations", "Tie payments by category and recipient to contracts, invoices, WHT returns, certificates, remittances and ledger accounts.", "Check resident/non-resident status, payment type, applicable rate, timing and any claimed treaty documents.", "high"],
            ["audit-suppliers", "Validate supplier and EFRIS documentation", "For material supplier costs, retain contracts, invoices, TIN details, proof of delivery and EFRIS records when required.", "Flag unsupported, duplicate, personal or related-party costs for review before explaining them.", "medium"],
            ["audit-tax-payments", "Match returns and assessments to payments", "Tie filed returns, provisional payments, assessments, bank receipts and URA account statements by tax type and period.", "List unexplained balances, arrears, credits and disputed assessments separately.", "high"],
          ],
        },
        {
          name: "Evidence, review and follow-up",
          items: [
            ["audit-documents", "Index evidence to each request and tax position", "Use a numbered evidence index that links each auditor request to the exact record, period, amount and responsible reviewer.", "Keep a duplicate submission set and proof of delivery; do not send originals unless formally required and tracked.", "medium"],
            ["audit-reconciliations", "Prepare explanations for material variances", "Document the cause, amount, tax effect, source records and proposed correction or reason no adjustment is required.", "Separate verified facts from estimates, assumptions and unresolved issues.", "high"],
            ["audit-quality", "Have a competent reviewer check the response", "Review completeness, arithmetic, consistency between returns and schedules, confidentiality and authorized sign-off before submission.", "Get specialist advice on disputed law, privilege, significant exposures or proposed adjustments.", "medium"],
            ["audit-meeting", "Prepare a factual meeting pack and attendee roles", "Bring the notice, request register, indexed records, reconciliations, contact list and people who understand the underlying transactions.", "Answer from evidence; record questions, items taken away and agreed next actions.", "medium"],
            ["audit-outcome", "Log findings, assessments and objection deadlines", "Record draft findings, final assessments, payment instructions, reasons, dates received, action owners and supporting documents.", "Promptly verify objection, review and payment deadlines from the governing law and notice; do not rely on this checklist for dates.", "high"],
          ],
        },
      ],
    },
    health: {
      label: "Tax health check",
      intro: "Use this screening to find gaps for follow-up across the business. It is not a compliance certificate, audit opinion, tax calculation or guarantee that URA will agree with a treatment.",
      categories: [
        {
          name: "Governance, registration and filing",
          items: [
            ["health-registration", "Tax registrations match the business activities", "Review entity, branch, VAT, employer, customs and other registrations against actual operations, locations and thresholds.", "Confirm registration or deregistration requirements with URA for each activity and period.", "high"],
            ["health-obligations", "Maintain a tax calendar and filing ownership", "List required returns, payment dates, responsible preparers, approvers, proof of submission and contingency cover.", "Compare the calendar with the current law and actual URA account; filing obligations may apply even where no tax is due.", "high"],
            ["health-returns", "Returns are complete and agree to source records", "Check filing acknowledgements and reconcile return figures to the ledger, payroll, sales, purchases and payment records.", "Investigate missing periods, nil returns, late filings, amended returns and recurring manual adjustments.", "high"],
            ["health-ura-account", "URA account balances are periodically reconciled", "Compare statements and assessments with filed returns, payments, credits, objections and the accounting ledger.", "Escalate unapplied payments, unexplained arrears, credits or open assessments.", "high"],
          ],
        },
        {
          name: "Income tax and accounting controls",
          items: [
            ["health-income-completeness", "Revenue completeness and cut-off are tested", "Compare sales records with EFRIS where applicable, contracts, bank receipts, inventory movements and subsequent credit notes.", "Investigate differences, manual journals, unusual margins and income recorded in a different period.", "high"],
            ["health-tax-reconciliation", "Annual income-tax reconciliation is documented", "Review accounting profit, tax adjustments, exempt income, capital allowances, losses and tax credits against filed returns.", "Retain a reviewer-approved bridge from financial statements to taxable income.", "high"],
            ["health-expenses", "Material deductions have business-purpose evidence", "Sample material expenses for contracts, valid invoices, delivery evidence, payment, business purpose and any statutory documentation requirements.", "Review personal, capital, related-party, unsupported and recoverable costs before deduction.", "high"],
            ["health-losses-assets", "Loss and asset schedules roll forward accurately", "Agree assessed losses and capital-allowance pools to prior returns, assessments, asset registers, acquisitions and disposals.", "Do not claim a loss, credit or allowance without period-by-period support and eligibility checks.", "medium"],
          ],
        },
        {
          name: "VAT, invoicing and indirect taxes",
          items: [
            ["health-vat-registration", "VAT registration status and taxable turnover are monitored", "Track taxable supplies by month and rolling statutory periods; review new products, branches and changes in activity.", "Confirm current thresholds, special rules and registration dates with URA.", "high"],
            ["health-vat-output", "Output VAT classifications and rates are reviewed", "Map products and services to the correct VAT treatment and reconcile invoice tax to VAT returns.", "Check exempt and zero-rated classifications and retain required supporting evidence.", "high"],
            ["health-efris", "EFRIS processes cover relevant sales and purchases", "Test invoice issuance, credit notes, system access, outage procedures, supplier evidence and reconciliation to returns.", "Investigate manual workarounds, missing invoices, duplicates and gaps in transaction sequences.", "high"],
            ["health-input-vat", "Input VAT claims are supported and recoverability reviewed", "Check valid invoices, business use, timing, exempt/private use restrictions, import evidence and return-period treatment.", "Remove unsupported or ineligible amounts only after reviewing the governing rules and correction process.", "high"],
            ["health-customs", "Customs and excise classifications are periodically validated", "Review HS codes, customs valuation, origin, duty, excise, import VAT and broker declarations for material goods.", "Check classification and preference evidence against current tariff rules; do not rely on supplier descriptions alone.", "medium"],
          ],
        },
        {
          name: "Payroll and withholding",
          items: [
            ["health-paye", "PAYE includes assessed taxable employment income", "Compare payroll to contracts, allowances, benefits, reimbursements, share awards, termination amounts and employee records.", "Review benefits, residence, work locations, exceptions, valuation and timing against current rules.", "high"],
            ["health-paye-remit", "PAYE filings and remittances agree to payroll", "Reconcile employee-level payroll totals to filed declarations, accounting, bank payments and URA statements.", "Investigate late payments, payroll adjustments, missing employees and unexplained variances.", "high"],
            ["health-wht", "Withholding is assessed on relevant payment types", "Review supplier, landlord, professional, interest, dividend, non-resident and other payment streams, including timing.", "Confirm payer duties, tax base, rate, exemptions, treaty documentation, returns and certificates for each class.", "high"],
            ["health-wht-certificates", "Withholding certificates and tax credits are controlled", "Match certificates received or issued to the recipient, transaction, return, remittance and tax-credit schedule.", "Resolve missing certificates and avoid duplicate or unsupported credits.", "medium"],
            ["health-nssf", "NSSF and payroll statutory reconciliations are current", "Compare employee eligibility, contribution schedules, deductions, employer contributions and payment confirmations.", "Resolve unmatched balances and assess applicable social-security rules for mobile or foreign employees.", "medium"],
          ],
        },
        {
          name: "Related parties and cross-border",
          items: [
            ["health-related-parties", "Related-party transactions are identified and documented", "Maintain an entity/transaction list, agreements, invoices, service evidence, pricing rationale and approvals.", "Screen for transfer-pricing returns, documentation, financing limits and disclosure requirements under current law.", "high"],
            ["health-nonresident", "Payments to non-residents receive a documented review", "Identify income type, source, recipient residence, withholding, treaty claim, beneficial ownership and payment evidence.", "Verify the treaty in force, domestic rate, anti-abuse rules and required forms before applying relief.", "high"],
            ["health-cross-border-staff", "Cross-border work and employer obligations are tracked", "Keep workday/location records, assignment terms, payroll, benefits, immigration and social-security information.", "Assess residence, source, payroll registration, permanent establishment and treaty conditions in each country.", "medium"],
            ["health-services", "Imported services and digital supplies are screened", "Review overseas service, software, platform, royalty and management-fee invoices for VAT, withholding and income-tax treatment.", "Confirm place and use of supply, reverse charge, registration, tax base and destination-country rules.", "medium"],
            ["health-controls", "Tax control owners and incident escalation are clear", "Document who prepares and reviews returns, approves adjustments, protects records and responds to URA communications.", "Set a process to promptly escalate errors, suspected fraud, data loss, disputed tax and approaching deadlines.", "medium"],
          ],
        },
      ],
    },
  };

  function getItems(mode) {
    if (!modes[mode]) throw new RangeError("Choose audit readiness or tax health check.");
    return modes[mode].categories.flatMap((category) => (
      category.items.map(([id, title, evidence, action, priority]) => ({
        id,
        title,
        evidence,
        action,
        priority,
        category: category.name,
      }))
    ));
  }

  function summarize(mode, responses = {}) {
    const items = getItems(mode);
    const counts = { unreviewed: 0, ready: 0, action: 0, na: 0 };
    const actions = [];
    for (const item of items) {
      const status = statuses.includes(responses[item.id]) ? responses[item.id] : "unreviewed";
      counts[status] += 1;
      if (status === "action") actions.push(item);
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    return {
      total: items.length,
      counts,
      reviewed: counts.ready + counts.action + counts.na,
      completionPercent: items.length === 0
        ? 0
        : Math.round((counts.ready + counts.action + counts.na) / items.length * 100),
      actions,
    };
  }

  function createReport(mode, responses = {}, period = "") {
    if (!modes[mode]) throw new RangeError("Choose audit readiness or tax health check.");
    const summary = summarize(mode, responses);
    const lines = [
      `TaxComp ${modes[mode].label} report`,
      `Prepared: ${new Date().toISOString().slice(0, 10)}`,
      `Tax period: ${String(period).replace(/[\r\n]/g, " ").trim() || "Not specified"}`,
      "",
      "This is a user-completed readiness checklist, not a tax filing, compliance certificate, audit opinion or legal advice.",
      `Progress: ${summary.reviewed}/${summary.total} reviewed (${summary.completionPercent}%).`,
      `Ready: ${summary.counts.ready} | Action needed: ${summary.counts.action} | Not applicable: ${summary.counts.na} | Not reviewed: ${summary.counts.unreviewed}`,
      "",
    ];

    for (const category of modes[mode].categories) {
      lines.push(category.name);
      for (const [id, title, , action] of category.items) {
        const status = statuses.includes(responses[id]) ? responses[id] : "unreviewed";
        lines.push(`- [${status.toUpperCase()}] ${title}`);
        if (status === "action") lines.push(`  Follow up: ${action}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  function initialize() {
    const root = document.querySelector("#audit-health");
    if (!root) return;

    const modeSelect = root.querySelector("#audit-health-mode");
    const periodInput = root.querySelector("#audit-health-period");
    const checklist = root.querySelector("#audit-health-checklist");
    const summary = root.querySelector("#audit-health-summary");
    const actions = root.querySelector("#audit-health-actions");
    const notice = root.querySelector("#audit-health-notice");
    const saveStatus = root.querySelector("#audit-health-save-status");
    const reportButton = root.querySelector("#audit-health-download");
    const printButton = root.querySelector("#audit-health-print");
    const resetButton = root.querySelector("#audit-health-reset");
    let responses = {};
    let currentMode = modeSelect.value;
    let storageAvailable = true;

    function setNotice(message, isError = false) {
      notice.textContent = message;
      notice.classList.toggle("is-error", isError);
      notice.hidden = !message;
    }

    function renderSummary() {
      const result = summarize(currentMode, responses);
      summary.replaceChildren();
      const countItems = [
        ["Reviewed", result.reviewed],
        ["Ready", result.counts.ready],
        ["Action needed", result.counts.action],
        ["Not applicable", result.counts.na],
        ["Not reviewed", result.counts.unreviewed],
      ];
      for (const [label, count] of countItems) {
        const card = document.createElement("div");
        card.className = "audit-health-stat";
        const amount = document.createElement("strong");
        amount.textContent = `${count}`;
        const caption = document.createElement("span");
        caption.textContent = label;
        card.append(amount, caption);
        summary.append(card);
      }

      actions.replaceChildren();
      if (result.actions.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No items are currently marked “Action needed.” Review all items; this is not a finding of compliance.";
        actions.append(empty);
        return;
      }
      const heading = document.createElement("h3");
      heading.textContent = "Prioritized follow-up";
      const list = document.createElement("ol");
      for (const item of result.actions) {
        const entry = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = `${item.priority === "high" ? "High priority" : "Follow-up"} · ${item.title}`;
        const instruction = document.createElement("p");
        instruction.textContent = item.action;
        entry.append(title, instruction);
        list.append(entry);
      }
      actions.append(heading, list);
    }

    function save() {
      if (!storageAvailable) return;
      try {
        const current = JSON.parse(localStorage.getItem(storageKey) || "{}");
        const state = current && typeof current === "object" && !Array.isArray(current)
          ? current
          : {};
        state[currentMode] = {
          period: periodInput.value,
          responses,
        };
        localStorage.setItem(storageKey, JSON.stringify(state));
        saveStatus.textContent = "Progress saved only in this browser on this device. No records or company data are uploaded.";
      } catch {
        storageAvailable = false;
        saveStatus.textContent = "This browser could not save progress locally. Your current checklist remains available until you close or reload this page.";
        setNotice("Local saving is unavailable in this browser. You can still print or download a report before leaving this page.", true);
      }
    }

    function renderChecklist() {
      currentMode = modeSelect.value;
      const mode = modes[currentMode];
      checklist.replaceChildren();
      root.querySelector("#audit-health-mode-description").textContent = mode.intro;
      for (const category of mode.categories) {
        const group = document.createElement("section");
        group.className = "audit-health-category";
        const heading = document.createElement("h3");
        heading.textContent = category.name;
        group.append(heading);
        for (const [id, title, evidence, action, priority] of category.items) {
          const card = document.createElement("article");
          card.className = "audit-health-item";
          const top = document.createElement("div");
          top.className = "audit-health-item-heading";
          const itemHeading = document.createElement("h4");
          itemHeading.textContent = title;
          const badge = document.createElement("span");
          badge.className = `audit-health-priority priority-${priority}`;
          badge.textContent = `${priority} priority`;
          top.append(itemHeading, badge);
          const evidenceText = document.createElement("p");
          evidenceText.textContent = evidence;
          const followUpLabel = document.createElement("strong");
          followUpLabel.className = "audit-health-follow-label";
          followUpLabel.textContent = "If review is needed";
          const followUp = document.createElement("p");
          followUp.className = "audit-health-follow";
          followUp.textContent = action;
          const label = document.createElement("label");
          label.htmlFor = `audit-status-${id}`;
          label.textContent = `Review status for ${title}`;
          const select = document.createElement("select");
          select.id = `audit-status-${id}`;
          select.dataset.checkId = id;
          for (const [value, text] of [
            ["unreviewed", "Not reviewed"],
            ["ready", "Reviewed — evidence ready"],
            ["action", "Action needed"],
            ["na", "Not applicable — confirm"],
          ]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            select.append(option);
          }
          select.value = statuses.includes(responses[id]) ? responses[id] : "unreviewed";
          card.append(top, evidenceText, followUpLabel, followUp, label, select);
          group.append(card);
        }
        checklist.append(group);
      }
      renderSummary();
    }

    function loadState() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
          throw new TypeError("Saved checklist data has an unexpected format.");
        }
        const savedMode = saved[currentMode];
        if (!savedMode) return;
        if (typeof savedMode !== "object" || Array.isArray(savedMode)) {
          throw new TypeError("Saved checklist data has an unexpected format.");
        }
        const validIds = new Set(getItems(currentMode).map((item) => item.id));
        const nextResponses = {};
        for (const [id, value] of Object.entries(savedMode.responses || {})) {
          if (validIds.has(id) && statuses.includes(value)) nextResponses[id] = value;
        }
        responses = nextResponses;
        periodInput.value = typeof savedMode.period === "string"
          ? savedMode.period.slice(0, 80)
          : "";
        saveStatus.textContent = "Loaded this device’s saved checklist progress.";
      } catch (error) {
        storageAvailable = false;
        setNotice("Saved checklist progress could not be read, so this session starts blank. Existing browser data was not deleted.", true);
        saveStatus.textContent = error instanceof SyntaxError
          ? "Saved checklist data is unreadable."
          : "Local storage is unavailable.";
      }
    }

    modeSelect.addEventListener("change", () => {
      responses = {};
      periodInput.value = "";
      currentMode = modeSelect.value;
      loadState();
      renderChecklist();
      save();
    });

    checklist.addEventListener("change", (event) => {
      const select = event.target.closest("[data-check-id]");
      if (!select) return;
      responses[select.dataset.checkId] = select.value;
      renderSummary();
      save();
    });

    periodInput.addEventListener("input", save);

    reportButton.addEventListener("click", () => {
      const report = createReport(currentMode, responses, periodInput.value);
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `taxcomp-${currentMode}-check.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Report downloaded. It contains only the checklist statuses and optional period you entered; review it before sharing.");
    });

    printButton.addEventListener("click", () => {
      const printReport = root.querySelector("#audit-health-print-report");
      printReport.textContent = createReport(currentMode, responses, periodInput.value);
      printReport.hidden = false;
      document.body.classList.add("printing-audit-report");
      window.addEventListener("afterprint", () => {
        document.body.classList.remove("printing-audit-report");
        printReport.hidden = true;
      }, { once: true });
      window.print();
    });

    resetButton.addEventListener("click", () => {
      if (!window.confirm("Clear this mode's saved checklist progress from this browser?")) return;
      responses = {};
      periodInput.value = "";
      if (storageAvailable) {
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
          if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            delete saved[currentMode];
            localStorage.setItem(storageKey, JSON.stringify(saved));
          }
        } catch {
          storageAvailable = false;
          setNotice("The checklist was cleared on screen, but saved progress could not be updated in local storage.", true);
        }
      }
      renderChecklist();
      if (storageAvailable) saveStatus.textContent = "This mode’s saved checklist was cleared from this browser.";
    });

    loadState();
    renderChecklist();
  }

  return { createReport, getItems, modes, summarize, initialize };
});
