import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  calculateInvoice,
  efrisDashboardResponse,
  handleEfrisApi,
  reconcileRows,
} from "./efris.mjs";

const product = {
  id: "product-1",
  name: "Consulting service",
  item_code: "CONSULT",
  selling_price: 100_000,
  tax_category: "standard",
  vat_rate: 18,
  active: 1,
};

test("calculates discounted invoice lines using the client catalogue rate", () => {
  const invoice = calculateInvoice({
    invoiceType: "tax_invoice",
    transactionDate: "2026-11-02",
    customerName: "Example customer",
    lines: [{ productId: product.id, quantity: 2, discount: 10_000 }],
  }, new Map([[product.id, product]]), "01234567-89ab-cdef-0123-456789abcdef");

  assert.equal(invoice.netAmount, 190_000);
  assert.equal(invoice.vatAmount, 34_200);
  assert.equal(invoice.totalAmount, 224_200);
  assert.equal(invoice.status, "draft");
  assert.match(invoice.invoiceNumber, /^DRAFT-20261102-/);
});

test("requires an original invoice reference for credit and debit notes", () => {
  for (const invoiceType of ["credit_note", "debit_note"]) {
    assert.throws(() => calculateInvoice({
      invoiceType,
      transactionDate: "2026-11-02",
      customerName: "Example customer",
      lines: [{ productId: product.id, quantity: 1 }],
    }, new Map([[product.id, product]])), /Original invoice reference is required/);
  }
});

test("rejects products outside the selected client's catalogue and invalid dates", () => {
  assert.throws(() => calculateInvoice({
    invoiceType: "receipt",
    transactionDate: "2026-02-31",
    customerName: "Example customer",
    lines: [{ productId: "other-client-product", quantity: 1 }],
  }, new Map([[product.id, product]])), /valid transaction date/);
  assert.throws(() => calculateInvoice({
    invoiceType: "receipt",
    transactionDate: "2026-11-02",
    customerName: "Example customer",
    lines: [{ productId: "other-client-product", quantity: 1 }],
  }, new Map([[product.id, product]])), /active product for this client/);
});

test("requires original references and prevents discounts above a line total", () => {
  assert.throws(() => calculateInvoice({
    invoiceType: "tax_invoice",
    transactionDate: "2026-11-02",
    customerName: "Example customer",
    lines: [{ productId: product.id, quantity: 1, discount: 100_001 }],
  }, new Map([[product.id, product]])), /discount cannot exceed/);
});

test("reconciles matched, partially matched, unmatched and duplicate imports", () => {
  const rows = [
    { sourceType: "efris", invoiceNumber: "INV-1", amount: 118, vatAmount: 18 },
    { sourceType: "sales_ledger", invoiceNumber: "inv-1", amount: 118, vatAmount: 18 },
    { sourceType: "efris", invoiceNumber: "INV-2", amount: 118, vatAmount: 18 },
    { sourceType: "sales_ledger", invoiceNumber: "INV-2", amount: 120, vatAmount: 18 },
    { sourceType: "sales_ledger", invoiceNumber: "INV-3", amount: 50, vatAmount: 0 },
    { sourceType: "efris", invoiceNumber: "INV-4", amount: 100, vatAmount: 15 },
    { sourceType: "efris", invoiceNumber: "INV-4", amount: 100, vatAmount: 15 },
  ];
  const result = reconcileRows(rows);
  assert.deepEqual(result.map((row) => [row.invoiceNumber, row.status]), [
    ["inv-1", "matched"],
    ["inv-2", "partially_matched"],
    ["inv-3", "unmatched"],
    ["inv-4", "duplicate"],
  ]);
  assert.equal(result[1].amountDifference, -2);
  assert.equal(result[1].vatDifference, 0);
});

test("flags missing fiscalisation evidence and classification differences for review", () => {
  const missingReference = reconcileRows([{
    sourceType: "efris",
    invoiceNumber: "INV-REF",
    status: "fiscalised",
    fiscalisationReference: "",
    amount: 118,
    vatAmount: 18,
  }]);
  assert.equal(missingReference[0].status, "requires_investigation");
  assert.ok(missingReference[0].issues.includes("missing_fiscalisation_reference"));

  const classificationDifference = reconcileRows([
    {
      sourceType: "efris",
      invoiceNumber: "INV-CAT",
      status: "fiscalised",
      fiscalisationReference: "IMPORTED-REF",
      taxCategory: "standard",
      amount: 118,
      vatAmount: 18,
    },
    {
      sourceType: "sales_ledger",
      invoiceNumber: "INV-CAT",
      taxCategory: "exempt",
      amount: 118,
      vatAmount: 18,
    },
  ]);
  assert.equal(classificationDifference[0].status, "requires_investigation");
  assert.ok(classificationDifference[0].issues.includes("tax_classification_difference"));
});

