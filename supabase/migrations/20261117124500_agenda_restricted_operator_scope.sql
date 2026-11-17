-- `has_capability` inherits every capability for operators, including restriction markers.
-- Read explicit grants here so a restricted operator never receives global agenda write/delete.
CREATE OR REPLACE FUNCTION public.cronograma_writer_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT m.org_id FROM public.org_members m WHERE m.user_id=auth.uid() AND m.is_active AND (
   m.role IN ('admin','gestor')
   OR (m.role='operador' AND NOT EXISTS(SELECT 1 FROM public.user_capabilities c
     WHERE c.org_id=m.org_id AND c.user_id=m.user_id AND c.capability='restricted_scope'))
   OR EXISTS(SELECT 1 FROM public.user_capabilities c WHERE c.org_id=m.org_id AND c.user_id=m.user_id
     AND c.capability IN ('cronograma_eventos_write','full_access'))
 );
$$;
CREATE OR REPLACE FUNCTION public._cronograma_require_writer(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR _org_id NOT IN (SELECT public.cronograma_writer_org_ids()) THEN
   RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem autorização global de escrita' USING ERRCODE='P0001';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public._cronograma_require_deleter(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR _org_id NOT IN (SELECT public.cronograma_writer_org_ids()) THEN
   RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem autorização para excluir eventos' USING ERRCODE='P0001';
 END IF;
END $$;
ALTER POLICY cronograma_eventos_delete ON public.cronograma_eventos
 USING(org_id IN (SELECT public.cronograma_writer_org_ids()) AND id IN (SELECT public.cronograma_visible_event_ids()));
CREATE OR REPLACE FUNCTION public.cronograma_agenda_permissions(_org_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'global_write',_org_id IN (SELECT public.cronograma_writer_org_ids()),
  'managed_commission_ids',coalesce((SELECT jsonb_agg(c.id) FROM public.commissions c WHERE c.org_id=_org_id
    AND c.id IN (SELECT public.cronograma_managed_commission_ids())),'[]'::jsonb),
  'writable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
    AND e.id IN (SELECT public.cronograma_writable_event_ids())),'[]'::jsonb),
  'deletable_event_ids',coalesce((SELECT jsonb_agg(e.id) FROM public.cronograma_eventos e WHERE e.org_id=_org_id
    AND e.id IN (SELECT public.cronograma_visible_event_ids())
    AND _org_id IN (SELECT public.cronograma_writer_org_ids())),'[]'::jsonb));
$$;
NOTIFY pgrst,'reload schema';
