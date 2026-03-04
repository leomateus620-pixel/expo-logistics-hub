
CREATE TABLE public.security_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  run_by_user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'quick',
  summary jsonb NOT NULL,
  findings jsonb NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_reports_select" ON public.security_audit_reports
  FOR SELECT TO authenticated
  USING (public.get_user_org_role(auth.uid(), org_id) = 'admin'::org_role);

CREATE POLICY "audit_reports_insert" ON public.security_audit_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_org_role(auth.uid(), org_id) = 'admin'::org_role);

CREATE OR REPLACE FUNCTION public.audit_check_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT c.relname::text, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';
$$;

CREATE OR REPLACE FUNCTION public.audit_count_policies()
RETURNS TABLE(table_name text, policy_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT c.relname::text, COUNT(p.polname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname;
$$;
