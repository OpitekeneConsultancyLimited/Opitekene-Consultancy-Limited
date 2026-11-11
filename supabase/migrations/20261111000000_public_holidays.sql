-- Uganda public holidays for the deadline engine (todo-verify.md A3).
--
-- Two uses, deliberately different:
--   * Warning (any row, verified or not): when a deadline falls on a weekend or
--     a listed holiday, the user is told to lodge by the working day BEFORE it.
--     That only ever moves the user earlier, so unverified data is safe here.
--   * Extension (verified rows only): if a reviewer approves the
--     "next_business_day" counting rule, a deadline on a holiday moves to the
--     next working day. Only holidays a reviewer has checked can do that.
--
-- Seed: the fixed-date holidays and Easter for 2026-2028, all UNVERIFIED.
-- Easter dates are computed (Gregorian computus). Eid al-Fitr and Eid al-Adha
-- are gazetted each year and are NOT seeded: a reviewer adds them. Whether a
-- holiday on a Sunday is observed on the Monday is TODO_VERIFY (not seeded).

SET search_path TO taxcomp;

CREATE TABLE IF NOT EXISTS public_holidays (
  holiday_date TEXT NOT NULL CHECK (holiday_date ~ '^\d{4}-\d{2}-\d{2}$'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 80),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  note TEXT NOT NULL DEFAULT '',
  verified_by TEXT,
  verified_at TEXT,
  added_by TEXT NOT NULL DEFAULT 'seed',
  created_at TEXT NOT NULL,
  PRIMARY KEY (holiday_date, name),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);

INSERT INTO public_holidays (holiday_date, name, note, created_at)
SELECT format('%s-%s', y, md), name,
       'TODO_VERIFY: Public Holidays Act; confirm the date and whether it moves when it falls on a Sunday.',
       '2026-11-11T00:00:00.000Z'
  FROM generate_series(2026, 2028) AS y,
       (VALUES ('01-01', 'New Year''s Day'), ('01-26', 'NRM Liberation Day'), ('02-16', 'Archbishop Janani Luwum Day'),
               ('03-08', 'International Women''s Day'), ('05-01', 'Labour Day'), ('06-03', 'Martyrs'' Day'),
               ('06-09', 'National Heroes'' Day'), ('10-09', 'Independence Day'), ('12-25', 'Christmas Day'),
               ('12-26', 'Boxing Day')) AS fixed(md, name)
ON CONFLICT (holiday_date, name) DO NOTHING;

INSERT INTO public_holidays (holiday_date, name, note, created_at) VALUES
  ('2026-04-03', 'Good Friday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z'),
  ('2026-04-06', 'Easter Monday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z'),
  ('2027-03-26', 'Good Friday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z'),
  ('2027-03-29', 'Easter Monday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z'),
  ('2028-04-14', 'Good Friday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z'),
  ('2028-04-17', 'Easter Monday', 'Computed from the Easter date. TODO_VERIFY.', '2026-11-11T00:00:00.000Z')
ON CONFLICT (holiday_date, name) DO NOTHING;

-- Reviewers add and verify holidays through the Worker (audited); nothing is deleted.
REVOKE DELETE, TRUNCATE ON taxcomp.public_holidays FROM taxcomp_worker;
GRANT SELECT, INSERT, UPDATE ON taxcomp.public_holidays TO taxcomp_worker;

DO $$
DECLARE
  api_role TEXT;
BEGIN
  ALTER TABLE taxcomp.public_holidays ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS taxcomp_worker_all ON taxcomp.public_holidays;
  CREATE POLICY taxcomp_worker_all ON taxcomp.public_holidays TO taxcomp_worker USING (true) WITH CHECK (true);
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON taxcomp.public_holidays FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
