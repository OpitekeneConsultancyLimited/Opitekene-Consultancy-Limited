-- Legislative knowledge engine: structured legislation by edition.
--
-- legislation_editions      an edition of the law (e.g. the 2024 revised edition as at FY 2024/25);
--                           later amendment overlays are further editions, never overwrites.
-- legislation_laws          stable identity of an Act or instrument (links to law_statutes).
-- legislation_law_versions  the law as it stands in one edition: title, chapter, commencement.
-- legislation_sections      section number and heading per law version; wording only when
--                           entered from an official source (never seeded).
-- legislation_schedules     schedules per law version.
-- legislation_relations     links between laws and sections, "confirmed" or "inferred".
-- legislation_coverage_gaps legislation known to be missing, so answers can say so.
-- legislation_history       append-only log of every insert and change (written by triggers).
--
-- Every captured record starts "unverified". Only a legal approver can mark a
-- record verified against the official (ULRC) edition, and a verified record
-- is never overwritten by a later import. Access as for the other TaxComp
-- tables: RLS on, Worker-only policy, no anon/authenticated grants. Idempotent.

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS legislation_editions (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  jurisdiction TEXT NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('revised_edition', 'amendment', 'consolidation')),
  base_edition_id TEXT REFERENCES legislation_editions(id) ON DELETE RESTRICT,
  amending_statute_id TEXT REFERENCES law_statutes(id) ON DELETE RESTRICT,
  -- The period the edition states the law for. Publication is recorded separately.
  effective_from TEXT NOT NULL CHECK (effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  effective_to TEXT CHECK (effective_to IS NULL OR effective_to ~ '^\d{4}-\d{2}-\d{2}$'),
  publication_date TEXT CHECK (publication_date IS NULL OR publication_date ~ '^\d{4}-\d{2}-\d{2}$'),
  source_reference TEXT NOT NULL,
  coverage_note TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'superseded', 'requires_amendment_review')),
  verification_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT CHECK (official_source_url IS NULL OR official_source_url ~ '^https://'),
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  CHECK (effective_to IS NULL OR effective_from <= effective_to),
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND official_source_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS legislation_editions_base ON legislation_editions (base_edition_id);
CREATE INDEX IF NOT EXISTS legislation_editions_amending ON legislation_editions (amending_statute_id);

