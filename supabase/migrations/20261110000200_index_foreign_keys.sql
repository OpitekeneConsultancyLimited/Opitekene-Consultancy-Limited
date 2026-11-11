-- Index every foreign key in the taxcomp schema that has no index starting
-- with its columns (Supabase performance advisor: unindexed_foreign_keys, 41
-- found on 2026-11-10). Without them, deletes and joins on the referenced
-- table scan the referencing table. Idempotent: re-running creates nothing new.
DO $$
DECLARE
  fk RECORD;
  idx_name TEXT;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl,
           c.conrelid AS relid,
           c.conkey AS keys,
           cl.relname AS table_name,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS col_list,
           (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS col_names
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'taxcomp'
  LOOP
    -- Covered when some index's leading columns are exactly the FK columns (any order).
    IF EXISTS (
      SELECT 1 FROM pg_index i
       WHERE i.indrelid = fk.relid
         AND (SELECT array_agg(x ORDER BY x) FROM unnest((i.indkey::int2[])[0:array_length(fk.keys, 1) - 1]) AS x)
           = (SELECT array_agg(x ORDER BY x) FROM unnest(fk.keys) AS x)
    ) THEN
      CONTINUE;
    END IF;
    idx_name := left(fk.table_name || '_' || fk.col_names, 50) || '_fk_' || substr(md5(fk.table_name || fk.col_names), 1, 6);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', idx_name, fk.tbl, fk.col_list);
  END LOOP;
END
$$;
