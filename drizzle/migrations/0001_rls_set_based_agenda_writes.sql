-- Políticas de escrita (ALL) da Agenda também valem para leitura: versão por conjuntos, mesmo resultado.
CREATE OR REPLACE FUNCTION public.cronograma_writable_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  writer_orgs AS (
    SELECT DISTINCT m.org_id FROM public.org_members m, me
    WHERE m.user_id = me.uid AND m.is_active = true
      AND ((public.get_user_org_role(me.uid, m.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role]))
           OR public.has_capability(me.uid, m.org_id, 'cronograma_eventos_write'))
  )
  SELECT e.id FROM public.cronograma_eventos e
  WHERE e.org_id IN (SELECT org_id FROM writer_orgs)
    AND e.id IN (SELECT public.cronograma_visible_event_ids());
$$;

CREATE OR REPLACE FUNCTION public.cronograma_managed_commission_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.commission_id
  FROM (SELECT DISTINCT commission_id FROM public.cronograma_evento_comissoes WHERE commission_id IS NOT NULL) c
  WHERE public.cronograma_unit_can_manage(auth.uid(), c.commission_id);
$$;

CREATE OR REPLACE FUNCTION public.cronograma_unit_event_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT l.event_id FROM public.cronograma_evento_comissoes l
  WHERE l.commission_id IN (SELECT public.cronograma_managed_commission_ids());
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_writable_event_ids(), public.cronograma_managed_commission_ids(),
  public.cronograma_unit_event_ids() TO authenticated, service_role;

ALTER POLICY cronograma_evento_comissoes_write ON public.cronograma_evento_comissoes
  USING (event_id IN (SELECT public.cronograma_writable_event_ids()));
ALTER POLICY cronograma_evento_comissoes_unit_write ON public.cronograma_evento_comissoes
  USING (commission_id IS NOT NULL AND commission_id IN (SELECT public.cronograma_managed_commission_ids()));
ALTER POLICY cronograma_evento_responsaveis_write ON public.cronograma_evento_responsaveis
  USING (event_id IN (SELECT public.cronograma_writable_event_ids()));
ALTER POLICY cronograma_evento_responsaveis_unit_write ON public.cronograma_evento_responsaveis
  USING (event_id IN (SELECT public.cronograma_unit_event_ids()));
ALTER POLICY cronograma_subeventos_write ON public.cronograma_subeventos
  USING (parent_event_id IN (SELECT public.cronograma_writable_event_ids()));
