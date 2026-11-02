const MAX_BODY_BYTES = 1_000_000;
const MAX_IMPORT_ROWS = 400;
const MAX_LIST_ROWS = 500;
const TAX_CATEGORIES = new Set(["standard", "zero_rated", "exempt", "out_of_scope"]);
const INVOICE_TYPES = new Set(["tax_invoice", "receipt", "credit_note", "debit_note"]);
const IMPORT_STATUSES = new Set([
  "draft",
  "validated",
  "submitted",
  "fiscalised",
  "rejected",
  "cancelled",
]);

class InputError extends Error {}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

function cleanText(value, label, maxLength, required = false) {
  if (typeof value !== "string") {
    if (required) throw new InputError(`${label} is required.`);
    return "";
  }
  const text = value.trim();
  if (required && !text) throw new InputError(`${label} is required.`);
  if (text.length > maxLength) throw new InputError(`${label} is too long.`);
  return text;
}

function finiteNumber(value, label, minimum, maximum, allowZero = true) {
  if (value === null || value === undefined ||
      (typeof value === "string" && !value.trim())) {
    throw new InputError(`${label} must be a number.`);
  }
  if (typeof value === "string" &&
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    throw new InputError(`${label} must be a number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum ||
      (!allowZero && number === 0)) {
    throw new InputError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function roundedAmount(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeTaxCategory(value) {
  if (!TAX_CATEGORIES.has(value)) {
    throw new InputError("Choose a supported internal tax category.");
  }
  return value;
}

function normalizeProduct(input) {
  const taxCategory = normalizeTaxCategory(input.taxCategory);
  const vatRate = finiteNumber(input.vatRate, "VAT rate", 0, 100);
  if (taxCategory !== "standard" && vatRate !== 0) {
    throw new InputError("Use a zero rate for zero-rated, exempt or out-of-scope items.");
  }
  return {
    name: cleanText(input.name, "Product or service name", 120, true),
    description: cleanText(input.description, "Description", 500),
    itemCode: cleanText(input.itemCode, "Item code", 80),
    unit: cleanText(input.unit, "Unit of measure", 40, true),
    sellingPrice: finiteNumber(input.sellingPrice, "Selling price", 0, 1_000_000_000),
    taxCategory,
    vatRate,
    classificationCode: cleanText(input.classificationCode, "EFRIS classification code", 100),
    active: input.active === false || input.active === "false" || input.active === "0"
      ? 0
      : 1,
  };
}

export function calculateInvoice(input, products, id = crypto.randomUUID()) {
  if (!input || !Array.isArray(input.lines) || input.lines.length < 1 ||
      input.lines.length > 50) {
    throw new InputError("An invoice must contain between 1 and 50 lines.");
  }
  if (!INVOICE_TYPES.has(input.invoiceType)) {
    throw new InputError("Choose a supported invoice type.");
  }
  if (!validDate(input.transactionDate)) {
    throw new InputError("Enter a valid transaction date.");
  }
  const originalInvoiceNumber = cleanText(
    input.originalInvoiceNumber,
    "Original invoice reference",
    120,
    input.invoiceType === "credit_note" || input.invoiceType === "debit_note",
  );
  const lines = input.lines.map((line) => {
    const product = products.get(line.productId);
    if (!product || !product.active) {
      throw new InputError("Each invoice line must use an active product for this client.");
    }
    const taxCategory = normalizeTaxCategory(product.tax_category);
    const vatRate = finiteNumber(product.vat_rate, "VAT rate", 0, 100);
    if (taxCategory !== "standard" && vatRate !== 0) {
      throw new InputError("Use a zero rate for zero-rated, exempt or out-of-scope items.");
    }
    const quantity = finiteNumber(line.quantity, "Quantity", 0, 1_000_000, false);
    const unitPrice = finiteNumber(product.selling_price, "Unit price", 0, 1_000_000_000);
    const discount = finiteNumber(line.discount || 0, "Discount", 0, 1_000_000_000);
    const gross = roundedAmount(quantity * unitPrice);
    if (discount > gross) throw new InputError("A line discount cannot exceed its gross amount.");
    const net = roundedAmount(gross - discount);
    const tax = roundedAmount(net * vatRate / 100);
    return {
      productId: product.id,
      description: product.name,
      itemCode: product.item_code,
      quantity,
      unitPrice,
      discount,
      taxCategory,
      vatRate,
      net,
      tax,
      total: roundedAmount(net + tax),
    };
  });
  const netAmount = roundedAmount(lines.reduce((sum, line) => sum + line.net, 0));
  const vatAmount = roundedAmount(lines.reduce((sum, line) => sum + line.tax, 0));
  return {
    id,
    invoiceNumber: `DRAFT-${input.transactionDate.replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
    invoiceType: input.invoiceType,
    transactionDate: input.transactionDate,
    customerName: cleanText(input.customerName, "Customer name", 160, true),
    customerTin: cleanText(input.customerTin, "Customer TIN", 40),
    originalInvoiceNumber,
    lines,
    netAmount,
    vatAmount,
    totalAmount: roundedAmount(netAmount + vatAmount),
    status: "draft",
  };
}

function normalizeImportedRow(row, sourceType, rowNumber) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new InputError(`CSV row ${rowNumber} must contain an object.`);
  }
  const invoiceNumber = cleanText(row.invoiceNumber, `CSV row ${rowNumber} invoice number`, 120, true);
  if (!validDate(row.transactionDate)) {
    throw new InputError(`CSV row ${rowNumber} must have a valid YYYY-MM-DD date.`);
  }
  const amount = finiteNumber(row.amount, `CSV row ${rowNumber} amount`, 0, 1_000_000_000_000);
  const vatAmount = finiteNumber(row.vatAmount, `CSV row ${rowNumber} VAT amount`, 0, amount);
  let taxCategory = "";
  let status = "recorded";
  let fiscalisationReference = "";
  if (sourceType === "efris") {
    taxCategory = normalizeTaxCategory(row.taxCategory);
    status = cleanText(row.status, `CSV row ${rowNumber} status`, 32, true).toLowerCase();
    if (!IMPORT_STATUSES.has(status)) {
      throw new InputError(`CSV row ${rowNumber} has an unsupported imported status.`);
    }
    fiscalisationReference = cleanText(row.fiscalisationReference, "Fiscalisation reference", 160);
  } else if (row.taxCategory) {
    taxCategory = normalizeTaxCategory(row.taxCategory);
  }
  return {
    invoiceNumber,
    transactionDate: row.transactionDate,
    customerName: cleanText(row.customerName, "Customer name", 160),
    customerTin: cleanText(row.customerTin, "Customer TIN", 40),
    amount,
    vatAmount,
    taxCategory,
    status,
    fiscalisationReference,
  };
}

