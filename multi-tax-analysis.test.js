import assert from "node:assert/strict";
import test from "node:test";
import taxCalculator from "./tax-calculator.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { assessTransaction } = require("./multi-tax-analysis.js");

function transaction(overrides = {}) {
  return {
    reference: "TEST-1",
    eventDate: "2026-09-15",
    scenario: "professional-services",
    direction: "payment",
    partyType: "company",
    partyRole: "customer",
    residency: "resident",
    supplierResidency: "resident",
    amount: 2_000_000,
    assetType: "services",
    supplierVat: "registered",
    vatTreatment: "standard",
    amountIncludesVat: false,
    whtAgent: "yes",
    employmentRelationship: "no",
    instrumentExecuted: "no",
    industrialBuilding: "no",
    efrisStatus: "not-recorded",
    payeRole: "primary",
    primaryMonthlyTaxableIncome: null,
    annualRentalAmount: false,
    relatedParty: false,
    description: "Consultancy payment",
    ...overrides,
  };
}

test("one professional-services transaction maps VAT, WHT, income tax, PAYE and EFRIS separately", () => {
  const assessment = assessTransaction(transaction(), taxCalculator);
  const heads = new Map(assessment.taxHeads.map((head) => [head.key, head]));

  assert.equal(heads.get("vat").calculation.amount, 360_000);
  assert.equal(heads.get("withholding-tax").calculation.amount, 120_000);
  assert.equal(heads.get("corporate-income-tax").status, "information_required");
  assert.equal(heads.get("paye").status, "not_indicated");
  assert.equal(heads.get("efris").status, "information_required");
  assert.equal(assessment.finalTaxPayable, null);
});

test("payroll uses existing PAYE calculation and does not classify salary as VAT", () => {
  const assessment = assessTransaction(transaction({
    scenario: "employment",
    direction: "payroll",
    partyRole: "employee",
    partyType: "individual",
    amount: 2_000_000,
    assetType: "employment",
    supplierVat: "not-registered",
    vatTreatment: "out-of-scope",
    supplierResidency: "unknown",
    whtAgent: "unknown",
    employmentRelationship: "yes",
    residency: "resident",
  }), taxCalculator);
  const heads = new Map(assessment.taxHeads.map((head) => [head.key, head]));

  assert.equal(heads.get("vat").status, "not_indicated");
  assert.equal(heads.get("paye").status, "calculated");
  assert.ok(heads.get("paye").calculation.amount > 0);
  assert.equal(heads.has("withholding-tax"), false);
});

test("secondary payroll uses the employee's primary taxable pay and keeps withholding distinct", () => {
  const assessment = assessTransaction(transaction({
    scenario: "employment",
    direction: "payroll",
    partyRole: "employee",
    partyType: "individual",
    amount: 1_000_000,
    assetType: "employment",
    residency: "resident",
    employmentRelationship: "yes",
    payeRole: "secondary",
    primaryMonthlyTaxableIncome: 2_000_000,
  }), taxCalculator);
  const paye = assessment.taxHeads.find((head) => head.key === "paye");

  assert.equal(paye.status, "calculated");
  assert.equal(
    paye.calculation.amount,
    taxCalculator.calculatePayeWithSecondaryEmployment(2_000_000, 1_000_000, true)
      .secondaryMonthlyTax,
  );
  assert.equal(assessment.calculations[0].kind, "monthly-payroll");
});

test("commercial-property purchase identifies duty and allowances without inventing a disposal gain", () => {
  const assessment = assessTransaction(transaction({
    scenario: "property",
    direction: "purchase",
    partyType: "company",
    partyRole: "buyer",
    assetType: "mixed-property",
    instrumentExecuted: "yes",
    supplierVat: "unknown",
    vatTreatment: "unknown",
    whtAgent: "unknown",
    employmentRelationship: "unknown",
    industrialBuilding: "unknown",
  }), taxCalculator);
  const heads = new Set(assessment.taxHeads.map((head) => head.key));

  assert.ok(heads.has("stamp-duty"));
  assert.ok(heads.has("capital-allowances"));
  assert.equal(heads.has("income-tax-disposal"), false);
  assert.ok(assessment.riskFlags.some((flag) => flag.includes("Separate land")));
});

test("asset disposal requests cost-base facts and does not apply a universal capital-gains rate", () => {
  const assessment = assessTransaction(transaction({
    scenario: "property",
    direction: "sale",
    partyRole: "seller",
    assetType: "building",
    supplierVat: "unknown",
    vatTreatment: "unknown",
    whtAgent: "unknown",
    employmentRelationship: "unknown",
    instrumentExecuted: "unknown",
  }), taxCalculator);
  const disposal = assessment.taxHeads.find((head) => head.key === "income-tax-disposal");

  assert.equal(disposal.status, "information_required");
  assert.match(disposal.reason, /No universal capital-gains rate/);
  assert.equal(disposal.calculation, null);
});

