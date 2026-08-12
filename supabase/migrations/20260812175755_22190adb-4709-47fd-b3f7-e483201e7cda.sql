-- 1) Writer check: aceita capability 'cronograma_eventos_write' (has_capability já cobre admin/gestor/operador)
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
$function$;

-- 2) cronograma_eventos: insert
DROP POLICY IF EXISTS cronograma_eventos_insert ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_insert ON public.cronograma_eventos
FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
    OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
);

-- 3) cronograma_eventos: update (com blindagem de escopo para usuários de visão restrita)
DROP POLICY IF EXISTS cronograma_eventos_update ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_update ON public.cronograma_eventos
FOR UPDATE TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
    OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR public.cronograma_scoped_event_visible(id, auth.uid())
  )
)
WITH CHECK (
  public.is_org_member(auth.uid(), org_id)
  AND (
    public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
    OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
);

-- 4) cronograma_subeventos: write via evento-pai
DROP POLICY IF EXISTS cronograma_subeventos_write ON public.cronograma_subeventos;
CREATE POLICY cronograma_subeventos_write ON public.cronograma_subeventos
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_subeventos.parent_event_id
      AND public.is_org_member(auth.uid(), e.org_id)
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_subeventos.parent_event_id
      AND public.is_org_member(auth.uid(), e.org_id)
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
);

-- 5) cronograma_evento_responsaveis: write via evento-pai
DROP POLICY IF EXISTS cronograma_evento_responsaveis_write ON public.cronograma_evento_responsaveis;
CREATE POLICY cronograma_evento_responsaveis_write ON public.cronograma_evento_responsaveis
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_evento_responsaveis.event_id
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_evento_responsaveis.event_id
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
);

-- 6) cronograma_evento_comissoes: write via evento-pai
DROP POLICY IF EXISTS cronograma_evento_comissoes_write ON public.cronograma_evento_comissoes;
CREATE POLICY cronograma_evento_comissoes_write ON public.cronograma_evento_comissoes
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_evento_comissoes.event_id
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_evento_comissoes.event_id
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
);

-- 7) cronograma_evento_logs: insert via evento-pai
DROP POLICY IF EXISTS cronograma_evento_logs_insert ON public.cronograma_evento_logs;
CREATE POLICY cronograma_evento_logs_insert ON public.cronograma_evento_logs
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cronograma_eventos e
    WHERE e.id = cronograma_evento_logs.event_id
      AND (
        public.get_user_org_role(auth.uid(), e.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role, 'operador'::org_role])
        OR public.has_capability(auth.uid(), e.org_id, 'cronograma_eventos_write')
      )
  )
);