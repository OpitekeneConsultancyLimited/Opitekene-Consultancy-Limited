export const requiredPhase6SecurityFlags = Object.freeze([
  "PHASE6_OPERATIONS_ENABLED",
  "PHASE6_SECURITY_REVIEWED",
  "PHASE6_DATA_AT_REST_REVIEWED",
  "PHASE6_BACKUP_RESTORE_VERIFIED",
]);

export const requiredDeploymentBindings = Object.freeze([
  "ALLOWED_ORIGIN",
  "UNANSWERED_QUESTIONS",
]);

export const optionalProductionBindings = Object.freeze([
  "PHASE6_BOOTSTRAP_SECRET",
  "PHASE6_APP_ORIGIN",
  "PHASE6_EMAIL_SERVICE",
  "PHASE6_EMAIL_ENDPOINT",
  "PHASE6_EMAIL_API_KEY",
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
  if (typeof env.PHASE6_APP_ORIGIN === "string" && !isHttpsOrigin(env.PHASE6_APP_ORIGIN)) {
    missingBindings.push("PHASE6_APP_ORIGIN");
  }

  const missingOptionalBindings = optionalProductionBindings.filter((name) => {
    if (name === "PHASE6_BOOTSTRAP_SECRET") {
      return typeof env[name] !== "string" || env[name].length < 16;
    }
    if (name === "PHASE6_APP_ORIGIN") return !isHttpsOrigin(env[name]);
    if (name === "PHASE6_EMAIL_SERVICE") return typeof env[name]?.fetch !== "function";
    if (name === "PHASE6_EMAIL_ENDPOINT") return !isHttpsOrigin(env[name]);
    if (name === "PHASE6_EMAIL_API_KEY") return typeof env[name] !== "string" || env[name].length < 24;
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
