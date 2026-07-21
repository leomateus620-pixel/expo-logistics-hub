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
    IF FOUND THEN
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
        id, parent_event_id, org_id, title, description, start_date, end_date,
        start_time, end_time, status, priority, commission_slug, responsible_name, sort_order,
        legacy_key, lock_version
      ) VALUES (
        v_id, v_parent, v_org,
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
        COALESCE(payload->>'legacy_key', v_request),
        1
      ) RETURNING * INTO v_row;
    END IF;
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
      COALESCE(payload->>'legacy_key', v_request),
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

ALTER VIEW public.cronograma_eventos_full SET (security_invoker = on);
GRANT SELECT ON public.cronograma_eventos_full TO authenticated;
GRANT ALL ON public.cronograma_eventos_full TO service_role;