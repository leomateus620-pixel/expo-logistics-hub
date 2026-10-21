CREATE OR REPLACE FUNCTION public.map_has_explicit_capability(_org_id uuid, _capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.role() = 'service_role'
    OR (
      public.is_org_member(auth.uid(), _org_id)
      AND (
      public.get_user_org_role(auth.uid(), _org_id) IN ('admin', 'gestor')
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities capability
        WHERE capability.user_id = auth.uid()
          AND capability.org_id = _org_id
          AND capability.capability IN (_capability, 'map.admin', 'full_access')
      )
      )
    );
$function$
