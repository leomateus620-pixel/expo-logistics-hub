DROP POLICY IF EXISTS "org_insert" ON public.organizations;

CREATE POLICY "org_insert" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
);