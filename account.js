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
  // HTTPS, or plain HTTP only on this computer (local development with npm run dev).
  const secureOrLocal = (url) => url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
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
  // Two-step sign-in (TOTP, Supabase Auth MFA). mfaPending: signed in with a
  // password but the account has a verified factor, so the code is still needed.
  let mfaPending = false;
  let factors = [];
  let enrolling = null; // { factorId, qr, secret } while setting up
  const listeners = new Set();

  const api = {
    async getAccessToken() {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    },
    isPremium: () => Boolean(account?.premium),
    /** The signed-in user's id (used to keep each person's chat history apart on a shared device). */
    getUserId: () => session?.user?.id || null,
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

  const mfa = () => supabase?.auth?.mfa || null;

  /** Works out whether this session still needs the two-step code. */
  async function checkAssurance() {
    mfaPending = false;
    if (!session || !mfa()) return;
    try {
      const { data } = await mfa().getAuthenticatorAssuranceLevel();
      mfaPending = Boolean(data && data.nextLevel === "aal2" && data.currentLevel !== "aal2");
    } catch { mfaPending = false; }
  }

  async function loadFactors() {
    factors = [];
    if (!session || !mfa() || mfaPending) return;
    try {
      const { data } = await mfa().listFactors();
      factors = (data?.all || []).filter((factor) => factor.factor_type === "totp");
    } catch { factors = []; }
  }

  async function loadAccount() {
    account = null;
    if (session && !mfaPending) {
      try { account = await call("/api/account"); } catch (error) { setMessage(error.message, "error"); }
      await loadFactors();
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
        if (result.session) { session = result.session; await loadAccount(); setMessage("Account created. Welcome to TaxComp.", "success"); window.scrollTo(0, 0); }
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
        if (error) throw new Error(/confirm/i.test(error.message) ? "Confirm your email first: open the link we sent you." : /rate|too many/i.test(error.message) ? "Too many sign-in attempts. Wait a few minutes and try again." : "Sign-in failed. Check your email and password.");
        session = result.session;
        message = "";
        await checkAssurance();
        await loadAccount();
        render();
        window.scrollTo(0, 0);
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

  /** Second step of sign-in: the 6-digit code from the authenticator app. */
  function mfaView() {
    return el("div", { className: "account-panel" }, [
      el("h3", { text: "Enter your two-step code" }),
      el("p", { text: "Open your authenticator app and enter the 6-digit code for TaxComp." }),
      busyForm(el("form", { className: "phase6-form", id: "account-mfa-form" }, [
        field("account-mfa-code", "6-digit code", "text", { inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", maxlength: "6" }),
        el("div", { className: "phase6-actions" }, [
          el("button", { type: "submit", className: "primary-button", text: "Continue" }),
          el("button", { type: "button", className: "secondary-button", text: "Sign out", onclick: signOutHere }),
        ]),
      ]), async (data) => {
        const code = String(data.get("account-mfa-code")).trim();
        if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6 digits shown in your authenticator app.");
        const { data: list } = await mfa().listFactors();
        const factor = (list?.totp || []).find((item) => item.status === "verified");
        if (!factor) throw new Error("No authenticator is set up for this account. Sign out and sign in again.");
        const { error } = await mfa().challengeAndVerify({ factorId: factor.id, code });
        if (error) throw new Error("That code was not accepted. Check the time on your phone and try the next code.");
        session = (await supabase.auth.getSession()).data.session;
        mfaPending = false;
        message = "";
        await loadAccount();
        render();
        window.scrollTo(0, 0);
      }),
    ]);
  }

  async function signOutHere() {
    await supabase.auth.signOut();
    session = null; account = null; mfaPending = false; factors = []; enrolling = null; mode = "signin";
    notify();
    setMessage("Signed out.", "success");
  }

  function qrSource(qr) {
    if (typeof qr !== "string") return "";
    if (qr.startsWith("data:image/")) return qr;
    if (qr.trim().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
    return "";
  }

  function twoStepSection() {
    const verified = factors.find((factor) => factor.status === "verified");
    const box = el("section", { className: "account-security", "aria-labelledby": "account-security-title" }, [
      el("h4", { id: "account-security-title", text: "Two-step sign-in" }),
    ]);
    if (verified) {
      box.append(
        el("p", { text: "On. When you sign in, TaxComp also asks for a 6-digit code from your authenticator app." }),
        el("p", { className: "account-note", text: "TaxComp staff and administrators must keep this on: without it, staff screens stay closed." }),
        el("button", { type: "button", className: "secondary-button", text: "Turn off two-step sign-in", onclick: async () => {
          if (!window.confirm("Turn off two-step sign-in? Anyone with your password could then sign in.")) return;
          const { error } = await mfa().unenroll({ factorId: verified.id });
          if (error) return setMessage("Could not turn it off. Sign out, sign in again with your code, then try again.", "error");
          await supabase.auth.refreshSession().catch(() => null);
          await loadFactors();
          setMessage("Two-step sign-in is off.", "success");
        } }),
      );
    } else if (enrolling) {
      const src = qrSource(enrolling.qr);
      box.append(
        el("p", { text: "1. Open an authenticator app (for example Google Authenticator or Microsoft Authenticator) and scan this code." }),
        src ? el("img", { className: "account-qr", src, alt: "QR code to add TaxComp to your authenticator app", width: "180", height: "180" }) : null,
        el("p", {}, [el("span", { text: "Or type this key into the app: " }), el("code", { className: "account-secret", text: enrolling.secret || "" })]),
        el("p", { text: "2. Enter the 6-digit code the app shows." }),
        busyForm(el("form", { className: "phase6-form", id: "account-mfa-enrol-form" }, [
          field("account-mfa-enrol-code", "6-digit code", "text", { inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", maxlength: "6" }),
          el("div", { className: "phase6-actions" }, [
            el("button", { type: "submit", className: "primary-button", text: "Turn on" }),
            el("button", { type: "button", className: "secondary-button", text: "Cancel", onclick: async () => {
              const pending = enrolling;
              enrolling = null;
              if (pending) await mfa().unenroll({ factorId: pending.factorId }).catch(() => null);
              await loadFactors();
              render();
            } }),
          ]),
        ]), async (data) => {
          const code = String(data.get("account-mfa-enrol-code")).trim();
          if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6 digits shown in your authenticator app.");
          const { error } = await mfa().challengeAndVerify({ factorId: enrolling.factorId, code });
          if (error) throw new Error("That code was not accepted. Check the time on your phone and try the next code.");
          enrolling = null;
          session = (await supabase.auth.getSession()).data.session;
          await loadFactors();
          setMessage("Two-step sign-in is on. Keep your phone safe: you need it to sign in.", "success");
        }),
      );
    } else {
      box.append(
        el("p", { text: "Protect your account with a second step: a 6-digit code from an authenticator app on your phone. Required for TaxComp staff and administrators." }),
        el("button", { type: "button", className: "secondary-button", text: "Set up two-step sign-in", onclick: async () => {
          try {
            // Clear any setup that was started and not finished.
            for (const factor of factors.filter((item) => item.status !== "verified")) await mfa().unenroll({ factorId: factor.id }).catch(() => null);
            const { data, error } = await mfa().enroll({ factorType: "totp", friendlyName: `TaxComp ${new Date().toISOString().slice(0, 10)}` });
            if (error || !data?.id) throw new Error("Could not start the setup. Please try again.");
            enrolling = { factorId: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret };
            render();
          } catch (error) {
            setMessage(error.message || "Could not start the setup. Please try again.", "error");
          }
        } }),
      );
    }
    box.append(el("button", { type: "button", className: "secondary-button", text: "Sign out on all devices", onclick: async () => {
      if (!window.confirm("Sign out of TaxComp on every device, including this one?")) return;
      await supabase.auth.signOut({ scope: "global" });
      session = null; account = null; mfaPending = false; factors = []; enrolling = null; mode = "signin";
      notify();
      setMessage("Signed out on all devices.", "success");
    } }));
    return box;
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
      return el("p", { className: "phase6-alert", "data-kind": "success", text: "Your firm workspace is set up. Open it from Business Workspace → Overview, signed in with this account." });
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
      el("button", { type: "button", className: "secondary-button", text: "Sign out", onclick: signOutHere }),
    ]));
    if (mfa()) wrap.append(twoStepSection());
    if (!account) return wrap;
    if (!account.paymentsEnabled) {
      wrap.append(el("p", { className: "phase6-alert", text: "Online payment is being set up. Until then, use the manual Mobile Money payment details under About Us." }));
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

  // Sign-in screen (#auth-gate in index.html): the site is hidden by CSS until
  // <html data-auth="in">. While signed out, the forms render only in the gate,
  // so the (hidden) Account section never duplicates their ids.
  const gateRoot = document.querySelector("#auth-gate-root");

  function render() {
    const signedIn = Boolean(supabase && session && !passwordSetup && !mfaPending);
    document.documentElement.dataset.auth = signedIn ? "in" : "out";
    const alertFor = () => message ? el("p", { className: "phase6-alert", "data-kind": messageKind, role: "status", text: message }) : null;

    if (gateRoot) {
      gateRoot.replaceChildren();
      if (!signedIn) {
        const notice = alertFor();
        if (notice) gateRoot.append(notice);
        if (!supabase) {
          gateRoot.append(el("p", { className: "phase6-alert", "data-kind": "error", text: "Sign-in is temporarily unavailable. Check your connection and reload the page." }));
        } else {
          // A password-reset link never skips the two-step code.
          gateRoot.append(session && mfaPending ? mfaView() : passwordSetup ? passwordView() : signedOutView());
        }
      }
    }

    if (!root) return;
    root.replaceChildren();
    if (!signedIn) { setStatus("Not signed in"); return; }
    const notice = alertFor();
    if (notice) root.append(notice);
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
    // Per-case purchases (Challenge an Assessment) return to #challenge.
    const perCase = txRef.startsWith("taxcomp-case-");
    window.history.replaceState({}, "", `${window.location.pathname}#${perCase ? "challenge" : "account"}`);
    const tell = (text, kind) => {
      setMessage(text, kind);
      if (perCase) window.dispatchEvent(new CustomEvent("taxcomp:case-payment", { detail: { text, kind } }));
    };
    if (state !== "successful" && state !== "completed") {
      tell(state === "cancelled" ? "Payment cancelled. You have not been charged." : "The payment did not go through. You have not been given access; please try again.", "error");
      return;
    }
    try {
      const result = await call("/api/billing/confirm", { method: "POST", body: { transactionId, txRef } });
      await loadAccount();
      const done = result.paymentStatus === "successful";
      tell(done
        ? (perCase ? "Payment confirmed. A reviewer will now check your case and sign off the full pack." : "Payment confirmed. Your subscription is active.")
        : "We are still confirming your payment with Flutterwave. Refresh this page in a minute.", done ? "success" : "notice");
    } catch (error) {
      tell(error.message, "error");
    }
  }

  async function start() {
    let configured = false;
    try { configured = secureOrLocal(new URL(supabaseUrl)) && supabaseKey.length >= 20 && Boolean(apiBase); } catch { configured = false; }
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
      const wasSignedIn = Boolean(session);
      session = next;
      if (event === "PASSWORD_RECOVERY") passwordSetup = true;
      if (event === "SIGNED_OUT") { account = null; mfaPending = false; factors = []; enrolling = null; notify(); }
      render();
      // Signed in from an email link or another tab: load plans, open the site at the top.
      if (event === "SIGNED_IN" && !wasSignedIn) {
        window.scrollTo(0, 0);
        // Callbacks must not await supabase calls directly (supabase-js lock), so defer.
        setTimeout(() => { checkAssurance().then(loadAccount).then(render); }, 0);
      }
    });
    session = (await supabase.auth.getSession()).data.session;
    await checkAssurance();
    await loadAccount();
    render();
    if (session && !mfaPending) await completeCheckout();
    if (linkType === "signup" && session) setMessage("Email confirmed. Welcome to TaxComp.", "success");
  }

  start();
})();
