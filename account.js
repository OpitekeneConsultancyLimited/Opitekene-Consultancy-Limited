// TaxComp accounts and subscriptions (public site).
// Identity: Supabase Auth (supabase-js, loaded only when configured).
// Payments: Flutterwave hosted checkout started by the Worker; access is granted
// only after the Worker verifies the payment with Flutterwave.
// Exposes window.TaxCompAccount for the chat: getAccessToken(), isPremium().
(() => {
  "use strict";

  const root = document.querySelector("#account-root");
  const status = document.querySelector("#account-status");
  const SUPABASE_JS_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
  const meta = (name) => (document.querySelector(`meta[name="${name}"]`)?.content || "").trim();
  const supabaseUrl = meta("taxcomp-supabase-url");
  const supabaseKey = meta("taxcomp-supabase-anon-key");
  const chatEndpoint = meta("taxcomp-chat-endpoint");
  const formatUgx = (amount) => `UGX ${Number(amount).toLocaleString("en-UG")}`;
  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-UG", { day: "numeric", month: "long", year: "numeric" });

  let apiBase = "";
  try {
    if (chatEndpoint) apiBase = new URL(chatEndpoint, window.location.href).origin;
  } catch { apiBase = ""; }

  let supabase = null;
  let session = null;
  let account = null;
  let message = "";
  let messageKind = "notice";
  let mode = "signup";
  let passwordSetup = false;
  const listeners = new Set();

  const api = {
    async getAccessToken() {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    },
    isPremium: () => Boolean(account?.premium),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  window.TaxCompAccount = api;
  const notify = () => listeners.forEach((fn) => { try { fn(api); } catch { /* listener error */ } });

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      if (key === "text") node.textContent = value;
      else if (key === "className") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function setMessage(text, kind = "notice") {
    message = text;
    messageKind = kind;
    render();
  }

  async function call(path, { method = "GET", body } = {}) {
    const token = await api.getAccessToken();
    const response = await fetch(`${apiBase}${path}`, {
      method,
      credentials: "omit",
      cache: "no-store",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  async function loadAccount() {
    account = null;
    if (session) {
      try { account = await call("/api/account"); } catch (error) { setMessage(error.message, "error"); }
    }
    notify();
  }

  function field(id, label, type, extra = {}) {
    return el("div", { className: "phase6-field" }, [
      el("label", { for: id, text: label }),
      el("input", { id, name: id, type, required: "", ...extra }),
    ]);
  }

  function busyForm(form, handler) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      if (button) button.disabled = true;
      try { await handler(new FormData(form)); }
      catch (error) { setMessage(error.message || "Something went wrong. Please try again.", "error"); }
      finally { if (button) button.disabled = false; }
    });
    return form;
  }

  function passwordPolicy(password) {
    if (password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      throw new Error("Use at least 12 characters, including a letter and a number.");
    }
  }

  function signedOutView() {
    const wrap = el("div", { className: "account-panel" });
    const tabs = el("div", { className: "phase6-tabs", role: "tablist", "aria-label": "Account" }, [
      ["signup", "Create account"], ["signin", "Sign in"], ["reset", "Forgot password"],
    ].map(([id, label]) => el("button", {
      type: "button", className: "phase6-tab", role: "tab", "aria-selected": String(mode === id),
      "aria-current": mode === id ? "page" : null, text: label,
      onclick: () => { mode = id; message = ""; render(); },
    })));
    wrap.append(tabs);
    if (mode === "signup") {
      wrap.append(busyForm(el("form", { className: "phase6-form", id: "account-signup-form" }, [
        field("account-signup-email", "Email", "email", { autocomplete: "email", maxlength: "254" }),
        field("account-signup-password", "Password (12+ characters, a letter and a number)", "password", { autocomplete: "new-password", maxlength: "128" }),
        el("div", { className: "phase6-actions" }, el("button", { type: "submit", className: "primary-button", text: "Create account" })),
      ]), async (data) => {
        const password = String(data.get("account-signup-password"));
        passwordPolicy(password);
        const { data: result, error } = await supabase.auth.signUp({
          email: String(data.get("account-signup-email")),
          password,
          options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#account` },
        });
        if (error) throw new Error(error.message);
        if (result.session) { session = result.session; await loadAccount(); setMessage("Account created. Choose a plan below.", "success"); }
        else { mode = "signin"; setMessage("Check your email and open the confirmation link, then sign in here.", "success"); }
      }));
    } else if (mode === "signin") {
      wrap.append(busyForm(el("form", { className: "phase6-form", id: "account-signin-form" }, [
        field("account-signin-email", "Email", "email", { autocomplete: "email", maxlength: "254" }),
        field("account-signin-password", "Password", "password", { autocomplete: "current-password", maxlength: "128" }),
        el("div", { className: "phase6-actions" }, el("button", { type: "submit", className: "primary-button", text: "Sign in" })),
      ]), async (data) => {
        const { data: result, error } = await supabase.auth.signInWithPassword({
          email: String(data.get("account-signin-email")), password: String(data.get("account-signin-password")),
        });
        if (error) throw new Error(/confirm/i.test(error.message) ? "Confirm your email first: open the link we sent you." : "Sign-in failed. Check your email and password.");
        session = result.session;
        message = "";
        await loadAccount();
        render();
      }));
    } else {
      wrap.append(busyForm(el("form", { className: "phase6-form", id: "account-reset-form" }, [
        field("account-reset-email", "Account email", "email", { autocomplete: "email", maxlength: "254" }),
        el("div", { className: "phase6-actions" }, el("button", { type: "submit", className: "secondary-button", text: "Send reset link" })),
      ]), async (data) => {
        await supabase.auth.resetPasswordForEmail(String(data.get("account-reset-email")), { redirectTo: `${window.location.origin}${window.location.pathname}#account` });
        setMessage("If that account exists, a password reset link is on its way.", "success");
      }));
    }
    return wrap;
  }

  function passwordView() {
    return el("div", { className: "account-panel" }, [
      el("h3", { text: "Choose a new password" }),
      busyForm(el("form", { className: "phase6-form", id: "account-newpass-form" }, [
        field("account-new-password", "New password", "password", { autocomplete: "new-password", maxlength: "128" }),
        el("div", { className: "phase6-actions" }, el("button", { type: "submit", className: "primary-button", text: "Save password" })),
      ]), async (data) => {
        const password = String(data.get("account-new-password"));
        passwordPolicy(password);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
        passwordSetup = false;
        await loadAccount();
        setMessage("Password saved. You are signed in.", "success");
      }),
    ]);
  }

  function planCard(plan, subscription) {
    const active = subscription?.active;
    const card = el("article", { className: "account-plan", "data-active": active ? "true" : "false" }, [
      el("div", { className: "account-plan-head" }, [
        el("h4", { text: plan.name }),
        el("span", { className: "account-plan-price", text: `${formatUgx(plan.amount)} / month` }),
      ]),
      el("p", { text: plan.description }),
      active ? el("p", { className: "account-plan-state", text: `Active until ${formatDate(subscription.periodEnd)}` })
        : subscription ? el("p", { className: "account-plan-state", "data-kind": "lapsed", text: `Expired on ${formatDate(subscription.periodEnd)}` }) : null,
    ]);
    const button = el("button", {
      type: "button", className: active ? "secondary-button" : "primary-button",
      text: active ? "Pay for another month" : subscription ? "Renew" : "Pay with Mobile Money or card",
      disabled: account.paymentsEnabled ? null : "",
      onclick: async () => {
        button.disabled = true;
        try {
          const { checkoutUrl } = await call("/api/billing/checkout", { method: "POST", body: { planId: plan.id } });
          window.location.assign(checkoutUrl);
        } catch (error) {
          button.disabled = false;
          setMessage(error.message, "error");
        }
      },
    });
    card.append(button);
    return card;
  }

  function firmSetup(subscription) {
    if (!subscription?.active || !subscription.includesWorkspace) return null;
    if (subscription.organizationId) {
      return el("p", { className: "phase6-alert", "data-kind": "success", text: "Your firm workspace is set up. Open it from Practice workspace at the top of this page, signed in with this account." });
    }
    return el("div", { className: "account-firm" }, [
      el("h4", { text: "Set up your firm workspace" }),
      el("p", { text: "You become the firm's administrator and can invite your staff." }),
      busyForm(el("form", { className: "phase6-form", id: "account-firm-form" }, [
        field("account-firm-name", "Firm name", "text", { maxlength: "160", autocomplete: "organization" }),
        el("div", { className: "phase6-actions" }, el("button", { type: "submit", className: "primary-button", text: "Create firm workspace" })),
      ]), async (data) => {
        await call("/api/account/firm", { method: "POST", body: { organizationName: String(data.get("account-firm-name")) } });
        await loadAccount();
        setMessage("Firm workspace created. You are its administrator.", "success");
      }),
    ]);
  }

  function signedInView() {
    const wrap = el("div", { className: "account-panel" });
    wrap.append(el("div", { className: "account-who" }, [
      el("p", {}, [el("span", { text: "Signed in as " }), el("strong", { text: session.user.email })]),
      el("button", { type: "button", className: "secondary-button", text: "Sign out", onclick: async () => {
        await supabase.auth.signOut();
        session = null; account = null; mode = "signin";
        notify();
        setMessage("Signed out.", "success");
      } }),
    ]));
    if (!account) return wrap;
    if (!account.paymentsEnabled) {
      wrap.append(el("p", { className: "phase6-alert", text: "Online payment is being set up. Until then, use the manual Mobile Money payment details further down this page." }));
    } else if (account.paymentsTestMode) {
      wrap.append(el("p", { className: "phase6-alert", text: "Payments are in test mode: no real money is charged." }));
    }
    const plans = el("div", { className: "account-plans" }, account.plans.map((plan) =>
      planCard(plan, account.subscriptions.find((s) => s.planId === plan.id))));
    wrap.append(plans);
    for (const subscription of account.subscriptions) {
      const setup = firmSetup(subscription);
      if (setup) wrap.append(setup);
    }
    wrap.append(el("p", { className: "account-note", text: "Each payment covers one month. Mobile Money is never charged automatically; renew when you choose. Payments are processed by Flutterwave; TaxComp never sees your card or PIN." }));
    return wrap;
  }

  function render() {
    if (!root) return;
    root.replaceChildren();
    if (message) root.append(el("p", { className: "phase6-alert", "data-kind": messageKind, role: "status", text: message }));
    if (!supabase) {
      setStatus("Not available yet");
      root.append(el("p", { className: "phase6-alert", text: "Accounts are not available on this page yet." }));
      return;
    }
    if (passwordSetup) { setStatus("Choose a password"); root.append(passwordView()); return; }
    if (!session) { setStatus("Not signed in"); root.append(signedOutView()); return; }
    setStatus(account?.premium ? "Premium active" : "Signed in");
    root.append(signedInView());
  }

  /** Handles the Flutterwave redirect (?status=…&tx_ref=…&transaction_id=…). */
  async function completeCheckout() {
    const params = new URLSearchParams(window.location.search);
    const hashQuery = window.location.hash.includes("?") ? new URLSearchParams(window.location.hash.split("?")[1]) : null;
    const read = (key) => params.get(key) || hashQuery?.get(key) || null;
    const txRef = read("tx_ref");
    if (!txRef) return;
    const state = read("status");
    const transactionId = read("transaction_id");
    window.history.replaceState({}, "", `${window.location.pathname}#account`);
    if (state !== "successful" && state !== "completed") {
      setMessage(state === "cancelled" ? "Payment cancelled. You have not been charged." : "The payment did not go through. You have not been given access; please try again.", "error");
      return;
    }
    try {
      const result = await call("/api/billing/confirm", { method: "POST", body: { transactionId, txRef } });
      await loadAccount();
      setMessage(result.paymentStatus === "successful"
        ? "Payment confirmed. Your subscription is active."
        : "We are still confirming your payment with Flutterwave. Refresh this page in a minute.", result.paymentStatus === "successful" ? "success" : "notice");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function start() {
    let configured = false;
    try { configured = new URL(supabaseUrl).protocol === "https:" && supabaseKey.length >= 20 && Boolean(apiBase); } catch { configured = false; }
    if (!configured) return render();
    const linkType = new URLSearchParams(window.location.hash.slice(1)).get("type");
    try {
      const { createClient } = await import(SUPABASE_JS_URL);
      supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "taxcomp-account" },
      });
    } catch {
      return setMessage("Could not load the sign-in service. Check your connection and reload.", "error");
    }
    passwordSetup = linkType === "recovery";
    supabase.auth.onAuthStateChange((event, next) => {
      session = next;
      if (event === "PASSWORD_RECOVERY") passwordSetup = true;
      if (event === "SIGNED_OUT") { account = null; notify(); }
      render();
    });
    session = (await supabase.auth.getSession()).data.session;
    await loadAccount();
    render();
    if (session) await completeCheckout();
    if (linkType === "signup" && session) setMessage("Email confirmed. Choose a plan below.", "success");
  }

  start();
})();
