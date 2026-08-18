-- ============ Ações previstas ============
CREATE TABLE public.cronograma_subevento_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subevent_id uuid NOT NULL REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  start_time time,
  title text NOT NULL,
  notes text,
  responsible_user_id uuid,
  responsible_name text,
  commission_slug text,
  commission_name text,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subevento_acoes TO authenticated;
GRANT ALL ON public.cronograma_subevento_acoes TO service_role;
ALTER TABLE public.cronograma_subevento_acoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cronograma_subevento_providencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subevent_id uuid NOT NULL REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  description text NOT NULL,
  responsible_user_id uuid,
  responsible_name text,
  commission_slug text,
  commission_name text,
  note text,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subevento_providencias TO authenticated;
GRANT ALL ON public.cronograma_subevento_providencias TO service_role;
ALTER TABLE public.cronograma_subevento_providencias ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cronograma_subevento_convidados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subevent_id uuid NOT NULL REFERENCES public.cronograma_subeventos(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_subevento_convidados TO authenticated;
GRANT ALL ON public.cronograma_subevento_convidados TO service_role;
ALTER TABLE public.cronograma_subevento_convidados ENABLE ROW LEVEL SECURITY;

CREATE INDEX cronograma_subevento_acoes_subevent_idx ON public.cronograma_subevento_acoes(subevent_id, sort_order);
CREATE INDEX cronograma_subevento_providencias_subevent_idx ON public.cronograma_subevento_providencias(subevent_id, sort_order);
CREATE INDEX cronograma_subevento_convidados_subevent_idx ON public.cronograma_subevento_convidados(subevent_id, sort_order);

CREATE POLICY cronograma_subevento_acoes_select ON public.cronograma_subevento_acoes
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR EXISTS (
      SELECT 1 FROM public.cronograma_subeventos s
      WHERE s.id = cronograma_subevento_acoes.subevent_id
        AND public.cronograma_scoped_event_visible(s.parent_event_id, auth.uid())
    )
  )
);
CREATE POLICY cronograma_subevento_acoes_write ON public.cronograma_subevento_acoes
FOR ALL TO authenticated
USING (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
)
WITH CHECK (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
);

CREATE POLICY cronograma_subevento_providencias_select ON public.cronograma_subevento_providencias
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR EXISTS (
      SELECT 1 FROM public.cronograma_subeventos s
      WHERE s.id = cronograma_subevento_providencias.subevent_id
        AND public.cronograma_scoped_event_visible(s.parent_event_id, auth.uid())
    )
  )
);
CREATE POLICY cronograma_subevento_providencias_write ON public.cronograma_subevento_providencias
FOR ALL TO authenticated
USING (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
)
WITH CHECK (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
);

CREATE POLICY cronograma_subevento_convidados_select ON public.cronograma_subevento_convidados
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND (
    NOT public.has_scoped_cronograma_access(auth.uid(), org_id)
    OR EXISTS (
      SELECT 1 FROM public.cronograma_subeventos s
      WHERE s.id = cronograma_subevento_convidados.subevent_id
        AND public.cronograma_scoped_event_visible(s.parent_event_id, auth.uid())
    )
  )
);
CREATE POLICY cronograma_subevento_convidados_write ON public.cronograma_subevento_convidados
FOR ALL TO authenticated
USING (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
)
WITH CHECK (
  public.get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role,'gestor'::org_role,'operador'::org_role])
  OR public.has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
);

