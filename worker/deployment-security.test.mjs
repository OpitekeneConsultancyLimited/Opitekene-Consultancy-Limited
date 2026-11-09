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
  SUPABASE_URL: "https://project.supabase.example.invalid",
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
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.synthetic",
    PHASE6_DOCUMENTS: {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    },
    PHASE6_MALWARE_SCANNER: { fetch: async () => new Response(null, { status: 204 }) },
  });

  assert.equal(readiness.productionReady, true);
  assert.deepEqual(readiness.missingProductionBindings, []);

  const newStyleKey = validateDeploymentReadiness({ ...readyEnv, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz" });
  assert.ok(newStyleKey.missingProductionBindings.includes("SUPABASE_SERVICE_ROLE_KEY"), "Storage needs the service_role JWT");
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
    SUPABASE_URL: undefined,
  });

  assert.equal(readiness.isReady, false);
  assert.ok(readiness.missingBindings.includes("ALLOWED_ORIGIN"));
  assert.ok(readiness.missingBindings.includes("SUPABASE_URL"), "Phase 6 needs Supabase Auth");
  assert.ok(readiness.missingProductionBindings.includes("PHASE6_BOOTSTRAP_SECRET"));
});
