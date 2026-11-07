"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PLAN_DEFINITIONS,
  configurePlanCatalog,
  isEntitled,
  createBillingProviderAdapter,
} = require("./subscription-management.js");

test("commercial plan labels exist but pricing and entitlements require explicit configuration", () => {
  const catalog = configurePlanCatalog();

  assert.equal(PLAN_DEFINITIONS.length, 6);
  assert.deepEqual(catalog.list(), []);
  assert.equal(catalog.get("enterprise"), null);
});

test("plan catalog rejects unknown, duplicate, or incomplete pricing configuration", () => {
  const plan = {
    id: "free",
    amountMinor: 0,
    currency: "UGX",
    entitlements: ["calculator"],
  };
  assert.throws(() => configurePlanCatalog([{ ...plan, amountMinor: undefined }]), RangeError);
  assert.throws(() => configurePlanCatalog([{ ...plan, currency: "UG" }]), RangeError);
  assert.throws(() => configurePlanCatalog([{ ...plan, entitlements: "calculator" }]), RangeError);
  assert.throws(() => configurePlanCatalog([plan, plan]), RangeError);
  assert.throws(() => configurePlanCatalog([{ ...plan, id: "made-up" }]), RangeError);
});

test("entitlements require an active, configured, in-period subscription", () => {
  const catalog = configurePlanCatalog([{
    id: "sme",
    amountMinor: 0,
    currency: "UGX",
    entitlements: ["calculator", "reports"],
  }]);
  const active = {
    planId: "sme",
    status: "active",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };

  assert.equal(isEntitled(active, "reports", { catalog, asOf: new Date("2026-11-07T00:00:00Z") }), true);
  assert.equal(isEntitled(active, "billing-admin", { catalog, asOf: new Date("2026-11-07T00:00:00Z") }), false);
  assert.equal(isEntitled({ ...active, status: "past_due" }, "reports", { catalog }), false);
  assert.equal(isEntitled({ ...active, periodEnd: "2026-11-06" }, "reports", { catalog, asOf: new Date("2026-11-07T00:00:00Z") }), false);
  assert.equal(isEntitled({ ...active, planId: "enterprise" }, "reports", { catalog }), false);
  assert.equal(isEntitled(active, "reports", { catalog, asOf: "2026-11-07" }), false);
});

test("all six subscription plans support configured entitlements without fixed prices", () => {
  const catalog = configurePlanCatalog(PLAN_DEFINITIONS.map(({ id }) => ({
    id,
    amountMinor: 0,
    currency: "UGX",
    entitlements: ["core"],
  })));
  const activePeriod = {
    status: "active",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  };

  assert.deepEqual(catalog.list().map(({ id }) => id), PLAN_DEFINITIONS.map(({ id }) => id));
  for (const { id } of PLAN_DEFINITIONS) {
    assert.equal(isEntitled({ ...activePeriod, planId: id }, "core", {
      catalog,
      asOf: new Date("2026-11-07T00:00:00Z"),
    }), true, `${id} must honor configured entitlements`);
  }
});

test("provider adapter requires explicit checkout, webhook verification, and refund operations", async () => {
  assert.throws(() => createBillingProviderAdapter({}), TypeError);
  const adapter = createBillingProviderAdapter({
    createCheckoutSession: async (request) => ({ checkoutId: request.id }),
    verifyWebhook: async () => ({ verified: true }),
    createRefund: async () => ({ requested: true }),
  });

  assert.deepEqual(await adapter.createCheckoutSession({ id: "synthetic" }), { checkoutId: "synthetic" });
  assert.deepEqual(await adapter.verifyWebhook("signed payload"), { verified: true });
  assert.deepEqual(await adapter.createRefund("payment-id"), { requested: true });
});
