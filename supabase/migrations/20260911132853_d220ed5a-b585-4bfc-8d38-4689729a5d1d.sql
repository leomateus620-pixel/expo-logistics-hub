-- 1. Origem do evento (propagação para a timeline central)
ALTER TABLE public.cronograma_eventos
  ADD COLUMN IF NOT EXISTS origin_source text NOT NULL DEFAULT 'agenda_central',
  ADD COLUMN IF NOT EXISTS origin_commission_id uuid REFERENCES public.commissions(id) ON DELETE SET NULL;

ALTER TABLE public.cronograma_eventos
  DROP CONSTRAINT IF EXISTS cronograma_eventos_origin_source_check;
ALTER TABLE public.cronograma_eventos
  ADD CONSTRAINT cronograma_eventos_origin_source_check
  CHECK (origin_source IN ('agenda_central', 'unidade'));

CREATE INDEX IF NOT EXISTS idx_cronograma_evento_comissoes_commission
  ON public.cronograma_evento_comissoes (commission_id, event_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_evento_responsaveis_user
  ON public.cronograma_evento_responsaveis (org_member_user_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_evento_anexos_event
  ON public.cronograma_evento_anexos (event_id);

-- 2. Helper: quem pode agir em nome de uma unidade
CREATE OR REPLACE FUNCTION public.cronograma_unit_can_manage(_user_id uuid, _commission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commissions c
    WHERE c.id = _commission_id
      AND (
        public.get_user_org_role(_user_id, c.org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
        OR public.has_capability(_user_id, c.org_id, 'cronograma_eventos_write')
        OR EXISTS (
          SELECT 1 FROM public.commission_responsibles r
          WHERE r.commission_id = c.id
            AND r.user_id = _user_id
            AND r.active IS NOT FALSE
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_unit_can_manage(uuid, uuid) TO authenticated;

-- 3. Escrita de vínculos pelos responsáveis da própria unidade (adiciona, não remove)
DROP POLICY IF EXISTS cronograma_evento_comissoes_unit_write ON public.cronograma_evento_comissoes;
CREATE POLICY cronograma_evento_comissoes_unit_write
  ON public.cronograma_evento_comissoes
  FOR ALL
  TO authenticated
  USING (commission_id IS NOT NULL AND public.cronograma_unit_can_manage(auth.uid(), commission_id))
  WITH CHECK (commission_id IS NOT NULL AND public.cronograma_unit_can_manage(auth.uid(), commission_id));

DROP POLICY IF EXISTS cronograma_evento_responsaveis_unit_write ON public.cronograma_evento_responsaveis;
CREATE POLICY cronograma_evento_responsaveis_unit_write
  ON public.cronograma_evento_responsaveis
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes l
    WHERE l.event_id = cronograma_evento_responsaveis.event_id
      AND l.commission_id IS NOT NULL
      AND public.cronograma_unit_can_manage(auth.uid(), l.commission_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes l
    WHERE l.event_id = cronograma_evento_responsaveis.event_id
      AND l.commission_id IS NOT NULL
      AND public.cronograma_unit_can_manage(auth.uid(), l.commission_id)
  ));

-- 4. Documentos gerais da unidade (arquivos de evento continuam na tabela de anexos)
CREATE TABLE IF NOT EXISTS public.cronograma_unidade_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  uploaded_by uuid,
  uploader_name text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'documento',
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_unidade_anexos TO authenticated;
GRANT ALL ON public.cronograma_unidade_anexos TO service_role;

ALTER TABLE public.cronograma_unidade_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cronograma_unidade_anexos_select ON public.cronograma_unidade_anexos;
CREATE POLICY cronograma_unidade_anexos_select
  ON public.cronograma_unidade_anexos FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS cronograma_unidade_anexos_insert ON public.cronograma_unidade_anexos;
CREATE POLICY cronograma_unidade_anexos_insert
  ON public.cronograma_unidade_anexos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), org_id)
    AND uploaded_by = auth.uid()
    AND public.cronograma_unit_can_manage(auth.uid(), commission_id)
  );

DROP POLICY IF EXISTS cronograma_unidade_anexos_update ON public.cronograma_unidade_anexos;
CREATE POLICY cronograma_unidade_anexos_update
  ON public.cronograma_unidade_anexos FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), org_id)
    AND (uploaded_by = auth.uid() OR public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]))
  )
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS cronograma_unidade_anexos_delete ON public.cronograma_unidade_anexos;
CREATE POLICY cronograma_unidade_anexos_delete
  ON public.cronograma_unidade_anexos FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), org_id)
    AND (uploaded_by = auth.uid() OR public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role]))
  );

