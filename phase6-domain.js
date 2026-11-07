"use strict";

const SCHEMA_VERSION = 1;

function assertPlainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${field} must be a plain object.`);
  }
}

function requireText(value, field, maxLength = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new RangeError(`${field} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalText(value, field, maxLength = 500) {
  if (value == null || value === "") return null;
  return requireText(value, field, maxLength);
}

function requireIsoDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must be an ISO date (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${field} must be a valid ISO date (YYYY-MM-DD).`);
  }
  return value;
}

function requireIsoInstant(value, field) {
  if (typeof value !== "string") throw new RangeError(`${field} must be an ISO timestamp.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`${field} must be a UTC ISO timestamp.`);
  }
  return value;
}

function requireTaxPeriod(value, field = "taxPeriod", { nullable = false } = {}) {
  if (nullable && value == null) return null;
  const period = requireText(value, field, 9);
  const match = /^(20\d{2})\/(\d{2})$/.exec(period);
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) {
    throw new RangeError(`${field} must use FY format YYYY/YY (for example, 2025/26).`);
  }
  return period;
}

function cloneJson(value, field) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError();
    return JSON.parse(serialized);
  } catch {
    throw new TypeError(`${field} must contain JSON-serializable data.`);
  }
}

function requireStringArray(value, field, { maxItems = 100, maxLength = 200 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new RangeError(`${field} must be an array of at most ${maxItems} strings.`);
  }
  return value.map((item, index) => requireText(item, `${field}[${index}]`, maxLength));
}

module.exports = {
  SCHEMA_VERSION,
  assertPlainObject,
  requireText,
  optionalText,
  requireIsoDate,
  requireIsoInstant,
  requireTaxPeriod,
  cloneJson,
  requireStringArray,
};