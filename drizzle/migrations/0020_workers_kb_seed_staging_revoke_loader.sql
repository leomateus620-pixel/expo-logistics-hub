-- The 2026-10-17 KB seed was promoted; close the temporary loader access.
DO $revoke$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    REVOKE ALL ON TABLE workers_private.kb_seed_stage_parts FROM sandbox_exec;
    REVOKE USAGE ON SCHEMA workers_private FROM sandbox_exec;
  END IF;
END $revoke$;