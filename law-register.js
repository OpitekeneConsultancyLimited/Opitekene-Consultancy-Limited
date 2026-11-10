(function () {
"use strict";

// Uganda Tax Law Register - point-in-time resolver.
//
// Works on rows shaped like the taxcomp.law_* tables (camelCase). It answers
// "what did provision X say on date D?" and keeps three things apart:
//   * law in force       - verified provision from a commenced, verified instrument
//   * unverified law     - a matching version exists but nobody has verified it
//   * pending changes    - amendments from bills / unconfirmed / not-yet-commenced
//                          instruments; reported, never applied (Phase 7 rule)
// Statutory time limits are computed here too; a date from an unverified rule
// is always marked provisional.

const LEGISLATIVE_STATUSES = Object.freeze(["bill", "passed", "assented", "commenced", "repealed", "unconfirmed"]);
const IN_FORCE_STATUSES = new Set(["commenced", "repealed"]);

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requireIsoDate(value, label) {
  if (!isIsoDate(value)) throw new RangeError(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

function freezeCopy(rows) {
  return Object.freeze((rows || []).map((row) => Object.freeze({ ...row })));
}

function createLawRegister({ instruments = [], provisions = [], amendments = [], timeLimits = [] } = {}) {
  const instrumentRows = freezeCopy(instruments);
  const provisionRows = freezeCopy(provisions);
  const amendmentRows = freezeCopy(amendments);
  const limitRows = freezeCopy(timeLimits);
  const instrumentsById = new Map(instrumentRows.map((row) => [row.id, row]));

  for (const row of instrumentRows) {
    if (!LEGISLATIVE_STATUSES.includes(row.legislativeStatus)) {
      throw new RangeError(`Instrument ${row.id} has an unknown legislative status: ${row.legislativeStatus}.`);
    }
  }

  function instrumentIsLaw(instrument, asAt) {
    if (!instrument || !IN_FORCE_STATUSES.has(instrument.legislativeStatus)) return false;
    if (instrument.verificationStatus !== "verified") return false;
    return !instrument.commencementDate || instrument.commencementDate <= asAt;
  }

  function sourceInstrument(provision) {
    return instrumentsById.get(provision.introducedByInstrumentId || provision.instrumentId) || null;
  }

  function versionCovers(provision, asAt) {
    return Boolean(provision.effectiveFrom) && provision.effectiveFrom <= asAt &&
      (!provision.effectiveTo || asAt <= provision.effectiveTo);
  }

  /** Changes to a provision that are proposed or not yet in force. Never applied. */
  function pendingChanges(provisionKey, asAt) {
    requireIsoDate(asAt, "As-at date");
    return amendmentRows
      .filter((row) => row.targetProvisionKey === provisionKey)
      .map((row) => ({ amendment: row, instrument: instrumentsById.get(row.amendingInstrumentId) || null }))
      .filter(({ amendment, instrument }) => !instrumentIsLaw(instrument, asAt) ||
        (amendment.effectiveFrom && amendment.effectiveFrom > asAt))
      .map(({ amendment, instrument }) => ({
        amendmentId: amendment.id,
        changeKind: amendment.changeKind,
        summary: amendment.summary || "",
        instrumentId: amendment.amendingInstrumentId,
        instrumentTitle: instrument?.shortTitle || amendment.amendingInstrumentId,
        legislativeStatus: instrument?.legislativeStatus || "unconfirmed",
        effectiveFrom: amendment.effectiveFrom || null,
        label: instrument?.legislativeStatus === "bill" ? "Proposed (bill) - not law" : "Not yet in force or not confirmed",
      }));
  }

  /** The version of a provision that applied on a date, with its standing. */
  function resolveProvision(provisionKey, asAt) {
    requireIsoDate(asAt, "As-at date");
    const versions = provisionRows.filter((row) => row.provisionKey === provisionKey)
      .sort((left, right) => right.versionNo - left.versionNo);
    const pending = pendingChanges(provisionKey, asAt);
    if (versions.length === 0) {
      return { status: "not-found", provisionKey, asAt, provision: null, instrument: null, pendingChanges: pending,
        warnings: ["This provision is not in the register yet. Read the official text before relying on it."] };
    }

    const covering = versions.filter((row) => versionCovers(row, asAt));
    const asLaw = covering.find((row) => row.verificationStatus === "verified" && instrumentIsLaw(sourceInstrument(row), asAt));
    if (asLaw) {
      return { status: "in-force", provisionKey, asAt, provision: asLaw, instrument: sourceInstrument(asLaw),
        pendingChanges: pending, warnings: pending.length ? ["Changes to this provision are proposed or not yet in force; see pendingChanges."] : [] };
    }

    // A version exists but is unverified, or comes from an instrument whose status is not confirmed.
    const candidate = covering.find((row) => {
      const instrument = sourceInstrument(row);
      return instrument && IN_FORCE_STATUSES.has(instrument.legislativeStatus);
    });
    if (candidate) {
      return { status: "unverified", provisionKey, asAt, provision: candidate, instrument: sourceInstrument(candidate),
        pendingChanges: pending,
        warnings: ["This text has not been verified against the official source. Confirm it before relying on it."] };
    }

    const future = versions.find((row) => row.effectiveFrom && row.effectiveFrom > asAt);
    return { status: future ? "not-yet-in-force" : "not-found", provisionKey, asAt, provision: null, instrument: null,
      pendingChanges: pending,
      warnings: [future ? `A version starts on ${future.effectiveFrom}; nothing verified applies on ${asAt}.`
        : "No version of this provision applies on that date in the register."] };
  }

  function getTimeLimit(limitId) {
    return limitRows.find((row) => row.id === limitId) || null;
  }

  /**
   * Due date for a statutory time limit. Day 1 is the day after the trigger.
   * Unverified rules always give a provisional date. No business-day roll-forward
   * is applied: that rule must itself be verified before it is added.
   */
  function computeTimeLimit(limitId, triggerDate, { today } = {}) {
    const rule = getTimeLimit(limitId);
    if (!rule) throw new RangeError(`Unknown statutory time limit: ${limitId}.`);
    requireIsoDate(triggerDate, "Trigger date");
    if (today !== undefined) requireIsoDate(today, "Today");
    if (!["verified", "pending-review"].includes(rule.verificationStatus)) {
      throw new RangeError(`Time limit ${limitId} is ${rule.verificationStatus} and cannot be used.`);
    }

    const dueDate = rule.periodUnit === "months"
      ? addMonths(triggerDate, rule.periodAmount)
      : addDays(triggerDate, rule.periodAmount);
    const provisional = rule.verificationStatus !== "verified";
    const daysRemaining = today ? daysBetween(today, dueDate) : null;
    const warnings = [];
    if (provisional) {
      warnings.push(`PROVISIONAL: the ${rule.periodAmount}-${rule.periodUnit === "months" ? "month" : "day"} period (${rule.provisionKey}) has not been verified against the current law, including 2026 amendments. Confirm it with a qualified tax professional or URA before relying on this date.`);
    }
    warnings.push("Count from the date the notice was actually served on (received by) the taxpayer. If that date is uncertain, act on the earliest possible date.");

    return {
      limitId,
      label: rule.label,
      provisionKey: rule.provisionKey,
      triggerEvent: rule.triggerEvent,
      triggerDate,
      dueDate,
      daysRemaining,
      provisional,
      ruleVerificationStatus: rule.verificationStatus,
      consequence: rule.consequence || "",
      warnings,
    };
  }

  return Object.freeze({
    resolveProvision,
    pendingChanges,
    computeTimeLimit,
    getTimeLimit,
    instrumentIsLaw: (instrumentId, asAt) => instrumentIsLaw(instrumentsById.get(instrumentId), requireIsoDate(asAt, "As-at date")),
    listInstruments: () => instrumentRows.map((row) => ({ ...row })),
  });
}

// Mirrors the seed rows in supabase/migrations/20261110000000_*.sql so the
// browser and tests use the same register before the Worker serves it.
const SEED_TIME_LIMITS = Object.freeze([
  Object.freeze({ id: "objection-to-assessment", label: "Lodge an objection to a tax decision / assessment", provisionKey: "tpca:s24(1)",
    triggerEvent: "service-of-assessment", periodAmount: 45, periodUnit: "days", verificationStatus: "pending-review",
    consequence: "A late objection may be refused unless the Commissioner accepts an application for extension." }),
  Object.freeze({ id: "commissioner-objection-decision", label: "Commissioner decides the objection", provisionKey: "tpca:s24",
    triggerEvent: "lodgement-of-objection", periodAmount: 90, periodUnit: "days", verificationStatus: "pending-review",
    consequence: "Check the current consequence of no decision within the period." }),
  Object.freeze({ id: "tat-application", label: "Apply to the Tax Appeals Tribunal for review of an objection decision", provisionKey: "tata:s16",
    triggerEvent: "service-of-objection-decision", periodAmount: 30, periodUnit: "days", verificationStatus: "pending-review",
    consequence: "Check payment-on-objection / deposit requirements that apply before the Tribunal hears the matter." }),
]);

const lawRegisterApi = Object.freeze({
  LEGISLATIVE_STATUSES,
  SEED_TIME_LIMITS,
  createLawRegister,
  addDays,
  addMonths,
  daysBetween,
  isIsoDate,
});

if (typeof module === "object" && module.exports) module.exports = lawRegisterApi;
if (typeof globalThis !== "undefined") globalThis.taxCompLawRegister = lawRegisterApi;
})();
