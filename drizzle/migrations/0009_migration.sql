CREATE OR REPLACE FUNCTION public.ai_workers_can_access(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = _org_id AND m.user_id = auth.uid() AND m.is_active AND m.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM org_members m JOIN commissions c ON c.id = m.commission_id
      WHERE m.org_id = _org_id AND m.user_id = auth.uid() AND m.is_active AND c.org_id = _org_id AND c.slug IN ('ccpf','central'))
    OR EXISTS (
      SELECT 1 FROM commission_responsibles r JOIN commissions c ON c.id = r.commission_id
      JOIN org_members m ON m.org_id = _org_id AND m.user_id = r.user_id AND m.is_active
      WHERE r.org_id = _org_id AND r.user_id = auth.uid() AND r.active AND c.org_id = _org_id AND c.slug IN ('ccpf','central'))
  );
$$;
REVOKE ALL ON FUNCTION public.ai_workers_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_workers_can_access(uuid) TO authenticated;