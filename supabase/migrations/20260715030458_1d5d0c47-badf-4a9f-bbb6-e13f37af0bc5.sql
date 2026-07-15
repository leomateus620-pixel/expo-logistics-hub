-- Snapshot all FK definitions from public.* into a backup table, then drop them
DROP TABLE IF EXISTS public._sync_fk_backup;
CREATE TABLE public._sync_fk_backup AS
SELECT
  n.nspname AS schema_name,
  cl.relname AS table_name,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public' AND c.contype = 'f';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schema_name, table_name, constraint_name FROM public._sync_fk_backup
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.schema_name, r.table_name, r.constraint_name);
  END LOOP;
END $$;

GRANT SELECT ON public._sync_fk_backup TO sandbox_exec;