export const requiredPhase6SecurityFlags = Object.freeze([
  "PHASE6_OPERATIONS_ENABLED",
  "PHASE6_SECURITY_REVIEWED",
  "PHASE6_DATA_AT_REST_REVIEWED",
  "PHASE6_BACKUP_RESTORE_VERIFIED",
]);

export const requiredDeploymentBindings = Object.freeze([
  "ALLOWED_ORIGIN",
  "UNANSWERED_QUESTIONS",
  "SUPABASE_URL", // Supabase Auth identity for Phase 6
]);

// Invitation and password emails are sent by Supabase Auth, and client
// documents live in Supabase Storage, both using SUPABASE_SERVICE_ROLE_KEY.
export const optionalProductionBindings = Object.freeze([
  "PHASE6_BOOTSTRAP_SECRET",
  "PHASE6_APP_ORIGIN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PHASE6_DOCUMENTS",
  "PHASE6_MALWARE_SCANNER",
]);

function isHttpsOrigin(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateDeploymentReadiness(env = {}) {
  const missingFlags = requiredPhase6SecurityFlags.filter((flag) => env[flag] !== "true");
  const missingBindings = [];

  if (!isHttpsOrigin(env.ALLOWED_ORIGIN)) {
    missingBindings.push("ALLOWED_ORIGIN");
  }
  if (!env.UNANSWERED_QUESTIONS) {
    missingBindings.push("UNANSWERED_QUESTIONS");
  }
  if (!isHttpsOrigin(env.SUPABASE_URL)) {
    missingBindings.push("SUPABASE_URL");
  }
  if (typeof env.PHASE6_APP_ORIGIN === "string" && !isHttpsOrigin(env.PHASE6_APP_ORIGIN)) {
    missingBindings.push("PHASE6_APP_ORIGIN");
  }

  const missingOptionalBindings = optionalProductionBindings.filter((name) => {
    if (name === "PHASE6_BOOTSTRAP_SECRET") {
      return typeof env[name] !== "string" || env[name].length < 16;
    }
    if (name === "PHASE6_APP_ORIGIN") return !isHttpsOrigin(env[name]);
    // service_role JWT (Storage rejects sb_secret_ keys; see supabase-auth.mjs).
    if (name === "SUPABASE_SERVICE_ROLE_KEY") return typeof env[name] !== "string" || !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(env[name]);
    if (name === "PHASE6_DOCUMENTS") {
      return typeof env[name]?.put !== "function" ||
        typeof env[name]?.get !== "function" ||
        typeof env[name]?.delete !== "function";
    }
    if (name === "PHASE6_MALWARE_SCANNER") return typeof env[name]?.fetch !== "function";
    return true;
  });

  const warnings = [];
  if (missingOptionalBindings.length > 0) {
    warnings.push(`Production service bindings not yet configured: ${missingOptionalBindings.join(", ")}.`);
  }

  const isReady = missingFlags.length === 0 && missingBindings.length === 0;
  const productionReady = isReady && missingOptionalBindings.length === 0;
  return Object.freeze({
    isReady,
    productionReady,
    missingFlags,
    missingBindings,
    missingProductionBindings: missingOptionalBindings,
    warnings,
    requiresReview: true,
  });
}

export function getDeploymentSecuritySummary(env = {}) {
  const readiness = validateDeploymentReadiness(env);
  return {
    phase: "Phase 9",
    title: "Secure deployment and production readiness",
    readiness,
    status: readiness.productionReady ? "ready" : "fail-closed",
  };
}