CREATE TABLE IF NOT EXISTS legislation_laws (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  jurisdiction TEXT NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  short_title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('act', 'regulations', 'order', 'rules')),
  tax_category TEXT NOT NULL,
  parent_law_id TEXT REFERENCES legislation_laws(id) ON DELETE RESTRICT,
  statute_id TEXT REFERENCES law_statutes(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK (category = 'act' OR parent_law_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS legislation_laws_parent ON legislation_laws (parent_law_id);
CREATE INDEX IF NOT EXISTS legislation_laws_statute ON legislation_laws (statute_id);

CREATE TABLE IF NOT EXISTS legislation_law_versions (
  id TEXT PRIMARY KEY NOT NULL,
  law_id TEXT NOT NULL REFERENCES legislation_laws(id) ON DELETE RESTRICT,
  edition_id TEXT NOT NULL REFERENCES legislation_editions(id) ON DELETE RESTRICT,
  official_title TEXT NOT NULL,
  chapter TEXT CHECK (chapter IS NULL OR chapter ~ '^Cap\. \d{1,3}[A-Z]?$'),
  commencement_date TEXT CHECK (commencement_date IS NULL OR commencement_date ~ '^\d{4}-\d{2}-\d{2}$'),
  enabling_provision TEXT,
  statutory_instrument TEXT,
  section_count INTEGER NOT NULL CHECK (section_count >= 0),
  schedule_count INTEGER NOT NULL DEFAULT 0 CHECK (schedule_count >= 0),
  source_reference TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'superseded', 'requires_amendment_review')),
  verification_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT CHECK (official_source_url IS NULL OR official_source_url ~ '^https://'),
  verified_by TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  UNIQUE (law_id, edition_id),
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND official_source_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS legislation_law_versions_edition ON legislation_law_versions (edition_id);

CREATE TABLE IF NOT EXISTS legislation_sections (
  id TEXT PRIMARY KEY NOT NULL,
  law_version_id TEXT NOT NULL REFERENCES legislation_law_versions(id) ON DELETE RESTRICT,
  section_number TEXT NOT NULL CHECK (section_number ~ '^\d{1,3}[A-Z]{0,2}$'),
  heading TEXT NOT NULL CHECK (length(heading) BETWEEN 1 AND 300),
  part_number TEXT,
  part_title TEXT,
  division TEXT,
  position INTEGER NOT NULL CHECK (position > 0),
  parent_section_id TEXT REFERENCES legislation_sections(id) ON DELETE RESTRICT,
  flags_json TEXT NOT NULL DEFAULT '[]' CHECK (flags_json IS JSON ARRAY),
  -- Wording is held only when entered from an official source; never imported.
  wording TEXT,
  wording_status TEXT NOT NULL DEFAULT 'none' CHECK (wording_status IN ('none', 'unverified', 'verified')),
  wording_source_url TEXT CHECK (wording_source_url IS NULL OR wording_source_url ~ '^https://'),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'superseded', 'requires_amendment_review')),
  verification_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT CHECK (official_source_url IS NULL OR official_source_url ~ '^https://'),
  verified_by TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(part_title, '') || ' ' || coalesce(division, ''))) STORED,
  UNIQUE (law_version_id, section_number),
  CHECK ((wording_status = 'none') = (wording IS NULL)),
  CHECK (wording_status <> 'verified' OR wording_source_url IS NOT NULL),
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND official_source_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS legislation_sections_order ON legislation_sections (law_version_id, position);
CREATE INDEX IF NOT EXISTS legislation_sections_parent ON legislation_sections (parent_section_id);
CREATE INDEX IF NOT EXISTS legislation_sections_search ON legislation_sections USING GIN (search_tsv);

