// EFRIS workspace end to end on real Postgres (PGlite) through the Supabase adapter.
import test from "node:test";
import assert from "node:assert/strict";
import { handleEfrisApi } from "./efris.mjs";
import { createMigratedDatabase } from "./pglite-test-support.mjs";

test("EFRIS workspace runs end to end on Supabase Postgres", { timeout: 60_000 }, async () => {
  const { pg, db } = await createMigratedDatabase();
  const env = { UNANSWERED_QUESTIONS: db };
  const post = async (body, expected) => {
    const response = await handleEfrisApi(new Request("https://worker.example/admin/efris/api", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), env);
    const json = await response.json();
    assert.equal(response.status, expected, `${body.action}: ${JSON.stringify(json)}`);
    return json;
  };

  const { client } = await post({ action: "createClient", name: "Synthetic Trader", tin: "1000000001" }, 201);
  const product = { action: "createProduct", clientId: client.id, name: "Consulting hour", unit: "hour",
    sellingPrice: 100_000, taxCategory: "standard", vatRate: 18, itemCode: "SVC-1", active: true };
  const created = (await post(product, 201)).product;
  const exempt = (await post({ ...product, name: "Exempt item", itemCode: "EX-1", taxCategory: "exempt", vatRate: 0 }, 201)).product;
  const duplicate = await post(product, 409);
  assert.match(duplicate.error, /conflicting unique value/, "Postgres unique violation mapped like D1");
  await post({ ...product, action: "updateProduct", id: created.id, sellingPrice: 120_000 }, 200);
  await post({ ...product, action: "updateProduct", id: "00000000-0000-0000-0000-000000000000" }, 404);

  const { invoice } = await post({
    action: "createInvoice", clientId: client.id, invoiceType: "tax_invoice", transactionDate: "2026-11-02",
    customerName: "Synthetic Customer", lines: [
      { productId: created.id, quantity: 2 },
      { productId: exempt.id, quantity: 1 },
    ],
  }, 201);
  assert.equal(invoice.netAmount, 240_000 + 100_000);
  assert.equal(invoice.vatAmount, 43_200);
  await post({ action: "validateInvoice", clientId: client.id, invoiceId: invoice.id }, 200);
  await post({ action: "validateInvoice", clientId: client.id, invoiceId: invoice.id }, 409);

  await post({ action: "importRows", clientId: client.id, sourceType: "sales_ledger", rows: [
    { invoiceNumber: "INV-9", transactionDate: "2026-11-01", amount: 118, vatAmount: 18, taxCategory: "standard" },
  ] }, 201);

  const workspace = await (await handleEfrisApi(new Request(`https://worker.example/admin/efris/api?clientId=${client.id}`), env)).json();
  assert.equal(workspace.selectedClientId, client.id);
  assert.equal(workspace.products.length, 2);
  assert.equal(workspace.products.find((p) => p.id === created.id).sellingPrice, 120_000);
  assert.equal(workspace.invoices[0].status, "validated");
  assert.equal(workspace.invoices[0].lines.length, 2);
  assert.equal(workspace.imports.length, 1);
  const audits = await db.prepare("SELECT COUNT(*) AS n FROM efris_audit_log WHERE client_id = ?").bind(client.id).first();
  assert.ok(audits.n >= 6);
  await pg.close();
});
