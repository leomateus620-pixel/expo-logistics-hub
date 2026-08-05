CREATE TABLE IF NOT EXISTS public.map_reference_migration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.map_projects(id) ON DELETE CASCADE,
  area_code text NOT NULL,
  source_revision text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  snapshot jsonb NOT NULL,
  apply_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by uuid REFERENCES auth.users(id),
  rollback_reason text,
  CONSTRAINT map_reference_migration_snapshots_status_check
    CHECK (status IN ('PENDING', 'APPLIED', 'ROLLED_BACK'))
);

ALTER TABLE public.map_reference_migration_snapshots
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS apply_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rollback_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS map_reference_migration_snapshots_one_active_revision
  ON public.map_reference_migration_snapshots(project_id, area_code, source_revision)
  WHERE status = 'APPLIED';

ALTER TABLE public.map_reference_migration_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS map_reference_migration_snapshots_select ON public.map_reference_migration_snapshots;
CREATE POLICY map_reference_migration_snapshots_select
  ON public.map_reference_migration_snapshots
  FOR SELECT TO authenticated
  USING (public.map_has_explicit_capability(org_id, 'map.admin'));

REVOKE ALL ON TABLE public.map_reference_migration_snapshots FROM PUBLIC;
GRANT SELECT ON TABLE public.map_reference_migration_snapshots TO authenticated;
GRANT ALL ON TABLE public.map_reference_migration_snapshots TO service_role;

COMMENT ON TABLE public.map_reference_migration_snapshots IS
  'Immutable pre-apply snapshots for targeted cartographic reference rollouts, enabling audited rollback.';