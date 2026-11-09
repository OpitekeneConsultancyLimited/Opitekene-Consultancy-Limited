// Paid accounts on Supabase + Flutterwave: real Postgres (PGlite), real ES256
// Supabase tokens, and a fake Flutterwave API with hosted checkout + verify.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./index.mjs";
import { addMonths, hasPremiumAccess } from "./billing.mjs";
import { clearSupabaseKeyCache } from "./supabase-auth.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";
import { createFakeSupabase } from "./supabase-test-fakes.mjs";

const origin = "https://taxcomp.example.invalid";
const FLW_KEY = "FLWSECK_TEST-0123456789abcdef-X";
const WEBHOOK_HASH = "synthetic-webhook-hash-1234567890";

function fakeFlutterwave() {
  const checkouts = new Map(); // tx_ref -> payload
  const transactions = new Map(); // id -> data
  let nextId = 9_000_001;
  return {
    checkouts,
    /** Simulates the customer paying on the hosted page; returns the transaction id. */
    pay(txRef, { amount, currency = "UGX", status = "successful" } = {}) {
      const checkout = checkouts.get(txRef);
      const id = nextId++;
      transactions.set(String(id), {
        id, tx_ref: txRef, status, currency,
        amount: amount ?? checkout.amount, charged_amount: amount ?? checkout.amount,
        payment_type: "mobilemoneyug", customer: { email: checkout?.customer?.email },
      });
      return id;
    },
    async fetch(url, init = {}) {
      if (init.headers?.Authorization !== `Bearer ${FLW_KEY}`) return Response.json({ status: "error", message: "Invalid authorization key" }, { status: 401 });
      const { pathname } = new URL(url);
      if (pathname === "/v3/payments" && init.method === "POST") {
        const payload = JSON.parse(init.body);
        checkouts.set(payload.tx_ref, payload);
        return Response.json({ status: "success", data: { link: `https://checkout.flutterwave.example/pay/${payload.tx_ref}` } });
      }
      const verify = pathname.match(/^\/v3\/transactions\/(\d+)\/verify$/);
      if (verify) {
        const data = transactions.get(verify[1]);
        return data ? Response.json({ status: "success", data }) : Response.json({ status: "error", message: "No transaction was found for this id" }, { status: 400 });
      }
      return Response.json({ status: "error" }, { status: 404 });
    },
  };
}

async function setup({ paymentsConfigured = true } = {}) {
  clearSupabaseKeyCache();
  const { pg, db } = await createMigratedDatabase();
  const supabase = await createFakeSupabase(pg);
  const flw = fakeFlutterwave();
  const env = {
    UNANSWERED_QUESTIONS: db,
    DATABASE_PROVIDER: "supabase",
    ALLOWED_ORIGIN: origin,
    PUBLIC_SITE_URL: `${origin}/TaxComp/`,
    SUPABASE_URL: supabase.url,
    SUPABASE_FETCH: supabase.fetch,
    CHAT_LIMITER: { limit: async () => ({ success: true }) },
    BILLING_ENABLED: "true",
    ...(paymentsConfigured ? { FLW_SECRET_KEY: FLW_KEY, FLW_WEBHOOK_HASH: WEBHOOK_HASH, FLUTTERWAVE_FETCH: (u, i) => flw.fetch(u, i) } : {}),
  };
  const call = async (path, { method = "GET", body, token, originValue = origin, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (originValue) init.headers.Origin = originValue;
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    const response = await handleRequest(new Request(`https://worker.example${path}`, init), env);
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null, headers: response.headers };
  };
  const webhook = (transactionId, hash = WEBHOOK_HASH) => call("/api/billing/webhook", {
    method: "POST", originValue: null, headers: { "verif-hash": hash },
    body: { event: "charge.completed", data: { id: transactionId, status: "successful" } },
  });
  return { pg, db, env, supabase, flw, call, webhook };
}

test("addMonths keeps month-end dates valid", () => {
  assert.equal(addMonths("2026-01-31T10:00:00.000Z", 1), "2026-02-28T10:00:00.000Z");
  assert.equal(addMonths("2028-01-31T00:00:00.000Z", 1), "2028-02-29T00:00:00.000Z");
  assert.equal(addMonths("2026-11-09T09:00:00.000Z", 1), "2026-12-09T09:00:00.000Z");
  assert.equal(addMonths("2026-12-15T00:00:00.000Z", 1), "2027-01-15T00:00:00.000Z");
});

