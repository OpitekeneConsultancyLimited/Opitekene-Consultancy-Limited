// Knowledge Centre search: one box across guides, laws, case law, updates and
// compliance resources (redesign brief section 8). Searches the text already
// on the page, including the law and case registers once they have loaded, so
// nothing is sent anywhere. Results respect the filter chips' categories, and
// picking one shows its section and scrolls to it.
//   rankBlocks(blocks, query, { limit }) -> hits   (pure; used by the tests)
(function kbSearch(root) {
  "use strict";

  const BLOCK_SELECTOR = "h2, h3, h4, summary, li, p, dt";
  const MIN_LENGTH = 3;

  function normalise(text) {
    return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }

  function words(query) {
    return normalise(query).split(/[^a-z0-9%]+/).filter((word) => word.length >= 2);
  }

  /**
   * Ranks text blocks for a query. Every query word must appear. Headings rank
   * above body text; earlier matches and whole-word matches rank higher.
   * blocks: [{ text, heading: boolean, kb, section, ref }]
   */
  function rankBlocks(blocks, query, { limit = 15 } = {}) {
    const terms = words(query);
    if (!terms.length) return [];
    const seen = new Set();
    const hits = [];
    for (const block of blocks) {
      const text = normalise(block.text);
      if (text.length < MIN_LENGTH || seen.has(text)) continue;
      if (!terms.every((term) => text.includes(term))) continue;
      seen.add(text);
      let score = block.heading ? 10 : 0;
      for (const term of terms) {
        if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) score += 3;
        score += Math.max(0, 2 - text.indexOf(term) / 200);
      }
      hits.push({ ...block, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** A short snippet around the first match, as text parts for <mark>. */
  function snippet(text, query, width = 160) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    const terms = words(query);
    const lower = normalise(clean);
    const first = Math.min(...terms.map((term) => lower.indexOf(term)).filter((i) => i >= 0), clean.length);
    const start = Math.max(0, first - 50);
    const piece = `${start > 0 ? "…" : ""}${clean.slice(start, start + width)}${start + width < clean.length ? "…" : ""}`;
    if (!terms.length) return [{ text: piece, mark: false }];
    const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
    return piece.split(pattern).filter(Boolean).map((part) => ({ text: part, mark: terms.includes(part.toLowerCase()) }));
  }

  // ------------------------------------------------------------ browser
  function collectBlocks(doc) {
    const blocks = [];
    for (const section of doc.querySelectorAll("main [data-kb]")) {
      const titleId = section.getAttribute("aria-labelledby");
      const sectionTitle = (titleId && doc.getElementById(titleId)?.textContent?.trim()) || section.querySelector("h2, h3")?.textContent?.trim() || "Knowledge centre";
      for (const node of section.querySelectorAll(BLOCK_SELECTOR)) {
        if (node.closest("form, script, style, [aria-hidden='true']")) continue;
        // Skip a list item or paragraph that only wraps another indexed block.
        if (node.querySelector(BLOCK_SELECTOR)) continue;
        blocks.push({ text: node.textContent || "", heading: /^H[234]$|^SUMMARY$/.test(node.tagName), kb: section.dataset.kb.split(" ")[0], section: sectionTitle, ref: node });
      }
    }
    return blocks;
  }

  function wire(doc) {
    const input = doc.getElementById("kb-search");
    const results = doc.getElementById("kb-search-results");
    if (!input || !results) return;
    const chipLabel = (kb) => doc.querySelector(`[data-kb-filter="${kb}"]`)?.textContent?.trim() || "";
    let timer = null;

    function show(element) {
      // site-router.js reveals the view and clears a filter that hides the
      // section when an element scrolls into view. (Clicking a filter chip here
      // would change the address and make the router scroll back to the top.)
      const details = element.closest("details");
      if (details) details.open = true;
      element.scrollIntoView({ block: "center" });
      element.classList.add("kb-hit");
      if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
      element.focus({ preventScroll: true });
      setTimeout(() => element.classList.remove("kb-hit"), 2400);
    }

    function statusText(count) {
      return count ? `${count} result${count === 1 ? "" : "s"}` : "Nothing found. Try fewer or different words, or ask the AI Tax Assistant.";
    }

    /** Results from providers (e.g. the tax Acts in the legislative database), added when they arrive. */
    async function addProviderResults(query, status, localCount) {
      const lists = await Promise.all(providers.map((provider) => Promise.resolve(provider(query)).catch(() => [])));
      const extra = lists.flat().filter((hit) => hit && hit.text);
      if (!extra.length || input.value !== query) return;
      const list = doc.createElement("ol");
      list.className = "kb-search-list";
      for (const hit of extra) {
        const item = doc.createElement("li");
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "kb-search-hit";
        const meta = doc.createElement("span");
        meta.className = "kb-search-meta";
        meta.textContent = hit.meta || "";
        const body = doc.createElement("span");
        body.className = "kb-search-snippet";
        body.textContent = hit.text;
        button.append(meta, body);
        button.addEventListener("click", () => hit.select && hit.select());
        item.append(button);
        list.append(item);
      }
      status.textContent = statusText(localCount + extra.length);
      results.append(list);
    }

    function render() {
      const query = input.value;
      results.replaceChildren();
      if (words(query).length === 0) { results.hidden = true; return; }
      const hits = rankBlocks(collectBlocks(doc), query);
      results.hidden = false;
      const status = doc.createElement("p");
      status.className = "kb-search-status";
      status.textContent = statusText(hits.length);
      results.append(status);
      if (providers.length) addProviderResults(query, status, hits.length);
      if (!hits.length) return;
      const list = doc.createElement("ol");
      list.className = "kb-search-list";
      for (const hit of hits) {
        const item = doc.createElement("li");
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "kb-search-hit";
        const meta = doc.createElement("span");
        meta.className = "kb-search-meta";
        meta.textContent = [chipLabel(hit.kb), hit.section].filter(Boolean).join(" · ");
        const body = doc.createElement("span");
        body.className = "kb-search-snippet";
        for (const part of snippet(hit.text, query)) {
          if (part.mark) { const mark = doc.createElement("mark"); mark.textContent = part.text; body.append(mark); }
          else body.append(doc.createTextNode(part.text));
        }
        button.append(meta, body);
        button.addEventListener("click", () => show(hit.ref));
        item.append(button);
        list.append(item);
      }
      results.append(list);
    }

    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 150); });
    input.form?.addEventListener("submit", (event) => { event.preventDefault(); clearTimeout(timer); render(); });
  }

  const providers = [];
  /** A provider is (query) => Promise<[{ meta, text, select }]>. */
  function addProvider(provider) {
    if (typeof provider === "function") providers.push(provider);
  }

  const api = Object.freeze({ rankBlocks, snippet, words, addProvider });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TaxCompKbSearch = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => wire(document));
    else wire(document);
  }
})(typeof window !== "undefined" ? window : globalThis);
