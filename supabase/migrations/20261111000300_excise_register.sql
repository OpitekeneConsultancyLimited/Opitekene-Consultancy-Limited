-- Law register: the Excise Duty Act and the Excise Duty (Amendment) Act 2026,
-- named in the owner's Master Development Directive.
--
-- Neither the directive nor the build brief gives the amendment's dates or
-- status, so nothing is asserted: the principal Act's chapter is NULL and the
-- 2026 amendment is seeded as a BILL. resolveLaw never applies a bill, so it
-- cannot affect any computation or case until a legal reviewer confirms its
-- assent and commencement dates (todo-verify.md B8, B9). No tax head uses the
-- Excise Duty Act yet; this is register content for the Knowledge Centre.
-- Idempotent.

SET search_path TO taxcomp;

INSERT INTO law_statutes (id, title, chapter, kind, parent_id, bill_status, returned_date, assent_date, commencement_date, applies_from_period, source_url, note, created_at) VALUES
  ('eda', 'Excise Duty Act', NULL, 'principal', NULL, 'in_force', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/',
   'TODO_VERIFY: chapter number in the Laws of Uganda 2024 Revised Edition and the exact ULII link.', '2026-11-11T00:00:00.000Z'),
  ('eda-amendment-2026', 'Excise Duty (Amendment) Act, 2026', NULL, 'amendment', 'eda', 'bill', NULL, NULL, NULL, NULL, 'https://ulii.org/en/legislation/',
   'Named in the owner''s directive; status and dates not yet confirmed, so it is held as a bill and never applied. TODO_VERIFY: Act number, assent and commencement dates, Gazette reference.', '2026-11-11T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;