test("sign up, pay for Individual Premium with Mobile Money, and get Premium", async () => {
  const t = await setup();
  assert.equal((await t.call("/api/account")).status, 401, "sign-in required");
  const { token, userId } = await t.supabase.issueToken({ email: "Payer@Example.invalid" });
  assert.equal((await t.call("/api/account", { token, originValue: "https://evil.example" })).status, 403);

  const before = (await t.call("/api/account", { token })).json;
  assert.deepEqual(before.plans.map((p) => [p.id, p.amount, p.currency]), [["individual-monthly", 100000, "UGX"], ["firm-monthly", 500000, "UGX"]]);
  assert.equal(before.premium, false);
  assert.equal(before.paymentsEnabled, true);
  assert.equal(before.paymentsTestMode, true);

  const checkout = await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "individual-monthly" } });
  assert.equal(checkout.status, 201);
  assert.match(checkout.json.checkoutUrl, /^https:\/\/checkout\.flutterwave\.example\/pay\/taxcomp-/);
  const sent = t.flw.checkouts.get(checkout.json.txRef);
  assert.equal(sent.amount, 100000);
  assert.equal(sent.currency, "UGX");
  assert.equal(sent.customer.email, "payer@example.invalid");
  assert.equal(sent.redirect_url, `${origin}/TaxComp/#account`);
  assert.match(sent.payment_options, /mobilemoneyuganda/);
  assert.equal((await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "gold-forever" } })).status, 400);

  const transactionId = t.flw.pay(checkout.json.txRef);
  const confirmed = await t.call("/api/billing/confirm", { method: "POST", token, body: { transactionId, txRef: checkout.json.txRef } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.paymentStatus, "successful");
  assert.equal(confirmed.json.premium, true);
  const sub = confirmed.json.subscriptions[0];
  assert.equal(sub.planId, "individual-monthly");
  assert.ok(Math.abs(new Date(sub.periodEnd) - new Date(addMonths(new Date().toISOString(), 1))) < 60_000, "paid for one month");

  // Premium is recognised on the chat (real check, no test seam).
  const chatRequest = new Request("https://worker.example/chat", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(await hasPremiumAccess(chatRequest, t.env), true);
  const chat = await t.call("/chat", { method: "POST", token, body: { message: "What is the VAT rate in Uganda?", providerConsent: true } });
  assert.equal(chat.status, 200);
  assert.equal(chat.headers.get("X-TaxComp-Premium"), null, "premium user is not asked to upgrade");
  const other = await t.supabase.issueToken({ email: "free@example.invalid" });
  const freeChat = await t.call("/chat", { method: "POST", token: other.token, body: { message: "What is the VAT rate in Uganda?", providerConsent: true } });
  assert.equal(freeChat.headers.get("X-TaxComp-Premium"), "required");

  // The confirmation is idempotent, and the same user cannot see others' payments.
  const again = await t.call("/api/billing/confirm", { method: "POST", token, body: { transactionId, txRef: checkout.json.txRef } });
  assert.equal(again.json.subscriptions[0].periodEnd, sub.periodEnd, "no extra month for a repeated confirmation");
  assert.equal((await t.call("/api/billing/confirm", { method: "POST", token: other.token, body: { transactionId, txRef: checkout.json.txRef } })).status, 404);
  assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM billing_payments WHERE user_id = ? AND status = 'successful'").bind(userId).first()).n, 1);
  await t.pg.close();
});

test("webhooks are authenticated, re-verified, idempotent, and renewals stack", async () => {
  const t = await setup();
  const { token } = await t.supabase.issueToken({ email: "renew@example.invalid" });
  const first = (await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "individual-monthly" } })).json;
  const firstTx = t.flw.pay(first.txRef);

  assert.equal((await t.webhook(firstTx, "wrong-hash-wrong-hash-wrong")).status, 401, "bad verif-hash");
  assert.equal((await t.call("/api/billing/webhook", { method: "POST", originValue: null, body: { data: { id: firstTx } } })).status, 401, "missing verif-hash");
  const ok = await t.webhook(firstTx);
  assert.deepEqual([ok.status, ok.json.credited], [200, true]);
  assert.deepEqual([(await t.webhook(firstTx)).json.credited], [false], "replayed webhook credits nothing");
  assert.equal((await t.webhook(987654321)).json.credited, false, "forged transaction id is not found by Flutterwave");
  const end1 = (await t.call("/api/account", { token })).json.subscriptions[0].periodEnd;

  const second = (await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "individual-monthly" } })).json;
  assert.equal((await t.webhook(t.flw.pay(second.txRef))).json.credited, true);
  const end2 = (await t.call("/api/account", { token })).json.subscriptions[0].periodEnd;
  assert.equal(end2, addMonths(end1, 1), "renewal adds a month to the current end, not to today");
  await t.pg.close();
});