export function reconcileRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.invoiceNumber.trim().toLowerCase();
    const entry = grouped.get(key) || { efris: [], sales_ledger: [] };
    if (entry[row.sourceType]) entry[row.sourceType].push(row);
    grouped.set(key, entry);
  }
  return Array.from(grouped.entries()).map(([invoiceNumber, entry]) => {
    if (entry.efris.length > 1 || entry.sales_ledger.length > 1) {
      return {
        invoiceNumber,
        status: "duplicate",
        issues: ["duplicate_invoice"],
        efris: entry.efris,
        ledger: entry.sales_ledger,
      };
    }
    const efris = entry.efris[0];
    const ledger = entry.sales_ledger[0];
    const issues = [];
    if (efris?.status === "fiscalised" && !efris.fiscalisationReference) {
      issues.push("missing_fiscalisation_reference");
    }
    if (efris?.status === "submitted") issues.push("submission_pending");
    if (efris?.status === "rejected") issues.push("failed_submission");
    if (efris && ledger && efris.taxCategory && ledger.taxCategory &&
        efris.taxCategory !== ledger.taxCategory) {
      issues.push("tax_classification_difference");
    }
    if (!entry.efris.length || !entry.sales_ledger.length) {
      return {
        invoiceNumber,
        status: issues.length ? "requires_investigation" : "unmatched",
        issues: [...issues, "missing_source_record"],
        efris: entry.efris,
        ledger: entry.sales_ledger,
      };
    }
    const amountDifference = roundedAmount(Number(efris.amount) - Number(ledger.amount));
    const vatDifference = roundedAmount(Number(efris.vatAmount) - Number(ledger.vatAmount));
    if (amountDifference !== 0) issues.push("transaction_value_difference");
    if (vatDifference !== 0) issues.push("vat_amount_difference");
    const status = issues.some((issue) => [
      "missing_fiscalisation_reference",
      "submission_pending",
      "failed_submission",
      "tax_classification_difference",
    ].includes(issue))
      ? "requires_investigation"
      : amountDifference === 0 && vatDifference === 0 ? "matched"
        : "partially_matched";
    return {
      invoiceNumber,
      status,
      issues,
      amountDifference,
      vatDifference,
      efris: entry.efris,
      ledger: entry.sales_ledger,
    };
  }).sort((left, right) => left.invoiceNumber.localeCompare(right.invoiceNumber));
}

async function readJsonBody(request) {
  if (!request.body) throw new InputError("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("The EFRIS request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SyntaxError("The EFRIS request must contain valid JSON.");
  }
}

async function audit(db, clientId, action, recordId, createdAt) {
  await db.prepare(
    "INSERT INTO efris_audit_log (id, client_id, action, record_id, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), clientId, action, recordId, createdAt).run();
}

async function createClient(db, body) {
  const name = cleanText(body.name, "Client name", 160, true);
  const tin = cleanText(body.tin, "Client TIN", 40);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      "INSERT INTO efris_clients (id, name, tin, created_at) VALUES (?, ?, ?, ?)",
    ).bind(id, name, tin || null, createdAt),
    db.prepare(
      "INSERT INTO efris_audit_log (id, client_id, action, record_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), id, "client.created", id, createdAt),
  ]);
  return { id, name, tin, createdAt };
}

