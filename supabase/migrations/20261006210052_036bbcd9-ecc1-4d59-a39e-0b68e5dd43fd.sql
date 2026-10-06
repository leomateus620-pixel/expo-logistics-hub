CREATE OR REPLACE FUNCTION public.map_capable_org_ids(_capability text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT o.org_id
  FROM (SELECT DISTINCT m.org_id FROM public.org_members m WHERE m.user_id = auth.uid() AND m.is_active = true) o
  WHERE public.map_has_explicit_capability(o.org_id, _capability);
$$;
REVOKE ALL ON FUNCTION public.map_capable_org_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_capable_org_ids(text) TO authenticated;

DO $$
DECLARE r record; v_new text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual FROM pg_policies
    WHERE schemaname = 'public' AND qual IS NOT NULL
      AND qual ~ 'map_has_explicit_capability\([a-z_]+\.org_id, ''[a-z_.]+''::text\)'
      AND 'authenticated' = ANY(roles) OR (schemaname = 'public' AND qual ~ 'map_has_explicit_capability\([a-z_]+\.org_id, ''[a-z_.]+''::text\)' AND 'public' = ANY(roles))
  LOOP
    v_new := regexp_replace(r.qual, 'map_has_explicit_capability\(([a-z_]+\.org_id), (''[a-z_.]+''::text)\)', '(\1 IN ( SELECT public.map_capable_org_ids(\2)))', 'g');
    IF v_new <> r.qual AND v_new !~ 'map_has_explicit_capability\(' THEN
      INSERT INTO public.map_rls_policy_snapshots (table_name, policy_name, original_qual, new_qual, migration_tag)
      VALUES (r.tablename, r.policyname, r.qual, v_new, 'map_capability_initplan_2026_10_06');
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.policyname, r.tablename, v_new);
    END IF;
  END LOOP;
END $$;