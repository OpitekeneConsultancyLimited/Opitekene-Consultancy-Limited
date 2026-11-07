"use strict";

const PLAN_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "free", name: "Free" }),
  Object.freeze({ id: "individual-consultant", name: "Individual tax consultant" }),
  Object.freeze({ id: "sme", name: "SME" }),
  Object.freeze({ id: "ngo", name: "NGO" }),
  Object.freeze({ id: "corporate", name: "Corporate" }),
  Object.freeze({ id: "enterprise", name: "Enterprise" }),
]);

const SUBSCRIPTION_STATUSES = Object.freeze([
  "pending",
  "active",
  "past_due",
  "canceled",
  "expired",
  "suspended",
]);

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function configurePlanCatalog(configuredPlans = []) {
  if (!Array.isArray(configuredPlans)) {
    throw new TypeError("Configured plans must be an array.");
  }
  const byId = new Map(PLAN_DEFINITIONS.map((plan) => [plan.id, plan]));
  const catalog = new Map();
  for (const configured of configuredPlans) {
    if (!configured || typeof configured !== "object" || Array.isArray(configured)) {
      throw new TypeError("Each plan configuration must be an object.");
    }
    const definition = byId.get(configured.id);
    if (!definition || catalog.has(configured.id)) {
      throw new RangeError("Plan configuration has an unknown or duplicate plan ID.");
    }
    if (!Number.isSafeInteger(configured.amountMinor) || configured.amountMinor < 0) {
      throw new RangeError(`Plan ${configured.id} requires a configured non-negative amountMinor.`);
    }
    if (typeof configured.currency !== "string" || !/^[A-Z]{3}$/.test(configured.currency)) {
      throw new RangeError(`Plan ${configured.id} requires a configured ISO currency code.`);
    }
    if (!Array.isArray(configured.entitlements) ||
        configured.entitlements.some((value) => typeof value !== "string" || !value.trim() || value.length > 80)) {
      throw new RangeError(`Plan ${configured.id} requires a valid entitlement list.`);
    }
    catalog.set(configured.id, Object.freeze({
      ...definition,
      amountMinor: configured.amountMinor,
      currency: configured.currency,
      entitlements: Object.freeze([...new Set(configured.entitlements)]),
    }));
  }
  return Object.freeze({
    get(planId) {
      return catalog.get(planId) || null;
    },
    list() {
      return [...catalog.values()];
    },
  });
}

function isEntitled(subscription, entitlement, { catalog, asOf = new Date() } = {}) {
  if (!subscription || !catalog || typeof catalog.get !== "function" ||
      typeof entitlement !== "string" || !(asOf instanceof Date) ||
      !Number.isFinite(asOf.getTime())) {
    return false;
  }
  const asOfDate = asOf.toISOString().slice(0, 10);
  if (!SUBSCRIPTION_STATUSES.includes(subscription.status) ||
      subscription.status !== "active" ||
      !isIsoDate(subscription.periodEnd) ||
      !isIsoDate(subscription.periodStart) ||
      subscription.periodStart > asOfDate ||
      subscription.periodEnd < asOfDate) {
    return false;
  }
  const plan = catalog.get(subscription.planId);
  return Boolean(plan && plan.entitlements.includes(entitlement));
}

function createBillingProviderAdapter(provider) {
  if (!provider || typeof provider !== "object" ||
      typeof provider.createCheckoutSession !== "function" ||
      typeof provider.verifyWebhook !== "function" ||
      typeof provider.createRefund !== "function") {
    throw new TypeError("Billing adapter must implement checkout, webhook verification, and refund operations.");
  }
  return Object.freeze({
    createCheckoutSession: (...args) => provider.createCheckoutSession(...args),
    verifyWebhook: (...args) => provider.verifyWebhook(...args),
    createRefund: (...args) => provider.createRefund(...args),
  });
}

module.exports = {
  PLAN_DEFINITIONS,
  SUBSCRIPTION_STATUSES,
  configurePlanCatalog,
  isEntitled,
  createBillingProviderAdapter,
};
