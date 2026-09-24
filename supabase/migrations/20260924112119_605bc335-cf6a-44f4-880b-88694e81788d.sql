DROP POLICY IF EXISTS cronograma_eventos_select ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_select ON public.cronograma_eventos FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), org_id)
  AND ((NOT planning_restricted) OR cronograma_can_view_planning(auth.uid(), org_id))
  AND (((get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])) AND NOT has_capability(auth.uid(), org_id, 'restricted_scope'))
    OR (NOT has_scoped_cronograma_access(auth.uid(), org_id))
    OR cronograma_scoped_event_visible(id, auth.uid())
    OR (created_by_user_id = auth.uid())));

DROP POLICY IF EXISTS cronograma_eventos_update ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_update ON public.cronograma_eventos FOR UPDATE TO authenticated
USING (is_org_member(auth.uid(), org_id)
  AND ((NOT planning_restricted) OR cronograma_can_view_planning(auth.uid(), org_id))
  AND ((get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])) OR has_capability(auth.uid(), org_id, 'cronograma_eventos_write'))
  AND (((get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])) AND NOT has_capability(auth.uid(), org_id, 'restricted_scope'))
    OR (NOT has_scoped_cronograma_access(auth.uid(), org_id))
    OR cronograma_scoped_event_visible(id, auth.uid())
    OR (created_by_user_id = auth.uid())));