test("uses a zero VAT rate for zero-rated, exempt and out-of-scope catalogue items", () => {
  assert.throws(() => calculateInvoice({
    invoiceType: "tax_invoice",
    transactionDate: "2026-11-02",
    customerName: "Example customer",
    lines: [{ productId: "exempt-1", quantity: 1 }],
  }, new Map([["exempt-1", {
    ...product,
    id: "exempt-1",
    tax_category: "exempt",
    vat_rate: 18,
  }]])), /zero rate/);
});

test("keeps every workspace query scoped to the selected client", async () => {
  const statements = [];
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          statements.push({ statement, values });
          return {
            first: async () => ({ id: values[0] }),
            all: async () => ({ results: [] }),
          };
        },
      };
    },
  };
  const response = await handleEfrisApi(
    new Request("https://worker.example/admin/efris/api?clientId=client-1"),
    { UNANSWERED_QUESTIONS: database },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).selectedClientId, "client-1");
  assert.equal(statements.length, 5);
  assert.ok(statements.slice(2).every(({ statement, values }) => (
    /WHERE client_id = \?/.test(statement) && values[0] === "client-1"
  )));
});

test("rejects normalized CSV imports that claim unsupported status values", async () => {
  const statements = [];
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          statements.push({ statement, values });
          return { first: async () => ({ id: values[0] }) };
        },
      };
    },
  };
  const response = await handleEfrisApi(
    new Request("https://worker.example/admin/efris/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "importRows",
        clientId: "client-1",
        sourceType: "efris",
        rows: [{
          invoiceNumber: "INV-1",
          transactionDate: "2026-11-02",
          amount: 118,
          vatAmount: 18,
          taxCategory: "standard",
          status: "confirmed",
        }],
      }),
    }),
    { UNANSWERED_QUESTIONS: database },
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unsupported imported status/);
  assert.equal(statements.length, 1);
});

test("creates a client-scoped internal draft without a fiscalisation action", async () => {
  const productQuery = [];
  const batches = [];
  const database = {
    prepare(statement) {
      return {
        bind(...values) {
          productQuery.push({ statement, values });
          return {
            first: async () => ({ id: "client-1" }),
            all: async () => ({
              results: statement.includes("FROM efris_products")
                ? [product]
                : [],
            }),
          };
        },
      };
    },
    batch: async (statements) => {
      batches.push(statements);
      return [];
    },
  };
  const response = await handleEfrisApi(
    new Request("https://worker.example/admin/efris/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createInvoice",
        clientId: "client-1",
        invoiceType: "tax_invoice",
        transactionDate: "2026-11-02",
        customerName: "Example customer",
        lines: [{ productId: product.id, quantity: 1 }],
      }),
    }),
    { UNANSWERED_QUESTIONS: database },
  );
  assert.equal(response.status, 201);
  const { invoice } = await response.json();
  assert.equal(invoice.status, "draft");
  assert.equal(invoice.totalAmount, 118_000);
  assert.match(invoice.invoiceNumber, /^DRAFT-/);
  assert.ok(productQuery.some(({ statement, values }) => (
    statement.includes("FROM efris_products WHERE client_id = ?") &&
    values[0] === "client-1"
  )));
  assert.equal(batches[0].length, 2);

  const unsupportedAction = await handleEfrisApi(
    new Request("https://worker.example/admin/efris/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fiscaliseInvoice",
        clientId: "client-1",
        invoiceId: invoice.id,
      }),
    }),
    { UNANSWERED_QUESTIONS: database },
  );
  assert.equal(unsupportedAction.status, 400);
});

test("serves a syntactically valid, non-fiscalising dashboard", async () => {
  const response = efrisDashboardResponse({ ADMIN_SHARED_TOKEN_ENABLED: "true" });
  const html = await response.text();
  const tag = html.match(/<script nonce="([A-Za-z0-9]+)">/);
  assert.ok(tag, "the page script carries the per-response CSP nonce");
  assert.match(response.headers.get("Content-Security-Policy"), new RegExp(`script-src 'nonce-${tag[1]}'`));
  const scriptTagStart = tag.index;
  const scriptStart = scriptTagStart + tag[0].length;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(html, /manual\/import workflow only/i);
  assert.match(html, /not submitted or fiscalised/i);
  assert.ok(scriptTagStart >= 0);
  assert.ok(scriptEnd > scriptStart);
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", "-"], {
    input: html.slice(scriptStart, scriptEnd),
    encoding: "utf8",
  }));
});
