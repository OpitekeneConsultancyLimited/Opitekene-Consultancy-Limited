// Structure of the tax Acts (Knowledge Centre), from the legislative database
// through the public API: GET /api/legislation, /api/legislation/{law},
// /api/legislation/{law}/sections and /api/legislation/search.
//
// Also gives the guided international answer its section citations, and
// adds tax-Act results to the Knowledge Centre search box (kb-search.js).
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

  function apiBase() {
    try {
      const meta = root.document?.querySelector('meta[name="taxcomp-chat-endpoint"]');
      return meta ? new URL(meta.content, root.location.href).origin : "";
    } catch {
      return "";
    }
  }

  async function getJson(path) {
    const response = await fetch(`${apiBase()}${path}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "The legislative database could not be reached.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  /** Converts API sections into the parts/divisions shape used by cite(). */
  function toInstrument(law, sections) {
    const parts = [];
    for (const s of sections) {
      let part = parts.at(-1);
      if (!part || part.part !== s.part.number) parts.push((part = { part: s.part.number, title: s.part.title, divisions: [] }));
      let division = part.divisions.at(-1);
      if (!division || division.title !== s.division) part.divisions.push((division = { title: s.division, items: [] }));
      division.items.push({ section: s.sectionNumber, heading: s.heading, verificationStatus: s.verificationStatus, flags: s.flags });
    }
    return {
      id: law.id, title: law.officialTitle, cap: law.chapter ? law.chapter.replace(/^Cap\.\s*/, "") : null, kind: law.category === "act" ? "act" : "regulations",
      verificationStatus: law.verificationStatus, parts,
    };
  }

  const cache = new Map();
  /** Sections of the given laws from the API, in the shape cite() expects. Null if unavailable. */
  async function load(ids = ["ita", "vata", "tpca", "ita-reg-transfer-pricing-2011"]) {
    const key = ids.join(",");
    if (!cache.has(key)) {
      cache.set(key, Promise.all(ids.map(async (id) => {
        const data = await getJson(`/api/legislation/${encodeURIComponent(id)}/sections?pageSize=200`);
        return toInstrument(data.law, data.sections);
      })).then((instruments) => ({ instruments, source: "database" })).catch(() => {
        cache.delete(key);
        return null;
      }));
    }
    return cache.get(key);
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
   * "Income Tax Act (Cap. 338): s.80 Foreign tax credit; s.88 International agreements".
   * refs: [[lawId, RegExp], ...]. Laws are grouped in the order first named.
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

  const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const sectionAnchor = (lawId, number) => `law-${lawId}-s${number}`;
  const badge = (status, label) => el("span", { className: `law-status is-${status}`, text: label });

  async function fillAct(details, law) {
    if (details.dataset.loaded) return;
    details.dataset.loaded = "loading";
    const body = details.querySelector(".law-index-body");
    try {
      const [detail, sections, changes] = await Promise.all([getJson(`/api/legislation/${law.id}`), getJson(`/api/legislation/${law.id}/sections?pageSize=200`),
        getJson(`/api/legislation/amendments?law=${encodeURIComponent(law.id)}`).catch(() => null)]);
      const amendedSections = amendedBySection(changes);
      const nodes = [];
      let part = null;
      let division;
      let list = null;
      for (const s of sections.sections) {
        if (!part || part.number !== s.part.number) {
          part = s.part;
          division = undefined;
          if (part.number) nodes.push(el("h4", { className: "law-index-part", text: `Part ${part.number}${part.title ? ` – ${part.title}` : ""}` }));
        }
        if (division !== s.division) {
          division = s.division;
          if (division) nodes.push(el("p", { className: "law-index-division", text: division }));
          list = null;
        }
        if (!list) nodes.push((list = el("ul", { className: "law-index-sections" })));
        list.append(el("li", { id: sectionAnchor(law.id, s.sectionNumber), "data-section": s.sectionNumber }, [
          el("span", { className: "law-index-number", text: `${s.sectionNumber}.` }), ` ${s.heading}`,
          s.flags.includes("numbering-check") ? el("span", { className: "law-index-flag", text: " (numbering to be checked)" }) : null,
          s.verificationStatus !== "unverified" ? el("span", { text: " " }) : null, s.verificationStatus !== "unverified" ? badge(s.verificationStatus, s.verificationLabel) : null,
          amendedSections.has(s.sectionNumber) ? el("span", { className: "law-amended-mark", title: amendedSections.get(s.sectionNumber).map((a) => `${a.amendingTitle}: ${a.summary} (${a.evidenceLabel})`).join(" | "), text: amendedSections.get(s.sectionNumber).some((a) => a.evidence === "bill_only") && amendedSections.get(s.sectionNumber).every((a) => a.evidence === "bill_only") ? "Bill proposed a 2026 change" : "Amended in 2026" }) : null,
        ]));
      }
      if (detail.schedules.length) {
        nodes.push(el("p", { className: "law-index-division", text: "Schedules" }),
          el("ul", { className: "law-index-sections" }, detail.schedules.map((s) => el("li", { text: `${s.label}${s.title ? ` – ${s.title}` : ""}` }))));
      }
      const related = detail.related.filter((r) => !r.from.sectionId && !r.to.sectionId);
      if (related.length) nodes.push(el("p", { className: "law-index-meta", text: `Related: ${related.map((r) => (r.from.lawId === law.id ? r.to.title : r.from.title)).join("; ")}` }));
      body.replaceChildren(...nodes);
      details.dataset.loaded = "1";
    } catch (error) {
      delete details.dataset.loaded;
      body.replaceChildren(el("p", { className: "ch-muted", text: `${error.message} Try again later.` }));
    }
  }

  function actDetails(law) {
    const label = law.category === "act" ? "sections" : "regulations";
    const meta = [law.chapter, law.statutoryInstrument ? `SI ${law.statutoryInstrument}` : null, law.commencementDate ? `commenced ${formatDate(law.commencementDate)}` : null,
      law.enablingProvision, `${law.sectionCount} ${label}`, law.scheduleCount ? `${law.scheduleCount} schedule${law.scheduleCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
    const details = el("details", { className: "law-index-act", "data-law": law.id }, [
      el("summary", {}, [law.officialTitle, " ", badge(law.verificationStatus, law.verificationLabel)]),
      el("p", { className: "law-index-meta", text: meta }),
      law.laterAmendments.length ? el("p", { className: "law-index-meta law-index-warn", text: `Not reflected here: ${law.laterAmendments.map((a) => a.title).join("; ")}.` }) : null,
      el("div", { className: "law-index-body" }, [el("p", { className: "ch-muted", text: "Loading…" })]),
    ]);
    details.addEventListener("toggle", () => { if (details.open) fillAct(details, law); });
    return details;
  }

  /** Opens an Act, loads it if needed, and shows one section. */
  async function showSection(lawId, number) {
    const details = document.querySelector(`details[data-law="${lawId}"]`);
    if (!details) return;
    details.open = true;
    for (let i = 0; i < 40 && details.dataset.loaded !== "1"; i++) await new Promise((r) => setTimeout(r, 100));
    const target = document.getElementById(sectionAnchor(lawId, number));
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.classList.add("kb-hit");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    setTimeout(() => target.classList.remove("kb-hit"), 2400);
  }

  /** Register records grouped by amending Act, in register order. */
  function groupAmendments(data) {
    const groups = new Map();
    for (const act of data?.acts || []) groups.set(act.id, { act, changes: [] });
    for (const a of data?.amendments || []) {
      if (!groups.has(a.amendingStatuteId)) groups.set(a.amendingStatuteId, { act: { id: a.amendingStatuteId, title: a.amendingTitle }, changes: [] });
      groups.get(a.amendingStatuteId).changes.push(a);
    }
    return [...groups.values()].filter((g) => g.changes.length);
  }

  function figureLines(a) {
    return [
      a.previousFigure ? ["Before", a.previousFigure] : null,
      a.billFigure ? ["Published Bill", a.billFigure] : null,
      a.reportedFigure ? ["Reported as enacted", a.reportedFigure] : null,
    ].filter(Boolean);
  }

  /** Section number → the 2026 changes recorded against it (knowledge-graph link from a section to its amendments). */
  function amendedBySection(data) {
    const map = new Map();
    for (const a of data?.amendments || []) {
      if (!a.sectionNumber) continue;
      if (!map.has(a.sectionNumber)) map.set(a.sectionNumber, []);
      map.get(a.sectionNumber).push(a);
    }
    return map;
  }

  // Changes most people ask about, shown first as before-and-after cards.
  const HEADLINE_CHANGES = ["vat-2026-s7-registration-threshold", "eda-2026-motor-spirit", "eda-2026-gas-oil", "eda-2026-cement", "eda-2026-sugar", "sda-2026-item67-vehicles"];

  /** Before and after for one change; when the Bill and the reported Act differ, both. */
  function beforeAfter(a) {
    const after = a.figuresDiffer && a.billFigure && a.reportedFigure
      ? [["Published Bill", a.billFigure], ["Reported as enacted", a.reportedFigure]]
      : [[a.reportedFigure ? "Reported as enacted" : "Published Bill", a.reportedFigure || a.billFigure]];
    return { before: a.previousFigure || "None", after: after.filter(([, v]) => v) };
  }

  function headlineCards(data) {
    const byId = new Map((data?.amendments || []).map((a) => [a.id, a]));
    const picked = HEADLINE_CHANGES.map((id) => byId.get(id)).filter(Boolean);
    if (!picked.length) return null;
    return el("div", { className: "law-change-cards", role: "list", "aria-label": "Key figures changed in 2026" }, picked.map((a) => {
      const { before, after } = beforeAfter(a);
      return el("article", { className: `law-change-card${a.figuresDiffer ? " is-conflict" : ""}`, role: "listitem" }, [
        el("p", { className: "law-change-title", text: `${a.summary.replace(/\.$/, "")} · ${a.provision}` }),
        el("div", { className: "law-change-pair" }, [
          el("div", { className: "law-change-before" }, [el("span", { text: "Before" }), el("strong", { text: before })]),
          el("span", { className: "law-change-arrow", "aria-hidden": "true", text: "→" }),
          el("div", { className: "law-change-after" }, after.map(([k, v]) => el("p", {}, [el("span", { text: k }), el("strong", { text: v })]))),
        ]),
        el("p", { className: "law-index-meta" }, [a.figuresDiffer ? el("span", { className: "law-index-warn", text: "Figures differ: check the enacted Act. " }) : null, `From ${a.effectiveFrom ? formatDate(a.effectiveFrom) : "a date not confirmed"} · `, badge(a.verificationStatus, a.verificationLabel)]),
      ]);
    }));
  }

  function actStatusText(act) {
    if (act.billStatus === "bill") return "Bill only: no report of its passing was found";
    const parts = [];
    if (act.assentDate) parts.push(`assent reported ${formatDate(act.assentDate)}`);
    else parts.push(act.billStatus === "passed" ? "passed; assent not confirmed" : "assent date not confirmed");
    if (act.commencementDate || act.appliesFrom) parts.push(`applies from ${formatDate(act.commencementDate || act.appliesFrom)}`);
    return parts.join(" · ");
  }

  function amendmentsSection(data) {
    const groups = groupAmendments(data);
    if (!groups.length) return null;
    const conflicts = data.amendments.filter((a) => a.figuresDiffer).length;
    return el("details", { className: "law-amendments" }, [
      el("summary", { text: `Changes made in 2026 (${data.amendments.length})` }),
      el("p", { className: "ch-muted", text: `${data.note}${conflicts ? ` ${conflicts} change${conflicts === 1 ? " has" : "s have"} different figures in the Bill and in the reports of the enacted Act: both are shown.` : ""}` }),
      headlineCards(data),
      ...groups.map(({ act, changes }) => el("section", { className: "law-amendments-act" }, [
        el("h4", { text: act.title }),
        el("p", { className: "law-index-meta", text: [actStatusText(act), act.principalTitle ? `amends the ${act.principalTitle}${act.principalChapter ? `, ${act.principalChapter}` : ""}` : null].filter(Boolean).join(" · ") }),
        el("ul", { className: "law-amendments-list" }, changes.map((a) => el("li", { className: a.figuresDiffer ? "is-conflict" : null }, [
          el("p", {}, [el("strong", { text: a.provision }), ` – ${a.summary}`]),
          figureLines(a).length ? el("dl", { className: "law-amendments-figures" }, figureLines(a).flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })])) : null,
          el("p", { className: "law-index-meta" }, [
            a.figuresDiffer ? el("span", { className: "law-index-warn", text: "Figures differ: check the enacted Act. " }) : null,
            `${a.evidenceLabel}. `, badge(a.verificationStatus, a.verificationLabel),
            a.billUrl ? el("span", { text: " " }) : null, a.billUrl ? el("a", { href: a.billUrl, target: "_blank", rel: "noopener", text: "Bill (Parliament)" }) : null,
          ]),
          a.note ? el("p", { className: "law-index-meta", text: a.note }) : null,
        ]))),
      ])),
    ]);
  }

  async function search(query) {
    const data = await getJson(`/api/legislation/search?q=${encodeURIComponent(query)}&pageSize=10`);
    return data.results;
  }

  function resultButton(s) {
    const button = el("button", { type: "button", className: "kb-search-hit" }, [
      el("span", { className: "kb-search-meta", text: `${s.lawTitle} · ${s.verificationLabel}` }),
      el("span", { className: "kb-search-snippet", text: `${s.category === "act" ? "Section" : "Regulation"} ${s.sectionNumber} – ${s.heading}` }),
    ]);
    button.addEventListener("click", () => showSection(s.lawId, s.sectionNumber));
    return button;
  }

  async function initialize() {
    const container = typeof document !== "undefined" ? document.querySelector("#kb-law-index") : null;
    if (!container) return;
    try {
      const [list, editions, amendments] = await Promise.all([getJson("/api/legislation?pageSize=100"), getJson("/api/legislation/editions"), getJson("/api/legislation/amendments").catch(() => null)]);
      const form = el("form", { className: "law-search-form", role: "search" }, [
        el("label", { for: "law-search", text: "Search the tax Acts by section number or heading" }),
        el("input", { id: "law-search", type: "search", placeholder: "e.g. foreign tax credit, or section 82", autocomplete: "off" }),
      ]);
      const results = el("div", { id: "law-search-results", className: "kb-search-results", "aria-live": "polite" });
      const input = form.querySelector("input");
      let timer;
      const run = async () => {
        const query = input.value.trim();
        if (query.length < 2) { results.replaceChildren(); return; }
        try {
          const hits = await search(query);
          if (input.value.trim() !== query) return;
          results.replaceChildren(el("p", { className: "kb-search-status", text: hits.length ? `${hits.length} provision${hits.length === 1 ? "" : "s"}` : "No section heading matches. Try other words." }),
            el("ol", { className: "kb-search-list" }, hits.map((s) => el("li", {}, [resultButton(s)]))));
        } catch (error) {
          results.replaceChildren(el("p", { className: "kb-search-status", text: error.message }));
        }
      };
      input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
      form.addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(timer); run(); });
      const edition = list.edition;
      const gaps = editions.gaps.filter((g) => g.kind !== "wording_not_held");
      container.replaceChildren(
        el("p", { className: "ch-muted", text: `${edition.label}: section numbers and headings only, no wording. Every record is ${edition.verificationStatus === "verified" ? "verified" : "unverified until checked against the official Uganda Law Reform Commission edition"}.${edition.warning ? ` ${edition.warning}` : ""}` }),
        form, results,
        amendments ? amendmentsSection(amendments) : null,
        ...list.laws.map(actDetails),
        gaps.length ? el("details", { className: "law-index-gaps" }, [el("summary", { text: "Not in the database yet" }), el("ul", {}, gaps.map((g) => el("li", { text: `${g.title}. ${g.note}` })))]) : null,
      );
    } catch (error) {
      container.replaceChildren(el("p", { className: "ch-muted", text: error.status === 503 ? "The legislative database is not switched on yet." : "The structure of the Acts could not be loaded right now." }));
    }
  }

  // Tax-Act results in the Knowledge Centre search box.
  if (root.TaxCompKbSearch?.addProvider) {
    root.TaxCompKbSearch.addProvider(async (query) => {
      if (query.trim().length < 3) return [];
      const hits = await search(query.trim()).catch(() => []);
      return hits.slice(0, 5).map((s) => ({
        meta: `Tax Acts · ${s.lawTitle} · ${s.verificationLabel}`,
        text: `${s.category === "act" ? "Section" : "Regulation"} ${s.sectionNumber} – ${s.heading}`,
        select: () => showSection(s.lawId, s.sectionNumber),
      }));
    });
  }

  return { load, findSections, cite, initialize, search, showSection, toInstrument, groupAmendments, figureLines, beforeAfter, HEADLINE_CHANGES, amendedBySection };
});
