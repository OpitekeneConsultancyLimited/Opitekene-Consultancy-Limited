-- Law register: the Excise Duty Act and the Excise Duty (Amendment) Act 2026,
-- named in the owner's Master Development Directive.
--
-- Source for what is seeded: Parliament of Uganda's Bill Tracker, bill 561
-- (https://bills.parliament.ug/user_bill_stage.php?billid=561, read
-- 2026-11-11). It describes the Bill as amending "the Excise Duty Act, Cap. 336"
-- and records first reading on 01/04/2026 and second and third readings on
-- 21/04/2026. It records no assent date. So the amendment is seeded as
-- PASSED (not assented): resolveLaw applies only assented or in-force law, so it
-- cannot affect any computation until a legal reviewer confirms assent and
-- commencement against the Gazette (todo-verify.md B8, B9). No tax head uses the
-- Excise Duty Act yet; this is register content for the Knowledge Centre.
-- Idempotent.

SET search_path TO taxcomp;

INSERT INTO law_statutes (id, title, chapter, kind, parent_id, bill_status, returned_date, assent_date, commencement_date, applies_from_period, source_url, note, created_at) VALUES
  ('eda', 'Excise Duty Act', 'Cap. 336', 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/',
   'Chapter as stated by Parliament''s Bill Tracker (bill 561). TODO_VERIFY: chapter in the Laws of Uganda 2024 Revised Edition and the exact ULII link.', '2026-11-11T00:00:00.000Z'),
  ('eda-amendment-2026', 'Excise Duty (Amendment) Act, 2026', NULL, 'amendment', 'eda', 'passed', NULL, NULL, NULL, NULL, 'https://bills.parliament.ug/user_bill_stage.php?billid=561',
   'Parliament''s Bill Tracker records the third reading (passed) on 21 April 2026 and no assent date, so TaxComp does not apply it. TODO_VERIFY: assent and commencement dates, Act number and Gazette reference.', '2026-11-11T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
