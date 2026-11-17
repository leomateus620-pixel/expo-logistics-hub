BEGIN;
CREATE OR REPLACE FUNCTION public._cronograma_require_deleter(_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE='P0001';
  END IF;
  IF public.get_user_org_role(auth.uid(), _org_id) NOT IN ('admin','gestor')
     AND NOT public.has_capability(auth.uid(), _org_id, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem permissão para excluir eventos' USING ERRCODE='P0001';
  END IF;
END $function$
;
CREATE OR REPLACE FUNCTION public._cronograma_require_writer(_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE='P0001';
  END IF;
  IF NOT public.has_capability(auth.uid(), _org_id, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: usuário sem permissão de escrita no cronograma' USING ERRCODE='P0001';
  END IF;
END
$function$
;
CREATE OR REPLACE FUNCTION public.cronograma_agenda_permissions(_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'global_write',_org_id IN (SELECT public.cronograma_writer_org_ids()),
    'managed_commission_ids',coalesce((SELECT jsonb_agg(c.id) FROM public.commissions c WHERE c.org_id=_org_id
      AND c.id IN (SELECT public.cronograma_managed_commission_ids())),'[]'::jsonb),
    'writable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
      AND e.id IN (SELECT public.cronograma_writable_event_ids())),'[]'::jsonb),
    'deletable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
      AND e.id IN (SELECT public.cronograma_visible_event_ids()) AND public.is_org_member(auth.uid(),_org_id)
      AND (public.get_user_org_role(auth.uid(),_org_id) IN ('admin','gestor')
        OR public.has_capability(auth.uid(),_org_id,'cronograma_eventos_write'))),'[]'::jsonb));
$function$
;
CREATE OR REPLACE FUNCTION public.cronograma_writer_org_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.org_id FROM public.org_members m
  WHERE m.user_id=auth.uid() AND m.is_active
    AND (m.role IN ('admin','gestor','operador') OR public.has_capability(auth.uid(),m.org_id,'cronograma_eventos_write'));
$function$
;
ALTER POLICY cronograma_eventos_delete ON public.cronograma_eventos USING(is_org_member(auth.uid(), org_id) AND ((NOT planning_restricted) OR cronograma_can_view_planning(auth.uid(), org_id)) AND (get_user_org_role(auth.uid(), org_id) IN ('admin','gestor') OR has_capability(auth.uid(), org_id, 'cronograma_eventos_write')));
DELETE FROM supabase_migrations.schema_migrations WHERE version='20261117124500';
NOTIFY pgrst,'reload schema';
COMMIT;
