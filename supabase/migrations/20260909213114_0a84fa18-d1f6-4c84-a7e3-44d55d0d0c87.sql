CREATE OR REPLACE FUNCTION public.cronograma_save_event(payload jsonb, expected_lock_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_org uuid;
  v_prev public.cronograma_eventos%ROWTYPE;
  v_row public.cronograma_eventos%ROWTYPE;
  v_request text := payload->>'request_id';
  v_source_key text := payload->>'source_key';
  v_action text;
BEGIN
  v_id := NULLIF(payload->>'id','')::uuid;
  v_org := NULLIF(payload->>'org_id','')::uuid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: org_id obrigatório' USING ERRCODE='P0001';
  END IF;
  PERFORM public._cronograma_require_writer(v_org);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos WHERE id = v_id AND org_id = v_org FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento %', v_id USING ERRCODE='P0001';
    END IF;
    IF expected_lock_version IS NOT NULL AND v_prev.lock_version <> expected_lock_version THEN
      RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão % esperada, atual %', expected_lock_version, v_prev.lock_version
        USING ERRCODE='P0001';
    END IF;
    v_action := 'update';
  ELSIF v_source_key IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.cronograma_eventos
     WHERE org_id = v_org AND source_key = v_source_key FOR UPDATE;
    IF FOUND THEN
      v_id := v_prev.id;
      v_action := 'update';
    ELSE
      v_action := 'create';
    END IF;
  ELSE
    v_action := 'create';
  END IF;

  IF v_action = 'create' THEN
    INSERT INTO public.cronograma_eventos (
      org_id, source_key, title, description, category, category_key, event_type,
      source_year, start_date, end_date, month_label, week_label, status, priority,
      location, event_time, start_time, end_time, days_remaining,
      commission_slug, commission_name, responsible_name,
      source_sheet, source_row, source_cell, source_note,
      is_official_seed, has_exact_date, linked_commissions, subevents,
      pending_reason, decision_needed, created_by_user_id, lock_version,
      notify_all_commission_members
    ) VALUES (
      v_org,
      COALESCE(v_source_key, 'manual-' || gen_random_uuid()::text),
      COALESCE(payload->>'title',''),
      payload->>'description',
      COALESCE(payload->>'category','Outros / a classificar'),
      payload->>'category_key',
      COALESCE(payload->>'event_type','planejamento'),
      COALESCE(NULLIF(payload->>'source_year','')::int, 2028),
      NULLIF(payload->>'start_date','')::date,
      NULLIF(payload->>'end_date','')::date,
      payload->>'month_label',
      payload->>'week_label',
      COALESCE(payload->>'status','planejado'),
      COALESCE(payload->>'priority','media'),
      payload->>'location',
      payload->>'event_time',
      NULLIF(payload->>'start_time','')::time,
      NULLIF(payload->>'end_time','')::time,
      NULLIF(payload->>'days_remaining','')::int,
      payload->>'commission_slug',
      payload->>'commission_name',
      payload->>'responsible_name',
      COALESCE(payload->>'source_sheet','Cadastro manual'),
      payload->>'source_row',
      payload->>'source_cell',
      payload->>'source_note',
      COALESCE((payload->>'is_official_seed')::boolean, false),
      COALESCE((payload->>'has_exact_date')::boolean, (payload->>'start_date') IS NOT NULL),
      COALESCE(payload->'linked_commissions','[]'::jsonb),
      COALESCE(payload->'subevents_json','[]'::jsonb),
      payload->>'pending_reason',
      payload->>'decision_needed',
      auth.uid(),
      1,
      COALESCE((payload->>'notify_all_commission_members')::boolean, false)
    ) RETURNING * INTO v_row;
    v_id := v_row.id;
  ELSE
    UPDATE public.cronograma_eventos SET
      title = COALESCE(payload->>'title', title),
      description = CASE WHEN payload ? 'description' THEN payload->>'description' ELSE description END,
      category = COALESCE(payload->>'category', category),
      category_key = CASE WHEN payload ? 'category_key' THEN payload->>'category_key' ELSE category_key END,
      event_type = COALESCE(payload->>'event_type', event_type),
      source_year = COALESCE(NULLIF(payload->>'source_year','')::int, source_year),
      start_date = CASE WHEN payload ? 'start_date' THEN NULLIF(payload->>'start_date','')::date ELSE start_date END,
      end_date = CASE WHEN payload ? 'end_date' THEN NULLIF(payload->>'end_date','')::date ELSE end_date END,
      month_label = CASE WHEN payload ? 'month_label' THEN payload->>'month_label' ELSE month_label END,
      week_label = CASE WHEN payload ? 'week_label' THEN payload->>'week_label' ELSE week_label END,
      status = COALESCE(payload->>'status', status),
      priority = COALESCE(payload->>'priority', priority),
      location = CASE WHEN payload ? 'location' THEN payload->>'location' ELSE location END,
      event_time = CASE WHEN payload ? 'event_time' THEN payload->>'event_time' ELSE event_time END,
      start_time = CASE WHEN payload ? 'start_time' THEN NULLIF(payload->>'start_time','')::time ELSE start_time END,
      end_time = CASE WHEN payload ? 'end_time' THEN NULLIF(payload->>'end_time','')::time ELSE end_time END,
      days_remaining = CASE WHEN payload ? 'days_remaining' THEN NULLIF(payload->>'days_remaining','')::int ELSE days_remaining END,
      commission_slug = CASE WHEN payload ? 'commission_slug' THEN payload->>'commission_slug' ELSE commission_slug END,
      commission_name = CASE WHEN payload ? 'commission_name' THEN payload->>'commission_name' ELSE commission_name END,
      responsible_name = CASE WHEN payload ? 'responsible_name' THEN payload->>'responsible_name' ELSE responsible_name END,
      has_exact_date = CASE WHEN payload ? 'has_exact_date' THEN (payload->>'has_exact_date')::boolean ELSE has_exact_date END,
      pending_reason = CASE WHEN payload ? 'pending_reason' THEN payload->>'pending_reason' ELSE pending_reason END,
      decision_needed = CASE WHEN payload ? 'decision_needed' THEN payload->>'decision_needed' ELSE decision_needed END,
      notify_all_commission_members = CASE WHEN payload ? 'notify_all_commission_members' THEN COALESCE((payload->>'notify_all_commission_members')::boolean, false) ELSE notify_all_commission_members END,
      lock_version = lock_version + 1,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF payload ? 'commissions' THEN
    PERFORM public._cronograma_apply_event_commissions(v_id, v_org, payload->'commissions');
  END IF;
  IF payload ? 'responsibles' THEN
    PERFORM public._cronograma_apply_event_responsibles(v_id, v_org, payload->'responsibles');
  END IF;

  PERFORM public._cronograma_log(v_id, 'event', v_id, v_action,
    CASE WHEN v_action = 'update' THEN to_jsonb(v_prev) ELSE NULL END,
    to_jsonb(v_row), v_request);

  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_id);
END $function$;