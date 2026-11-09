// Paid accounts: Supabase Auth identity + monthly plans paid via Flutterwave.
//
// Routes (browser routes need the site's Origin and a Supabase Bearer token):
//   GET  /api/account                 plans, subscriptions, premium flag
//   POST /api/billing/checkout        { planId } -> { checkoutUrl } (Flutterwave hosted page)
//   POST /api/billing/confirm         { transactionId, txRef } after the redirect back
//   POST /api/account/firm            { organizationName } creates the firm workspace
//   POST /api/billing/webhook         Flutterwave server-to-server (verif-hash header)
//
// A payment is credited only after the Worker re-verifies the transaction with
// Flutterwave's API (status, reference, currency, amount). Webhooks and
// redirects are just triggers for that check, so a forged or replayed request
// cannot grant access. Crediting is atomic and idempotent: the payment row's
// pending->successful transition (changes() = 1) gates the month added to the
// subscription, which is computed in SQL so concurrent confirmations stack
// correctly.

import { createSupabaseTokenVerifier, normalizeSupabaseUrl, readBearerToken } from "./supabase-auth.mjs";

const MAX_BODY = 8_000;
const FLW_API = "https://api.flutterwave.com/v3";

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function readJson(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new TypeError("Send the request as JSON.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw new RangeError("Request body is too large.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new TypeError("The request must contain valid JSON.");
  }
}

