// Page views for the single-page site (2026-11 redesign).
// Every existing section stays in index.html; this script only decides which
// group of sections (a "view") is on screen. It never touches sign-in state
// (account.js owns <html data-auth>), and it leaves Supabase auth fragments
// (#access_token=…, #type=recovery, #…?…) alone for account.js / phase6-app.js.
(function siteRouter() {
  const VIEWS = ["home", "tools", "knowledge", "assistant", "workspace", "about"];
  const root = document.documentElement;
  let currentView = "";

  function isAuthFragment(hash) {
    return hash.includes("=") || hash.includes("?");
  }

  function setView(view) {
    if (!VIEWS.includes(view)) view = "home";
    root.dataset.view = view;
    currentView = view;
    document.querySelectorAll("[data-nav-view]").forEach((link) => {
      if (link.dataset.navView === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    closeMenus();
  }

  function setPane(pane) {
    const panes = document.querySelectorAll("[data-pane]");
    if (!panes.length) return;
    if (![...panes].some((node) => node.dataset.pane === pane)) pane = panes[0].dataset.pane;
    panes.forEach((node) => { node.hidden = node.dataset.pane !== pane; });
    document.querySelectorAll("[data-pane-link]").forEach((link) => {
      if (link.dataset.paneLink === pane) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function setKnowledgeFilter(filter) {
    const sections = document.querySelectorAll("[data-kb]");
    const valid = filter === "all" || [...sections].some((node) => node.dataset.kb.split(" ").includes(filter));
    if (!valid) filter = "all";
    sections.forEach((node) => {
      node.classList.toggle("is-filtered-out", filter !== "all" && !node.dataset.kb.split(" ").includes(filter));
    });
    document.querySelectorAll("[data-kb-filter]").forEach((chip) => {
      chip.setAttribute("aria-pressed", String(chip.dataset.kbFilter === filter));
    });
  }

  // Tax Tools shows either the catalogue or one tool, never everything at once.
  const TOOL_SECTIONS = ["tools", "estimator", "multi-tax-analysis", "international-tax"];
  function setToolFocus(id) {
    root.dataset.toolFocus = TOOL_SECTIONS.includes(id) ? id : "tools";
  }

  // Make sure an element is actually on screen before something scrolls to it
  // (calculator links in chat answers, "Get Premium" links, legacy anchors).
  function reveal(element) {
    const viewNode = element.closest("[data-view]");
    if (viewNode) {
      const view = viewNode.dataset.view.split(" ")[0];
      if (view !== currentView) {
        setView(view);
        // Keep the address in step so the nav link for the old view still works.
        if (!isAuthFragment(window.location.hash) && element.id) {
          history.replaceState(null, "", `#${element.id}`);
        }
      }
    }
    const toolNode = element.closest("main > [data-view~='tools']");
    if (toolNode && root.dataset.toolFocus !== toolNode.id) setToolFocus(toolNode.id);
    const paneNode = element.closest("[data-pane]");
    if (paneNode && paneNode.hidden) setPane(paneNode.dataset.pane);
    const kbNode = element.closest("[data-kb]");
    if (kbNode && kbNode.classList.contains("is-filtered-out")) setKnowledgeFilter("all");
  }

  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoViewRevealed(...args) {
    try { reveal(this); } catch { /* never block the scroll */ }
    return nativeScrollIntoView.apply(this, args);
  };

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function route() {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (isAuthFragment(hash)) {
      if (!currentView) setView("home");
      return;
    }
    if (!hash) { setView("home"); scrollToTop(); return; }
    if (VIEWS.includes(hash)) {
      setView(hash);
      if (hash === "tools") setToolFocus("tools");
      if (hash === "knowledge") setKnowledgeFilter("all");
      if (hash === "workspace") setPane("overview");
      scrollToTop();
      return;
    }
    if (hash.startsWith("calc-")) {
      setView("tools");
      setToolFocus("estimator");
      const tab =document.getElementById(`tab-${hash.slice(5)}`);
      if (tab) tab.click();
      const target = document.getElementById("estimator");
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      return;
    }
    if (hash.startsWith("kb-")) {
      setView("knowledge");
      setKnowledgeFilter(hash.slice(3));
      scrollToTop();
      return;
    }
    if (hash.startsWith("ws-")) {
      setView("workspace");
      setPane(hash.slice(3));
      scrollToTop();
      return;
    }
    const target = document.getElementById(hash);
    if (target) {
      reveal(target);
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      return;
    }
    setView("home");
  }

  // Header dropdowns and the phone menu.
  function closeMenus(except) {
    document.querySelectorAll("[data-menu-toggle][aria-expanded='true']").forEach((button) => {
      if (button !== except) button.setAttribute("aria-expanded", "false");
    });
  }

  function wireHeader() {
    document.querySelectorAll("[data-menu-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = button.getAttribute("aria-expanded") !== "true";
        closeMenus(button);
        button.setAttribute("aria-expanded", String(open));
      });
    });
    const navToggle = document.getElementById("site-nav-toggle");
    if (navToggle) {
      navToggle.addEventListener("click", () => {
        const open = navToggle.getAttribute("aria-expanded") !== "true";
        navToggle.setAttribute("aria-expanded", String(open));
        root.classList.toggle("nav-open", open);
      });
    }
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-menu]")) closeMenus();
      // A link to the hash we're already on fires no hashchange: route anyway.
      const link = event.target.closest('a[href^="#"]');
      if (link && link.getAttribute("href") === window.location.hash && link.getAttribute("href").length > 1) {
        event.preventDefault();
        route();
      }
      if (event.target.closest(".site-nav a")) {
        root.classList.remove("nav-open");
        if (navToggle) navToggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenus();
    });
  }

  // Knowledge filter chips + workspace sidebar buttons.
  function wireControls() {
    document.querySelectorAll("[data-kb-filter]").forEach((chip) => {
      chip.addEventListener("click", () => setKnowledgeFilter(chip.dataset.kbFilter));
    });
  }

  // Tax Tools catalogue: search + category filter (cards are static links).
  function wireCatalogue() {
    const search = document.getElementById("tool-search");
    const chips = document.querySelectorAll("[data-tool-filter]");
    const cards = document.querySelectorAll("[data-tool-card]");
    const empty = document.getElementById("tool-search-empty");
    if (!cards.length) return;
    let category = "all";
    function apply() {
      const words = (search ? search.value : "").toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      cards.forEach((card) => {
        const text = card.textContent.toLowerCase() + " " + (card.dataset.keywords || "");
        const inCategory = category === "all" || card.dataset.toolCard.split(" ").includes(category);
        const visible = inCategory && words.every((word) => text.includes(word));
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      if (empty) empty.hidden = shown > 0;
    }
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        category = chip.dataset.toolFilter;
        chips.forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
        apply();
      });
    });
    if (search) search.addEventListener("input", apply);
  }

  // Home preview card: a live PAYE figure from the real calculator
  // (window.ugandaTax.calculatePaye, tax-calculator.js). No tax maths here.
  function wirePayePreview() {
    const form = document.getElementById("paye-preview");
    const input = document.getElementById("paye-preview-salary");
    if (!form || !input) return;
    const out = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    const ugx = (n) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
    function update() {
      const engine = window.ugandaTax;
      const salary = Number(input.value);
      if (!engine || typeof engine.calculatePaye !== "function" || !Number.isFinite(salary) || salary < 0) {
        ["paye-preview-tax", "paye-preview-nssf", "paye-preview-net"].forEach((id) => out(id, "—"));
        return;
      }
      try {
        const result = engine.calculatePaye(salary, true);
        out("paye-preview-tax", ugx(result.monthlyTax));
        out("paye-preview-nssf", ugx(result.monthlyEmployeeNssf));
        out("paye-preview-net", ugx(salary - result.monthlyTax - result.monthlyEmployeeNssf));
      } catch {
        ["paye-preview-tax", "paye-preview-nssf", "paye-preview-net"].forEach((id) => out(id, "—"));
      }
    }
    form.addEventListener("submit", (event) => event.preventDefault());
    input.addEventListener("input", update);
    // site-router.js loads before tax-calculator.js; DOMContentLoaded fires
    // after every deferred script has run.
    if (window.ugandaTax) update(); else window.addEventListener("DOMContentLoaded", update);
  }

  // Signed-out landing page: "Sign in" / "Get started" buttons bring the
  // sign-in card into view and pick the matching tab that account.js drew.
  const AUTH_TABS = { signup: "Create account", signin: "Sign in", reset: "Forgot password" };
  function wireAuthButtons() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-auth-mode]");
      if (!button) return;
      const card = document.getElementById("lp-signin");
      const gateRoot = document.getElementById("auth-gate-root");
      if (!card || !gateRoot) return;
      const label = AUTH_TABS[button.dataset.authMode];
      const tab = [...gateRoot.querySelectorAll(".phase6-tab")].find((node) => node.textContent.trim() === label);
      if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      // account.js re-renders on a tab click; focus the new form's first field.
      setTimeout(() => {
        const input = gateRoot.querySelector("input");
        if (input) input.focus({ preventScroll: true });
      }, 50);
    });
  }

  function start() {
    setToolFocus("tools");
    wirePayePreview();
    wireAuthButtons();
    wireHeader();
    wireControls();
    wireCatalogue();
    route();
    window.addEventListener("hashchange", route);
    const year = document.getElementById("footer-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
