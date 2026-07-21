ALTER TABLE public.cronograma_subeventos
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

CREATE OR REPLACE FUNCTION public.cronograma_save_subevent(payload jsonb, expected_lock_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := NULLIF(payload->>'id','')::uuid;
  v_parent uuid := NULLIF(payload->>'parent_event_id','')::uuid;
  v_org uuid;
  v_prev public.cronograma_subeventos%ROWTYPE;
  v_row public.cronograma_subeventos%ROWTYPE;
  v_request text := payload->>'request_id';
  v_action text;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: parent_event_id obrigatório' USING ERRCODE='P0001';
  END IF;
  SELECT org_id INTO v_org FROM public.cronograma_eventos WHERE id = v_parent;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento pai %', v_parent USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_subeventos WHERE id = v_id AND parent_event_id = v_parent FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: subevento %', v_id USING ERRCODE='P0001';
    END IF;
    IF expected_lock_version IS NOT NULL AND v_prev.lock_version <> expected_lock_version THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão %', expected_lock_version USING ERRCODE='P0001';
    END IF;
    v_action := 'update';
    UPDATE public.cronograma_subeventos SET
      org_id = v_org,
      title = COALESCE(payload->>'title', title),
      description = CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      start_date = CASE WHEN payload ? 'start_date' THEN NULLIF(payload->>'start_date','')::date ELSE start_date END,
      end_date = CASE WHEN payload ? 'end_date' THEN NULLIF(payload->>'end_date','')::date ELSE end_date END,
      start_time = CASE WHEN payload ? 'start_time' THEN NULLIF(payload->>'start_time','')::time ELSE start_time END,
      end_time = CASE WHEN payload ? 'end_time' THEN NULLIF(payload->>'end_time','')::time ELSE end_time END,
      status = COALESCE(payload->>'status', status),
      priority = COALESCE(payload->>'priority', priority),
      commission_slug = CASE WHEN payload ? 'commission_slug' THEN payload->>'commission_slug' ELSE commission_slug END,
      responsible_name = CASE WHEN payload ? 'responsible_name' THEN payload->>'responsible_name' ELSE responsible_name END,
      sort_order = COALESCE(NULLIF(payload->>'sort_order','')::int, sort_order),
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    v_action := 'create';
    INSERT INTO public.cronograma_subeventos (
      parent_event_id, org_id, title, description, start_date, end_date,
      start_time, end_time, status, priority, commission_slug, responsible_name, sort_order,
      legacy_key, lock_version
    ) VALUES (
      v_parent, v_org,
      COALESCE(payload->>'title',''),
      payload->>'description',
      NULLIF(payload->>'start_date','')::date,
      NULLIF(payload->>'end_date','')::date,
      NULLIF(payload->>'start_time','')::time,
      NULLIF(payload->>'end_time','')::time,
      COALESCE(payload->>'status','planejado'),
      COALESCE(payload->>'priority','media'),
      payload->>'commission_slug',
      payload->>'responsible_name',
      COALESCE(NULLIF(payload->>'sort_order','')::int,
        (SELECT COALESCE(MAX(sort_order),-1)+1 FROM public.cronograma_subeventos WHERE parent_event_id = v_parent)),
      payload->>'legacy_key',
      1
    ) RETURNING * INTO v_row;
    v_id := v_row.id;
  END IF;

  IF payload ? 'commissions' THEN
    PERFORM public._cronograma_apply_subevent_commissions(v_id, v_org, payload->'commissions');
  END IF;
  IF payload ? 'responsibles' THEN
    PERFORM public._cronograma_apply_subevent_responsibles(v_id, v_org, payload->'responsibles');
  END IF;

  PERFORM public._cronograma_log(v_parent, 'subevent', v_id, v_action,
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
    to_jsonb(v_row), v_request);

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_parent);
END $function$;

CREATE OR REPLACE VIEW public.cronograma_eventos_full AS
 SELECT id,
    org_id,
    source_key,
    title,
    description,
    category,
    event_type,
    source_year,
    start_date,
    end_date,
    month_label,
    week_label,
    status,
    priority,
    location,
    event_time,
    days_remaining,
    commission_slug,
    commission_name,
    responsible_name,
    source_sheet,
    source_row,
    source_cell,
    source_note,
    is_official_seed,
    has_exact_date,
    linked_commissions,
    subevents,
    created_by_user_id,
    created_at,
    updated_at,
    category_key,
    start_time,
    end_time,
    pending_reason,
    decision_needed,
    lock_version,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', ec.id, 'commission_id', ec.commission_id, 'commission_slug', ec.commission_slug, 'commission_name', COALESCE(c.nome, ec.commission_name_snapshot), 'relation_role', ec.relation_role) ORDER BY (ec.relation_role = 'principal'::text) DESC, ec.created_at) AS jsonb_agg
           FROM (cronograma_evento_comissoes ec
             LEFT JOIN commissions c ON ((c.id = ec.commission_id)))
          WHERE (ec.event_id = e.id)), '[]'::jsonb) AS commissions_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', er.id, 'user_id', er.org_member_user_id, 'name', COALESCE(m.nome_exibicao, er.name_snapshot), 'role', er.role, 'is_primary', er.is_primary, 'responsible_type', er.responsible_type) ORDER BY er.is_primary DESC, er.created_at) AS jsonb_agg
           FROM (cronograma_evento_responsaveis er
             LEFT JOIN org_members m ON (((m.user_id = er.org_member_user_id) AND (m.org_id = er.org_id))))
          WHERE (er.event_id = e.id)), '[]'::jsonb) AS responsibles_rel,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description, 'start_date', s.start_date, 'end_date', s.end_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status, 'priority', s.priority, 'commission_slug', s.commission_slug, 'responsible_name', s.responsible_name, 'sort_order', s.sort_order, 'lock_version', s.lock_version, 'created_at', s.created_at, 'updated_at', s.updated_at, 'commissions', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'commission_id', sc.commission_id, 'commission_slug', sc.commission_slug, 'commission_name', COALESCE(c2.nome, sc.commission_name_snapshot), 'relation_role', sc.relation_role)) AS jsonb_agg
                   FROM (cronograma_subevento_comissoes sc
                     LEFT JOIN commissions c2 ON ((c2.id = sc.commission_id)))
                  WHERE (sc.subevent_id = s.id)), '[]'::jsonb), 'responsibles', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', sr.id, 'user_id', sr.org_member_user_id, 'name', COALESCE(m2.nome_exibicao, sr.name_snapshot), 'role', sr.role, 'is_primary', sr.is_primary, 'responsible_type', sr.responsible_type)) AS jsonb_agg
                   FROM (cronograma_subevento_responsaveis sr
                     LEFT JOIN org_members m2 ON (((m2.user_id = sr.org_member_user_id) AND (m2.org_id = sr.org_id))))
                  WHERE (sr.subevent_id = s.id)), '[]'::jsonb)) ORDER BY s.sort_order, s.created_at, s.id) AS jsonb_agg
           FROM cronograma_subeventos s
          WHERE (s.parent_event_id = e.id)), '[]'::jsonb) AS subevents_rel
   FROM cronograma_eventos e;