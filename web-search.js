// Live web results for the site's search boxes (Knowledge centre and tax cases).
// The built-in TaxComp results still render instantly (app.js); this adds a
// "From the web" panel underneath, fetched from the Worker's /search route,
// which uses Gemini with Google Search grounding and returns cited sources.
// Web searches run only on an explicit search (button, Enter, suggested
// question), never while typing, and identical searches reuse the result.
(() => {
  "use strict";

  const endpointMeta = (document.querySelector('meta[name="taxcomp-chat-endpoint"]')?.content || "").trim();
  let searchUrl = "";
  try {
    if (endpointMeta) {
      const url = new URL(endpointMeta, window.location.href);
      if (url.protocol === "https:") searchUrl = `${url.origin}/search`;
    }
  } catch { searchUrl = ""; }
  if (!searchUrl) return;

  const cache = new Map();
  const MAX_QUERY = 1600;

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

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  function attach({ form, input, anchor, kind, label }) {
    if (!form || !input || !anchor) return;
    form.append(el("p", {
      className: "web-search-note",
      text: "Searches also look up current public web sources through an AI provider (Anthropic Claude, or Google Gemini as backup). Do not enter names, TINs or other personal details.",
    }));
    const panel = el("section", { className: "web-search-panel", "aria-live": "polite", "aria-label": `${label}: web results`, hidden: "" });
    anchor.after(panel);
    let controller = null;

    function render(state, data = {}) {
      panel.hidden = false;
      panel.replaceChildren(el("div", { className: "web-search-head" }, [
        el("h3", { text: "From the web" }),
        el("span", { className: "web-search-badge", text: state === "loading" ? "Searching…" : state === "ok" ? "Live sources" : "No web results" }),
      ]));
      if (state === "loading") {
        panel.append(el("p", { className: "web-search-status", text: "Searching current public sources. This can take up to a minute; TaxComp's own results are shown above." }));
        return;
      }
      if (state !== "ok") {
        panel.append(el("p", { className: "web-search-status", text: data.message || "Web results are unavailable right now." }));
        return;
      }
      for (const paragraph of String(data.summary || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
        panel.append(el("p", { className: "web-search-summary", text: paragraph }));
      }
      const links = (data.sources || []).map((source) => ({ url: safeUrl(source.url), label: String(source.label || source.url || "").slice(0, 160) }))
        .filter((source) => source.url);
      if (links.length) {
        panel.append(el("h4", { text: "Sources" }));
        panel.append(el("ol", { className: "web-search-sources" }, links.map((source) =>
          el("li", {}, el("a", { href: source.url, target: "_blank", rel: "noopener noreferrer", text: source.label || new URL(source.url).hostname })))));
      }
      panel.append(el("p", { className: "web-search-caveat", text: "AI summary of live web sources. Unverified: open each source and check its date before relying on it. Not a URA ruling or professional advice." }));
    }

    async function run() {
      const query = input.value.trim();
      if (query.length < 3 || query.length > MAX_QUERY) { panel.hidden = true; return; }
      const key = `${kind}:${query.toLowerCase()}`;
      if (cache.has(key)) { render(...cache.get(key)); return; }
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const timeout = setTimeout(() => mine.abort(), 90_000); // live web research can take up to a minute
      render("loading");
      try {
        const response = await fetch(searchUrl, {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, kind }),
          signal: mine.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (mine !== controller) return; // a newer search replaced this one
        const result = response.ok
          ? [data.status === "ok" ? "ok" : "none", data]
          : ["none", { message: response.status === 429 ? "Too many searches in a minute. Please wait a moment and try again." : "Web results are unavailable right now. TaxComp's own results are shown above." }];
        if (response.ok && data.status === "ok") cache.set(key, result);
        render(...result);
      } catch (error) {
        if (mine !== controller) return; // cancelled by a newer search: say nothing
        render("none", { message: error.name === "AbortError" ? "The web search took too long. Please try again." : "Web results are unavailable right now." });
      } finally {
        clearTimeout(timeout);
      }
    }

    form.addEventListener("submit", () => { run(); });
    return run;
  }

  const advisoryRun = attach({
    form: document.querySelector("#tax-advisory-search"),
    input: document.querySelector("#advisory-query"),
    anchor: document.querySelector("#advisory-results"),
    kind: "guidance",
    label: "Knowledge centre",
  });
  document.querySelector(".advisory-quick-questions")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-advisory-query]")) advisoryRun?.();
  });

  attach({
    form: document.querySelector("#tax-case-search"),
    input: document.querySelector("#tax-case-query"),
    anchor: document.querySelector("#tax-case-no-results") || document.querySelector("#tax-case-results"),
    kind: "cases",
    label: "Tax cases",
  });
})();
