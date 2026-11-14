// Phase 2b: emergency withdrawals of legal material, read from the Worker
// (GET /api/legislation/withdrawals, never cached). The tax calculators call
// calculatorBlock() before showing a result: a withdrawn rule set shows the
// reviewers' reason instead of figures. Refreshed on load, every 5 minutes and
// whenever the page becomes visible again.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.taxcompLegalStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const REFRESH_MS = 5 * 60 * 1000;
  const state = { withdrawals: [], checkedAt: null, error: null };

  function apiBase() {
    try {
      const meta = root.document?.querySelector('meta[name="taxcomp-chat-endpoint"]');
      return meta ? new URL(meta.content, root.location.href).origin : "";
    } catch {
      return "";
    }
  }

  async function refresh(fetchImpl = root.fetch) {
    const base = apiBase();
    if (!base || typeof fetchImpl !== "function") return state;
    try {
      const response = await fetchImpl(`${base}/api/legislation/withdrawals`, { cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = await response.json();
      state.withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
      state.checkedAt = Date.now();
      state.error = null;
    } catch (error) {
      state.error = String(error && error.message ? error.message : error);
    }
    return state;
  }

  /** Replaces the list (tests, and the server-rendered case). */
  function setWithdrawals(list) {
    state.withdrawals = Array.isArray(list) ? list : [];
    state.checkedAt = Date.now();
    state.error = null;
  }

  /** The withdrawal that blocks this calculator, or null. A whole rule set, or "ruleSet#taxHead" for one calculator. */
  function calculatorBlock(taxHead, ruleSetId) {
    return state.withdrawals.find((w) => w.entityType === "calculator_rules" &&
      (w.entityId === ruleSetId || (taxHead && w.entityId === `${ruleSetId}#${taxHead}`))) || null;
  }

  function isWithdrawn(entityType, entityId) {
    return state.withdrawals.some((w) => w.entityType === entityType && w.entityId === entityId);
  }

  const ready = refresh();
  // Timers only in a page (not when loaded by Node tests, where they would keep the process alive).
  if (root.document && root.setInterval) root.setInterval(() => { refresh(); }, REFRESH_MS);
  root.document?.addEventListener?.("visibilitychange", () => {
    if (root.document.visibilityState === "visible" && (!state.checkedAt || Date.now() - state.checkedAt > 60_000)) refresh();
  });

  return { refresh, ready, calculatorBlock, isWithdrawn, setWithdrawals, state };
});
