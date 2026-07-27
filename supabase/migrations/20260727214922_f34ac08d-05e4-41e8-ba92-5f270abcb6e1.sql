CREATE OR REPLACE FUNCTION public.venue_refresh_occupancies(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.venue_events%ROWTYPE;
BEGIN
  SELECT * INTO event_row FROM public.venue_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  DELETE FROM public.venue_occupancies WHERE event_id = _event_id;
  IF event_row.status NOT IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento', 'concluido') THEN RETURN; END IF;

  INSERT INTO public.venue_occupancies (
    org_id,
    event_id,
    event_space_id,
    booking_unit_id,
    setup_start_at,
    teardown_end_at,
    active,
    conflict_override,
    override_reason
  )
  SELECT DISTINCT ON (mapping.booking_unit_id)
    allocation.org_id,
    allocation.event_id,
    allocation.id,
    mapping.booking_unit_id,
    allocation.setup_start_at,
    allocation.teardown_end_at,
    true,
    allocation.conflict_override,
    event_row.conflict_override_reason
  FROM public.venue_event_spaces allocation
  JOIN public.venue_space_booking_units mapping
    ON mapping.org_id = allocation.org_id
   AND mapping.space_id = allocation.space_id
  WHERE allocation.event_id = _event_id
    AND allocation.setup_start_at IS NOT NULL
    AND allocation.teardown_end_at IS NOT NULL
  ORDER BY mapping.booking_unit_id, allocation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.venue_assert_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_log_audit(uuid, text, uuid, public.audit_action, jsonb, jsonb, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_redact_stakeholder_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_redact_document_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_begin_mutation(uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_finish_mutation(uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_calculate_usage_quantity(text, timestamptz, timestamptz, integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_clear_usage_excess_approval(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_recalculate_agreement_excess(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_sync_event_counterpart(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_refresh_occupancies(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_get_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_get_audit_history(uuid, uuid, integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_check_availability(uuid, uuid[], timestamptz, timestamptz, uuid, integer, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_get_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_get_audit_history(uuid, uuid, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_check_availability(uuid, uuid[], timestamptz, timestamptz, uuid, integer, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.venue_save_event(
  _org_id uuid,
  _event_id uuid,
  _expected_version integer,
  _idempotency_key uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  operation_name text := CASE WHEN _event_id IS NULL THEN 'venue_create_event' ELSE 'venue_update_event' END;
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'event_id', _event_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  before_event jsonb;
  before_spaces jsonb;
  before_resources jsonb;
  before_responsibles jsonb;
  before_checklist jsonb;
  after_spaces jsonb;
  after_checklist jsonb;
  before_resource_definition jsonb := '[]'::jsonb;
  requested_resource_definition jsonb := '[]'::jsonb;
  event_row public.venue_events%ROWTYPE;
  previous_row public.venue_events%ROWTYPE;
  venue_ids uuid[];
  supporting_user_ids uuid[];
  previous_supporting_user_ids uuid[];
  resource_types text[];
  title_value text := trim(coalesce(_payload->>'title', ''));
  event_type_value text := _payload->>'event_type';
  requested_area_value text := nullif(trim(coalesce(_payload->>'requested_area', '')), '');
  pending_date_value boolean := coalesce((_payload->>'pending_date')::boolean, false);
  start_value timestamptz := nullif(_payload->>'start_at', '')::timestamptz;
  end_value timestamptz := nullif(_payload->>'end_at', '')::timestamptz;
  setup_value timestamptz := nullif(_payload->>'setup_start_at', '')::timestamptz;
  teardown_value timestamptz := nullif(_payload->>'teardown_end_at', '')::timestamptz;
  requester_value text := trim(coalesce(_payload->>'requester_name', ''));
  responsible_org_value uuid := nullif(_payload->>'responsible_organization_id', '')::uuid;
  sponsor_value uuid := nullif(_payload->>'sponsor_id', '')::uuid;
  responsible_user_value uuid := nullif(_payload->>'responsible_user_id', '')::uuid;
  estimated_audience_value integer := nullif(_payload->>'estimated_audience', '')::integer;
  confirmed_audience_value integer := nullif(_payload->>'confirmed_audience', '')::integer;
  priority_value text := coalesce(nullif(_payload->>'priority', ''), 'media');
  visibility_value text := coalesce(nullif(_payload->>'visibility', ''), 'institucional');
  counterpart_value uuid := nullif(_payload->>'counterpart_agreement_id', '')::uuid;
  counterpart_quantity_value numeric := nullif(_payload->>'counterpart_requested_quantity', '')::numeric;
  change_reason text := nullif(trim(coalesce(_payload->>'change_reason', '')), '');
  conflict_override_value boolean := coalesce((_payload->>'conflict_override')::boolean, false);
  conflict_reason text := nullif(trim(coalesce(_payload->>'conflict_override_reason', '')), '');
  conflicts jsonb := '[]'::jsonb;
  conflict_count integer := 0;
  temporal_conflict_count integer := 0;
  capacity_conflict_count integer := 0;
  conflict_fingerprint text;
  dates_changed boolean := false;
  material_changed boolean := false;
  resulting_status text;
  resource jsonb;
  checklist_template record;
  obsolete_checklist record;
  updated_checklist record;
BEGIN
  actor_id := public.venue_assert_capability(
    _org_id,
    CASE WHEN _event_id IS NULL THEN 'venue_events_create' ELSE 'venue_events_access' END
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  IF title_value = '' OR length(title_value) < 3 OR length(title_value) > 160 THEN
    RAISE EXCEPTION 'VENUE_TITLE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF requester_value = '' OR length(requester_value) > 160 THEN
    RAISE EXCEPTION 'VENUE_REQUESTER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF event_type_value IS NULL OR event_type_value NOT IN (
    'institucional', 'patrocinador', 'comissao', 'corporativo', 'cultural', 'comercial',
    'cerimonial', 'reuniao', 'jantar', 'lancamento', 'show', 'externo', 'interno', 'outro'
  ) THEN RAISE EXCEPTION 'VENUE_EVENT_TYPE_INVALID' USING ERRCODE = '23514'; END IF;

  SELECT coalesce(array_agg(value::uuid ORDER BY value), '{}') INTO venue_ids
  FROM jsonb_array_elements_text(coalesce(_payload->'venue_ids', '[]'::jsonb)) item(value);
  IF cardinality(venue_ids) = 0 THEN
    RAISE EXCEPTION 'VENUE_SPACE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.venue_spaces WHERE org_id = _org_id AND active AND id = ANY(venue_ids))
    <> cardinality(venue_ids) THEN
    RAISE EXCEPTION 'VENUE_SPACE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(venue_ids) selected_space(space_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.venue_space_booking_units mapping
      JOIN public.venue_booking_units booking_unit
        ON booking_unit.org_id = mapping.org_id
       AND booking_unit.id = mapping.booking_unit_id
       AND booking_unit.active
      WHERE mapping.org_id = _org_id
        AND mapping.space_id = selected_space.space_id
    )
  ) THEN
    RAISE EXCEPTION 'VENUE_BOOKING_UNIT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(value::uuid ORDER BY value), '{}')
  INTO supporting_user_ids
  FROM jsonb_array_elements_text(
    coalesce(_payload->'supporting_responsible_user_ids', '[]'::jsonb)
  ) item(value);
  IF cardinality(supporting_user_ids) <> cardinality(
      ARRAY(SELECT DISTINCT member_id FROM unnest(supporting_user_ids) AS selected(member_id))
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(supporting_user_ids) AS selected(member_id)
      WHERE selected.member_id = responsible_user_value
        OR NOT public.is_org_member(selected.member_id, _org_id)
    ) THEN
    RAISE EXCEPTION 'VENUE_SUPPORTING_RESPONSIBLES_INVALID' USING ERRCODE = '23514';
  END IF;

  IF pending_date_value THEN
    start_value := NULL;
    end_value := NULL;
    setup_value := NULL;
    teardown_value := NULL;
  ELSIF start_value IS NULL OR end_value IS NULL OR setup_value IS NULL OR teardown_value IS NULL
    OR setup_value > start_value OR start_value >= end_value OR end_value > teardown_value THEN
    RAISE EXCEPTION 'VENUE_PERIOD_INVALID' USING ERRCODE = '22007';
  END IF;

  IF estimated_audience_value IS NOT NULL AND estimated_audience_value < 0
    OR confirmed_audience_value IS NOT NULL AND confirmed_audience_value < 0 THEN
    RAISE EXCEPTION 'VENUE_AUDIENCE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF responsible_org_value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_stakeholders
    WHERE id = responsible_org_value AND org_id = _org_id AND active
  ) THEN
    RAISE EXCEPTION 'VENUE_RESPONSIBLE_ORGANIZATION_INVALID' USING ERRCODE = '23514';
  END IF;
  IF sponsor_value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_stakeholders
    WHERE id = sponsor_value AND org_id = _org_id AND active
      AND relationship_type IN ('patrocinador', 'parceiro')
  ) THEN
    RAISE EXCEPTION 'VENUE_SPONSOR_INVALID' USING ERRCODE = '23514';
  END IF;
  IF responsible_user_value IS NOT NULL
    AND NOT public.is_org_member(responsible_user_value, _org_id) THEN
    RAISE EXCEPTION 'VENUE_RESPONSIBLE_USER_INVALID' USING ERRCODE = '23514';
  END IF;
  IF conflict_override_value AND (
    NOT public.venue_has_capability(_org_id, 'venue_events_conflict_override')
    OR length(coalesce(conflict_reason, '')) < 8
  ) THEN
    RAISE EXCEPTION 'VENUE_CONFLICT_OVERRIDE_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _event_id IS NULL THEN
    INSERT INTO public.venue_events (
      org_id, title, executive_description, event_type, requested_area, pending_date,
      start_at, end_at, setup_start_at, teardown_end_at, requester_name, requester_user_id,
      responsible_organization_id, sponsor_id, responsible_user_id, estimated_audience,
      confirmed_audience, target_audience, status, approval_status, priority, visibility,
      counterpart_agreement_id, counterpart_requested_quantity, observations,
      conflict_override_reason, created_by, updated_by
    ) VALUES (
      _org_id, title_value, nullif(trim(coalesce(_payload->>'executive_description', '')), ''),
      event_type_value, requested_area_value, pending_date_value, start_value, end_value,
      setup_value, teardown_value, requester_value, actor_id, responsible_org_value, sponsor_value,
      responsible_user_value, estimated_audience_value, confirmed_audience_value,
      nullif(trim(coalesce(_payload->>'target_audience', '')), ''), 'rascunho', 'nao_solicitado',
      priority_value, visibility_value, counterpart_value, counterpart_quantity_value,
      nullif(trim(coalesce(_payload->>'observations', '')), ''), conflict_reason, actor_id, actor_id
    ) RETURNING * INTO event_row;
  ELSE
    SELECT * INTO previous_row
    FROM public.venue_events
    WHERE id = _event_id AND org_id = _org_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF _expected_version IS NULL OR previous_row.version <> _expected_version THEN
      RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF previous_row.created_by <> actor_id
      AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
      RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF previous_row.created_by = actor_id
      AND previous_row.status NOT IN ('rascunho', 'pendente_informacoes', 'reprogramado', 'recusado')
      AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
      RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF previous_row.status IN ('concluido', 'cancelado') THEN
      RAISE EXCEPTION 'VENUE_EVENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF previous_row.status = 'em_andamento' THEN
      RAISE EXCEPTION 'VENUE_EVENT_LOCKED_DURING_EXECUTION' USING ERRCODE = '23514';
    END IF;

    before_event := to_jsonb(previous_row);
    SELECT coalesce(
      jsonb_agg(to_jsonb(allocation) ORDER BY allocation.space_id, allocation.id),
      '[]'::jsonb
    )
    INTO before_spaces
    FROM public.venue_event_spaces allocation
    WHERE allocation.event_id = previous_row.id;
    SELECT coalesce(jsonb_agg(to_jsonb(existing_resource) ORDER BY existing_resource.resource_type), '[]'::jsonb)
    INTO before_resources
    FROM public.venue_event_resources existing_resource
    WHERE existing_resource.event_id = previous_row.id;
    SELECT
      coalesce(array_agg(responsible.user_id ORDER BY responsible.user_id), '{}'),
      coalesce(jsonb_agg(to_jsonb(responsible) ORDER BY responsible.user_id), '[]'::jsonb)
    INTO previous_supporting_user_ids, before_responsibles
    FROM public.venue_event_responsibles responsible
    WHERE responsible.event_id = previous_row.id
      AND responsible.responsibility_role = 'apoio';
    SELECT coalesce(
      jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.id),
      '[]'::jsonb
    )
    INTO before_checklist
    FROM public.venue_event_checklist_items item
    WHERE item.event_id = previous_row.id;
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'resource_type', existing_resource.resource_type,
        'quantity', existing_resource.quantity,
        'responsible_team', existing_resource.responsible_team,
        'notes', existing_resource.notes
      ) ORDER BY existing_resource.resource_type
    ), '[]'::jsonb)
    INTO before_resource_definition
    FROM public.venue_event_resources existing_resource
    WHERE existing_resource.event_id = previous_row.id;
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'resource_type', resource_item.value->>'resource_type',
        'quantity', (resource_item.value->>'quantity')::numeric,
        'responsible_team', nullif(trim(coalesce(resource_item.value->>'responsible_team', '')), ''),
        'notes', nullif(trim(coalesce(resource_item.value->>'notes', '')), '')
      ) ORDER BY resource_item.value->>'resource_type'
    ), '[]'::jsonb)
    INTO requested_resource_definition
    FROM jsonb_array_elements(coalesce(_payload->'resources', '[]'::jsonb)) resource_item(value);

    dates_changed := previous_row.pending_date IS DISTINCT FROM pending_date_value
      OR previous_row.start_at IS DISTINCT FROM start_value
      OR previous_row.end_at IS DISTINCT FROM end_value
      OR previous_row.setup_start_at IS DISTINCT FROM setup_value
      OR previous_row.teardown_end_at IS DISTINCT FROM teardown_value
      OR (SELECT coalesce(array_agg(space_id ORDER BY space_id), '{}') FROM public.venue_event_spaces WHERE event_id = previous_row.id)
        IS DISTINCT FROM venue_ids;
    material_changed := dates_changed
      OR previous_row.title IS DISTINCT FROM title_value
      OR previous_row.executive_description IS DISTINCT FROM nullif(trim(coalesce(_payload->>'executive_description', '')), '')
      OR previous_row.event_type IS DISTINCT FROM event_type_value
      OR previous_row.requested_area IS DISTINCT FROM requested_area_value
      OR previous_row.responsible_organization_id IS DISTINCT FROM responsible_org_value
      OR previous_row.sponsor_id IS DISTINCT FROM sponsor_value
      OR previous_row.responsible_user_id IS DISTINCT FROM responsible_user_value
      OR previous_row.estimated_audience IS DISTINCT FROM estimated_audience_value
      OR previous_row.confirmed_audience IS DISTINCT FROM confirmed_audience_value
      OR previous_row.counterpart_agreement_id IS DISTINCT FROM counterpart_value
      OR previous_row.counterpart_requested_quantity IS DISTINCT FROM counterpart_quantity_value
      OR previous_supporting_user_ids IS DISTINCT FROM supporting_user_ids
      OR before_resource_definition IS DISTINCT FROM requested_resource_definition;
    IF material_changed AND previous_row.status IN ('em_analise', 'aprovado', 'confirmado', 'em_preparacao', 'reprogramado')
      AND length(coalesce(change_reason, '')) < 8 THEN
      RAISE EXCEPTION 'VENUE_MATERIAL_CHANGE_REASON_REQUIRED' USING ERRCODE = '23514';
    END IF;

    resulting_status := CASE
      WHEN material_changed AND previous_row.status IN ('aprovado', 'confirmado', 'em_preparacao')
        THEN 'reprogramado'
      WHEN material_changed AND previous_row.status = 'em_analise'
        THEN 'solicitado'
      WHEN previous_row.status = 'recusado'
        THEN 'rascunho'
      ELSE previous_row.status
    END;

    UPDATE public.venue_events
    SET
      title = title_value,
      executive_description = nullif(trim(coalesce(_payload->>'executive_description', '')), ''),
      event_type = event_type_value,
      requested_area = requested_area_value,
      pending_date = pending_date_value,
      start_at = start_value,
      end_at = end_value,
      setup_start_at = setup_value,
      teardown_end_at = teardown_value,
      requester_name = requester_value,
      responsible_organization_id = responsible_org_value,
      sponsor_id = sponsor_value,
      responsible_user_id = responsible_user_value,
      estimated_audience = estimated_audience_value,
      confirmed_audience = confirmed_audience_value,
      target_audience = nullif(trim(coalesce(_payload->>'target_audience', '')), ''),
      status = resulting_status,
      approval_status = CASE
        WHEN resulting_status = 'reprogramado' OR (material_changed AND previous_row.status = 'em_analise') THEN 'pendente'
        WHEN resulting_status = 'rascunho' THEN 'nao_solicitado'
        ELSE approval_status
      END,
      priority = priority_value,
      visibility = visibility_value,
      counterpart_agreement_id = counterpart_value,
      counterpart_requested_quantity = counterpart_quantity_value,
      observations = nullif(trim(coalesce(_payload->>'observations', '')), ''),
      conflict_override_reason = conflict_reason,
      updated_by = actor_id,
      version = version + 1
    WHERE id = previous_row.id
    RETURNING * INTO event_row;
  END IF;

  DELETE FROM public.venue_event_spaces WHERE event_id = event_row.id;
  INSERT INTO public.venue_event_spaces (
    org_id, event_id, space_id, requested_area, start_at, end_at, setup_start_at,
    teardown_end_at, blocks_availability, conflict_override
  )
  SELECT
    _org_id, event_row.id, space_id, requested_area_value, start_value, end_value,
    setup_value, teardown_value, false, conflict_override_value
  FROM unnest(venue_ids) AS selected_space(space_id);

  DELETE FROM public.venue_event_responsibles
  WHERE event_id = event_row.id
    AND responsibility_role = 'apoio';
  INSERT INTO public.venue_event_responsibles (
    org_id, event_id, user_id, responsibility_role
  )
  SELECT _org_id, event_row.id, member_id, 'apoio'
  FROM unnest(supporting_user_ids) AS selected(member_id);

  IF NOT pending_date_value THEN
    SELECT
      coalesce(jsonb_agg(
        to_jsonb(conflict_row)
        ORDER BY
          conflict_row.conflict_kind,
          conflict_row.evidence_token,
          conflict_row.conflict_id,
          conflict_row.space_id
      ), '[]'::jsonb),
      count(*),
      count(*) FILTER (WHERE conflict_row.conflict_kind IN ('event', 'block')),
      count(*) FILTER (WHERE conflict_row.conflict_kind = 'capacity')
    INTO conflicts, conflict_count, temporal_conflict_count, capacity_conflict_count
    FROM public.venue_check_availability(
      _org_id,
      venue_ids,
      setup_value,
      teardown_value,
      event_row.id,
      coalesce(confirmed_audience_value, estimated_audience_value),
      start_value,
      end_value,
      event_type_value
    ) conflict_row;

    SELECT md5(coalesce(jsonb_agg(jsonb_build_object(
      'conflict_kind', conflict_item.value->>'conflict_kind',
      'space_id', conflict_item.value->>'space_id',
      'starts_at', conflict_item.value->>'starts_at',
      'ends_at', conflict_item.value->>'ends_at'
    ) || jsonb_build_object(
      'evidence_token', conflict_item.value->>'evidence_token',
      'detail', conflict_item.value->>'detail'
    ) ORDER BY
      conflict_item.value->>'conflict_kind',
      conflict_item.value->>'evidence_token',
      conflict_item.value->>'space_id',
      conflict_item.value->>'starts_at',
      conflict_item.value->>'ends_at'
    ), '[]'::jsonb)::text)
    INTO conflict_fingerprint
    FROM jsonb_array_elements(conflicts) conflict_item(value);
  END IF;

  UPDATE public.venue_events
  SET conflict_status = CASE
    WHEN pending_date_value THEN 'nao_verificado'
    WHEN conflict_count = 0 THEN 'livre'
    WHEN conflict_override_value THEN 'excecao_autorizada'
    ELSE 'conflito'
  END,
  conflict_override_reason = CASE
    WHEN conflict_count > 0 AND conflict_override_value THEN conflict_reason
    ELSE NULL
  END,
  conflict_override_fingerprint = CASE
    WHEN conflict_count > 0 AND conflict_override_value THEN conflict_fingerprint
    ELSE NULL
  END
  WHERE id = event_row.id
  RETURNING * INTO event_row;

  UPDATE public.venue_event_spaces
  SET
    blocks_availability = event_row.status IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento', 'concluido'),
    conflict_override = conflict_override_value
      AND temporal_conflict_count > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(conflicts) conflict_item(value)
        WHERE conflict_item.value->>'conflict_kind' IN ('event', 'block')
          AND (conflict_item.value->>'space_id')::uuid = public.venue_event_spaces.space_id
      )
  WHERE event_id = event_row.id;

  IF event_row.status IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento')
    AND conflict_count > 0 AND NOT conflict_override_value THEN
    RAISE EXCEPTION 'VENUE_CONFLICT' USING ERRCODE = '23P01', DETAIL = conflicts::text;
  END IF;

  SELECT coalesce(array_agg(value->>'resource_type' ORDER BY value->>'resource_type'), '{}')
  INTO resource_types
  FROM jsonb_array_elements(coalesce(_payload->'resources', '[]'::jsonb)) item(value);
  IF cardinality(resource_types) <> cardinality(
      ARRAY(SELECT DISTINCT candidate.resource_type FROM unnest(resource_types) AS candidate(resource_type))
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(resource_types) AS candidate(resource_type)
      WHERE candidate.resource_type NOT IN (
        'mesas', 'cadeiras', 'palco', 'som', 'iluminacao', 'energia', 'limpeza',
        'seguranca', 'recepcao', 'catering', 'cozinha', 'audiovisual',
        'estacionamento', 'acessibilidade', 'sinalizacao', 'equipe_tecnica'
      )
    ) THEN
    RAISE EXCEPTION 'VENUE_RESOURCE_DUPLICATE_OR_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR resource IN SELECT value FROM jsonb_array_elements(coalesce(_payload->'resources', '[]'::jsonb))
  LOOP
    IF nullif(resource->>'quantity', '')::numeric IS NULL
      OR (resource->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'VENUE_RESOURCE_QUANTITY_INVALID' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.venue_event_resources AS existing (
      org_id, event_id, resource_type, quantity, responsible_team, required_at,
      notes, created_by, updated_by
    ) VALUES (
      _org_id,
      event_row.id,
      resource->>'resource_type',
      (resource->>'quantity')::numeric,
      nullif(trim(coalesce(resource->>'responsible_team', '')), ''),
      setup_value,
      nullif(trim(coalesce(resource->>'notes', '')), ''),
      actor_id,
      actor_id
    )
    ON CONFLICT (event_id, resource_type) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      responsible_team = EXCLUDED.responsible_team,
      required_at = EXCLUDED.required_at,
      notes = EXCLUDED.notes,
      confirmation_status = 'solicitado',
      completion_status = 'pendente',
      updated_by = actor_id,
      version = existing.version + 1
    WHERE existing.quantity IS DISTINCT FROM EXCLUDED.quantity
      OR existing.responsible_team IS DISTINCT FROM EXCLUDED.responsible_team
      OR existing.required_at IS DISTINCT FROM EXCLUDED.required_at
      OR existing.notes IS DISTINCT FROM EXCLUDED.notes;
  END LOOP;

  DELETE FROM public.venue_event_resources
  WHERE event_id = event_row.id
    AND NOT (resource_type = ANY(resource_types));

  FOR checklist_template IN
    SELECT DISTINCT ON (template.title) template.*
    FROM public.venue_checklist_templates template
    WHERE template.org_id = _org_id
      AND template.active
      AND (template.space_id IS NULL OR template.space_id = ANY(venue_ids))
      AND (template.event_type IS NULL OR template.event_type = event_type_value)
    ORDER BY template.title, template.space_id NULLS LAST, template.event_type NULLS LAST
  LOOP
    INSERT INTO public.venue_event_checklist_items AS existing (
      org_id, event_id, template_id, title, responsible_user_id, deadline,
      phase, required, sort_order, created_by, updated_by
    ) VALUES (
      _org_id,
      event_row.id,
      checklist_template.id,
      checklist_template.title,
      responsible_user_value,
      CASE
        WHEN start_value IS NOT NULL AND checklist_template.deadline_offset_hours IS NOT NULL
          THEN (
            CASE
              WHEN checklist_template.phase = 'pos_evento' THEN end_value
              ELSE start_value
            END
          ) + make_interval(hours => checklist_template.deadline_offset_hours)
        ELSE NULL
      END,
      checklist_template.phase,
      checklist_template.required,
      checklist_template.sort_order,
      actor_id,
      actor_id
    ) ON CONFLICT (event_id, template_id) DO UPDATE SET
      phase = EXCLUDED.phase,
      responsible_user_id = coalesce(existing.responsible_user_id, EXCLUDED.responsible_user_id),
      status = CASE WHEN existing.status = 'obsoleto' THEN 'pendente' ELSE existing.status END,
      note = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.note END,
      completed_at = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.completed_at END,
      completed_by = CASE WHEN existing.status = 'obsoleto' THEN NULL ELSE existing.completed_by END,
      deadline = CASE
        WHEN existing.status IN ('concluido', 'dispensado')
          THEN existing.deadline
        ELSE EXCLUDED.deadline
      END,
      updated_by = actor_id,
      version = existing.version + 1
    WHERE existing.phase IS DISTINCT FROM EXCLUDED.phase
      OR existing.responsible_user_id IS DISTINCT FROM
        coalesce(existing.responsible_user_id, EXCLUDED.responsible_user_id)
      OR existing.status = 'obsoleto'
      OR existing.deadline IS DISTINCT FROM CASE
        WHEN existing.status IN ('concluido', 'dispensado')
          THEN existing.deadline
        ELSE EXCLUDED.deadline
      END;
  END LOOP;

  FOR obsolete_checklist IN
    SELECT item.*
    FROM public.venue_event_checklist_items item
    WHERE item.event_id = event_row.id
      AND item.template_id IS NOT NULL
      AND item.status NOT IN ('concluido', 'dispensado', 'obsoleto')
      AND NOT EXISTS (
        SELECT 1
        FROM public.venue_checklist_templates template
        WHERE template.id = item.template_id
          AND template.org_id = _org_id
          AND template.active
          AND (template.space_id IS NULL OR template.space_id = ANY(venue_ids))
          AND (template.event_type IS NULL OR template.event_type = event_type_value)
      )
    FOR UPDATE
  LOOP
    UPDATE public.venue_event_checklist_items
    SET
      status = 'obsoleto',
      note = 'Item desativado automaticamente após mudança de espaço ou tipo do evento.',
      completed_at = now(),
      completed_by = actor_id,
      updated_by = actor_id,
      version = version + 1
    WHERE id = obsolete_checklist.id
    RETURNING * INTO updated_checklist;

    PERFORM public.venue_log_audit(
      _org_id,
      'venue_checklist_item',
      obsolete_checklist.id,
      'status_change'::public.audit_action,
      to_jsonb(obsolete_checklist),
      to_jsonb(updated_checklist),
      'checklist_item_obsoleted',
      change_reason,
      _idempotency_key
    );
  END LOOP;

  PERFORM public.venue_refresh_occupancies(event_row.id);
  PERFORM public.venue_sync_event_counterpart(event_row.id, _idempotency_key, change_reason);

  SELECT coalesce(
    jsonb_agg(to_jsonb(allocation) ORDER BY allocation.space_id, allocation.id),
    '[]'::jsonb
  )
  INTO after_spaces
  FROM public.venue_event_spaces allocation
  WHERE allocation.event_id = event_row.id;
  SELECT coalesce(
    jsonb_agg(to_jsonb(item) ORDER BY item.sort_order, item.id),
    '[]'::jsonb
  )
  INTO after_checklist
  FROM public.venue_event_checklist_items item
  WHERE item.event_id = event_row.id;

  PERFORM public.venue_log_audit(
    _org_id,
    'venue_event',
    event_row.id,
    CASE WHEN _event_id IS NULL THEN 'create'::public.audit_action ELSE 'update'::public.audit_action END,
    CASE
      WHEN _event_id IS NULL THEN NULL
      ELSE before_event || jsonb_build_object(
        'venue_spaces', before_spaces,
        'resources', before_resources,
        'supporting_responsibles', before_responsibles,
        'checklist_items', before_checklist
      )
    END,
    to_jsonb(event_row) || jsonb_build_object(
      'venue_ids', venue_ids,
      'venue_spaces', after_spaces,
      'resources', coalesce(_payload->'resources', '[]'::jsonb),
      'supporting_responsible_user_ids', supporting_user_ids,
      'checklist_items', after_checklist
    ),
    CASE
      WHEN dates_changed THEN 'event_rescheduled'
      WHEN material_changed THEN 'event_material_change'
      WHEN _event_id IS NULL THEN 'event_created'
      ELSE 'event_updated'
    END,
    change_reason,
    _idempotency_key
  );

  IF material_changed AND previous_row.status IN ('em_analise', 'aprovado', 'confirmado', 'em_preparacao', 'reprogramado') THEN
    INSERT INTO public.venue_event_approvals (
      org_id, event_id, decision, reason, previous_status, new_status, approver_id
    ) VALUES (
      _org_id,
      event_row.id,
      CASE WHEN dates_changed THEN 'reprogramado' ELSE 'alteracao_material' END,
      change_reason,
      previous_row.status,
      event_row.status,
      actor_id
    );
  END IF;

  IF conflict_count > 0 AND conflict_override_value THEN
    INSERT INTO public.venue_event_approvals (
      org_id, event_id, decision, reason, previous_status, new_status, approver_id
    ) VALUES (
      _org_id,
      event_row.id,
      'excecao_conflito',
      conflict_reason,
      coalesce(previous_row.status, event_row.status),
      event_row.status,
      actor_id
    );
  END IF;

  result := jsonb_build_object(
    'event_id', event_row.id,
    'version', event_row.version,
    'status', event_row.status,
    'conflict_status', event_row.conflict_status,
    'conflicts', conflicts,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

REVOKE ALL ON FUNCTION public.venue_save_event(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_save_event(uuid, uuid, integer, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.venue_transition_event(
  _org_id uuid,
  _event_id uuid,
  _expected_version integer,
  _transition text,
  _reason text,
  _idempotency_key uuid,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  operation_name text := 'venue_transition_' || coalesce(_transition, 'unknown');
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'event_id', _event_id,
    'expected_version', _expected_version,
    'transition', _transition,
    'reason', _reason
  );
  replay jsonb;
  result jsonb;
  event_row public.venue_events%ROWTYPE;
  before_event jsonb;
  usage_row public.venue_counterpart_usage%ROWTYPE;
  before_usage jsonb;
  from_status text;
  to_status text;
  to_approval text;
  decision_value text;
  conflict_count integer := 0;
  temporal_conflict_count integer := 0;
  capacity_conflict_count integer := 0;
  conflicts jsonb := '[]'::jsonb;
  conflict_fingerprint text;
  required_pending integer := 0;
  previous_approved_excess numeric := 0;
  reason_value text := nullif(trim(coalesce(_reason, '')), '');
  event_space_ids uuid[];
  blocked_from_status text;
  no_show_consumes boolean := false;
  current_reserved numeric := 0;
  current_consumed numeric := 0;
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_events_access');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  SELECT * INTO event_row
  FROM public.venue_events
  WHERE id = _event_id AND org_id = _org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _expected_version IS NULL OR event_row.version <> _expected_version THEN
    RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  from_status := event_row.status;
  before_event := to_jsonb(event_row);
  SELECT coalesce(array_agg(space_id ORDER BY space_id), '{}')
  INTO event_space_ids
  FROM public.venue_event_spaces
  WHERE event_id = event_row.id;

  CASE _transition
    WHEN 'submit' THEN
      IF event_row.created_by <> actor_id
        AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('rascunho', 'pendente_informacoes', 'reprogramado') THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      IF event_row.pending_date THEN
        to_status := 'pendente_informacoes';
      ELSE
        to_status := 'solicitado';
      END IF;
      to_approval := 'pendente';
      decision_value := 'enviado';

    WHEN 'start_review' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_approve') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('solicitado', 'reprogramado') THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      to_status := 'em_analise';
      to_approval := 'em_analise';
      decision_value := 'em_analise';

    WHEN 'approve' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_approve') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('solicitado', 'em_analise', 'reprogramado')
        OR event_row.pending_date OR event_row.start_at IS NULL THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      IF cardinality(event_space_ids) = 0
        OR (
          SELECT count(*)
          FROM public.venue_spaces space
          WHERE space.org_id = _org_id
            AND space.active
            AND space.id = ANY(event_space_ids)
        ) <> cardinality(event_space_ids) THEN
        RAISE EXCEPTION 'VENUE_SPACE_INVALID' USING ERRCODE = '23514';
      END IF;
      SELECT
        coalesce(jsonb_agg(
          to_jsonb(conflict_row)
          ORDER BY
            conflict_row.conflict_kind,
            conflict_row.evidence_token,
            conflict_row.conflict_id,
            conflict_row.space_id
        ), '[]'::jsonb),
        count(*),
        count(*) FILTER (WHERE conflict_row.conflict_kind IN ('event', 'block')),
        count(*) FILTER (WHERE conflict_row.conflict_kind = 'capacity')
      INTO conflicts, conflict_count, temporal_conflict_count, capacity_conflict_count
      FROM public.venue_check_availability(
        _org_id,
        event_space_ids,
        event_row.setup_start_at,
        event_row.teardown_end_at,
        event_row.id,
        coalesce(event_row.confirmed_audience, event_row.estimated_audience),
        event_row.start_at,
        event_row.end_at,
        event_row.event_type
      ) conflict_row;
      SELECT md5(coalesce(jsonb_agg(jsonb_build_object(
        'conflict_kind', conflict_item.value->>'conflict_kind',
        'space_id', conflict_item.value->>'space_id',
        'starts_at', conflict_item.value->>'starts_at',
        'ends_at', conflict_item.value->>'ends_at'
      ) || jsonb_build_object(
        'evidence_token', conflict_item.value->>'evidence_token',
        'detail', conflict_item.value->>'detail'
      ) ORDER BY
        conflict_item.value->>'conflict_kind',
        conflict_item.value->>'evidence_token',
        conflict_item.value->>'space_id',
        conflict_item.value->>'starts_at',
        conflict_item.value->>'ends_at'
      ), '[]'::jsonb)::text)
      INTO conflict_fingerprint
      FROM jsonb_array_elements(conflicts) conflict_item(value);
      IF conflict_count > 0 AND (
        event_row.conflict_status <> 'excecao_autorizada'
        OR event_row.conflict_override_fingerprint IS DISTINCT FROM conflict_fingerprint
        OR length(coalesce(event_row.conflict_override_reason, '')) < 8
      ) THEN
        RAISE EXCEPTION 'VENUE_CONFLICT' USING ERRCODE = '23P01', DETAIL = conflicts::text;
      END IF;
      IF temporal_conflict_count > 0 AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(conflicts) conflict_item(value)
        WHERE conflict_item.value->>'conflict_kind' IN ('event', 'block')
          AND NOT EXISTS (
            SELECT 1
            FROM public.venue_event_spaces allocation
            WHERE allocation.event_id = event_row.id
              AND allocation.space_id = (conflict_item.value->>'space_id')::uuid
              AND allocation.conflict_override
          )
      ) THEN
        RAISE EXCEPTION 'VENUE_CONFLICT' USING ERRCODE = '23P01', DETAIL = conflicts::text;
      END IF;
      SELECT * INTO usage_row
      FROM public.venue_counterpart_usage
      WHERE event_id = event_row.id AND superseded_at IS NULL
      FOR UPDATE;
      IF usage_row.id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.venue_counterpart_agreements agreement
        WHERE agreement.id = usage_row.agreement_id
          AND agreement.requires_approval
          AND agreement.responsible_approver_id IS NOT NULL
          AND agreement.responsible_approver_id <> actor_id
      ) THEN
        RAISE EXCEPTION 'VENUE_COUNTERPART_DESIGNATED_APPROVER_REQUIRED' USING ERRCODE = '42501';
      END IF;
      IF usage_row.id IS NOT NULL
        AND usage_row.excess_quantity > 0
        AND EXISTS (
          SELECT 1
          FROM public.venue_counterpart_agreements agreement
          WHERE agreement.id = usage_row.agreement_id
            AND agreement.requires_approval
        )
        AND (
          usage_row.excess_approval_status NOT IN ('aprovado', 'cobranca_adicional')
          OR usage_row.approved_excess_quantity <> usage_row.excess_quantity
        ) THEN
        RAISE EXCEPTION 'VENUE_EXCESS_APPROVAL_REQUIRED' USING ERRCODE = '23514';
      END IF;
      to_status := 'aprovado';
      to_approval := 'aprovado';
      decision_value := 'aprovado';

    WHEN 'confirm' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_approve')
        AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status <> 'aprovado' THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      to_status := 'confirmado';
      to_approval := 'aprovado';
      decision_value := 'confirmado';

    WHEN 'reject' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_approve') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('solicitado', 'em_analise', 'reprogramado') OR length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_REJECTION_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      to_status := 'recusado';
      to_approval := 'recusado';
      decision_value := 'recusado';

    WHEN 'block_request' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN (
        'rascunho', 'solicitado', 'em_analise', 'reprogramado', 'pendente_informacoes'
      ) OR length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_BLOCK_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      to_status := 'bloqueado';
      to_approval := event_row.approval_status;
      decision_value := 'bloqueado';

    WHEN 'unblock_request' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status <> 'bloqueado' OR length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_UNBLOCK_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      SELECT approval.previous_status
      INTO blocked_from_status
      FROM public.venue_event_approvals approval
      WHERE approval.event_id = event_row.id
        AND approval.decision = 'bloqueado'
      ORDER BY approval.created_at DESC, approval.id DESC
      LIMIT 1;
      to_status := CASE
        WHEN blocked_from_status IN (
          'rascunho', 'solicitado', 'em_analise', 'reprogramado', 'pendente_informacoes'
        ) THEN blocked_from_status
        WHEN event_row.pending_date THEN 'pendente_informacoes'
        ELSE 'solicitado'
      END;
      to_approval := CASE
        WHEN to_status = 'rascunho' THEN 'nao_solicitado'
        WHEN to_status = 'em_analise' THEN 'em_analise'
        ELSE 'pendente'
      END;
      decision_value := 'desbloqueado';

    WHEN 'prepare' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_operations_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status <> 'confirmado' THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      to_status := 'em_preparacao';
      to_approval := event_row.approval_status;
      decision_value := 'preparacao_iniciada';

    WHEN 'start' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_operations_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('confirmado', 'em_preparacao') THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      to_status := 'em_andamento';
      to_approval := event_row.approval_status;
      decision_value := 'evento_iniciado';

    WHEN 'complete' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_operations_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('confirmado', 'em_preparacao', 'em_andamento') THEN
        RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
      END IF;
      SELECT count(*) INTO required_pending
      FROM public.venue_event_checklist_items
      WHERE event_id = event_row.id
        AND required
        AND phase = 'pre_evento'
        AND status NOT IN ('concluido', 'dispensado', 'obsoleto');
      IF required_pending > 0 THEN
        RAISE EXCEPTION 'VENUE_REQUIRED_CHECKLIST_PENDING' USING ERRCODE = '23514';
      END IF;
      SELECT count(*) INTO required_pending
      FROM public.venue_event_resources
      WHERE event_id = event_row.id
        AND NOT (
          (confirmation_status = 'confirmado' AND completion_status = 'concluido')
          OR (confirmation_status = 'dispensado' AND completion_status = 'nao_aplicavel')
        );
      IF required_pending > 0 THEN
        RAISE EXCEPTION 'VENUE_REQUIRED_RESOURCE_PENDING' USING ERRCODE = '23514';
      END IF;
      IF length(trim(coalesce(_payload->>'event_result', ''))) < 8 THEN
        RAISE EXCEPTION 'VENUE_EVENT_RESULT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      to_status := 'concluido';
      to_approval := event_row.approval_status;
      decision_value := 'concluido';

    WHEN 'cancel' THEN
      IF event_row.status IN ('concluido', 'cancelado') OR length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_CANCELLATION_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF event_row.status IN ('confirmado', 'em_preparacao', 'em_andamento')
        AND NOT public.venue_has_capability(_org_id, 'venue_events_cancel')
        AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('confirmado', 'em_preparacao', 'em_andamento')
        AND event_row.created_by <> actor_id
        AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      to_status := 'cancelado';
      to_approval := event_row.approval_status;
      decision_value := 'cancelado';

    WHEN 'mark_no_show' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_operations_manage') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF event_row.status NOT IN ('confirmado', 'em_preparacao', 'em_andamento')
        OR length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_NO_SHOW_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF event_row.start_at IS NULL OR now() < event_row.start_at THEN
        RAISE EXCEPTION 'VENUE_NO_SHOW_TOO_EARLY' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO usage_row
      FROM public.venue_counterpart_usage
      WHERE event_id = event_row.id AND superseded_at IS NULL
      FOR UPDATE;
      IF event_row.counterpart_agreement_id IS NOT NULL AND NOT FOUND THEN
        RAISE EXCEPTION 'VENUE_COUNTERPART_USAGE_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
      IF usage_row.id IS NOT NULL THEN before_usage := to_jsonb(usage_row); END IF;
      to_status := 'cancelado';
      to_approval := event_row.approval_status;
      decision_value := 'no_show';

    WHEN 'approve_excess', 'mark_excess_paid', 'request_contract_review' THEN
      IF NOT public.venue_has_capability(_org_id, 'venue_excess_approve') THEN
        RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
      END IF;
      IF length(coalesce(reason_value, '')) < 8 THEN
        RAISE EXCEPTION 'VENUE_EXCESS_REASON_REQUIRED' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO usage_row
      FROM public.venue_counterpart_usage
      WHERE event_id = event_row.id AND superseded_at IS NULL
      FOR UPDATE;
      IF NOT FOUND OR usage_row.excess_quantity <= 0 THEN
        RAISE EXCEPTION 'VENUE_EXCESS_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.venue_counterpart_agreements agreement
        WHERE agreement.id = usage_row.agreement_id
          AND agreement.responsible_approver_id IS NOT NULL
          AND agreement.responsible_approver_id <> actor_id
      ) THEN
        RAISE EXCEPTION 'VENUE_COUNTERPART_DESIGNATED_APPROVER_REQUIRED' USING ERRCODE = '42501';
      END IF;
      IF usage_row.excess_approval_status = (CASE _transition
          WHEN 'approve_excess' THEN 'aprovado'
          WHEN 'mark_excess_paid' THEN 'cobranca_adicional'
          ELSE 'revisao_contrato'
        END)
        AND (
          _transition = 'request_contract_review'
          OR usage_row.approved_excess_quantity = usage_row.excess_quantity
      ) THEN
        RAISE EXCEPTION 'VENUE_EXCESS_ALREADY_RESOLVED' USING ERRCODE = '23514';
      END IF;
      IF _transition = 'request_contract_review'
        AND (
          usage_row.usage_state IN ('reservado', 'consumido')
          OR (
            usage_row.usage_state = 'no_show'
            AND EXISTS (
              SELECT 1
              FROM public.venue_counterpart_agreements agreement
              WHERE agreement.id = usage_row.agreement_id
                AND agreement.no_show_consumes_allowance
            )
          )
        ) THEN
        RAISE EXCEPTION 'VENUE_COMMITTED_EXCESS_UNAPPROVED' USING ERRCODE = '23514';
      END IF;
      previous_approved_excess := usage_row.approved_excess_quantity;
      before_usage := to_jsonb(usage_row);
      UPDATE public.venue_counterpart_usage
      SET
        excess_approval_status = CASE _transition
          WHEN 'approve_excess' THEN 'aprovado'
          WHEN 'mark_excess_paid' THEN 'cobranca_adicional'
          ELSE 'revisao_contrato'
        END,
        approved_excess_quantity = CASE
          WHEN _transition = 'request_contract_review' THEN 0
          ELSE excess_quantity
        END,
        approved_by = actor_id,
        approved_at = now(),
        observation = reason_value
      WHERE id = usage_row.id
      RETURNING * INTO usage_row;

      IF usage_row.approved_excess_quantity <> previous_approved_excess THEN
        INSERT INTO public.venue_counterpart_ledger (
          org_id, agreement_id, event_id, usage_id, movement_type,
          reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
        ) VALUES (
          _org_id,
          usage_row.agreement_id,
          event_row.id,
          usage_row.id,
          CASE
            WHEN usage_row.approved_excess_quantity < previous_approved_excess THEN 'revisao_contrato'
            WHEN _transition = 'mark_excess_paid' THEN 'excesso_cobravel'
            ELSE 'excesso_autorizado'
          END,
          0,
          0,
          usage_row.approved_excess_quantity - previous_approved_excess,
          reason_value,
          _idempotency_key,
          actor_id
        );
      END IF;
      INSERT INTO public.venue_event_approvals (
        org_id, event_id, decision, reason, previous_status, new_status, approver_id
      ) VALUES (
        _org_id,
        event_row.id,
        CASE _transition
          WHEN 'approve_excess' THEN 'excesso_aprovado'
          WHEN 'mark_excess_paid' THEN 'cobranca_adicional'
          ELSE 'revisao_contrato'
        END,
        reason_value,
        event_row.status,
        event_row.status,
        actor_id
      );
      PERFORM public.venue_log_audit(
        _org_id, 'venue_counterpart_usage', usage_row.id, 'status_change'::public.audit_action,
        before_usage, to_jsonb(usage_row), _transition, reason_value, _idempotency_key
      );
      UPDATE public.venue_events
      SET updated_by = actor_id, version = version + 1
      WHERE id = event_row.id
      RETURNING * INTO event_row;
      result := jsonb_build_object(
        'event_id', event_row.id,
        'version', event_row.version,
        'status', event_row.status,
        'excess_approval_status', usage_row.excess_approval_status,
        'replayed', false
      );
      RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);

    ELSE
      RAISE EXCEPTION 'VENUE_INVALID_TRANSITION' USING ERRCODE = '23514';
  END CASE;

  UPDATE public.venue_events
  SET
    status = to_status,
    approval_status = to_approval,
    cancellation_reason = CASE
      WHEN _transition IN ('cancel', 'mark_no_show') THEN reason_value
      ELSE cancellation_reason
    END,
    event_result = CASE WHEN _transition = 'complete' THEN trim(_payload->>'event_result') ELSE event_result END,
    confirmed_audience = CASE
      WHEN _transition = 'complete' AND nullif(_payload->>'confirmed_audience', '') IS NOT NULL
        THEN (_payload->>'confirmed_audience')::integer
      ELSE confirmed_audience
    END,
    completed_at = CASE WHEN _transition = 'complete' THEN now() ELSE completed_at END,
    conflict_status = CASE
      WHEN _transition = 'approve' AND conflict_count = 0 THEN 'livre'
      ELSE conflict_status
    END,
    conflict_override_reason = CASE
      WHEN _transition = 'approve' AND conflict_count = 0 THEN NULL
      ELSE conflict_override_reason
    END,
    conflict_override_fingerprint = CASE
      WHEN _transition = 'approve' AND conflict_count = 0 THEN NULL
      ELSE conflict_override_fingerprint
    END,
    updated_by = actor_id,
    version = version + 1
  WHERE id = event_row.id
  RETURNING * INTO event_row;

  UPDATE public.venue_event_spaces
  SET
    blocks_availability = event_row.status IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento', 'concluido'),
    conflict_override = CASE
      WHEN _transition = 'approve' AND temporal_conflict_count = 0 THEN false
      ELSE conflict_override
    END
  WHERE event_id = event_row.id;

  PERFORM public.venue_refresh_occupancies(event_row.id);
  IF _transition = 'mark_no_show' AND usage_row.id IS NOT NULL THEN
    SELECT agreement.no_show_consumes_allowance
    INTO no_show_consumes
    FROM public.venue_counterpart_agreements agreement
    WHERE agreement.id = usage_row.agreement_id
      AND agreement.org_id = _org_id
    FOR UPDATE;

    SELECT coalesce(sum(ledger.reserved_delta), 0), coalesce(sum(ledger.consumed_delta), 0)
    INTO current_reserved, current_consumed
    FROM public.venue_counterpart_ledger ledger
    WHERE ledger.usage_id = usage_row.id;

    IF current_consumed <> 0 THEN
      RAISE EXCEPTION 'VENUE_COMPLETED_COUNTERPART_IMMUTABLE' USING ERRCODE = '23514';
    END IF;

    IF no_show_consumes THEN
      INSERT INTO public.venue_counterpart_ledger (
        org_id, agreement_id, event_id, usage_id, movement_type,
        reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
      ) VALUES (
        _org_id,
        usage_row.agreement_id,
        event_row.id,
        usage_row.id,
        'consumo',
        -current_reserved,
        usage_row.requested_quantity,
        0,
        reason_value,
        _idempotency_key,
        actor_id
      );
    ELSIF current_reserved <> 0 THEN
      INSERT INTO public.venue_counterpart_ledger (
        org_id, agreement_id, event_id, usage_id, movement_type,
        reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
      ) VALUES (
        _org_id,
        usage_row.agreement_id,
        event_row.id,
        usage_row.id,
        'liberacao',
        -current_reserved,
        0,
        0,
        reason_value,
        _idempotency_key,
        actor_id
      );
    END IF;

    UPDATE public.venue_counterpart_usage
    SET usage_state = 'no_show', observation = reason_value
    WHERE id = usage_row.id;
    PERFORM public.venue_recalculate_agreement_excess(
      usage_row.agreement_id,
      _idempotency_key,
      reason_value
    );
    SELECT * INTO usage_row
    FROM public.venue_counterpart_usage
    WHERE id = usage_row.id;
    PERFORM public.venue_log_audit(
      _org_id,
      'venue_counterpart_usage',
      usage_row.id,
      'status_change'::public.audit_action,
      before_usage,
      to_jsonb(usage_row),
      'mark_no_show',
      reason_value,
      _idempotency_key
    );
  ELSE
    PERFORM public.venue_sync_event_counterpart(event_row.id, _idempotency_key, reason_value);
  END IF;

  INSERT INTO public.venue_event_approvals (
    org_id, event_id, decision, reason, observation, previous_status, new_status, approver_id
  ) VALUES (
    _org_id,
    event_row.id,
    decision_value,
    reason_value,
    nullif(trim(coalesce(_payload->>'observation', '')), ''),
    from_status,
    event_row.status,
    actor_id
  );

  PERFORM public.venue_log_audit(
    _org_id,
    'venue_event',
    event_row.id,
    'status_change'::public.audit_action,
    before_event,
    to_jsonb(event_row),
    _transition,
    reason_value,
    _idempotency_key
  );

  result := jsonb_build_object(
    'event_id', event_row.id,
    'version', event_row.version,
    'status', event_row.status,
    'approval_status', event_row.approval_status,
    'conflicts', conflicts,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

REVOKE ALL ON FUNCTION public.venue_transition_event(uuid, uuid, integer, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_transition_event(uuid, uuid, integer, text, text, uuid, jsonb) TO authenticated;