function equalStrings(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function addMonths(iso, months) {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function supabaseFetch(env) {
  return typeof env.SUPABASE_FETCH === "function" ? env.SUPABASE_FETCH : globalThis.fetch;
}

function flutterwave(env) {
  const key = env.FLW_SECRET_KEY;
  if (env.BILLING_ENABLED !== "true" || typeof key !== "string" || !/^FLWSECK(_TEST)?-[A-Za-z0-9-]{10,}$/.test(key)) return null;
  const fetchImpl = typeof env.FLUTTERWAVE_FETCH === "function" ? env.FLUTTERWAVE_FETCH : globalThis.fetch;
  const base = typeof env.FLW_API_BASE === "string" && env.FLW_API_BASE.startsWith("https://") ? env.FLW_API_BASE.replace(/\/+$/, "") : FLW_API;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    testMode: key.startsWith("FLWSECK_TEST-"),
    async createPaymentLink(payload) {
      const result = await fetchImpl(`${base}/payments`, { method: "POST", headers, body: JSON.stringify(payload) });
      const body = await result.json().catch(() => ({}));
      if (!result.ok || body.status !== "success" || typeof body.data?.link !== "string") {
        throw new Error(`Flutterwave checkout failed (${result.status}).`);
      }
      return body.data.link;
    },
    async verifyTransaction(transactionId) {
      if (!/^\d{1,20}$/.test(String(transactionId))) return null;
      const result = await fetchImpl(`${base}/transactions/${transactionId}/verify`, { headers });
      const body = await result.json().catch(() => ({}));
      return result.ok && body.status === "success" ? body.data : null;
    },
  };
}

async function identify(request, env) {
  const token = readBearerToken(request);
  if (!token || !normalizeSupabaseUrl(env.SUPABASE_URL)) return null;
  const verifier = createSupabaseTokenVerifier({ supabaseUrl: env.SUPABASE_URL, fetchImpl: supabaseFetch(env) });
  const claims = await verifier.verify(token);
  if (!claims || typeof claims.email !== "string") return null;
  return { userId: claims.sub, email: claims.email.toLowerCase() };
}

async function entitlements(db, userId, now = new Date().toISOString()) {
  const { results = [] } = await db.prepare(
    `SELECT s.id AS subscriptionId, s.plan_id AS planId, s.status, s.current_period_end AS periodEnd,
            s.organization_id AS organizationId, p.name AS planName, p.audience,
            p.includes_premium_advisor AS includesPremium, p.includes_firm_workspace AS includesWorkspace
       FROM billing_subscriptions s JOIN billing_plans p ON p.id = s.plan_id
      WHERE s.user_id = ? ORDER BY s.current_period_end DESC`,
  ).bind(userId).all();
  const subscriptions = results.map((row) => ({
    ...row,
    active: row.status === "active" && row.periodEnd > now,
    includesPremium: Number(row.includesPremium) === 1,
    includesWorkspace: Number(row.includesWorkspace) === 1,
  }));
  return { subscriptions, premium: subscriptions.some((s) => s.active && s.includesPremium) };
}

/** True when the request carries a Supabase token of a user with an active premium plan. */
export async function hasPremiumAccess(request, env) {
  // Test seam: a function can only be injected by code, never by Worker
  // vars/secrets (always strings), so production cannot enable this.
  if (typeof env.PREMIUM_ACCESS_CHECK === "function") return Boolean(await env.PREMIUM_ACCESS_CHECK(request));
  if (env.DATABASE_PROVIDER !== "supabase" || !env.UNANSWERED_QUESTIONS) return false;
  try {
    const identity = await identify(request, env);
    if (!identity) return false;
    return (await entitlements(env.UNANSWERED_QUESTIONS, identity.userId)).premium;
  } catch {
    return false;
  }
}

/**
 * Credits a verified Flutterwave transaction to its pending payment.
 * Returns { credited, reason }. Safe to call any number of times.
 */
export async function creditVerifiedTransaction(db, transaction, { now = new Date() } = {}) {
  if (!transaction || transaction.status !== "successful" || typeof transaction.tx_ref !== "string") {
    return { credited: false, reason: "not-successful" };
  }
  const payment = await db.prepare(
    `SELECT p.tx_ref AS txRef, p.user_id AS userId, p.plan_id AS planId, p.amount, p.currency, p.status,
            pl.interval_months AS intervalMonths
       FROM billing_payments p JOIN billing_plans pl ON pl.id = p.plan_id WHERE p.tx_ref = ?`,
  ).bind(transaction.tx_ref).first();
  if (!payment) return { credited: false, reason: "unknown-reference" };
  if (payment.status === "successful") return { credited: false, reason: "already-credited" };
  if (transaction.currency !== payment.currency || !(Number(transaction.amount) >= Number(payment.amount))) {
    await db.prepare("UPDATE billing_payments SET status = 'failed' WHERE tx_ref = ? AND status = 'pending'").bind(payment.txRef).run();
    return { credited: false, reason: "amount-or-currency-mismatch" };
  }
  const nowIso = now.toISOString();
  const months = Number(payment.intervalMonths) || 1;
  try {
    const results = await db.batch([
      db.prepare(
        `UPDATE billing_payments SET status = 'successful', provider_transaction_id = ?, provider_payment_type = ?, verified_at = ?
          WHERE tx_ref = ? AND status = 'pending'`,
      ).bind(String(transaction.id), String(transaction.payment_type || "").slice(0, 40) || null, nowIso, payment.txRef),
      db.prepare(
        `INSERT INTO billing_subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at, updated_at)
         SELECT ?, ?, ?, 'active', ?, ?, ?, ? WHERE changes() = 1
         ON CONFLICT (user_id, plan_id) DO UPDATE SET
           status = 'active',
           current_period_start = CASE WHEN billing_subscriptions.status = 'active' AND billing_subscriptions.current_period_end > EXCLUDED.current_period_start
             THEN billing_subscriptions.current_period_start ELSE EXCLUDED.current_period_start END,
           current_period_end = CASE WHEN billing_subscriptions.status = 'active' AND billing_subscriptions.current_period_end > EXCLUDED.current_period_start
             THEN to_char((billing_subscriptions.current_period_end::timestamptz + make_interval(months => ?)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             ELSE EXCLUDED.current_period_end END,
           updated_at = EXCLUDED.updated_at`,
      ).bind(crypto.randomUUID(), payment.userId, payment.planId, nowIso, addMonths(nowIso, months), nowIso, nowIso, months),
    ]);
    return results[0].meta.changes === 1 ? { credited: true, userId: payment.userId, planId: payment.planId } : { credited: false, reason: "already-credited" };
  } catch (error) {
    if (/UNIQUE constraint failed/.test(error?.message || "")) return { credited: false, reason: "transaction-already-used" };
    throw error;
  }
}

async function plans(db) {
  const { results = [] } = await db.prepare(
    `SELECT id, audience, name, description, amount, currency, interval_months AS intervalMonths,
            includes_premium_advisor AS includesPremium, includes_firm_workspace AS includesWorkspace
       FROM billing_plans WHERE active = 1 ORDER BY sort_order`,
  ).bind().all();
  return results.map((p) => ({ ...p, includesPremium: Number(p.includesPremium) === 1, includesWorkspace: Number(p.includesWorkspace) === 1 }));
}

async function handleWebhook(request, env) {
  const expected = env.FLW_WEBHOOK_HASH;
  const supplied = request.headers.get("verif-hash");
  if (typeof expected !== "string" || expected.length < 16 || !supplied || !equalStrings(expected, supplied)) {
    return json({ error: "Unauthorized." }, 401);
  }
  const provider = flutterwave(env);
  if (!provider) return json({ error: "Payments are not configured." }, 503);
  let event;
  try {
    event = await readJson(request);
  } catch {
    return json({ error: "Invalid payload." }, 400);
  }
  const transactionId = event?.data?.id;
  if (!transactionId) return json({ received: true }, 200);
  // Never trust the webhook body: re-verify with Flutterwave.
  const transaction = await provider.verifyTransaction(transactionId);
  const outcome = await creditVerifiedTransaction(env.UNANSWERED_QUESTIONS, transaction);
  return json({ received: true, credited: outcome.credited }, 200);
}

export async function handleBillingRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/billing/webhook" && request.method === "POST") {
    if (env.DATABASE_PROVIDER !== "supabase") return json({ error: "Billing requires the Supabase database." }, 503);
    return handleWebhook(request, env);
  }
  const cors = corsFor(request, env);
  if (!cors) return json({ error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (env.DATABASE_PROVIDER !== "supabase" || !env.UNANSWERED_QUESTIONS) return json({ error: "Accounts are not available yet." }, 503, cors);

  if (env.CHAT_LIMITER?.limit) {
    try {
      const limit = await env.CHAT_LIMITER.limit({ key: `account:${request.headers.get("CF-Connecting-IP") || "unknown"}` });
      if (!limit.success) return json({ error: "Too many requests. Please wait a minute." }, 429, cors);
    } catch { /* limiter outage: continue, auth still applies */ }
  }

  const db = env.UNANSWERED_QUESTIONS;
  const identity = await identify(request, env);
  if (!identity) return json({ error: "Sign in to continue." }, 401, cors);
  const now = new Date().toISOString();

  try {
    if (path === "/api/account" && request.method === "GET") {
      const { subscriptions, premium } = await entitlements(db, identity.userId, now);
      return json({
        user: identity,
        plans: await plans(db),
        subscriptions,
        premium,
        paymentsEnabled: Boolean(flutterwave(env)),
        paymentsTestMode: Boolean(flutterwave(env)?.testMode),
      }, 200, cors);
    }

    if (path === "/api/billing/checkout" && request.method === "POST") {
      const provider = flutterwave(env);
      if (!provider) return json({ error: "Online payments are not configured yet. Please use the manual payment options below." }, 503, cors);
      const { planId } = await readJson(request);
      const plan = (await plans(db)).find((item) => item.id === planId);
      if (!plan) return json({ error: "Choose a valid plan." }, 400, cors);
      const txRef = `taxcomp-${crypto.randomUUID()}`;
      await db.batch([
        db.prepare("INSERT INTO billing_accounts (user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, updated_at = EXCLUDED.updated_at")
          .bind(identity.userId, identity.email, now, now),
        db.prepare("INSERT INTO billing_payments (tx_ref, user_id, plan_id, amount, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(txRef, identity.userId, plan.id, plan.amount, plan.currency, now),
      ]);
      const returnUrl = new URL(env.PUBLIC_SITE_URL || env.ALLOWED_ORIGIN);
      returnUrl.hash = "account";
      const checkoutUrl = await provider.createPaymentLink({
        tx_ref: txRef,
        amount: plan.amount,
        currency: plan.currency,
        redirect_url: returnUrl.toString(),
        payment_options: "mobilemoneyuganda,card",
        customer: { email: identity.email },
        customizations: { title: `TaxComp ${plan.name}`, description: `${plan.name}: one month` },
        meta: { plan_id: plan.id },
      });
      return json({ checkoutUrl, txRef }, 201, cors);
    }

    if (path === "/api/billing/confirm" && request.method === "POST") {
      const provider = flutterwave(env);
      if (!provider) return json({ error: "Online payments are not configured yet." }, 503, cors);
      const { transactionId, txRef } = await readJson(request);
      const owned = await db.prepare("SELECT status FROM billing_payments WHERE tx_ref = ? AND user_id = ?").bind(String(txRef || ""), identity.userId).first();
      if (!owned) return json({ error: "Payment not found for this account." }, 404, cors);
      if (owned.status === "pending") {
        const transaction = await provider.verifyTransaction(transactionId);
        if (transaction?.tx_ref === txRef) await creditVerifiedTransaction(db, transaction);
      }
      const { subscriptions, premium } = await entitlements(db, identity.userId);
      const payment = await db.prepare("SELECT status FROM billing_payments WHERE tx_ref = ?").bind(String(txRef)).first();
      return json({ paymentStatus: payment.status, premium, subscriptions }, 200, cors);
    }

    if (path === "/api/account/firm" && request.method === "POST") {
      const { organizationName } = await readJson(request);
      const name = typeof organizationName === "string" ? organizationName.trim() : "";
      if (!name || name.length > 160) return json({ error: "Enter your firm's name (up to 160 characters)." }, 400, cors);
      const { subscriptions } = await entitlements(db, identity.userId, now);
      const firm = subscriptions.find((s) => s.active && s.includesWorkspace);
      if (!firm) return json({ error: "An active Firm subscription is required." }, 402, cors);
      if (firm.organizationId) return json({ error: "Your firm workspace already exists.", organizationId: firm.organizationId }, 409, cors);
      const organizationId = crypto.randomUUID();
      const results = await db.batch([
        db.prepare("INSERT INTO phase6_users (id, email, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?) ON CONFLICT (id) DO NOTHING")
          .bind(identity.userId, identity.email, now, now),
        db.prepare("UPDATE billing_subscriptions SET organization_id = ?, updated_at = ? WHERE id = ? AND organization_id IS NULL")
          .bind(organizationId, now, firm.subscriptionId),
        db.prepare("INSERT INTO phase6_organizations (id, name, created_at, updated_at, billing_subscription_id) SELECT ?, ?, ?, ?, ? WHERE changes() = 1")
          .bind(organizationId, name, now, now, firm.subscriptionId),
        db.prepare("INSERT INTO phase6_memberships (organization_id, user_id, role, created_at) SELECT ?, ?, 'practice-admin', ? WHERE changes() = 1")
          .bind(organizationId, identity.userId, now),
        db.prepare("INSERT INTO phase6_audit_log (id, organization_id, actor_user_id, action, resource_type, resource_id, details_json, occurred_at) SELECT ?, ?, ?, 'organization.created-by-subscription', 'organization', ?, ?, ? WHERE changes() = 1")
          .bind(crypto.randomUUID(), organizationId, identity.userId, organizationId, JSON.stringify({ planId: firm.planId }), now),
      ]);
      if (results[1].meta.changes !== 1) return json({ error: "Your firm workspace already exists." }, 409, cors);
      return json({ organization: { organizationId, name, role: "practice-admin" } }, 201, cors);
    }

    return json({ error: "Not found." }, 404, cors);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return json({ error: error.message }, 400, cors);
    console.error("Account request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "The account service could not complete that request." }, 500, cors);
  }
}
