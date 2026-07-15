-- Restore all FK constraints from backup
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schema_name, table_name, constraint_name, constraint_def FROM public._sync_fk_backup
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', r.schema_name, r.table_name, r.constraint_name, r.constraint_def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FK % on %.% failed: %', r.constraint_name, r.schema_name, r.table_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- Re-enable user triggers on public tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '\_sync%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;
END $$;

-- Cleanup temporary sync tables
DROP TABLE IF EXISTS public._sync_fk_backup;

-- Revoke temporary grants
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM sandbox_exec;