-- ============ helpers de substituição total ============
CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_actions(_subevent_id uuid, _org_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE item jsonb; idx int := 0;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_subevento_acoes WHERE subevent_id = _subevent_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE(NULLIF(trim(item->>'title'),''), '') = '' THEN CONTINUE; END IF;
    INSERT INTO public.cronograma_subevento_acoes
      (subevent_id, org_id, start_time, title, notes, responsible_user_id, responsible_name, commission_slug, commission_name, is_done, sort_order)
    VALUES (
      _subevent_id, _org_id,
      NULLIF(item->>'start_time','')::time,
      trim(item->>'title'),
      NULLIF(item->>'notes',''),
      NULLIF(item->>'responsible_user_id','')::uuid,
      NULLIF(item->>'responsible_name',''),
      NULLIF(item->>'commission_slug',''),
      NULLIF(item->>'commission_name',''),
      COALESCE((item->>'is_done')::boolean, false),
      COALESCE(NULLIF(item->>'sort_order','')::int, idx)
    );
    idx := idx + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_provisions(_subevent_id uuid, _org_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE item jsonb; idx int := 0;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_subevento_providencias WHERE subevent_id = _subevent_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE(NULLIF(trim(item->>'description'),''), '') = '' THEN CONTINUE; END IF;
    INSERT INTO public.cronograma_subevento_providencias
      (subevent_id, org_id, description, responsible_user_id, responsible_name, commission_slug, commission_name, note, is_done, sort_order)
    VALUES (
      _subevent_id, _org_id,
      trim(item->>'description'),
      NULLIF(item->>'responsible_user_id','')::uuid,
      NULLIF(item->>'responsible_name',''),
      NULLIF(item->>'commission_slug',''),
      NULLIF(item->>'commission_name',''),
      NULLIF(item->>'note',''),
      COALESCE((item->>'is_done')::boolean, false),
      COALESCE(NULLIF(item->>'sort_order','')::int, idx)
    );
    idx := idx + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._cronograma_apply_subevent_guests(_subevent_id uuid, _org_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE item jsonb; idx int := 0;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  DELETE FROM public.cronograma_subevento_convidados WHERE subevent_id = _subevent_id;
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE(NULLIF(trim(item->>'name'),''), '') = '' THEN CONTINUE; END IF;
    INSERT INTO public.cronograma_subevento_convidados (subevent_id, org_id, name, category, sort_order)
    VALUES (
      _subevent_id, _org_id,
      trim(item->>'name'),
      NULLIF(item->>'category',''),
      COALESCE(NULLIF(item->>'sort_order','')::int, idx)
    );
    idx := idx + 1;
  END LOOP;
END $$;

-- ============ RPC de plano completo ============
CREATE OR REPLACE FUNCTION public.cronograma_save_subevent_plan(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent uuid := NULLIF(payload->>'parent_event_id','')::uuid;
  v_org uuid;
  v_request text := COALESCE(payload->>'request_id', gen_random_uuid()::text);
  v_item jsonb;
  v_id uuid;
  v_prev public.cronograma_subeventos%ROWTYPE;
  v_row public.cronograma_subeventos%ROWTYPE;
  v_action text;
  v_index int := 0;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: parent_event_id obrigatório' USING ERRCODE='P0001';
  END IF;
  SELECT org_id INTO v_org FROM public.cronograma_eventos WHERE id = v_parent;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento pai %', v_parent USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'subevents','[]'::jsonb)) LOOP
    IF COALESCE(NULLIF(trim(v_item->>'title'),''),'') = '' THEN
      RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: subevento sem título' USING ERRCODE='P0001';
    END IF;
    v_id := NULLIF(v_item->>'id','')::uuid;

    IF v_id IS NOT NULL THEN
      SELECT * INTO v_prev FROM public.cronograma_subeventos
      WHERE id = v_id AND parent_event_id = v_parent FOR UPDATE;
    ELSE
      v_prev := NULL;
    END IF;

    IF v_id IS NOT NULL AND v_prev.id IS NOT NULL THEN
      v_action := 'update';
      UPDATE public.cronograma_subeventos SET
        title = trim(v_item->>'title'),
        description = NULLIF(v_item->>'description',''),
        start_date = NULLIF(v_item->>'start_date','')::date,
        end_date = NULLIF(v_item->>'end_date','')::date,
        start_time = NULLIF(v_item->>'start_time','')::time,
        end_time = NULLIF(v_item->>'end_time','')::time,
        status = COALESCE(v_item->>'status', status),
        priority = COALESCE(v_item->>'priority', priority),
        commission_slug = NULLIF(v_item->>'commission_slug',''),
        responsible_name = NULLIF(v_item->>'responsible_name',''),
        sort_order = COALESCE(NULLIF(v_item->>'sort_order','')::int, v_index),
        lock_version = lock_version + 1,
        updated_at = now()
      WHERE id = v_id
      RETURNING * INTO v_row;
    ELSE
      v_action := 'create';
      INSERT INTO public.cronograma_subeventos (
        parent_event_id, org_id, title, description, start_date, end_date,
        start_time, end_time, status, priority, commission_slug, responsible_name,
        sort_order, legacy_key, lock_version
      ) VALUES (
        v_parent, v_org,
        trim(v_item->>'title'),
        NULLIF(v_item->>'description',''),
        NULLIF(v_item->>'start_date','')::date,
        NULLIF(v_item->>'end_date','')::date,
        NULLIF(v_item->>'start_time','')::time,
        NULLIF(v_item->>'end_time','')::time,
        COALESCE(v_item->>'status','planejado'),
        COALESCE(v_item->>'priority','media'),
        NULLIF(v_item->>'commission_slug',''),
        NULLIF(v_item->>'responsible_name',''),
        COALESCE(NULLIF(v_item->>'sort_order','')::int, v_index),
        COALESCE(v_item->>'legacy_key', v_request || '-' || v_index::text),
        1
      ) RETURNING * INTO v_row;
      v_id := v_row.id;
    END IF;

    IF v_item ? 'commissions' THEN
      PERFORM public._cronograma_apply_subevent_commissions(v_id, v_org, v_item->'commissions');
    END IF;
    IF v_item ? 'responsibles' THEN
      PERFORM public._cronograma_apply_subevent_responsibles(v_id, v_org, v_item->'responsibles');
    END IF;
    IF v_item ? 'actions' THEN
      PERFORM public._cronograma_apply_subevent_actions(v_id, v_org, v_item->'actions');
    END IF;
    IF v_item ? 'provisions' THEN
      PERFORM public._cronograma_apply_subevent_provisions(v_id, v_org, v_item->'provisions');
    END IF;
    IF v_item ? 'guests' THEN
      PERFORM public._cronograma_apply_subevent_guests(v_id, v_org, v_item->'guests');
    END IF;

    PERFORM public._cronograma_log(v_parent, 'subevent', v_id, v_action,
      CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
      to_jsonb(v_row), v_request);

    v_index := v_index + 1;
  END LOOP;

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_parent);
END $$;

-- ============ view com as listas do plano ============
CREATE OR REPLACE VIEW public.cronograma_eventos_full
WITH (security_invoker = on)
AS
SELECT
  e.id, e.org_id, e.source_key, e.title, e.description, e.category, e.event_type, e.source_year,
  e.start_date, e.end_date, e.month_label, e.week_label, e.status, e.priority, e.location,
  e.event_time, e.days_remaining, e.commission_slug, e.commission_name, e.responsible_name,
  e.source_sheet, e.source_row, e.source_cell, e.source_note, e.is_official_seed, e.has_exact_date,
  e.linked_commissions, e.subevents, e.created_by_user_id, e.created_at, e.updated_at,
  e.category_key, e.start_time, e.end_time, e.pending_reason, e.decision_needed, e.lock_version,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ec.id, 'commission_id', ec.commission_id, 'commission_slug', ec.commission_slug,
      'commission_name', COALESCE(c.nome, ec.commission_name_snapshot), 'relation_role', ec.relation_role
    ) ORDER BY (ec.relation_role = 'principal') DESC, ec.created_at)
    FROM public.cronograma_evento_comissoes ec
    LEFT JOIN public.commissions c ON c.id = ec.commission_id
    WHERE ec.event_id = e.id
  ), '[]'::jsonb) AS commissions_rel,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', er.id, 'user_id', er.org_member_user_id, 'name', COALESCE(m.nome_exibicao, er.name_snapshot),
      'role', er.role, 'is_primary', er.is_primary, 'responsible_type', er.responsible_type
    ) ORDER BY er.is_primary DESC, er.created_at)
    FROM public.cronograma_evento_responsaveis er
    LEFT JOIN public.org_members m ON m.user_id = er.org_member_user_id AND m.org_id = er.org_id
    WHERE er.event_id = e.id
  ), '[]'::jsonb) AS responsibles_rel,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'description', s.description, 'start_date', s.start_date,
      'end_date', s.end_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status,
      'priority', s.priority, 'commission_slug', s.commission_slug, 'responsible_name', s.responsible_name,
      'sort_order', s.sort_order, 'lock_version', s.lock_version, 'created_at', s.created_at,
      'updated_at', s.updated_at,
      'commissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'commission_id', sc.commission_id,
          'commission_slug', sc.commission_slug, 'commission_name', COALESCE(c2.nome, sc.commission_name_snapshot),
          'relation_role', sc.relation_role))
        FROM public.cronograma_subevento_comissoes sc
        LEFT JOIN public.commissions c2 ON c2.id = sc.commission_id
        WHERE sc.subevent_id = s.id
      ), '[]'::jsonb),
      'responsibles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sr.id, 'user_id', sr.org_member_user_id,
          'name', COALESCE(m2.nome_exibicao, sr.name_snapshot), 'role', sr.role,
          'is_primary', sr.is_primary, 'responsible_type', sr.responsible_type))
        FROM public.cronograma_subevento_responsaveis sr
        LEFT JOIN public.org_members m2 ON m2.user_id = sr.org_member_user_id AND m2.org_id = sr.org_id
        WHERE sr.subevent_id = s.id
      ), '[]'::jsonb),
      'actions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sa.id, 'start_time', sa.start_time, 'title', sa.title,
          'notes', sa.notes, 'responsible_user_id', sa.responsible_user_id, 'responsible_name', sa.responsible_name,
          'commission_slug', sa.commission_slug, 'commission_name', sa.commission_name,
          'is_done', sa.is_done, 'sort_order', sa.sort_order) ORDER BY sa.sort_order, sa.created_at)
        FROM public.cronograma_subevento_acoes sa WHERE sa.subevent_id = s.id
      ), '[]'::jsonb),
      'provisions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sp.id, 'description', sp.description,
          'responsible_user_id', sp.responsible_user_id, 'responsible_name', sp.responsible_name,
          'commission_slug', sp.commission_slug, 'commission_name', sp.commission_name,
          'note', sp.note, 'is_done', sp.is_done, 'sort_order', sp.sort_order) ORDER BY sp.sort_order, sp.created_at)
        FROM public.cronograma_subevento_providencias sp WHERE sp.subevent_id = s.id
      ), '[]'::jsonb),
      'guests', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sg.id, 'name', sg.name, 'category', sg.category,
          'sort_order', sg.sort_order) ORDER BY sg.sort_order, sg.created_at)
        FROM public.cronograma_subevento_convidados sg WHERE sg.subevent_id = s.id
      ), '[]'::jsonb)
    ) ORDER BY s.sort_order, s.created_at, s.id)
    FROM public.cronograma_subeventos s
    WHERE s.parent_event_id = e.id
  ), '[]'::jsonb) AS subevents_rel
FROM public.cronograma_eventos e;