test("annual rental income invokes the existing individual rental calculator", () => {
  const assessment = assessTransaction(transaction({
    scenario: "commercial-rental",
    direction: "income",
    partyType: "individual",
    partyRole: "landlord",
    residency: "resident",
    supplierResidency: "unknown",
    amount: 12_000_000,
    assetType: "rent",
    supplierVat: "unknown",
    vatTreatment: "unknown",
    whtAgent: "no",
    employmentRelationship: "no",
    annualRentalAmount: true,
  }), taxCalculator);
  const rental = assessment.taxHeads.find((head) => head.key === "rental-income-tax");

  assert.equal(rental.status, "calculated");
  assert.equal(
    rental.calculation.amount,
    taxCalculator.calculateRentalIncomeTax({
      grossRentalIncome: 12_000_000,
      taxpayerType: "individual",
      residency: "resident",
    }).tax,
  );
});

test("imported machinery flags customs facts and does not use a domestic VAT base", () => {
  const assessment = assessTransaction(transaction({
    scenario: "imported-machinery",
    direction: "purchase",
    partyRole: "importer",
    assetType: "machinery",
    supplierVat: "registered",
    vatTreatment: "standard",
    instrumentExecuted: "no",
    whtAgent: "yes",
    industrialBuilding: "no",
  }), taxCalculator);
  const heads = new Map(assessment.taxHeads.map((head) => [head.key, head]));

  assert.equal(heads.get("vat").status, "information_required");
  assert.equal(heads.get("customs-import-taxes").status, "information_required");
  assert.equal(heads.get("capital-allowances").status, "information_required");
  assert.equal(heads.get("vat").calculation, null);
});

test("foreign supplier registration status cannot suppress import VAT assessment", () => {
  const assessment = assessTransaction(transaction({
    scenario: "imported-machinery",
    direction: "purchase",
    partyRole: "importer",
    assetType: "machinery",
    supplierVat: "not-registered",
    vatTreatment: "out-of-scope",
    instrumentExecuted: "no",
    industrialBuilding: "no",
  }), taxCalculator);
  const vat = assessment.taxHeads.find((head) => head.key === "vat");

  assert.equal(vat.status, "information_required");
  assert.match(vat.reason, /Import VAT/);
  assert.equal(vat.calculation, null);
});

test("an industrial-building disposal requests prior-allowance and balancing-adjustment facts", () => {
  const assessment = assessTransaction(transaction({
    scenario: "industrial-building",
    direction: "sale",
    partyRole: "seller",
    assetType: "building",
    supplierVat: "unknown",
    vatTreatment: "unknown",
    whtAgent: "unknown",
    employmentRelationship: "unknown",
    instrumentExecuted: "yes",
    industrialBuilding: "yes",
  }), taxCalculator);
  const allowance = assessment.taxHeads.find(
    (head) => head.key === "industrial-building-deduction",
  );

  assert.equal(allowance.status, "information_required");
  assert.match(allowance.reason, /disposal may affect prior building deductions/);
  assert.equal(assessment.taxHeads.some((head) => head.key === "capital-allowances"), false);
});

test("a share purchase can flag instrument review without inventing a disposal tax", () => {
  const assessment = assessTransaction(transaction({
    scenario: "share-transfer",
    direction: "purchase",
    partyRole: "buyer",
    assetType: "shares",
    supplierVat: "unknown",
    vatTreatment: "unknown",
    instrumentExecuted: "yes",
    industrialBuilding: "no",
  }), taxCalculator);
  const heads = new Map(assessment.taxHeads.map((head) => [head.key, head]));

  assert.equal(heads.get("vat").status, "not_indicated");
  assert.equal(heads.get("stamp-duty").status, "information_required");
  assert.equal(heads.has("income-tax-disposal"), false);
});

test("user-marked out-of-scope supply is not run through the output-VAT estimator", () => {
  const assessment = assessTransaction(transaction({
    vatTreatment: "out-of-scope",
  }), taxCalculator);
  const vat = assessment.taxHeads.find((head) => head.key === "vat");

  assert.equal(vat.status, "not_indicated");
  assert.equal(vat.calculation, null);
});

test("description keywords cannot create tax-head matches without structured facts", () => {
  const ordinary = assessTransaction(transaction({
    scenario: "other",
    direction: "other",
    description: "VAT withholding stamp duty PAYE property sale",
  }), taxCalculator);

  assert.equal(ordinary.taxHeads.some((head) =>
    ["vat", "stamp-duty", "income-tax-disposal"].includes(head.key)), false);
  assert.equal(ordinary.taxHeads.some((head) => head.status === "calculated"), false);
});

test("missing tax residence and related-party facts are surfaced for review", () => {
  const assessment = assessTransaction(transaction({
    supplierResidency: "unknown",
    whtAgent: "unknown",
    relatedParty: true,
  }), taxCalculator);

  assert.equal(assessment.status, "information_required");
  assert.ok(assessment.riskFlags.some((flag) => flag.includes("Related-party")));
  assert.ok(
    assessment.taxHeads.find((head) => head.key === "withholding-tax")
      .informationRequired.length > 0,
  );
});