CREATE TABLE IF NOT EXISTS legislation_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  law_version_id TEXT NOT NULL REFERENCES legislation_law_versions(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  title TEXT,
  position INTEGER NOT NULL CHECK (position > 0),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'superseded', 'requires_amendment_review')),
  verification_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT CHECK (official_source_url IS NULL OR official_source_url ~ '^https://'),
  verified_by TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  UNIQUE (law_version_id, position),
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND official_source_url IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS legislation_relations (
  id TEXT PRIMARY KEY NOT NULL,
  from_law_id TEXT NOT NULL REFERENCES legislation_laws(id) ON DELETE RESTRICT,
  from_section_id TEXT REFERENCES legislation_sections(id) ON DELETE RESTRICT,
  to_law_id TEXT NOT NULL REFERENCES legislation_laws(id) ON DELETE RESTRICT,
  to_section_id TEXT REFERENCES legislation_sections(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('made_under', 'related', 'procedure_next_step', 'amends', 'implements')),
  -- confirmed: stated in the legislation itself (e.g. an instrument's enabling provision).
  -- inferred: suggested from headings; shown as such until a reviewer confirms it.
  basis TEXT NOT NULL CHECK (basis IN ('confirmed', 'inferred')),
  evidence TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS legislation_relations_from ON legislation_relations (from_law_id, from_section_id);
CREATE INDEX IF NOT EXISTS legislation_relations_to ON legislation_relations (to_law_id, to_section_id);
CREATE INDEX IF NOT EXISTS legislation_relations_from_section ON legislation_relations (from_section_id);
CREATE INDEX IF NOT EXISTS legislation_relations_to_section ON legislation_relations (to_section_id);

CREATE TABLE IF NOT EXISTS legislation_coverage_gaps (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  jurisdiction TEXT NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('not_captured', 'not_in_source', 'amendments_not_captured', 'wording_not_held')),
  keywords TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legislation_history (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('edition', 'law_version', 'section', 'schedule')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('imported', 'status_changed', 'content_changed')),
  from_status TEXT,
  to_status TEXT,
  from_value TEXT,
  to_value TEXT,
  actor TEXT,
  note TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS legislation_history_entity ON legislation_history (entity_type, entity_id, occurred_at DESC);

-- History: every insert and every change of status or content is logged, whatever wrote it.
-- Ids are derived from the change itself, so a restore (which re-runs the seed) produces the same rows.
CREATE OR REPLACE FUNCTION taxcomp.legislation_log_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind TEXT := TG_ARGV[0];
  new_json JSONB := to_jsonb(NEW);
  old_json JSONB;
  new_value TEXT;
  old_value TEXT;
BEGIN
  new_value := CASE kind
    WHEN 'section' THEN concat_ws(' | ', new_json->>'section_number', new_json->>'heading', new_json->>'wording_status')
    WHEN 'law_version' THEN concat_ws(' | ', new_json->>'official_title', new_json->>'chapter', new_json->>'commencement_date')
    WHEN 'schedule' THEN concat_ws(' | ', new_json->>'label', new_json->>'title')
    ELSE concat_ws(' | ', new_json->>'label', new_json->>'effective_from', new_json->>'effective_to') END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO taxcomp.legislation_history (id, entity_type, entity_id, action, from_status, to_status, from_value, to_value, actor, note, occurred_at)
    VALUES (md5(concat_ws(':', kind, NEW.id, 'imported', NEW.updated_at, new_value)), kind, NEW.id, 'imported', NULL, NEW.verification_status, NULL, new_value, NEW.updated_by, '', NEW.updated_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;
  old_json := to_jsonb(OLD);
  old_value := CASE kind
    WHEN 'section' THEN concat_ws(' | ', old_json->>'section_number', old_json->>'heading', old_json->>'wording_status')
    WHEN 'law_version' THEN concat_ws(' | ', old_json->>'official_title', old_json->>'chapter', old_json->>'commencement_date')
    WHEN 'schedule' THEN concat_ws(' | ', old_json->>'label', old_json->>'title')
    ELSE concat_ws(' | ', old_json->>'label', old_json->>'effective_from', old_json->>'effective_to') END;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    INSERT INTO taxcomp.legislation_history (id, entity_type, entity_id, action, from_status, to_status, from_value, to_value, actor, note, occurred_at)
    VALUES (md5(concat_ws(':', kind, NEW.id, 'status_changed', NEW.updated_at, OLD.verification_status, NEW.verification_status)), kind, NEW.id, 'status_changed', OLD.verification_status, NEW.verification_status, NULL, NULL, NEW.updated_by, coalesce(new_json->>'verification_note', ''), NEW.updated_at)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF new_value IS DISTINCT FROM old_value THEN
    INSERT INTO taxcomp.legislation_history (id, entity_type, entity_id, action, from_status, to_status, from_value, to_value, actor, note, occurred_at)
    VALUES (md5(concat_ws(':', kind, NEW.id, 'content_changed', NEW.updated_at, old_value, new_value)), kind, NEW.id, 'content_changed', OLD.verification_status, NEW.verification_status, old_value, new_value, NEW.updated_by, coalesce(new_json->>'verification_note', ''), NEW.updated_at)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS legislation_editions_history ON legislation_editions;
CREATE TRIGGER legislation_editions_history AFTER INSERT OR UPDATE ON legislation_editions FOR EACH ROW EXECUTE FUNCTION taxcomp.legislation_log_change('edition');
DROP TRIGGER IF EXISTS legislation_law_versions_history ON legislation_law_versions;
CREATE TRIGGER legislation_law_versions_history AFTER INSERT OR UPDATE ON legislation_law_versions FOR EACH ROW EXECUTE FUNCTION taxcomp.legislation_log_change('law_version');
DROP TRIGGER IF EXISTS legislation_sections_history ON legislation_sections;
CREATE TRIGGER legislation_sections_history AFTER INSERT OR UPDATE ON legislation_sections FOR EACH ROW EXECUTE FUNCTION taxcomp.legislation_log_change('section');
DROP TRIGGER IF EXISTS legislation_schedules_history ON legislation_schedules;
CREATE TRIGGER legislation_schedules_history AFTER INSERT OR UPDATE ON legislation_schedules FOR EACH ROW EXECUTE FUNCTION taxcomp.legislation_log_change('schedule');

REVOKE DELETE, TRUNCATE ON taxcomp.legislation_editions, taxcomp.legislation_laws, taxcomp.legislation_law_versions, taxcomp.legislation_sections,
  taxcomp.legislation_schedules, taxcomp.legislation_relations, taxcomp.legislation_coverage_gaps FROM taxcomp_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON taxcomp.legislation_history FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.legislation_editions, taxcomp.legislation_laws, taxcomp.legislation_law_versions, taxcomp.legislation_sections,
  taxcomp.legislation_schedules, taxcomp.legislation_relations, taxcomp.legislation_coverage_gaps TO taxcomp_worker;
GRANT SELECT, INSERT ON taxcomp.legislation_history TO taxcomp_worker;
REVOKE ALL ON FUNCTION taxcomp.legislation_log_change() FROM PUBLIC;

DO $$
DECLARE
  t TEXT;
  api_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['legislation_editions', 'legislation_laws', 'legislation_law_versions', 'legislation_sections', 'legislation_schedules',
    'legislation_relations', 'legislation_coverage_gaps', 'legislation_history'] LOOP
    EXECUTE format('ALTER TABLE taxcomp.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.%I', t);
    EXECUTE format('CREATE POLICY taxcomp_worker_all ON taxcomp.%I TO taxcomp_worker USING (true) WITH CHECK (true)', t);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON taxcomp.%I FROM %I', t, api_role);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- Known gaps, so that answers say "not in the database" instead of guessing.
INSERT INTO legislation_coverage_gaps (id, jurisdiction, title, kind, keywords, note, created_at) VALUES
  ('ug-local-service-tax', 'UG', 'Local Service Tax (Local Governments Act, Cap. 138, extract)', 'not_captured', 'local service tax lst local government',
   'The FY 2024/25 compendium prints an extract of the Local Governments Act on Local Service Tax without an arrangement of sections, so it is not part of the 18-law dataset.', '2026-11-12T02:00:00.000Z'),
  ('ug-other-subsidiary', 'UG', 'Subsidiary legislation printed without an arrangement of sections', 'not_captured', 'regulations order rate of tax vat regulations 1996 statutory instrument',
   'Other regulations and orders in the compendium (for example the VAT Regulations, 1996 and VAT rate orders) have no printed arrangement and were not captured.', '2026-11-12T02:00:00.000Z'),
  ('ug-customs', 'UG', 'Customs law (East African Community Customs Management Act and the Common External Tariff)', 'not_in_source', 'customs import duty tariff eaccma common external tariff',
   'Customs law is not in the captured dataset.', '2026-11-12T02:00:00.000Z'),
  ('ug-tax-treaties', 'UG', 'Uganda''s double taxation agreements', 'not_in_source', 'treaty treaties double taxation agreement dta convention',
   'Treaty texts are not in the database. The Income Tax Act provision on international agreements is captured (heading only).', '2026-11-12T02:00:00.000Z'),
  ('ug-amendments-2025', 'UG', 'Amendments made in 2025', 'amendments_not_captured', 'amendment 2025 2025/26',
   'No 2025 amendment has been captured as an edition. The FY 2024/25 structure may be out of date for later periods.', '2026-11-12T02:00:00.000Z'),
  ('ug-amendments-2026', 'UG', 'Amendments made in 2026', 'amendments_not_captured', 'amendment 2026 2026/27',
   'The 2026 amendment Acts are listed in the law register but their changes are not captured as an edition.', '2026-11-12T02:00:00.000Z'),
  ('ug-section-wording', 'UG', 'Section wording', 'wording_not_held', 'wording text provision',
   'No section wording is held for the captured legislation: only section numbers and headings. Wording is added only from the official text.', '2026-11-12T02:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
