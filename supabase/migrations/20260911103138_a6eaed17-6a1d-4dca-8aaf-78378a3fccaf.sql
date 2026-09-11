CREATE OR REPLACE FUNCTION public.venue_check_availability(_org_id uuid, _space_ids uuid[], _setup_start_at timestamp with time zone, _teardown_end_at timestamp with time zone, _exclude_event_id uuid DEFAULT NULL::uuid, _audience integer DEFAULT NULL::integer, _event_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _event_end_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _event_type text DEFAULT NULL::text)
 RETURNS TABLE(conflict_kind text, conflict_id uuid, space_id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, detail text, evidence_token text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.venue_assert_capability(_org_id, 'venue_events_access');

  IF _space_ids IS NULL OR cardinality(_space_ids) = 0 THEN
    RAISE EXCEPTION 'VENUE_SPACE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _setup_start_at IS NULL OR _teardown_end_at IS NULL OR _setup_start_at >= _teardown_end_at THEN
    RAISE EXCEPTION 'VENUE_PERIOD_INVALID' USING ERRCODE = '22007';
  END IF;

  RETURN QUERY
  WITH selected_units AS (
    SELECT DISTINCT mapping.booking_unit_id, mapping.space_id
    FROM public.venue_space_booking_units mapping
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = ANY(_space_ids)
  )
  SELECT
    'event'::text,
    CASE
      WHEN public.venue_can_view_event(_org_id, occupancy.event_id) THEN occupancy.event_id
      ELSE NULL::uuid
    END,
    selected.space_id,
    CASE
      WHEN public.venue_can_view_event(_org_id, occupancy.event_id) THEN event.title
      ELSE 'Ocupação restrita'
    END,
    occupancy.setup_start_at,
    occupancy.teardown_end_at,
    'A ocupação se sobrepõe ao período solicitado, incluindo montagem ou desmontagem.'::text,
    md5('event:' || occupancy.event_id::text)
  FROM selected_units selected
  JOIN public.venue_occupancies occupancy
    ON occupancy.booking_unit_id = selected.booking_unit_id
   AND occupancy.org_id = _org_id
   AND occupancy.active
   AND occupancy.event_id IS DISTINCT FROM _exclude_event_id
   AND occupancy.occupied_during && tstzrange(_setup_start_at, _teardown_end_at, '[)')
  JOIN public.venue_events event ON event.id = occupancy.event_id

  UNION ALL

  SELECT DISTINCT
    'block'::text,
    block.id,
    selected.space_id,
    block.title,
    block.starts_at,
    block.ends_at,
    block.reason,
    md5('block:' || block.id::text)
  FROM selected_units selected
  JOIN public.venue_space_booking_units block_mapping
    ON block_mapping.org_id = _org_id
   AND block_mapping.booking_unit_id = selected.booking_unit_id
  JOIN public.venue_space_blocks block
    ON block.org_id = _org_id
   AND block.space_id = block_mapping.space_id
  WHERE block.org_id = _org_id
    AND block.active
    AND block.starts_at < _teardown_end_at
    AND _setup_start_at < block.ends_at;
END;
$function$;

DO $mig$
DECLARE
  src text;
  before_len int;
BEGIN
  src := pg_get_functiondef('public.venue_save_event(uuid,uuid,integer,uuid,jsonb)'::regprocedure);

  before_len := length(src);
  src := replace(src, $frag$  IF conflict_override_value AND (
    NOT public.venue_has_capability(_org_id, 'venue_events_conflict_override')
    OR length(coalesce(conflict_reason, '')) < 8
  ) THEN
    RAISE EXCEPTION 'VENUE_CONFLICT_OVERRIDE_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
$frag$, '');
  IF length(src) = before_len THEN
    RAISE EXCEPTION 'PATCH_OVERRIDE_CHECK_NOT_FOUND';
  END IF;

  before_len := length(src);
  src := replace(src, $frag$    IF material_changed AND previous_row.status IN ('em_analise', 'aprovado', 'confirmado', 'em_preparacao', 'reprogramado')
      AND length(coalesce(change_reason, '')) < 8 THEN
      RAISE EXCEPTION 'VENUE_MATERIAL_CHANGE_REASON_REQUIRED' USING ERRCODE = '23514';
    END IF;
$frag$, '');
  IF length(src) = before_len THEN
    RAISE EXCEPTION 'PATCH_CHANGE_REASON_NOT_FOUND';
  END IF;

  before_len := length(src);
  src := replace(src, $frag$  IF event_row.status IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento')
    AND conflict_count > 0 AND NOT conflict_override_value THEN
    RAISE EXCEPTION 'VENUE_CONFLICT' USING ERRCODE = '23P01', DETAIL = conflicts::text;
  END IF;
$frag$, '');
  IF length(src) = before_len THEN
    RAISE EXCEPTION 'PATCH_CONFLICT_RAISE_NOT_FOUND';
  END IF;

  before_len := length(src);
  src := replace(src, $frag$  IF conflict_count > 0 AND conflict_override_value THEN$frag$,
                      $frag$  IF conflict_count > 0 THEN$frag$);
  IF length(src) = before_len THEN
    RAISE EXCEPTION 'PATCH_CONFLICT_APPROVAL_NOT_FOUND';
  END IF;

  before_len := length(src);
  src := replace(src, $frag$      'excecao_conflito',
      conflict_reason,$frag$,
                      $frag$      'excecao_conflito',
      coalesce(nullif(trim(coalesce(conflict_reason, '')), ''), 'Alteração salva com sobreposição de horário detectada.'),$frag$);
  IF length(src) = before_len THEN
    RAISE EXCEPTION 'PATCH_CONFLICT_REASON_NOT_FOUND';
  END IF;

  EXECUTE src;
END;
$mig$;