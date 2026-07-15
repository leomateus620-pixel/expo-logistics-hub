DROP TABLE IF EXISTS public._sync_probe2;
CREATE TABLE public._sync_probe2 AS
SELECT
  pg_has_role('postgres', 'supabase_auth_admin', 'MEMBER') AS is_auth_admin_member,
  pg_has_role('postgres', 'supabase_auth_admin', 'USAGE') AS has_auth_admin_usage;
GRANT SELECT ON public._sync_probe2 TO sandbox_exec;

-- Attempt to grant via SET ROLE
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE supabase_auth_admin;
    GRANT USAGE ON SCHEMA auth TO sandbox_exec;
    GRANT INSERT, DELETE ON auth.users TO sandbox_exec;
    GRANT INSERT, DELETE ON auth.identities TO sandbox_exec;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'grant via set role failed: %', SQLERRM;
  END;
END $$;