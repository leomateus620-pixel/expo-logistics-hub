DROP POLICY IF EXISTS cronograma_eventos_select ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_select ON public.cronograma_eventos
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor','operador']::org_role[])
    OR NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(id, auth.uid())
    OR created_by_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS cronograma_eventos_update ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_update ON public.cronograma_eventos
FOR UPDATE TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor','operador']::org_role[])
    OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor','operador']::org_role[])
    OR NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(id, auth.uid())
    OR created_by_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor','operador']::org_role[])
    OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin','gestor','operador']::org_role[])
    OR NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(id, auth.uid())
    OR created_by_user_id = auth.uid()
  )
);