async function requireClient(db, clientId) {
  const client = await db.prepare(
    "SELECT id FROM efris_clients WHERE id = ?",
  ).bind(clientId).first();
  if (!client) return false;
  return true;
}

async function createProduct(db, body, clientId) {
  const product = normalizeProduct(body);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      "INSERT INTO efris_products (id, client_id, name, description, item_code, unit, selling_price, tax_category, vat_rate, classification_code, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      id, clientId, product.name, product.description, product.itemCode,
      product.unit, product.sellingPrice, product.taxCategory, product.vatRate,
      product.classificationCode, product.active, createdAt,
    ),
    db.prepare(
      "INSERT INTO efris_audit_log (id, client_id, action, record_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), clientId, "product.created", id, createdAt),
  ]);
  return { id, clientId, ...product, createdAt };
}

async function updateProduct(db, body, clientId) {
  const id = cleanText(body.id, "Product ID", 36, true);
  const product = normalizeProduct(body);
  const createdAt = new Date().toISOString();
  const result = await db.prepare(
    "UPDATE efris_products SET name = ?, description = ?, item_code = ?, unit = ?, selling_price = ?, tax_category = ?, vat_rate = ?, classification_code = ?, active = ? WHERE id = ? AND client_id = ?",
  ).bind(
    product.name, product.description, product.itemCode, product.unit,
    product.sellingPrice, product.taxCategory, product.vatRate,
    product.classificationCode, product.active, id, clientId,
  ).run();
  if (result.meta?.changes === 0) return null;
  await audit(db, clientId, "product.updated", id, createdAt);
  return { id, clientId, ...product };
}

async function createInvoice(db, body, clientId) {
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 50) {
    throw new InputError("An invoice must contain between 1 and 50 lines.");
  }
  const productIds = Array.from(new Set(body.lines.map((line) => (
    cleanText(line?.productId, "Product ID", 36, true)
  ))));
  const placeholders = productIds.map(() => "?").join(", ");
  const { results = [] } = await db.prepare(
    `SELECT id, name, item_code, selling_price, tax_category, vat_rate, active FROM efris_products WHERE client_id = ? AND id IN (${placeholders})`,
  ).bind(clientId, ...productIds).all();
  const products = new Map(results.map((product) => [product.id, product]));
  const invoice = calculateInvoice(body, products);
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      "INSERT INTO efris_invoices (id, client_id, invoice_number, invoice_type, transaction_date, customer_name, customer_tin, original_invoice_number, lines_json, net_amount, vat_amount, total_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      invoice.id, clientId, invoice.invoiceNumber, invoice.invoiceType,
      invoice.transactionDate, invoice.customerName, invoice.customerTin || null,
      invoice.originalInvoiceNumber || null, JSON.stringify(invoice.lines),
      invoice.netAmount, invoice.vatAmount, invoice.totalAmount, "draft", createdAt,
    ),
    db.prepare(
      "INSERT INTO efris_audit_log (id, client_id, action, record_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), clientId, "invoice.draft_created", invoice.id, createdAt),
  ]);
  return { ...invoice, clientId, createdAt };
}

async function validateInvoice(db, invoiceId, clientId) {
  const createdAt = new Date().toISOString();
  const result = await db.prepare(
    "UPDATE efris_invoices SET status = 'validated' WHERE id = ? AND client_id = ? AND status = 'draft'",
  ).bind(invoiceId, clientId).run();
  if (result.meta?.changes === 0) return false;
  await audit(db, clientId, "invoice.internally_validated", invoiceId, createdAt);
  return true;
}

async function importRows(db, body, clientId) {
  if (!["efris", "sales_ledger"].includes(body.sourceType) ||
      !Array.isArray(body.rows) || body.rows.length < 1 ||
      body.rows.length > MAX_IMPORT_ROWS) {
    throw new InputError(`Choose an import type and provide between 1 and ${MAX_IMPORT_ROWS} rows.`);
  }
  const normalized = body.rows.map((row, index) => (
    normalizeImportedRow(row, body.sourceType, index + 2)
  ));
  const createdAt = new Date().toISOString();
  const statements = normalized.map((row) => db.prepare(
    "INSERT INTO efris_imports (id, client_id, source_type, invoice_number, transaction_date, customer_name, customer_tin, amount, vat_amount, tax_category, imported_status, fiscalisation_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(), clientId, body.sourceType, row.invoiceNumber,
    row.transactionDate, row.customerName || null, row.customerTin || null,
    row.amount, row.vatAmount, row.taxCategory || null, row.status,
    row.fiscalisationReference || null, createdAt,
  ));
  for (let offset = 0; offset < statements.length; offset += 100) {
    await db.batch(statements.slice(offset, offset + 100));
  }
  await audit(db, clientId, `${body.sourceType}.csv_imported`, `rows:${normalized.length}`, createdAt);
  const workspace = await loadWorkspace(db, clientId);
  return { imported: normalized.length, sourceType: body.sourceType, workspace };
}

