CREATE TABLE IF NOT EXISTS legal_sources (
  source_id TEXT PRIMARY KEY NOT NULL,
  record_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending-review', 'verified', 'superseded', 'withdrawn', 'rejected')),
  review_history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS legal_sources_status_updated
  ON legal_sources (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS legal_source_audit (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'updated-draft', 'verified', 'rejected')),
  actor TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS legal_source_audit_source_created
  ON legal_source_audit (source_id, created_at DESC);
