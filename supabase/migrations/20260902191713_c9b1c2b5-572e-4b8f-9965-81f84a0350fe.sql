DROP POLICY IF EXISTS cronograma_eventos_delete ON public.cronograma_eventos;
CREATE POLICY cronograma_eventos_delete ON public.cronograma_eventos
FOR DELETE TO authenticated
USING (
  is_org_member(auth.uid(), org_id)
  AND ((NOT planning_restricted) OR cronograma_can_view_planning(auth.uid(), org_id))
  AND (
    get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['admin'::org_role, 'gestor'::org_role])
    OR has_capability(auth.uid(), org_id, 'cronograma_eventos_write')
  )
);

CREATE OR REPLACE FUNCTION public.cronograma_delete_event(event_id uuid, event_org_id uuid, event_source_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.cronograma_eventos%ROWTYPE;
  v_source_key text := btrim(event_source_key);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE = 'P0001';
  END IF;

  IF public.get_user_org_role(auth.uid(), event_org_id) NOT IN ('admin','gestor')
     AND NOT public.has_capability(auth.uid(), event_org_id, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem permissão para excluir eventos' USING ERRCODE = 'P0001';
  END IF;

  IF event_id IS NOT NULL THEN
    SELECT * INTO v_event
    FROM public.cronograma_eventos
    WHERE id = event_id AND org_id = event_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: evento não encontrado' USING ERRCODE = 'P0001';
    END IF;
    v_source_key := v_event.source_key;
  END IF;

  IF v_source_key IS NULL OR v_source_key = '' THEN
    RAISE EXCEPTION 'CRONOGRAMA_VALIDATION_ERROR: source_key obrigatório' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.cronograma_evento_tombstones (org_id, source_key, deleted_event_id, deleted_by_user_id)
  VALUES (event_org_id, v_source_key, event_id, auth.uid())
  ON CONFLICT (org_id, source_key) DO UPDATE SET
    deleted_event_id = EXCLUDED.deleted_event_id,
    deleted_by_user_id = EXCLUDED.deleted_by_user_id,
    deleted_at = now();

  DELETE FROM public.cronograma_eventos
  WHERE org_id = event_org_id
    AND (id = event_id OR source_key = v_source_key);

  RETURN jsonb_build_object('id', event_id, 'source_key', v_source_key, 'deleted', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cronograma_delete_subevent(subevent_id uuid, expected_lock_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.cronograma_subeventos%ROWTYPE; v_org uuid;
BEGIN
  SELECT * INTO v_row FROM public.cronograma_subeventos WHERE id = subevent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRONOGRAMA_NOT_FOUND: subevento %', subevent_id USING ERRCODE='P0001';
  END IF;
  v_org := v_row.org_id;
  IF public.get_user_org_role(auth.uid(), v_org) NOT IN ('admin','gestor')
     AND NOT public.has_capability(auth.uid(), v_org, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem permissão para excluir subeventos' USING ERRCODE='P0001';
  END IF;
  IF expected_lock_version IS NOT NULL AND v_row.lock_version <> expected_lock_version THEN
    RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: versão' USING ERRCODE='P0001';
  END IF;
  DELETE FROM public.cronograma_subeventos WHERE id = subevent_id;
  PERFORM public._cronograma_log(v_row.parent_event_id, 'subevent', subevent_id, 'delete',
    to_jsonb(v_row), NULL, NULL);
  RETURN (SELECT to_jsonb(f) FROM public.cronograma_eventos_full f WHERE f.id = v_row.parent_event_id);
END $function$;