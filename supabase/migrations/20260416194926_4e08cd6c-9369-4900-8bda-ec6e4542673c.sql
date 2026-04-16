-- committee_mobility_forms
DROP POLICY IF EXISTS "cmf_insert" ON public.committee_mobility_forms;
CREATE POLICY "cmf_insert" ON public.committee_mobility_forms FOR INSERT
  WITH CHECK (
    public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    OR public.has_capability(auth.uid(), org_id, 'mobility_access')
  );

DROP POLICY IF EXISTS "cmf_update" ON public.committee_mobility_forms;
CREATE POLICY "cmf_update" ON public.committee_mobility_forms FOR UPDATE
  USING (
    public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    OR public.has_capability(auth.uid(), org_id, 'mobility_access')
  );

-- committee_mobility_members
DROP POLICY IF EXISTS "cmm_insert" ON public.committee_mobility_members;
CREATE POLICY "cmm_insert" ON public.committee_mobility_members FOR INSERT
  WITH CHECK (
    public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    OR public.has_capability(auth.uid(), org_id, 'mobility_access')
  );

DROP POLICY IF EXISTS "cmm_update" ON public.committee_mobility_members;
CREATE POLICY "cmm_update" ON public.committee_mobility_members FOR UPDATE
  USING (
    public.get_user_org_role(auth.uid(), org_id) IN ('admin','gestor','operador')
    OR public.has_capability(auth.uid(), org_id, 'mobility_access')
  );