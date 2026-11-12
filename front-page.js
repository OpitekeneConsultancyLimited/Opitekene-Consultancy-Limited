// Corporate site (index.html): the 4-tab quick calculator, the phone menu,
// "print summary" and the advisory-request form.
// Every tax figure comes from the real engine (window.ugandaTax,
// tax-calculator.js, FY 2026/27 rules); this file does no tax maths itself,
// only the arithmetic of what is left after tax.
(function frontPage() {
  const WHATSAPP = "https://wa.me/256782092825";
  const $ = (id) => document.getElementById(id);
  const ugx = (n) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
  const pct = (rate) => `${Number((rate * 100).toFixed(2))}%`;
  const number = (id) => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  let active = "paye";

  function renderSummary(head, rows, label, amount, note) {
    $("pc-summary-head").textContent = head;
    const list = $("pc-summary-rows");
    list.replaceChildren(...rows.map(([term, value, tone]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value;
      if (tone) dd.dataset.tone = tone;
      row.append(dt, dd);
      return row;
    }));
    $("pc-result-label").textContent = label;
    $("pc-result-amount").textContent = amount;
    $("pc-summary-note").textContent = note || "Estimate only, not a tax filing.";
  }

  function calculate() {
    const engine = window.ugandaTax;
    if (!engine) {
      renderSummary("LOADING", [], "Calculator is loading", "—");
      return;
    }
    try {
      if (active === "paye") {
        const gross = number("pc-paye-gross");
        const result = engine.calculatePaye(gross, true);
        const net = gross - result.monthlyTax - result.monthlyEmployeeNssf;
        renderSummary("PAYE SUMMARY", [
          ["Gross Monthly Salary", ugx(gross)],
          ["PAYE Tax Liability", ugx(result.monthlyTax), "tax"],
          ["Employee NSSF", ugx(result.monthlyEmployeeNssf), "tax"],
        ], "Net Take-Home Salary", ugx(net),
        "Resident employee, one employer. NSSF is a social-security contribution, not income tax.");
        $("pc-paye-bands").replaceChildren(...result.breakdown.map((band) => {
          const item = document.createElement("li");
          item.textContent = `${band.label} a year: ${pct(band.rate)}`;
          return item;
        }));
      } else if (active === "vat") {
        const amount = number("pc-vat-amount");
        const inclusive = $("pc-vat-mode").value === "inclusive";
        const result = engine.calculateVat({ standardRatedSales: amount, salesIncludeVat: inclusive });
        const net = inclusive ? amount - result.outputVat : amount;
        renderSummary(`VAT (${engine.standardVatRatePercent}%) SUMMARY`, [
          ["Taxable Net Amount", ugx(net)],
          [`VAT (${engine.standardVatRatePercent}% standard rate)`, ugx(result.outputVat), "accent"],
          ["Total Gross Amount", ugx(net + result.outputVat)],
        ], "Calculated VAT Amount", ugx(result.outputVat),
        "Standard-rated supplies only. Zero-rated, exempt supplies and input VAT credits are in the full VAT calculator.");
      } else if (active === "wht") {
        const gross = number("pc-wht-amount");
        const result = engine.calculateWithholdingTax(gross, $("pc-wht-type").value, $("pc-wht-designated").checked);
        renderSummary("WITHHOLDING TAX (WHT) SUMMARY", [
          ["Gross Invoice Payment", ugx(gross)],
          ["WHT Rate Applied", pct(result.rate), "accent"],
          ["WHT to Remit to URA", ugx(result.tax), "tax"],
        ], "Net Amount Payable to Supplier", ugx(gross - result.tax), result.note);
      } else {
        const revenue = number("pc-cit-revenue");
        const expenses = number("pc-cit-expenses");
        const profit = Math.max(0, revenue - expenses);
        const result = engine.calculateCompanyIncomeTax(profit);
        renderSummary("CORPORATE INCOME TAX SUMMARY", [
          ["Gross Annual Revenue", ugx(revenue)],
          ["Allowable Expenses", `−${ugx(expenses)}`],
          ["Net Chargeable Profit", ugx(profit)],
          [`CIT (${pct(result.taxRate)})`, ugx(result.tax), "tax"],
        ], "Estimated CIT Tax Payable", ugx(result.tax),
        "Simplified: add-backs, capital allowances, losses and credits are not included.");
      }
    } catch (error) {
      renderSummary("CHECK YOUR FIGURES", [], "No estimate", "—", error.message);
    }
  }

  function selectTab(id) {
    active = id;
    document.querySelectorAll("[data-pc-tab]").forEach((button) => {
      const on = button.dataset.pcTab === id;
      button.setAttribute("aria-selected", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".pc-panel").forEach((panel) => {
      panel.hidden = panel.id !== `pc-panel-${id}`;
    });
    calculate();
  }

  function wireCalculator() {
    const tabs = [...document.querySelectorAll("[data-pc-tab]")];
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => selectTab(button.dataset.pcTab));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        selectTab(next.dataset.pcTab);
      });
    });
    ["pc-paye-gross", "pc-vat-mode", "pc-vat-amount", "pc-wht-amount", "pc-wht-type", "pc-wht-designated", "pc-cit-revenue", "pc-cit-expenses"]
      .forEach((id) => {
        const field = $(id);
        if (!field) return;
        field.addEventListener("input", calculate);
        field.addEventListener("change", calculate);
      });
    const rate = document.querySelector("[data-pc-vat-rate]");
    if (rate && window.ugandaTax) rate.textContent = window.ugandaTax.standardVatRatePercent;
    $("pc-print")?.addEventListener("click", () => {
      document.documentElement.classList.add("pc-printing");
      window.print();
    });
    window.addEventListener("afterprint", () => document.documentElement.classList.remove("pc-printing"));
    $("pc-request-filing")?.addEventListener("click", () => {
      $("pc-c-message").value = `Hello Opitekene Consultancy Ltd,\n\nI calculated my taxes on your site:\n[${$("pc-summary-head").textContent} -> ${$("pc-result-label").textContent}: ${$("pc-result-amount").textContent}]\n\nI request professional support for return filing and URA compliance.`;
      $("pc-c-service").value = "Tax compliance";
    });
    calculate();
  }

  function wireMenu() {
    const toggle = $("pc-menu-toggle");
    const menu = $("pc-mobile-menu");
    if (!toggle || !menu) return;
    const close = () => { menu.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
    toggle.addEventListener("click", () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.addEventListener("click", (event) => { if (event.target.closest("a, button")) close(); });
  }

  // "Request Tax Support" etc. preselect the service in the form.
  function wireServiceLinks() {
    document.querySelectorAll("[data-pc-service]").forEach((link) => {
      link.addEventListener("click", () => { $("pc-c-service").value = link.dataset.pcService; });
    });
  }

  // The form does not post anywhere: it opens WhatsApp with the request typed
  // in, and the visitor presses Send there. We say so plainly.
  function wireContactForm() {
    const form = $("pc-contact-form");
    const alert = $("pc-form-alert");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = $("pc-c-name").value.trim();
      const message = $("pc-c-message").value.trim();
      if (!name || !message) {
        alert.hidden = false;
        alert.dataset.kind = "error";
        alert.textContent = "Please enter your name and a message.";
        (name ? $("pc-c-message") : $("pc-c-name")).focus();
        return;
      }
      const email = $("pc-c-email").value.trim();
      const phone = $("pc-c-phone").value.trim();
      const lines = ["Hello Opitekene Consultancy Ltd,", "", `Name: ${name}`];
      if (email) lines.push(`Email: ${email}`);
      if (phone) lines.push(`Phone: ${phone}`);
      lines.push(`Service: ${$("pc-c-service").value}`, "", message);
      const url = `${WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
      // A real link click (not window.open, which returns null with noopener).
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
      alert.hidden = false;
      alert.dataset.kind = "success";
      alert.textContent = "WhatsApp is opening with your request. Press Send in WhatsApp to reach our team.";
    });
  }

  function start() {
    wireCalculator();
    wireMenu();
    wireServiceLinks();
    wireContactForm();
    document.querySelectorAll("[data-pc-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
