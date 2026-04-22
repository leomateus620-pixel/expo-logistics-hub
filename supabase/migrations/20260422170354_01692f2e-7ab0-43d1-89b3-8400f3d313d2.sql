DROP POLICY IF EXISTS "cmm_update" ON public.committee_mobility_members;

CREATE POLICY "cmm_update"
ON public.committee_mobility_members
FOR UPDATE
USING (public.is_org_member(auth.uid(), org_id))
WITH CHECK (public.is_org_member(auth.uid(), org_id));