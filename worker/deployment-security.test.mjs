import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentReadiness } from "./deployment-security.mjs";

const readyEnv = {
  ALLOWED_ORIGIN: "https://example.invalid",
  UNANSWERED_QUESTIONS: { prepared: true },
  PHASE6_BOOTSTRAP_SECRET: "0123456789abcdef",
  PHASE6_OPERATIONS_ENABLED: "true",
  PHASE6_SECURITY_REVIEWED: "true",
  PHASE6_DATA_AT_REST_REVIEWED: "true",
  PHASE6_BACKUP_RESTORE_VERIFIED: "true",
  PHASE6_APP_ORIGIN: "https://example.invalid",
  PHASE6_EMAIL_ENDPOINT: "https://email.example.invalid/send",
};

test("core deployment gate passes while unconfigured production services remain visible", () => {
  const readiness = validateDeploymentReadiness(readyEnv);
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.productionReady, false);
  assert.deepEqual(readiness.missingFlags, []);
  assert.deepEqual(readiness.missingBindings, []);
  assert.ok(readiness.missingProductionBindings.includes("PHASE6_DOCUMENTS"));
});

test("production readiness requires every provider and storage service binding", () => {
  const readiness = validateDeploymentReadiness({
    ...readyEnv,
    PHASE6_EMAIL_SERVICE: { fetch: async () => new Response(null, { status: 204 }) },
    PHASE6_EMAIL_API_KEY: "synthetic-email-api-key-at-least-24",
    PHASE6_DOCUMENTS: {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    },
    PHASE6_MALWARE_SCANNER: { fetch: async () => new Response(null, { status: 204 }) },
  });

  assert.equal(readiness.productionReady, true);
  assert.deepEqual(readiness.missingProductionBindings, []);
});

test("deployment readiness fails closed when required flags are missing", () => {
  const readiness = validateDeploymentReadiness({
    ...readyEnv,
    PHASE6_OPERATIONS_ENABLED: "false",
    PHASE6_BACKUP_RESTORE_VERIFIED: "false",
  });

  assert.equal(readiness.isReady, false);
  assert.ok(readiness.missingFlags.includes("PHASE6_OPERATIONS_ENABLED"));
  assert.ok(readiness.missingFlags.includes("PHASE6_BACKUP_RESTORE_VERIFIED"));
});

test("deployment readiness flags missing critical configuration before live operations", () => {
  const readiness = validateDeploymentReadiness({
    ...readyEnv,
    ALLOWED_ORIGIN: "http://insecure.invalid",
    PHASE6_BOOTSTRAP_SECRET: "short",
  });

  assert.equal(readiness.isReady, false);
  assert.ok(readiness.missingBindings.includes("ALLOWED_ORIGIN"));
  assert.ok(readiness.missingProductionBindings.includes("PHASE6_BOOTSTRAP_SECRET"));
});
