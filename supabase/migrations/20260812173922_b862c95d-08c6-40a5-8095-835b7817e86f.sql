CREATE OR REPLACE FUNCTION public.has_scoped_cronograma_access(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_capabilities
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND capability = 'cronograma_scoped_access'
  )
$$;

CREATE OR REPLACE FUNCTION public.cronograma_scoped_event_visible(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_evento_responsaveis er
    WHERE er.event_id = _event_id
      AND er.org_member_user_id = _user_id
      AND er.responsible_type = 'member'
  )
  OR EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes ec
    JOIN public.commission_responsibles cr
      ON cr.commission_id = ec.commission_id
     AND cr.user_id = _user_id
     AND cr.active = true
    WHERE ec.event_id = _event_id
  )
$$;

DROP POLICY IF EXISTS cronograma_eventos_select ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_select ON public.cronograma_eventos
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(id, auth.uid())
  )
);

DROP POLICY IF EXISTS cronograma_subevento_comissoes_select ON public.cronograma_subevento_comissoes;
CREATE POLICY cronograma_subevento_comissoes_select ON public.cronograma_subevento_comissoes
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR EXISTS (
      SELECT 1 FROM public.cronograma_subeventos s
      WHERE s.id = cronograma_subevento_comissoes.subevent_id
        AND public.cronograma_scoped_event_visible(s.parent_event_id, auth.uid())
    )
  )
);

DROP POLICY IF EXISTS cronograma_subevento_responsaveis_select ON public.cronograma_subevento_responsaveis;
CREATE POLICY cronograma_subevento_responsaveis_select ON public.cronograma_subevento_responsaveis
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR EXISTS (
      SELECT 1 FROM public.cronograma_subeventos s
      WHERE s.id = cronograma_subevento_responsaveis.subevent_id
        AND public.cronograma_scoped_event_visible(s.parent_event_id, auth.uid())
    )
  )
);

DROP POLICY IF EXISTS anexos_select_org_members ON public.cronograma_evento_anexos;
CREATE POLICY anexos_select_org_members ON public.cronograma_evento_anexos
FOR SELECT
USING (
  is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(event_id, auth.uid())
  )
);