test("underpayment, wrong currency, failed payments and reused transactions grant nothing", async () => {
  const t = await setup();
  const { token } = await t.supabase.issueToken({ email: "edge@example.invalid" });
  const checkout = async () => (await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "individual-monthly" } })).json.txRef;

  const cheap = await checkout();
  await t.webhook(t.flw.pay(cheap, { amount: 1000 }));
  const usd = await checkout();
  await t.webhook(t.flw.pay(usd, { currency: "USD" }));
  const failed = await checkout();
  await t.webhook(t.flw.pay(failed, { status: "failed" }));
  const account = (await t.call("/api/account", { token })).json;
  assert.equal(account.premium, false);
  const statuses = await t.db.prepare("SELECT tx_ref AS ref, status FROM billing_payments").bind().all();
  const byRef = Object.fromEntries(statuses.results.map((r) => [r.ref, r.status]));
  assert.deepEqual([byRef[cheap], byRef[usd], byRef[failed]], ["failed", "failed", "pending"]);

  // A real successful transaction for checkout A cannot be used to confirm checkout B.
  const a = await checkout();
  const b = await checkout();
  const txA = t.flw.pay(a);
  const misuse = await t.call("/api/billing/confirm", { method: "POST", token, body: { transactionId: txA, txRef: b } });
  assert.equal(misuse.json.paymentStatus, "pending");
  assert.equal(misuse.json.premium, false);
  await t.pg.close();
});

test("a Firm subscription creates one firm workspace that is suspended when payment lapses", async () => {
  const t = await setup();
  Object.assign(t.env, {
    PHASE6_OPERATIONS_ENABLED: "true", PHASE6_SECURITY_REVIEWED: "true",
    PHASE6_DATA_AT_REST_REVIEWED: "true", PHASE6_BACKUP_RESTORE_VERIFIED: "true",
  });
  const { token, userId } = await t.supabase.issueToken({ email: "partner@firm.example.invalid" });
  assert.equal((await t.call("/api/account/firm", { method: "POST", token, body: { organizationName: "Firm" } })).status, 402, "payment first");

  const { txRef } = (await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "firm-monthly" } })).json;
  assert.equal(t.flw.checkouts.get(txRef).amount, 500000);
  await t.webhook(t.flw.pay(txRef));
  const account = (await t.call("/api/account", { token })).json;
  assert.equal(account.premium, true, "Firm includes Premium research");

  const created = await t.call("/api/account/firm", { method: "POST", token, body: { organizationName: "Kampala Tax Partners" } });
  assert.equal(created.status, 201);
  assert.equal(created.json.organization.role, "practice-admin");
  assert.equal((await t.call("/api/account/firm", { method: "POST", token, body: { organizationName: "Second" } })).status, 409);
  assert.equal((await t.db.prepare("SELECT COUNT(*) AS n FROM phase6_organizations").bind().first()).n, 1);

  // The payer signs in to their workspace as its practice administrator.
  const me = await t.call("/api/phase6/auth/me", { token });
  assert.equal(me.json.principal.role, "practice-admin");
  assert.equal(me.json.principal.organizationId, created.json.organization.organizationId);
  assert.equal((await t.call("/api/phase6/clients", { token })).status, 200);

  await t.pg.query("UPDATE taxcomp.billing_subscriptions SET current_period_start = '2019-12-01T00:00:00.000Z', current_period_end = '2020-01-01T00:00:00.000Z' WHERE user_id = $1", [userId]);
  const lapsed = await t.call("/api/phase6/clients", { token });
  assert.equal(lapsed.status, 402);
  assert.match(lapsed.json.error, /Renew it/);
  const renewal = (await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "firm-monthly" } })).json;
  await t.webhook(t.flw.pay(renewal.txRef));
  assert.equal((await t.call("/api/phase6/clients", { token })).status, 200, "renewing restores access");
  await t.pg.close();
});

test("without Flutterwave keys, accounts work but checkout is clearly unavailable", async () => {
  const t = await setup({ paymentsConfigured: false });
  const { token } = await t.supabase.issueToken({ email: "early@example.invalid" });
  const account = await t.call("/api/account", { token });
  assert.equal(account.status, 200);
  assert.equal(account.json.paymentsEnabled, false);
  const checkout = await t.call("/api/billing/checkout", { method: "POST", token, body: { planId: "individual-monthly" } });
  assert.equal(checkout.status, 503);
  assert.match(checkout.json.error, /not configured yet/);
  assert.equal((await t.webhook(1)).status, 401, "webhook refuses without a configured hash");
  await t.pg.close();
});