async function loadWorkspace(db, clientId) {
  const { results: clients = [] } = await db.prepare(
    "SELECT id, name, tin, created_at AS createdAt FROM efris_clients ORDER BY name LIMIT ?",
  ).bind(MAX_LIST_ROWS).all();
  if (!clientId) return { clients, selectedClientId: null };
  if (!await requireClient(db, clientId)) return null;
  const [products, invoices, imports] = await Promise.all([
    db.prepare(
      "SELECT id, client_id AS clientId, name, description, item_code AS itemCode, unit, selling_price AS sellingPrice, tax_category AS taxCategory, vat_rate AS vatRate, classification_code AS classificationCode, active, created_at AS createdAt FROM efris_products WHERE client_id = ? ORDER BY name LIMIT ?",
    ).bind(clientId, MAX_LIST_ROWS).all(),
    db.prepare(
      "SELECT id, client_id AS clientId, invoice_number AS invoiceNumber, invoice_type AS invoiceType, transaction_date AS transactionDate, customer_name AS customerName, customer_tin AS customerTin, original_invoice_number AS originalInvoiceNumber, lines_json AS linesJson, net_amount AS netAmount, vat_amount AS vatAmount, total_amount AS totalAmount, status, created_at AS createdAt FROM efris_invoices WHERE client_id = ? ORDER BY created_at DESC LIMIT ?",
    ).bind(clientId, MAX_LIST_ROWS).all(),
    db.prepare(
      "SELECT id, source_type AS sourceType, invoice_number AS invoiceNumber, transaction_date AS transactionDate, customer_name AS customerName, customer_tin AS customerTin, amount, vat_amount AS vatAmount, tax_category AS taxCategory, imported_status AS status, fiscalisation_reference AS fiscalisationReference, created_at AS createdAt FROM efris_imports WHERE client_id = ? ORDER BY transaction_date DESC LIMIT ?",
    ).bind(clientId, MAX_LIST_ROWS).all(),
  ]);
  const invoiceRows = invoices.results || [];
  const importRowsList = imports.results || [];
  return {
    clients,
    selectedClientId: clientId,
    products: products.results || [],
    invoices: invoiceRows.map((invoice) => ({
      ...invoice,
      lines: JSON.parse(invoice.linesJson),
      linesJson: undefined,
    })),
    imports: importRowsList,
    reconciliation: reconcileRows(importRowsList),
  };
}

export async function handleEfrisApi(request, env) {
  const db = env.UNANSWERED_QUESTIONS;
  if (!db) return jsonResponse({ error: "The EFRIS data store is not configured." }, 503);
  if (request.method === "GET") {
    const clientId = new URL(request.url).searchParams.get("clientId") || "";
    const workspace = await loadWorkspace(db, clientId);
    return workspace
      ? jsonResponse(workspace)
      : jsonResponse({ error: "The selected client was not found." }, 404);
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use GET or POST for the EFRIS workspace." }, 405);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return jsonResponse({ error: "Send EFRIS data as JSON." }, 415);
  }
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return jsonResponse({
      error: error instanceof RangeError ? error.message
        : error instanceof SyntaxError ? error.message
          : error instanceof InputError ? error.message
            : "The EFRIS request could not be read.",
    }, error instanceof RangeError ? 413 : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("The EFRIS request must be a JSON object.");
  }
  try {
    if (body.action === "createClient") {
      return jsonResponse({ client: await createClient(db, body) }, 201);
    }
    const clientId = cleanText(body.clientId, "Client ID", 36, true);
    if (!await requireClient(db, clientId)) {
      return jsonResponse({ error: "The selected client was not found." }, 404);
    }
    if (body.action === "createProduct") {
      return jsonResponse({ product: await createProduct(db, body, clientId) }, 201);
    }
    if (body.action === "updateProduct") {
      const product = await updateProduct(db, body, clientId);
      return product
        ? jsonResponse({ product })
        : jsonResponse({ error: "The product was not found for this client." }, 404);
    }
    if (body.action === "createInvoice") {
      const invoice = await createInvoice(db, body, clientId);
      return invoice
        ? jsonResponse({ invoice }, 201)
        : jsonResponse({ error: "The selected client was not found." }, 404);
    }
    if (body.action === "validateInvoice") {
      const invoiceId = cleanText(body.invoiceId, "Invoice ID", 36, true);
      const validated = await validateInvoice(db, invoiceId, clientId);
      return validated
        ? jsonResponse({ id: invoiceId, status: "validated", note: "Validated internally only; not submitted or fiscalised." })
        : jsonResponse({ error: "Only a draft belonging to this client can be validated." }, 409);
    }
    if (body.action === "importRows") {
      return jsonResponse(await importRows(db, body, clientId), 201);
    }
    return badRequest("Choose a supported EFRIS workspace action.");
  } catch (error) {
    if (error instanceof InputError) return badRequest(error.message);
    if (error instanceof RangeError) return jsonResponse({ error: error.message }, 413);
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      return jsonResponse({ error: "A record with a conflicting unique value already exists." }, 409);
    }
    throw error;
  }
}

