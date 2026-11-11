-- 2026 amendments register: what each 2026 amending Act (or Bill) changes.
--
-- Sources, in order of weight:
--   1. The Bills as published by Parliament: Bills Supplement No. 2 to the
--      Uganda Gazette No. 33, Vol. CXIX, 27 March 2026 (parliament.go.ug,
--      "Tax Bills 2026"). Primary text, but of the Bill as introduced: Parliament
--      changed some figures before passing it.
--   2. Professional summaries of the Acts as enacted (EY Tax Alert of 11 June
--      2026; PwC; Dentons). Secondary: they report the enacted figures but are
--      not the law.
-- The enacted Acts, their Act numbers and their Gazette references were not
-- available online. Every record is therefore "unverified" and states both
-- the Bill figure and the reported enacted figure; where they differ the
-- record is flagged and TaxComp does not choose between them.
--
-- Summaries are TaxComp's own words; figures are given as printed. Access as
-- for the other legislation tables: RLS on, Worker-only, no DELETE. Idempotent:
-- a reviewed record (any status other than unverified) is never overwritten.

SET search_path TO taxcomp;

-- ------------------------------------------------------------------ law register
-- Principal Acts named by the 2026 Bills that were not yet in the register (chapter as cited in the Bill).
INSERT INTO law_statutes (id, title, chapter, kind, parent_id, bill_status, returned_date, assent_date, commencement_date, applies_from_period, source_url, note, created_at) VALUES
  ('eta', 'External Trade Act', 'Cap. 69', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://www.parliament.go.ug/page/tax-bills-2026',
   'Chapter as cited in the External Trade (Amendment) Bill, 2026. TODO_VERIFY against the ULRC 2024 revised edition. Not in the legislative database (no arrangement of sections captured).', '2026-11-11T12:00:00.000Z'),
  ('trsa', 'Traffic and Road Safety Act', 'Cap. 347', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://www.parliament.go.ug/page/tax-bills-2026',
   'Chapter as cited in the Traffic and Road Safety (Amendment) Bill, 2026. TODO_VERIFY against the ULRC 2024 revised edition. Not in the legislative database.', '2026-11-11T12:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO law_statutes (id, title, chapter, kind, parent_id, bill_status, returned_date, assent_date, commencement_date, applies_from_period, source_url, note, created_at) VALUES
  ('sda-amendment-2026', 'Stamp Duty (Amendment) Act, 2026', NULL, 'amendment', 'sda', 'assented', NULL, '2026-05-18', '2026-07-01', '2026-07-01',
   'https://www.parliament.go.ug/sites/default/files/Stamp%20Duty%20(Amendment)%20Bill%2C%202026.pdf',
   'Bill No. 4 of 2026 (Bills Supplement No. 2 to the Uganda Gazette No. 33, Vol. CXIX, 27 March 2026) provides for commencement on 1 July 2026. Assent on 18 May 2026 is reported by EY (Tax Alert, 11 June 2026), not confirmed from the Gazette. TODO_VERIFY: Act number and Gazette reference.', '2026-11-11T12:00:00.000Z'),
  ('lga-amendment-2026', 'Lotteries and Gaming (Amendment) Act, 2026', NULL, 'amendment', 'lga', 'assented', NULL, '2026-05-18', '2026-07-01', '2026-07-01',
   'https://www.parliament.go.ug/sites/default/files/Lotteries%20and%20Gaming%20(Amendment)%20Bill%2C%202026.pdf',
   'Bill No. 10 of 2026 (Bills Supplement No. 2, 27 March 2026) provides for commencement on 1 July 2026. Assent on 18 May 2026 is reported by EY (Tax Alert, 11 June 2026), not confirmed from the Gazette. TODO_VERIFY: Act number and Gazette reference.', '2026-11-11T12:00:00.000Z'),
  ('eta-amendment-2026', 'External Trade (Amendment) Act, 2026', NULL, 'amendment', 'eta', 'assented', NULL, '2026-05-18', '2026-07-01', '2026-07-01',
   'https://www.parliament.go.ug/sites/default/files/External%20Trade%20(Amendment)%20Bill%2C%202026.pdf',
   'Bill No. 3 of 2026 (Bills Supplement No. 2, 27 March 2026) provides for commencement on 1 July 2026. Assent on 18 May 2026 is reported by EY (Tax Alert, 11 June 2026), not confirmed from the Gazette. TODO_VERIFY: Act number and Gazette reference.', '2026-11-11T12:00:00.000Z'),
  ('trsa-amendment-2026', 'Traffic and Road Safety (Amendment) Bill, 2026', NULL, 'amendment', 'trsa', 'bill', NULL, NULL, NULL, NULL,
   'https://www.parliament.go.ug/sites/default/files/Traffic%20and%20Road%20Safety%20(Amendment)%20Bill%2C%202026.pdf',
   'Bill No. 9 of 2026 (Bills Supplement No. 2, 27 March 2026), listed by Parliament with the 2026 tax Bills. The Bill provides for commencement on 1 July 2026. No report of its passing or assent was found. TODO_VERIFY.', '2026-11-11T12:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- Existing register rows: add what the web sources say, without changing status or dates (conflicts are flagged, not resolved).
UPDATE law_statutes SET note = note || ' Web check 11 Nov 2026: Bill No. 7 of 2026 (Bills Supplement No. 2, 27 March 2026) provides for commencement on 1 July 2026. EY (11 June 2026) reported that it had not yet been assented to; a commentary reports it was returned by the President on 14 July 2026; URA has published a notice titled "Effective date of the Income Tax (Amendment) Act, 2026 and the Excise Duty (Amendment) Act, 2026", which could not be read. The owner''s brief calls it "Act 22"; no source confirming that number was found.'
  WHERE id = 'eda-amendment-2026' AND verification_status = 'pending-review' AND note NOT LIKE '%Web check 11 Nov 2026%';
UPDATE law_statutes SET note = note || ' Web check 11 Nov 2026: Bill No. 6 of 2026 (Bills Supplement No. 2, 27 March 2026) provides for commencement on 1 July 2026. EY (11 June 2026) reported that it had not yet been assented to; Kampala Associated Advocates report re-passing on 4 August and assent on 20 August 2026; URA has published a notice on its effective date, which could not be read.'
  WHERE id = 'ita-amendment-2026' AND verification_status = 'pending-review' AND note NOT LIKE '%Web check 11 Nov 2026%';
UPDATE law_statutes SET note = note || ' Web check 11 Nov 2026: Bill No. 8 of 2026 (Bills Supplement No. 2, 27 March 2026) amends the Value Added Tax Act, Cap. 344 (not Cap. 349 as in the owner''s brief) and provides for commencement on 1 July 2026. EY (11 June 2026) reports assent on 18 May 2026.'
  WHERE id = 'vata-amendment-2026' AND verification_status = 'pending-review' AND note NOT LIKE '%Web check 11 Nov 2026%';
UPDATE law_statutes SET note = note || ' Web check 11 Nov 2026: Bill No. 5 of 2026 (Bills Supplement No. 2, 27 March 2026) amends the Tax Procedures Code Act, Cap. 343 and provides for commencement on 1 July 2026. EY (11 June 2026) reports assent on 18 May 2026.'
  WHERE id = 'tpca-amendment-2026' AND verification_status = 'pending-review' AND note NOT LIKE '%Web check 11 Nov 2026%';

-- ------------------------------------------------------------------ register
CREATE TABLE IF NOT EXISTS legislation_amendments (
  id TEXT PRIMARY KEY NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  jurisdiction TEXT NOT NULL CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  amending_statute_id TEXT NOT NULL REFERENCES law_statutes(id) ON DELETE RESTRICT,
  law_id TEXT REFERENCES legislation_laws(id) ON DELETE RESTRICT,
  principal_act TEXT NOT NULL,
  provision TEXT NOT NULL,
  section_number TEXT CHECK (section_number IS NULL OR section_number ~ '^\d{1,3}[A-Z]{0,2}$'),
  topic TEXT NOT NULL CHECK (topic IN ('rates', 'threshold', 'withholding', 'exemption', 'definition', 'deduction', 'procedure', 'penalty', 'levy', 'relief', 'restriction', 'administration')),
  summary TEXT NOT NULL,
  previous_figure TEXT,
  bill_figure TEXT,
  reported_figure TEXT,
  figures_differ INTEGER NOT NULL DEFAULT 0 CHECK (figures_differ IN (0, 1)),
  effective_from TEXT CHECK (effective_from IS NULL OR effective_from ~ '^\d{4}-\d{2}-\d{2}$'),
  -- bill_only: in the published Bill, not mentioned by the enacted-Act summaries (it may have been dropped).
  -- bill_and_report: in the Bill and reported as enacted. report_only: reported as enacted, not in the Bill.
  evidence TEXT NOT NULL CHECK (evidence IN ('bill_only', 'bill_and_report', 'report_only')),
  bill_reference TEXT NOT NULL,
  bill_url TEXT CHECK (bill_url IS NULL OR bill_url ~ '^https://'),
  secondary_sources TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'superseded', 'requires_amendment_review')),
  verification_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT CHECK (official_source_url IS NULL OR official_source_url ~ '^https://'),
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  CHECK (verification_status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND official_source_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS legislation_amendments_statute ON legislation_amendments (amending_statute_id, position);
CREATE INDEX IF NOT EXISTS legislation_amendments_law ON legislation_amendments (law_id, section_number);

-- History for amendment records, through the existing trigger function.
ALTER TABLE legislation_history DROP CONSTRAINT IF EXISTS legislation_history_entity_type_check;
ALTER TABLE legislation_history ADD CONSTRAINT legislation_history_entity_type_check CHECK (entity_type IN ('edition', 'law_version', 'section', 'schedule', 'amendment'));

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
    WHEN 'amendment' THEN concat_ws(' | ', new_json->>'provision', new_json->>'bill_figure', new_json->>'reported_figure', new_json->>'effective_from')
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
    WHEN 'amendment' THEN concat_ws(' | ', old_json->>'provision', old_json->>'bill_figure', old_json->>'reported_figure', old_json->>'effective_from')
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
REVOKE ALL ON FUNCTION taxcomp.legislation_log_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS legislation_amendments_history ON legislation_amendments;
CREATE TRIGGER legislation_amendments_history AFTER INSERT OR UPDATE ON legislation_amendments FOR EACH ROW EXECUTE FUNCTION taxcomp.legislation_log_change('amendment');

REVOKE DELETE, TRUNCATE ON taxcomp.legislation_amendments FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.legislation_amendments TO taxcomp_worker;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  ALTER TABLE taxcomp.legislation_amendments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.legislation_amendments;
  CREATE POLICY taxcomp_worker_all ON taxcomp.legislation_amendments TO taxcomp_worker USING (true) WITH CHECK (true);
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON taxcomp.legislation_amendments FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;

-- ------------------------------------------------------------------ records
INSERT INTO legislation_amendments (id, jurisdiction, amending_statute_id, law_id, principal_act, provision, section_number, topic, summary, previous_figure, bill_figure, reported_figure, figures_differ, effective_from, evidence, bill_reference, bill_url, secondary_sources, note, position, created_at, updated_at, updated_by) VALUES
-- Income Tax (Amendment) Bill No. 6
  ('ita-2026-royalty-software', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.2, definition of "royalty"', '2', 'definition',
   'Adds software to the items whose use or right to use is a royalty.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 2', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 10, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s20-non-business-asset', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.20(1)(ba)', '20', 'definition',
   'Adds income derived from the disposal of a non-business asset to business income under section 20.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 6 of 2026, clause 3', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', '', 'Not mentioned in the summaries of the enacted Act that were read; it may have been changed or dropped before enactment.', 20, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s21-bujagali', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.21(1)(ab)', '21', 'exemption',
   'Extends the exemption of the income of the Bujagali hydro power project.', 'to 30 June 2026 (as reported)', 'up to 30 June 2032', 'to 30 June 2032', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 30, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s21-hotel-developer', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.21(1)(ah)', '21', 'exemption',
   'Exempts the income of a developer of a hotel or tourism facility that meets investment, local sourcing and citizen employment conditions.', NULL, 'investment capital of at least USD 10 million (foreigner) or USD 5 million (citizen); at least 70% locally sourced raw materials subject to availability; at least 70% of employees citizens earning at least 70% of the wage bill', 'investment of at least USD 10 million (foreigner) or USD 5 million (citizen)', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', 'The Bill as published does not state how long the exemption lasts; check the enacted text.', 40, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s21-infrastructure-bond', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.21(7), definition of "infrastructure bond"', '21', 'definition',
   'Redefines an infrastructure bond as a bond, note or similar security used to raise funds for public infrastructure and other social services, with a minimum maturity.', NULL, 'maturity period of at least ten years', 'maturity of at least ten years', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 50, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s24-microfinance', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.24(2)(b), (2)(c), (3)(b) and (3)', '24', 'deduction',
   'Extends the bad debt rules for financial institutions to microfinance deposit-taking institutions and tier 4 microfinance institutions.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 5', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 60, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s25-interest-definitions', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.25(5)', '25', 'definition',
   'Replaces the definitions used for the interest deduction limit: adds "dormant" and "group" (excluding dormant members) and restates tax earnings before interest, tax, depreciation and amortisation.', NULL, '"group" requires at least 51% common underlying ownership', '"group" with at least 51% common ownership', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 6', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 70, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s34-asset-class', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.34(1)', '34', 'deduction',
   'Changes the asset class referred to in section 34(1).', 'class 4', 'class 3', 'class 3', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 7', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 80, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s36-loss-minimum-tax', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.36(6a)', '36', 'rates',
   'Proposed a minimum tax on a taxpayer that carries forward assessed losses after seven years of income.', NULL, '0.5% of gross income or the tax charged under section 4, whichever is higher', NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 6 of 2026, clause 8', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', '', 'Not mentioned in the summaries of the enacted Act that were read; it may have been dropped before enactment. Do not apply without the enacted text.', 90, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s82-debenture-interest', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.82(5) and Schedule 4, Part V, paragraph 2A', '82', 'withholding',
   'Replaces section 82(5): a resident company paying interest on debentures issued abroad (under stated conditions) withholds tax at a new Schedule 4 rate.', NULL, '5%', '5%', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clauses 9 and 20(b)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 100, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s86-royalties', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.86(7)', '86', 'restriction',
   'Section 86 no longer applies to income attributable to royalties.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 10', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026 (describes section 86 as digital services tax)', '', 110, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s115a-arms-length', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.115A (new)', '115A', 'administration',
   'New anti-avoidance rule: a controlled transaction (a transaction between associates) must be accounted for consistently with the arm''s length principle.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 11', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 120, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s124-rental-monthly', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.124(1a)', '124', 'procedure',
   'An individual liable to rental tax may file a provisional return of rental income monthly.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 12', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 130, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s130-non-business-asset-wht', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.130(3) and Schedule 4, Part X, item 4', '130', 'withholding',
   'Proposed withholding tax on payments for the purchase of a non-business asset.', NULL, '6% of the gross payment', NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 6 of 2026, clauses 13 and 20(c)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', '', 'Not mentioned in the summaries of the enacted Act that were read; it may have been changed or dropped. Do not apply without the enacted text.', 140, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s131-winnings', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.131 (substituted) and Schedule 4, Part XI', '131', 'withholding',
   'A person paying winnings from betting or gaming withholds tax on the winnings (pay-out less the amount staked). Winnings paid by a national lottery licensee are excluded.', NULL, '15%', '15%', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clauses 14 and 20(d)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 150, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s133-telecom-commission', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.133 (substituted) and Schedule 4, Part XIII', '133', 'withholding',
   'A licensed telecommunications service provider withholds tax on commission paid for telecommunication retail, mobile network or mobile money services.', NULL, '10% of the gross amount', '10% of the gross amount', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clauses 15 and 20(e)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 160, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s135b-entertainers', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.135B (new) and Schedule 4, Part XVI', '135B', 'withholding',
   'A person paying a public entertainer withholds tax on the gross payment.', NULL, '6% of the gross payment', '6% of gross payments', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clauses 16 and 20(f)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 170, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s139-final-tax', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.139', '139', 'withholding',
   'Extends final tax treatment to tax withheld on telecom and mobile money commissions paid to resident individuals and on commission paid to insurance agents (the Bill also lists purchases of non-business assets).', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 17', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', 'EY mentions sections 133 and 134 only; the non-business asset item depends on whether section 130(3) was enacted.', 180, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-s150a-foreign-income', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 's.150A (new)', '150A', 'rates',
   'Proposed that a resident individual''s foreign-source income is taxed at the rate that applies to the same type of Uganda-source income.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 6 of 2026, clause 18', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', '', 'Not mentioned in the summaries of the enacted Act that were read; it may have been dropped.', 190, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-sch2-listed-institutions', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 'Schedule 2', NULL, 'exemption',
   'Adds the Arab Bank for Economic Development in Africa (BADEA) and the Uganda Red Cross Society to Schedule 2.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 19', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 200, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('ita-2026-sch4-individual-rates', 'UG', 'ita-amendment-2026', 'ita', 'Income Tax Act, Cap. 338', 'Schedule 4, Part I (rates for resident individuals)', NULL, 'rates',
   'Replaces the annual income tax bands for resident individuals (the basis of PAYE). The tax-free band rises to UGX 4,020,000 a year (UGX 335,000 a month).', 'tax-free to UGX 235,000 a month (as reported)',
   'Nil to UGX 4,020,000; 20% of the excess over 4,020,000 to 4,920,000; UGX 180,000 plus 25% of the excess over 4,920,000 to 5,820,000; UGX 405,000 plus 30% of the excess over 5,820,000 to 120,000,000; above 120,000,000 the same plus an additional 10% of the excess over 120,000,000',
   'Same bands as the Bill (EY)', 0, '2026-07-01', 'bill_and_report', 'Bill No. 6 of 2026, clause 20(a)', 'https://www.parliament.go.ug/sites/default/files/Income%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026; PwC Uganda significant developments', 'TaxComp''s FY 2026/27 PAYE calculator already uses these bands, marked pending verification. The Bill gives no new non-resident bands.', 210, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Value Added Tax (Amendment) Bill No. 8
  ('vat-2026-s5-withholding-einvoice', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.5(7)', '5', 'withholding',
   'VAT withholding by a designated person does not apply where it pays for taxable supplies and is issued with an e-invoice or e-receipt under section 92 of the Tax Procedures Code Act.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 2', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 300, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s7-registration-threshold', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.7(2)', '7', 'threshold',
   'Raises the annual VAT registration threshold.', 'UGX 150,000,000', 'UGX 250,000,000', 'UGX 300,000,000', 1, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 3', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026; Dentons global tax guide; alfredhabaasa.com 2026/27 outlook', 'The published Bill says 250 million; the enacted-Act summaries say 300 million (raised during passage). TaxComp''s VAT calculator uses 300 million, marked pending verification. Confirm against the enacted Act.', 310, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s28-hotel-credit', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.28(3a) to (3c) and (4)(d)', '28', 'relief',
   'Allows input tax credit to a developer of a hotel or tourism facility for civil works, feasibility, design and construction services, and certain construction materials, fittings and equipment, supplied up to two years before commissioning; the credit arises on commissioning and applies only to that facility.', NULL, 'investment of at least USD 10 million (foreigner) or USD 5 million (citizen)', NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 320, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s28-software', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.28(6)(f) and (6a)', '28', 'restriction',
   'Adds software as a new paragraph (f) of section 28(6), limited by a new subsection (6a) to imported software.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 8 of 2026, clause 4(c) and (d)', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', '', 'Not mentioned in the summaries of the enacted Act that were read. Read section 28(6) of the principal Act to see what the paragraph does.', 330, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s32-mining-inputs', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.32(7)', '32', 'procedure',
   'The Minister may prescribe by regulations the terms for paying tax on plant and machinery and on inputs for the mining sector.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 5', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 340, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s36-refund-interest', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.36(3)', '36', 'threshold',
   'Changes the amount in section 36(3) on interest on refunds from a fixed sum to a percentage of the refund claimed.', 'UGX 50,000', '5% of the total amount of the tax refund claimed', '5% of the total tax refunds claimed', 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 6', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 350, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-s38-refund-threshold', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 's.38', '38', 'threshold',
   'Lowers the amount in section 38 (refunds connected with e-receipts, as reported).', 'UGX 5,000,000', 'UGX 2,000,000', 'UGX 2,000,000', 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 7', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 360, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-sch2-organisations', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 'Schedule 2', NULL, 'exemption',
   'Adds BADEA and renames the Medical Research Council entry as the MRC/UVRI and LSHTM Uganda Research Unit.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 8', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 370, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('vat-2026-sch3-nuclear', 'UG', 'vata-amendment-2026', 'vata', 'Value Added Tax Act, Cap. 344', 'Schedule 3, paragraph 1(z)', NULL, 'exemption',
   'Adds nuclear energy to Schedule 3, paragraph 1(z), so that supplies to contractors and subcontractors of nuclear energy projects are covered.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 8 of 2026, clause 9', 'https://www.parliament.go.ug/sites/default/files/Value%20Added%20Tax%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 380, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Excise Duty (Amendment) Bill No. 7 (Schedule 2)
  ('eda-2026-spirits', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 3(c)(ii)', NULL, 'rates',
   'Imported un-denatured spirits of less than 80% alcohol by volume.', '80% or UGX 1,700 per litre, whichever is higher (as reported)', '80% or UGX 3,500 per litre, whichever is higher', '80% or UGX 3,500 per litre, whichever is higher', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(a)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', 'Assent and commencement of this Act are not confirmed (see the law register).', 400, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-cement', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 7', NULL, 'rates',
   'Cement, adhesives, grout, white cement or lime.', 'UGX 500 per 50 kg', 'UGX 1,000 per 50 kg', 'UGX 750 per 50 kg', 1, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(b)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026; PwC Uganda significant developments', 'The published Bill says 1,000; the enacted-Act summaries say 750. Confirm against the enacted Act.', 410, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-motor-spirit', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 8(a)', NULL, 'rates',
   'Motor spirit (gasoline).', 'UGX 1,550 per litre', 'UGX 1,750 per litre', 'UGX 1,750 per litre', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(c)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026; PwC Uganda significant developments', '', 420, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-gas-oil', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 8(b)', NULL, 'rates',
   'Gas oil (automotive, light, amber for high-speed engines).', 'UGX 1,230 per litre', 'UGX 1,430 per litre', 'UGX 1,430 per litre', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(c)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', '', 430, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-sugar', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 9', NULL, 'rates',
   'Cane or beet sugar and chemically pure sucrose in solid form.', 'UGX 100 per kg', 'UGX 300 per kg', 'UGX 200 per kg', 1, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(d)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', 'The published Bill says 300; the enacted-Act summary says 200. Confirm against the enacted Act.', 440, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-plastics', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 11', NULL, 'rates',
   'Plastics: sacks and bags of polymers of ethylene and other plastics (with stated exceptions) and disposable plastic cups, plates, cutlery, bags, sachets, bottles, straws, stirrers, cling films, wraps, jars and lids.', '2.5% or USD 70 per ton, whichever is greater (as reported; possibly a misprint)', '25% or USD 1,500 per tonne, whichever is higher', '25% or USD 1,500 per ton, whichever is greater', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(e)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', 'Exceptions in the Bill: vacuum packaging bags for food, juices, tea and coffee sacks, and bags for direct use in making sanitary pads.', 450, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-cooking-oil', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 18', NULL, 'rates',
   'Cooking oil.', 'UGX 200 per litre', 'UGX 400 per litre', 'UGX 400 per litre', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(f)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', '', 460, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-motorcycles', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 19', NULL, 'rates',
   'Motorcycles at first registration.', 'UGX 200,000', 'UGX 500,000', 'UGX 500,000', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(g)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', '', 470, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-paints', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 28 (new)', NULL, 'rates',
   'Paints, varnishes and lacquers, newly excisable.', 'Nil', 'locally manufactured: 3% or UGX 50 per litre or per kg, whichever is higher; imported: 10% or UGX 2,000 per litre or per kg, whichever is higher', 'locally manufactured: 3% or UGX 50 per litre or kg; imported: 10% or UGX 2,000 per litre or kg', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(h)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026; Dentons global tax guide', '', 480, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eda-2026-cooking-fat', 'UG', 'eda-amendment-2026', 'eda', 'Excise Duty Act, Cap. 336', 'Schedule 2, item 29 (new)', NULL, 'rates',
   'Cooking fat, newly excisable.', 'Nil', 'UGX 500 per litre or kg', 'UGX 500 per litre or kg', 0, '2026-07-01', 'bill_and_report', 'Bill No. 7 of 2026, clause 2(h)', 'https://www.parliament.go.ug/sites/default/files/Excise%20Duty%20(Amendment)%20Bill%2C%202026_0.pdf', 'EY Tax Alert, 11 June 2026', '', 490, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Stamp Duty (Amendment) Bill No. 4
  ('sda-2026-s7a-monthly-returns', 'UG', 'sda-amendment-2026', 'sda', 'Stamp Duty Act, Cap. 339', 's.7A (new)', '7A', 'procedure',
   'A person carrying on financial services business files monthly returns of stamp duty received on instruments; late filing attracts simple interest.', NULL, '2% of the duty payable for every month of default', '2% of the duty payable for each month of default', 0, '2026-07-01', 'bill_and_report', 'Bill No. 4 of 2026, clause 2', 'https://www.parliament.go.ug/sites/default/files/Stamp%20Duty%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 500, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('sda-2026-s62-records', 'UG', 'sda-amendment-2026', 'sda', 'Stamp Duty Act, Cap. 339', 's.62(2)', '62', 'administration',
   'Documents and records subject to stamp duty must be kept for a minimum period from the date they were made.', NULL, 'at least five years', 'at least five years', 0, '2026-07-01', 'bill_and_report', 'Bill No. 4 of 2026, clause 3', 'https://www.parliament.go.ug/sites/default/files/Stamp%20Duty%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 510, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('sda-2026-item63-transfer', 'UG', 'sda-amendment-2026', 'sda', 'Stamp Duty Act, Cap. 339', 'Schedule 2, item 63(a)', NULL, 'rates',
   'Substitutes the duty on transfers in item 63(a).', NULL, NULL, NULL, 0, '2026-07-01', 'bill_only', 'Bill No. 4 of 2026, clause 4(a)', 'https://www.parliament.go.ug/sites/default/files/Stamp%20Duty%20(Amendment)%20Bill%2C%202026.pdf', '', 'The rate printed in the Bill could not be read reliably from the PDF, so no figure is recorded. Not mentioned in the summaries of the enacted Act that were read.', 520, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('sda-2026-item67-vehicles', 'UG', 'sda-amendment-2026', 'sda', 'Stamp Duty Act, Cap. 339', 'Schedule 2, item 67 (new)', NULL, 'rates',
   'Duty on the registration or transfer of motor vehicles.', NULL, 'motorcycle, tricycle or quadricycle: UGX 50,000; any other motor vehicle: UGX 200,000', 'motorcycle, tricycle or quadricycle: UGX 30,000; any other motor vehicle: UGX 200,000', 1, '2026-07-01', 'bill_and_report', 'Bill No. 4 of 2026, clause 4(b)', 'https://www.parliament.go.ug/sites/default/files/Stamp%20Duty%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', 'The published Bill says 50,000 for motorcycles; the enacted-Act summary says 30,000. Confirm against the enacted Act.', 530, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Tax Procedures Code (Amendment) Bill No. 5
  ('tpc-2026-s21-tax-stamps', 'UG', 'tpca-amendment-2026', 'tpca', 'Tax Procedures Code Act, Cap. 343', 's.21(3)', '21', 'penalty',
   'Reduces the alternative minimum penal tax in section 21(3) (goods without tax stamps, as reported).', '2,500 currency points', '100 currency points', '100 currency points (reported as UGX 2,000,000)', 0, '2026-07-01', 'bill_and_report', 'Bill No. 5 of 2026, clause 2', 'https://www.parliament.go.ug/sites/default/files/Tax%20Procedures%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 600, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('tpc-2026-s47c-waiver-2016', 'UG', 'tpca-amendment-2026', 'tpca', 'Tax Procedures Code Act, Cap. 343', 's.47C (new)', '47C', 'relief',
   'Waives tax, penal tax and interest owed as at 30 June 2016 that is still outstanding when the Act commences.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 5 of 2026, clause 3', 'https://www.parliament.go.ug/sites/default/files/Tax%20Procedures%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 610, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('tpc-2026-s47d-waiver-2025', 'UG', 'tpca-amendment-2026', 'tpca', 'Tax Procedures Code Act, Cap. 343', 's.47D (reported)', '47D', 'relief',
   'Reported waiver of interest and penalties outstanding as at 30 June 2025 where the principal tax is paid by a deadline.', NULL, NULL, 'principal tax paid by 30 June 2027 (one passage of the same source says 30 June 2026)', 1, '2026-07-01', 'report_only', 'Not in Bill No. 5 of 2026 as published', 'https://www.parliament.go.ug/sites/default/files/Tax%20Procedures%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', 'Not in the Bill as published: reported as added during passage. The source gives two different payment deadlines. Confirm against the enacted Act.', 620, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('tpc-2026-s93-efd-einvoice', 'UG', 'tpca-amendment-2026', 'tpca', 'Tax Procedures Code Act, Cap. 343', 's.93(1) and (2)', '93', 'penalty',
   'Replaces the penal tax for not using an electronic fiscal device, not issuing an e-invoice or e-receipt, or tampering with a device.', 'tax due or 400 currency points (no EFD); tax due or 300 currency points (e-invoice, tampering) (as reported)', 'double the tax due or ten currency points, whichever is higher', 'double the tax due or 10 currency points', 0, '2026-07-01', 'bill_and_report', 'Bill No. 5 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/Tax%20Procedures%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 630, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Lotteries and Gaming (Amendment) Bill No. 10
  ('lga-2026-schedule4-gaming-tax', 'UG', 'lga-amendment-2026', 'lga', 'Lotteries and Gaming Act, Cap. 334', 'Schedule 4 (section 48(1))', NULL, 'rates',
   'Harmonises the tax on betting and gaming activities at one rate of total stakes less payouts, and defines payouts.', 'betting 20%, gaming 30% of total stakes less payouts (as reported)', '30% of the total amount staked less the payouts', 'betting 30%; gaming 30% (unchanged)', 0, '2026-07-01', 'bill_and_report', 'Bill No. 10 of 2026, clause 2', 'https://www.parliament.go.ug/sites/default/files/Lotteries%20and%20Gaming%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', 'Separate from the 15% withholding tax on winnings under the Income Tax Act (section 131).', 700, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- External Trade (Amendment) Bill No. 3
  ('eta-2026-medical-exemptions', 'UG', 'eta-amendment-2026', NULL, 'External Trade Act, Cap. 69', 'ss.3A and 3B', '3A', 'exemption',
   'Exempts imports of vaccines, medicines, medical supplies, pesticides, rodenticides, acaricides and insecticides from the infrastructure levy and the import declaration fee.', NULL, NULL, NULL, 0, '2026-07-01', 'bill_and_report', 'Bill No. 3 of 2026, clauses 2 and 3', 'https://www.parliament.go.ug/sites/default/files/External%20Trade%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 800, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('eta-2026-worn-clothing-levy', 'UG', 'eta-amendment-2026', NULL, 'External Trade Act, Cap. 69', 's.3C (new)', '3C', 'levy',
   'New environmental levy on worn clothing and other worn articles.', NULL, '30% of the CIF value', '30% of CIF value', 0, '2026-07-01', 'bill_and_report', 'Bill No. 3 of 2026, clause 4', 'https://www.parliament.go.ug/sites/default/files/External%20Trade%20(Amendment)%20Bill%2C%202026.pdf', 'EY Tax Alert, 11 June 2026', '', 810, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
-- Traffic and Road Safety (Amendment) Bill No. 9
  ('trsa-2026-vehicle-age', 'UG', 'trsa-amendment-2026', NULL, 'Traffic and Road Safety Act, Cap. 347', 's.15', '15', 'restriction',
   'Lowers the maximum age of motor vehicles that may be imported; vehicles in transit before commencement that arrive by 31 December 2026 are excluded.', '15 years from the year of manufacture', '13 years from the year of manufacture', NULL, 0, NULL, 'bill_only', 'Bill No. 9 of 2026, clauses 1 and 2', 'https://www.parliament.go.ug/sites/default/files/Traffic%20and%20Road%20Safety%20(Amendment)%20Bill%2C%202026.pdf', '', 'Bill only: no report of its passing or assent was found. The Bill provides for commencement on 1 July 2026.', 900, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026'),
  ('trsa-2026-environment-levy', 'UG', 'trsa-amendment-2026', NULL, 'Traffic and Road Safety Act, Cap. 347', 'Schedule 3, item (b)', NULL, 'levy',
   'Revises the environment levy on imported motor vehicles (other than goods vehicles) by age from the year of manufacture.', NULL, '9 years old: 20% of CIF value; 10 years: 30%; 11 years: 40%; 12 years: 50% (further entries not captured)', NULL, 0, NULL, 'bill_only', 'Bill No. 9 of 2026, clause 3', 'https://www.parliament.go.ug/sites/default/files/Traffic%20and%20Road%20Safety%20(Amendment)%20Bill%2C%202026.pdf', '', 'Bill only: no report of its passing or assent was found. The last entry of the item could not be read from the PDF.', 910, '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z', 'import:amendments-2026')
ON CONFLICT (id) DO UPDATE SET
  principal_act = EXCLUDED.principal_act, provision = EXCLUDED.provision, section_number = EXCLUDED.section_number, topic = EXCLUDED.topic, summary = EXCLUDED.summary,
  previous_figure = EXCLUDED.previous_figure, bill_figure = EXCLUDED.bill_figure, reported_figure = EXCLUDED.reported_figure, figures_differ = EXCLUDED.figures_differ,
  effective_from = EXCLUDED.effective_from, evidence = EXCLUDED.evidence, bill_reference = EXCLUDED.bill_reference, bill_url = EXCLUDED.bill_url,
  secondary_sources = EXCLUDED.secondary_sources, note = EXCLUDED.note, position = EXCLUDED.position, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
  WHERE legislation_amendments.verification_status = 'unverified';

-- ------------------------------------------------------------------ the 2024 edition
-- The amended Acts' 2024 versions no longer state the law from 1 July 2026: flag them for review (unverified ones only).
UPDATE legislation_law_versions SET verification_status = 'requires_amendment_review',
  verification_note = 'Amended with effect from 1 July 2026 (see the 2026 amendments register). Check each change against the enacted 2026 Act.',
  updated_at = '2026-11-11T12:00:00.000Z', updated_by = 'import:amendments-2026'
  WHERE edition_id = 'ug-rev-2024' AND law_id IN ('ita', 'vata', 'eda', 'sda', 'tpca', 'lga') AND verification_status = 'unverified';

UPDATE legislation_coverage_gaps SET note = 'The changes made by the 2026 amendment Acts are listed in the 2026 amendments register (from the Bills as published and reported enactments, unverified) but are not yet captured as an edition with amended section headings or wording.'
  WHERE id = 'ug-amendments-2026';

INSERT INTO legislation_coverage_gaps (id, jurisdiction, title, kind, keywords, note, created_at) VALUES
  ('ug-external-trade', 'UG', 'External Trade Act, Cap. 69', 'not_captured', 'external trade infrastructure levy import declaration fee worn clothing environmental levy',
   'The External Trade Act is not in the legislative database. Its 2026 changes are in the 2026 amendments register.', '2026-11-11T12:00:00.000Z'),
  ('ug-traffic-road-safety', 'UG', 'Traffic and Road Safety Act, Cap. 347', 'not_captured', 'traffic road safety vehicle age environment levy motor vehicle import',
   'The Traffic and Road Safety Act is not in the legislative database. The 2026 Bill''s changes are in the 2026 amendments register (Bill only).', '2026-11-11T12:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