CREATE INDEX IF NOT EXISTS idx_cronograma_unidade_anexos_commission
  ON public.cronograma_unidade_anexos (commission_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_cronograma_unidade_anexos_updated_at ON public.cronograma_unidade_anexos;
CREATE TRIGGER trg_cronograma_unidade_anexos_updated_at
  BEFORE UPDATE ON public.cronograma_unidade_anexos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Agenda de uma unidade, por identificador real (respeita RLS do chamador)
CREATE OR REPLACE FUNCTION public.cronograma_unit_agenda(_commission_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  event_time text,
  status text,
  location text,
  description text,
  responsible_name text,
  commission_slug text,
  origin_source text,
  origin_commission_id uuid,
  units jsonb,
  people jsonb,
  document_count integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.title,
    e.start_date,
    e.end_date,
    e.start_time::text,
    e.end_time::text,
    e.event_time::text,
    e.status,
    e.location,
    e.description,
    e.responsible_name,
    e.commission_slug,
    e.origin_source,
    e.origin_commission_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'commission_id', l2.commission_id,
        'slug', l2.commission_slug,
        'name', l2.commission_name_snapshot,
        'role', l2.relation_role
      ) ORDER BY l2.relation_role, l2.commission_slug)
      FROM public.cronograma_evento_comissoes l2 WHERE l2.event_id = e.id
    ), '[]'::jsonb) AS units,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'user_id', r.org_member_user_id,
        'name', r.name_snapshot,
        'role', r.role,
        'is_primary', r.is_primary
      ) ORDER BY r.is_primary DESC, r.name_snapshot)
      FROM public.cronograma_evento_responsaveis r WHERE r.event_id = e.id
    ), '[]'::jsonb) AS people,
    (SELECT count(*)::int FROM public.cronograma_evento_anexos a WHERE a.event_id = e.id) AS document_count
  FROM public.cronograma_eventos e
  WHERE EXISTS (
    SELECT 1 FROM public.cronograma_evento_comissoes l
    WHERE l.event_id = e.id AND l.commission_id = _commission_id
  )
  ORDER BY e.start_date NULLS LAST, e.start_time NULLS LAST, e.title;
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_unit_agenda(uuid) TO authenticated;

-- 6. Indicadores da unidade (contagens, sem revelar conteúdo restrito)
CREATE OR REPLACE FUNCTION public.cronograma_unit_metrics(_commission_id uuid)
RETURNS TABLE (total integer, upcoming integer, completed integer, in_month integer, documents integer)
LANGUAGE sql
STABLE
AS $$
  WITH scoped AS (
    SELECT e.id, e.start_date, e.status
    FROM public.cronograma_eventos e
    WHERE EXISTS (
      SELECT 1 FROM public.cronograma_evento_comissoes l
      WHERE l.event_id = e.id AND l.commission_id = _commission_id
    )
  ), today AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  )
  SELECT
    (SELECT count(*)::int FROM scoped),
    (SELECT count(*)::int FROM scoped, today WHERE scoped.start_date >= today.d),
    (SELECT count(*)::int FROM scoped WHERE scoped.status IN ('concluido', 'completed', 'concluído')),
    (SELECT count(*)::int FROM scoped, today WHERE date_trunc('month', scoped.start_date) = date_trunc('month', today.d)),
    (SELECT count(*)::int FROM public.cronograma_unidade_anexos u WHERE u.commission_id = _commission_id)
      + (SELECT count(*)::int FROM public.cronograma_evento_anexos a WHERE a.event_id IN (SELECT id FROM scoped));
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_unit_metrics(uuid) TO authenticated;

-- 7. Origem do evento definida pela unidade que o criou
CREATE OR REPLACE FUNCTION public.cronograma_set_event_origin(_event_id uuid, _commission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cronograma_unit_can_manage(auth.uid(), _commission_id) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: unidade não autorizada';
  END IF;

  UPDATE public.cronograma_eventos
     SET origin_source = 'unidade',
         origin_commission_id = _commission_id
   WHERE id = _event_id
     AND EXISTS (
       SELECT 1 FROM public.cronograma_evento_comissoes l
       WHERE l.event_id = _event_id AND l.commission_id = _commission_id
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cronograma_set_event_origin(uuid, uuid) TO authenticated;