export function efrisDashboardResponse() {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>TaxComp EFRIS workspace</title>
<style>
:root{font:15px/1.5 system-ui,sans-serif;color:#17233b;background:#f6f7f2}*{box-sizing:border-box}body{max-width:1180px;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}h1{font-size:2rem}.warning{padding:1rem;background:#fff3cd;border:1px solid #e8c85b;border-radius:.5rem}.card{padding:1rem;background:#fff;border:1px solid #d5dce5;border-radius:.5rem;margin:1rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.8rem}form{display:flex;flex-wrap:wrap;gap:.6rem;align-items:end}label{display:grid;gap:.2rem;min-width:170px;flex:1}input,select,button,textarea{font:inherit;padding:.55rem;border:1px solid #9ca9ba;border-radius:.3rem}button{cursor:pointer;background:#173c6b;color:white;border:0}button.secondary{background:#edf1f6;color:#17233b;border:1px solid #9ca9ba}button:disabled{opacity:.55;cursor:wait}table{width:100%;border-collapse:collapse;display:block;overflow:auto}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #d5dce5;white-space:nowrap}small,.muted{color:#536176}.error{color:#9e2525}.success{color:#175b37}.line{display:flex;gap:.5rem;flex-wrap:wrap;padding:.6rem 0;border-bottom:1px solid #d5dce5}.line label{min-width:130px}.hidden{display:none!important}.status{min-height:1.5em}.actions{display:flex;gap:.5rem;flex-wrap:wrap}.report{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){body{margin:1rem auto}.line label{min-width:44%}}
</style></head><body><main>
<h1>EFRIS management workspace</h1>
<p class="warning"><strong>Manual/import workflow only.</strong> This workspace is not connected to URA EFRIS. Invoices created here are internal drafts and are never submitted or fiscalised. Imported status values are not authenticated against URA. Do not use a draft as a substitute for an official fiscalised invoice.</p>
<section class="card"><p><strong>Staff access</strong> — use the existing TaxComp administrator token. It is held in page memory only and is not saved in browser storage.</p><form id="login"><label>Admin token<input id="token" type="password" autocomplete="off" required></label><button>Open workspace</button></form></section>
<p class="status" id="status" role="status" aria-live="polite"></p>
<section id="workspace" class="hidden">
<div class="actions"><button type="button" class="secondary" id="lock-workspace">Lock workspace</button></div>
<div class="card grid"><label>Client<select id="client-select"><option value="">Select a client</option></select></label><form id="client-form"><label>Client / business name<input name="name" maxlength="160" required></label><label>TIN (optional)<input name="tin" maxlength="40"></label><button>Add client</button></form></div>
<section class="grid" id="metrics"></section>
<section class="card"><h2>Product and service catalogue</h2><p class="muted">Use only classifications and VAT rates confirmed for the client and applicable period. No official EFRIS product code is supplied by this tool.</p><form id="product-form"><label>Name<input name="name" maxlength="120" required></label><label>Description<input name="description" maxlength="500"></label><label>Item code<input name="itemCode" maxlength="80"></label><label>Unit<input name="unit" maxlength="40" placeholder="e.g. item, hour" required></label><label>Selling price (UGX)<input name="sellingPrice" type="number" min="0" step="0.01" required></label><label>Internal VAT category<select name="taxCategory"><option value="standard">Standard</option><option value="zero_rated">Zero-rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option></select></label><label>VAT rate (%)<input name="vatRate" type="number" min="0" max="100" step="0.01" required></label><label>EFRIS classification (optional)<input name="classificationCode" maxlength="100"></label><label>Active<select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></label><button id="save-product">Add product</button><button type="button" class="secondary hidden" id="cancel-product-edit">Cancel edit</button></form><div id="products"></div></section>
<section class="card"><h2>Create an invoice draft</h2><p class="muted">The generated DRAFT reference is not an official invoice number. Credit and debit notes require the original invoice reference.</p><form id="invoice-form"><label>Type<select name="invoiceType"><option value="tax_invoice">Tax invoice</option><option value="receipt">Receipt</option><option value="credit_note">Credit note</option><option value="debit_note">Debit note</option></select></label><label>Date<input name="transactionDate" type="date" required></label><label>Customer name<input name="customerName" maxlength="160" required></label><label>Customer TIN<input name="customerTin" maxlength="40"></label><label>Original invoice reference<input name="originalInvoiceNumber" maxlength="120"></label><div id="invoice-lines"></div><div class="actions"><button type="button" class="secondary" id="add-line">Add line</button><button>Create draft</button></div></form><div id="invoices"></div></section>
<section class="card"><h2>CSV import and reconciliation</h2><p class="muted">URA's current export schema could not be verified. Import only CSV files mapped to these normalized headers. Dates must use YYYY-MM-DD; amount is gross including VAT, and vat_amount is the VAT amount. Template exports are available below; importing does not verify the source.</p><div class="actions"><button type="button" class="secondary" id="template-efris">Download EFRIS template</button><button type="button" class="secondary" id="template-ledger">Download sales-ledger template</button></div><form id="import-form"><label>Source<select name="sourceType"><option value="efris">EFRIS report</option><option value="sales_ledger">Sales ledger</option></select></label><label>CSV file<input name="file" type="file" accept=".csv,text/csv" required></label><button>Import and reconcile</button></form><div class="actions"><button type="button" id="export-invoices" class="secondary">Export draft register CSV</button><button type="button" id="export-reconciliation" class="secondary">Export reconciliation CSV</button></div><div id="reconciliation"></div></section>
<p class="muted">Records are stored in the protected Worker database and are visible to administrators holding the shared admin token. This is not per-user role-based access control. Use distinct client IDs for separation; the API scopes product, invoice and import operations to the selected client.</p>
</section></main>
<script>
const statusNode=document.querySelector("#status"),login=document.querySelector("#login"),tokenInput=document.querySelector("#token"),workspace=document.querySelector("#workspace"),clientSelect=document.querySelector("#client-select");let token="",data=null;
function message(text,kind=""){statusNode.textContent=text;statusNode.className="status "+kind}
async function api(action,body){const options={headers:{Authorization:"Bearer "+token}};if(body){options.method="POST";options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body)}const response=await fetch("/admin/efris/api"+(action?"?clientId="+encodeURIComponent(action):""),options);const result=await response.json();if(!response.ok)throw new Error(result.error||"The EFRIS request failed.");return result}
function esc(value){const node=document.createElement("span");node.textContent=String(value??"");return node.innerHTML}
function csvCell(value){const text=String(value??"");return '"'+text.replaceAll('"','""')+'"'}
function download(name,rows){const csv=rows.map(row=>row.map(csvCell).join(",")).join("\\r\\n");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob(["\\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));link.download=name;link.click();URL.revokeObjectURL(link.href)}
function render(){const selectedClientId=data.selectedClientId||clientSelect.value;const client=data.clients.find(item=>item.id===selectedClientId);clientSelect.replaceChildren(new Option("Select a client",""));for(const item of data.clients)clientSelect.add(new Option(item.name+(item.tin?" · "+item.tin:""),item.id));if(client)clientSelect.value=client.id;const active=Boolean(data.selectedClientId);for(const node of workspace.querySelectorAll(".card:not(:first-child)"))node.classList.toggle("hidden",!active);if(!active)return;
const importedEfris=data.imports.filter(row=>row.sourceType==="efris"),claimedFiscalised=importedEfris.filter(row=>row.status==="fiscalised"),sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row[key]||0),0),metrics=[["Imported EFRIS rows",importedEfris.length],["Imported fiscalised-status rows",claimedFiscalised.length],["Pending imported rows",importedEfris.filter(row=>row.status==="submitted").length],["Rejected imported rows",importedEfris.filter(row=>row.status==="rejected").length],["Claimed fiscalised sales (UGX)",sum(claimedFiscalised,"amount").toLocaleString()],["Claimed output VAT (UGX)",sum(claimedFiscalised,"vatAmount").toLocaleString()],["Reconciliation exceptions",data.reconciliation.filter(row=>row.status!=="matched").length]];document.querySelector("#metrics").replaceChildren(...metrics.map(([title,value])=>{const card=document.createElement("div");card.className="card";card.innerHTML="<small>"+esc(title)+"</small><h2>"+esc(value)+"</h2>";return card}));
document.querySelector("#products").innerHTML="<h3>Products</h3>"+(data.products.length?'<table><thead><tr><th>Name</th><th>Item code</th><th>Price</th><th>Category</th><th>Rate</th><th>Status</th><th></th></tr></thead><tbody>'+data.products.map(p=>"<tr><td>"+esc(p.name)+"</td><td>"+esc(p.itemCode)+"</td><td>"+esc(p.sellingPrice)+"</td><td>"+esc(p.taxCategory)+"</td><td>"+esc(p.vatRate)+"%</td><td>"+(p.active?"Active":"Inactive")+'</td><td><button type="button" class="secondary" data-edit-product="'+esc(p.id)+'">Edit</button></td></tr>').join("")+"</tbody></table>":"<p>No products recorded.</p>");
const productOptions=data.products.filter(p=>p.active).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' ('+esc(p.sellingPrice)+' UGX)</option>').join("");for(const select of document.querySelectorAll(".line-product")){const selected=select.value;select.innerHTML='<option value="">Select product</option>'+productOptions;select.value=selected}
document.querySelector("#invoices").innerHTML="<h3>Recent internal drafts</h3>"+(data.invoices.length?'<table><thead><tr><th>Draft reference</th><th>Date</th><th>Customer</th><th>Type</th><th>Total UGX</th><th>Status</th><th>Action</th></tr></thead><tbody>'+data.invoices.map(i=>"<tr><td>"+esc(i.invoiceNumber)+"</td><td>"+esc(i.transactionDate)+"</td><td>"+esc(i.customerName)+"</td><td>"+esc(i.invoiceType)+"</td><td>"+esc(i.totalAmount)+"</td><td>"+esc(i.status)+"</td><td>"+(i.status==="draft"?'<button type="button" data-validate="'+esc(i.id)+'">Validate internally</button>':"Validated internally")+"</td></tr>").join("")+"</tbody></table>":"<p>No invoices yet.</p>");
document.querySelector("#reconciliation").innerHTML="<h3>Imported records</h3>"+(data.reconciliation.length?'<table><thead><tr><th>Invoice</th><th>Status</th><th>Review issues</th><th>EFRIS amount</th><th>Ledger amount</th><th>Amount difference</th><th>VAT difference</th></tr></thead><tbody>'+data.reconciliation.map(r=>"<tr><td>"+esc(r.invoiceNumber)+"</td><td>"+esc(r.status)+"</td><td>"+esc((r.issues||[]).join(", "))+"</td><td>"+esc(r.efris[0]?.amount??"")+"</td><td>"+esc(r.ledger[0]?.amount??"")+"</td><td>"+esc(r.amountDifference??"")+"</td><td>"+esc(r.vatDifference??"")+"</td></tr>").join("")+"</tbody></table>":"<p>No imported records to reconcile.</p>");
}
async function reload(clientId=clientSelect.value){data=await api(clientId||"");render()}
function addLine(){const wrapper=document.createElement("div");wrapper.className="line";wrapper.innerHTML='<label>Product or service<select class="line-product" required><option value="">Select product</option></select></label><label>Quantity<input class="line-quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>Discount (UGX)<input class="line-discount" type="number" min="0" step="0.01" value="0" required></label><button type="button" class="secondary remove-line">Remove</button>';document.querySelector("#invoice-lines").append(wrapper);wrapper.querySelector(".remove-line").addEventListener("click",()=>wrapper.remove());render()}
function parseCsv(text){if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);const rows=[];let row=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}else if(ch==='"')quoted=true;else if(ch===","){row.push(cell);cell=""}else if(ch==="\\n"){row.push(cell.replace(/\\r$/,""));rows.push(row);row=[];cell=""}else cell+=ch}if(quoted)throw new Error("CSV contains an unclosed quoted field.");if(cell.length||row.length){row.push(cell.replace(/\\r$/,""));rows.push(row)}if(!rows.length)throw new Error("The CSV is empty.");const headers=rows.shift().map(x=>x.trim());return rows.filter(r=>r.some(v=>v.trim())).map((values,index)=>{if(values.length!==headers.length)throw new Error("CSV row "+(index+2)+" has a different number of columns.");return Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]))})}
login.addEventListener("submit",async event=>{event.preventDefault();token=tokenInput.value;try{data=await api("");workspace.classList.remove("hidden");login.classList.add("hidden");message("Authenticated. Choose or create a client.","success");render();if(!document.querySelector("#invoice-lines").children.length)addLine()}catch(error){token="";tokenInput.value="";message(error.message,"error")}});
document.querySelector("#lock-workspace").addEventListener("click",()=>{token="";data=null;tokenInput.value="";login.classList.remove("hidden");workspace.classList.add("hidden");clientSelect.replaceChildren(new Option("Select a client",""));for(const id of ["metrics","products","invoices","reconciliation"])document.querySelector("#"+id).replaceChildren();for(const form of workspace.querySelectorAll("form"))form.reset();document.querySelector("#invoice-lines").replaceChildren();message("Workspace locked. Close this page to clear any remaining in-memory data.")});
clientSelect.addEventListener("change",()=>reload().catch(error=>message(error.message,"error")));
document.querySelector("#client-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget;try{const result=await api("",{action:"createClient",name:form.name.value,tin:form.tin.value});form.reset();data.clients.push(result.client);data.selectedClientId=result.client.id;data.products=[];data.invoices=[];data.imports=[];data.reconciliation=[];render();message("Client added.","success")}catch(error){message(error.message,"error")}});
let editingProductId="";const productForm=document.querySelector("#product-form");productForm.addEventListener("submit",async event=>{event.preventDefault();if(!clientSelect.value)return message("Select a client first.","error");const form=event.currentTarget;const body=Object.fromEntries(new FormData(form));try{const result=await api("",{...body,action:editingProductId?"updateProduct":"createProduct",id:editingProductId||undefined,clientId:clientSelect.value});if(editingProductId)data.products=data.products.map(item=>item.id===result.product.id?result.product:item);else data.products.push(result.product);editingProductId="";form.reset();document.querySelector("#save-product").textContent="Add product";document.querySelector("#cancel-product-edit").classList.add("hidden");render();message("Product saved.","success")}catch(error){message(error.message,"error")}});
document.querySelector("#cancel-product-edit").addEventListener("click",()=>{editingProductId="";productForm.reset();document.querySelector("#save-product").textContent="Add product";document.querySelector("#cancel-product-edit").classList.add("hidden")});
document.querySelector("#products").addEventListener("click",event=>{const button=event.target.closest("[data-edit-product]");if(!button)return;const product=data.products.find(item=>item.id===button.dataset.editProduct);if(!product)return;editingProductId=product.id;for(const [field,key] of Object.entries({name:"name",description:"description",itemCode:"itemCode",unit:"unit",sellingPrice:"sellingPrice",taxCategory:"taxCategory",vatRate:"vatRate",classificationCode:"classificationCode"}))productForm.elements[field].value=product[key]??"";productForm.elements.active.value=product.active?"true":"false";document.querySelector("#save-product").textContent="Save product";document.querySelector("#cancel-product-edit").classList.remove("hidden");productForm.scrollIntoView({behavior:"smooth",block:"center"})});
document.querySelector("#invoice-form").addEventListener("submit",async event=>{event.preventDefault();if(!clientSelect.value)return message("Select a client first.","error");const form=event.currentTarget;const lines=Array.from(document.querySelectorAll(".line")).map(line=>({productId:line.querySelector(".line-product").value,quantity:line.querySelector(".line-quantity").value,discount:line.querySelector(".line-discount").value}));const fields=Object.fromEntries(new FormData(form));try{const result=await api("",{...fields,action:"createInvoice",clientId:clientSelect.value,lines});data.invoices.unshift(result.invoice);render();message("Draft created: "+result.invoice.invoiceNumber+". It is not fiscalised.","success")}catch(error){message(error.message,"error")}});
document.querySelector("#add-line").addEventListener("click",addLine);
document.querySelector("#invoices").addEventListener("click",async event=>{const button=event.target.closest("[data-validate]");if(!button)return;try{const result=await api("",{action:"validateInvoice",clientId:clientSelect.value,invoiceId:button.dataset.validate});data.invoices=data.invoices.map(invoice=>invoice.id===result.id?{...invoice,status:result.status}:invoice);render();message("Validated internally only. Not submitted or fiscalised.","success")}catch(error){message(error.message,"error")}});
document.querySelector("#import-form").addEventListener("submit",async event=>{event.preventDefault();if(!clientSelect.value)return message("Select a client first.","error");const form=event.currentTarget,file=form.file.files[0];if(!file)return message("Choose a CSV file.","error");if(file.size>1000000)return message("CSV must be no larger than 1 MB.","error");try{const rows=parseCsv(await file.text());const sourceType=form.sourceType.value;const fieldMap=sourceType==="efris"?{invoice_number:"invoiceNumber",transaction_date:"transactionDate",customer_name:"customerName",customer_tin:"customerTin",amount:"amount",vat_amount:"vatAmount",tax_category:"taxCategory",status:"status",fiscalisation_reference:"fiscalisationReference"}:{invoice_number:"invoiceNumber",transaction_date:"transactionDate",customer_name:"customerName",customer_tin:"customerTin",amount:"amount",vat_amount:"vatAmount",tax_category:"taxCategory"};const mapped=rows.map(row=>Object.fromEntries(Object.entries(fieldMap).map(([key,value])=>[value,row[key]??""])));const result=await api("",{action:"importRows",clientId:clientSelect.value,sourceType,rows:mapped});form.reset();data=result.workspace;render();message("Imported "+result.imported+" row(s). Review reconciliation exceptions.","success")}catch(error){message(error.message,"error")}});
document.querySelector("#template-efris").addEventListener("click",()=>download("efris-import-template.csv",[["invoice_number","transaction_date","customer_name","customer_tin","amount","vat_amount","tax_category","status","fiscalisation_reference"],["INV-001","2026-11-01","Example Customer","","118000","18000","standard","fiscalised","EXAMPLE-REF"]]));
document.querySelector("#template-ledger").addEventListener("click",()=>download("sales-ledger-import-template.csv",[["invoice_number","transaction_date","customer_name","customer_tin","amount","vat_amount","tax_category"],["INV-001","2026-11-01","Example Customer","","118000","18000","standard"]]));
document.querySelector("#export-invoices").addEventListener("click",()=>download("taxcomp-draft-register.csv",[["draft_reference","date","type","customer","net_ugx","vat_ugx","total_ugx","internal_status"],...data.invoices.map(i=>[i.invoiceNumber,i.transactionDate,i.invoiceType,i.customerName,i.netAmount,i.vatAmount,i.totalAmount,i.status])]));
document.querySelector("#export-reconciliation").addEventListener("click",()=>download("efris-reconciliation.csv",[["invoice_number","status","issues","efris_amount","ledger_amount","amount_difference","vat_difference"],...data.reconciliation.map(r=>[r.invoiceNumber,r.status,(r.issues||[]).join("|"),r.efris[0]?.amount??"",r.ledger[0]?.amount??"",r.amountDifference??"",r.vatDifference??""])]));
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}
