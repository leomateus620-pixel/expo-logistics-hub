-- Additional organization gate requested by the owner. Existing action grants are unchanged.
CREATE TABLE IF NOT EXISTS public.financial_restricted_orgs (
 org_id uuid PRIMARY KEY REFERENCES public.organizations(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_access_roster (
 org_id uuid NOT NULL REFERENCES public.financial_restricted_orgs(org_id),user_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,user_id)
);
ALTER TABLE public.financial_restricted_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_access_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_restricted_orgs,public.financial_access_roster FROM PUBLIC,anon,authenticated;
-- Account identities were resolved from the live organization, not inferred from names.
DO $$ DECLARE org uuid:='985888b8-155f-4bbe-b6b9-6bef2893d99b'; ids uuid[]:=ARRAY[
 'b664fc22-69d3-40f1-8370-16b8a07ec402'::uuid,
 'b8fd1e36-b46c-4eff-bb75-372b676ce123'::uuid,
 'e0ada2e5-4440-4d15-91bd-aa4160247113'::uuid,
 'f9ed4ab9-0ef3-4ee4-9707-36288dbc828f'::uuid];
BEGIN
 LOCK TABLE public.org_members,public.user_capabilities IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org) THEN RAISE EXCEPTION 'FINANCIAL_ACCESS_WRONG_ORGANIZATION'; END IF;
 IF (SELECT count(DISTINCT user_id) FROM public.org_members WHERE org_id=org AND user_id=ANY(ids) AND is_active)<>4 THEN RAISE EXCEPTION 'FINANCIAL_ACCESS_IDENTITY_CONFLICT'; END IF;
 INSERT INTO public.financial_restricted_orgs(org_id) VALUES(org) ON CONFLICT DO NOTHING;
 INSERT INTO public.financial_access_roster(org_id,user_id) SELECT org,unnest(ids) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.financial_can(_org_id uuid,_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL
 AND (NOT EXISTS(SELECT 1 FROM public.financial_restricted_orgs r WHERE r.org_id=_org_id)
      OR EXISTS(SELECT 1 FROM public.financial_access_roster r WHERE r.org_id=_org_id AND r.user_id=auth.uid() AND r.active))
 AND EXISTS(SELECT 1 FROM public.org_members m WHERE m.org_id=_org_id AND m.user_id=auth.uid() AND m.is_active
  AND (m.role='admin' OR EXISTS(SELECT 1 FROM public.user_capabilities c WHERE c.org_id=_org_id AND c.user_id=auth.uid()
   AND (c.capability=_capability OR (_capability='financial_access' AND c.capability IN ('financial_edit','financial_confirm','financial_settle','financial_admin'))))));
$$;
CREATE OR REPLACE FUNCTION public.financial_accessible_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT m.org_id FROM public.org_members m WHERE m.user_id=auth.uid() AND m.is_active
 AND (NOT EXISTS(SELECT 1 FROM public.financial_restricted_orgs r WHERE r.org_id=m.org_id)
  OR EXISTS(SELECT 1 FROM public.financial_access_roster r WHERE r.org_id=m.org_id AND r.user_id=m.user_id AND r.active))
 AND (m.role='admin' OR EXISTS(SELECT 1 FROM public.user_capabilities c WHERE c.org_id=m.org_id AND c.user_id=m.user_id
  AND c.capability IN ('financial_access','financial_edit','financial_confirm','financial_settle','financial_admin')));
$$;
REVOKE ALL ON FUNCTION public.financial_can(uuid,text),public.financial_accessible_org_ids() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financial_can(uuid,text),public.financial_accessible_org_ids() TO authenticated;
