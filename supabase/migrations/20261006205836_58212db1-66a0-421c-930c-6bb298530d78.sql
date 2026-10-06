-- Otimiza a leitura do mapa comercial: a autorização por organização/segmento passa
-- a ser calculada uma vez por consulta (subconsulta não correlacionada), em vez de uma
-- chamada de função por linha. A semântica é idêntica: as novas funções delegam às
-- funções originais can_view_commercial_map e map_can_access_segment.

CREATE OR REPLACE FUNCTION public.map_viewable_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT o.org_id
  FROM (SELECT DISTINCT m.org_id FROM public.org_members m WHERE m.user_id = auth.uid() AND m.is_active = true) o
  WHERE public.can_view_commercial_map(o.org_id);
$$;

CREATE OR REPLACE FUNCTION public.map_accessible_segment_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.id FROM public.map_segments s WHERE s.is_active = true AND public.map_can_access_segment(s.id);
$$;

REVOKE ALL ON FUNCTION public.map_viewable_org_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.map_accessible_segment_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_viewable_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.map_accessible_segment_ids() TO authenticated;

-- Snapshot das políticas originais para reversão.
CREATE TABLE IF NOT EXISTS public.map_rls_policy_snapshots (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  policy_name text NOT NULL,
  original_qual text NOT NULL,
  new_qual text NOT NULL,
  migration_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.map_rls_policy_snapshots TO service_role;
ALTER TABLE public.map_rls_policy_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record; v_new text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'SELECT'
      AND (qual LIKE '%can_view_commercial_map(%' OR qual LIKE '%map_can_access_segment(%')
  LOOP
    v_new := regexp_replace(r.qual, 'can_view_commercial_map\(([a-z_]+\.org_id)\)', '(\1 IN ( SELECT public.map_viewable_org_ids()))', 'g');
    v_new := regexp_replace(v_new, 'map_can_access_segment\(([a-z_]+\.(segment_id|id))\)', '(\1 IN ( SELECT public.map_accessible_segment_ids()))', 'g');
    IF v_new <> r.qual AND v_new NOT LIKE '%can_view_commercial_map(%' AND v_new NOT LIKE '%map_can_access_segment(%' THEN
      INSERT INTO public.map_rls_policy_snapshots (table_name, policy_name, original_qual, new_qual, migration_tag)
      VALUES (r.tablename, r.policyname, r.qual, v_new, 'map_read_initplan_2026_10_06');
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, v_new);
    END IF;
  END LOOP;
END $$;