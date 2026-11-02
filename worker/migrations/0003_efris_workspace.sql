CREATE TABLE IF NOT EXISTS efris_clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  tin TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_products (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  item_code TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  tax_category TEXT NOT NULL CHECK (tax_category IN ('standard', 'zero_rated', 'exempt', 'out_of_scope')),
  vat_rate REAL NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 100),
  classification_code TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('tax_invoice', 'receipt', 'credit_note', 'debit_note')),
  transaction_date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_tin TEXT,
  original_invoice_number TEXT,
  lines_json TEXT NOT NULL,
  net_amount REAL NOT NULL CHECK (net_amount >= 0),
  vat_amount REAL NOT NULL CHECK (vat_amount >= 0),
  total_amount REAL NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated')),
  created_at TEXT NOT NULL,
  UNIQUE (client_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS efris_imports (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES efris_clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('efris', 'sales_ledger')),
  invoice_number TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  customer_name TEXT,
  customer_tin TEXT,
  amount REAL NOT NULL CHECK (amount >= 0),
  vat_amount REAL NOT NULL CHECK (vat_amount >= 0 AND vat_amount <= amount),
  tax_category TEXT,
  imported_status TEXT NOT NULL,
  fiscalisation_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS efris_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS efris_products_client_name
  ON efris_products (client_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS efris_products_client_item_code
  ON efris_products (client_id, item_code)
  WHERE item_code <> '';

CREATE INDEX IF NOT EXISTS efris_invoices_client_created
  ON efris_invoices (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS efris_imports_client_invoice
  ON efris_imports (client_id, invoice_number, source_type);

CREATE INDEX IF NOT EXISTS efris_audit_client_created
  ON efris_audit_log (client_id, created_at DESC);
