// Uganda tax law structure (law-index.json): the Parts, section numbers and
// headings of the tax Acts and regulations, as in the 2024 revised edition
// at FY 2024/25. Structure only — no section wording.
//
// Renders the "Structure of the tax Acts" list in the Knowledge Centre (so
// kb-search.js can find a section by its heading) and lets the guided
// international answer cite sections by number and heading.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.taxCompLawIndex = api;
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => api.initialize());
      else api.initialize();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SOURCE = "law-index.json?v=2024-25-1";
  let loading = null;

  /** Loads the index once (cached by the service worker for offline use). */
  function load() {
    if (!loading) {
      loading = fetch(SOURCE, { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return loading;
  }

  function instrument(index, id) {
    return index?.instruments?.find((item) => item.id === id) || null;
  }

  /** Sections of one instrument whose heading matches the pattern, in printed order. */
  function findSections(index, id, pattern) {
    const found = [];
    const act = instrument(index, id);
    if (!act) return found;
    for (const part of act.parts) {
      for (const division of part.divisions) {
        for (const item of division.items) if (pattern.test(item.heading)) found.push({ ...item, part: part.part, partTitle: part.title });
      }
    }
    return found;
  }

  /**
   * "Income Tax Act: s.80 Foreign tax credit; s.88 International agreements".
   * refs: [[instrumentId, RegExp], ...]. Instruments are grouped in the order first named.
   */
  function cite(index, refs) {
    if (!index) return "";
    const groups = new Map();
    for (const [id, pattern] of refs) {
      const act = instrument(index, id);
      if (!act) continue;
      const list = groups.get(id) || [];
      for (const item of findSections(index, id, pattern)) if (!list.some((x) => x.section === item.section)) list.push(item);
      groups.set(id, list);
    }
    return [...groups].filter(([, list]) => list.length).map(([id, list]) => {
      const act = instrument(index, id);
      const mark = act.kind === "act" ? "s." : "reg. ";
      return `${act.title}${act.cap ? ` (Cap. ${act.cap})` : ""}: ${list.map((item) => `${mark}${item.section} ${item.heading}`).join("; ")}`;
    }).join(" · ");
  }

  // ------------------------------------------------------------------ page
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function render(container, index) {
    const acts = index.instruments;
    const items = acts.map((act) => {
      const label = act.kind === "act" ? "section" : "regulation";
      const meta = [act.cap ? `Cap. ${act.cap}` : act.statutoryInstrument ? `SI ${act.statutoryInstrument}` : null,
        act.commencement ? `commenced ${new Date(`${act.commencement}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : null, act.enablingProvision, `${act.sectionCount} ${label}s`].filter(Boolean).join(" · ");
      const body = [];
      for (const part of act.parts) {
        if (part.part) body.push(el("h4", { className: "law-index-part", text: `Part ${part.part}${part.title ? ` – ${part.title}` : ""}` }));
        for (const division of part.divisions) {
          if (division.title) body.push(el("p", { className: "law-index-division", text: division.title }));
          body.push(el("ul", { className: "law-index-sections" }, division.items.map((item) => el("li", {}, [el("span", { className: "law-index-number", text: `${item.section}.` }), ` ${item.heading}`]))));
        }
      }
      if (act.schedules.length) body.push(el("p", { className: "law-index-division", text: "Schedules" }), el("ul", { className: "law-index-sections" }, act.schedules.map((s) => el("li", { text: s }))));
      return el("details", { className: "law-index-act", "data-law": act.id }, [el("summary", { text: act.title }), el("p", { className: "law-index-meta", text: meta }), ...body]);
    });
    container.replaceChildren(
      el("p", { className: "ch-muted", text: `${index.edition}. Section numbers and headings only, to help you find the right provision; read the official text before relying on it. ${index.caveats.join(" ")}` }),
      ...items,
    );
  }

  async function initialize() {
    const container = typeof document !== "undefined" ? document.querySelector("#kb-law-index") : null;
    if (!container) return;
    const index = await load();
    if (!index) {
      container.replaceChildren(el("p", { className: "ch-muted", text: "The structure of the Acts could not be loaded right now." }));
      return;
    }
    render(container, index);
  }

  return { load, findSections, cite, initialize, render };
});
