-- ============================================================
-- 015_drop_duplicate_fk_constraints.sql
--
-- The live database contains duplicate foreign key constraints:
-- an auto-named `<table>_<column>_fkey` constraint plus a manually
-- added `fk_<table>_<column>` constraint on the same columns.
-- PostgREST cannot disambiguate these, causing PGRST201 errors
-- ("more than one relationship was found") on embedded selects.
--
-- This migration drops every `fk_%` foreign key constraint that has
-- an identical sibling constraint (same table, same columns, same
-- definition). `fk_%` constraints without a duplicate are kept.
-- ============================================================

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT c.oid, c.conname, t.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND c.conname LIKE 'fk\_%'
      AND EXISTS (
        SELECT 1
        FROM pg_constraint c2
        WHERE c2.contype = 'f'
          AND c2.conrelid = c.conrelid
          AND c2.conname <> c.conname
          AND pg_get_constraintdef(c2.oid) = pg_get_constraintdef(c.oid)
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', dup.table_name, dup.conname);
    RAISE NOTICE 'Dropped duplicate FK constraint % on table %', dup.conname, dup.table_name;
  END LOOP;
END $$;
