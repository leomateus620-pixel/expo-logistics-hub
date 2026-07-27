CREATE OR REPLACE FUNCTION public.venue_upsert_stakeholder(
  _org_id uuid,
  _stakeholder_id uuid,
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
  operation_name text := CASE
    WHEN _stakeholder_id IS NULL THEN 'venue_create_stakeholder'
    ELSE 'venue_update_stakeholder'
  END;
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'stakeholder_id', _stakeholder_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  stakeholder_row public.venue_stakeholders%ROWTYPE;
  before_row jsonb;
  legal_name_value text := trim(coalesce(_payload->>'legal_name', ''));
  trade_name_value text := nullif(trim(coalesce(_payload->>'trade_name', '')), '');
  normalized_name_value text;
  document_value text := nullif(trim(coalesce(_payload->>'document_identifier', '')), '');
  relationship_value text := _payload->>'relationship_type';
  active_from_value date := nullif(_payload->>'active_from', '')::date;
  active_until_value date := nullif(_payload->>'active_until', '')::date;
  active_value boolean := coalesce((_payload->>'active')::boolean, true);
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_sponsors_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  IF length(legal_name_value) < 2 OR length(legal_name_value) > 180 THEN
    RAISE EXCEPTION 'VENUE_STAKEHOLDER_NAME_INVALID' USING ERRCODE = '23514';
  END IF;
  IF relationship_value NOT IN ('patrocinador', 'parceiro', 'comissao', 'empresa', 'instituicao', 'externo') THEN
    RAISE EXCEPTION 'VENUE_STAKEHOLDER_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF active_until_value IS NOT NULL AND active_from_value IS NOT NULL
    AND active_until_value < active_from_value THEN
    RAISE EXCEPTION 'VENUE_STAKEHOLDER_PERIOD_INVALID' USING ERRCODE = '22007';
  END IF;

  normalized_name_value := public.venue_normalize_name(coalesce(trade_name_value, legal_name_value));
  IF EXISTS (
    SELECT 1
    FROM public.venue_stakeholders existing
    WHERE existing.org_id = _org_id
      AND existing.active
      AND existing.id IS DISTINCT FROM _stakeholder_id
      AND (
        existing.normalized_name = normalized_name_value
        OR (
          document_value IS NOT NULL
          AND regexp_replace(existing.document_identifier, '[^0-9A-Za-z]', '', 'g') =
            regexp_replace(document_value, '[^0-9A-Za-z]', '', 'g')
        )
      )
  ) THEN
    RAISE EXCEPTION 'VENUE_DUPLICATE_STAKEHOLDER' USING ERRCODE = '23505';
  END IF;

  IF _stakeholder_id IS NULL THEN
    INSERT INTO public.venue_stakeholders (
      org_id, legal_name, trade_name, document_identifier, contact_name, email, phone,
      relationship_type, contract_reference, sponsor_category, active_from, active_until,
      notes, active, created_by, updated_by
    ) VALUES (
      _org_id,
      legal_name_value,
      trade_name_value,
      document_value,
      nullif(trim(coalesce(_payload->>'contact_name', '')), ''),
      nullif(lower(trim(coalesce(_payload->>'email', ''))), ''),
      nullif(trim(coalesce(_payload->>'phone', '')), ''),
      relationship_value,
      nullif(trim(coalesce(_payload->>'contract_reference', '')), ''),
      nullif(trim(coalesce(_payload->>'sponsor_category', '')), ''),
      active_from_value,
      active_until_value,
      nullif(trim(coalesce(_payload->>'notes', '')), ''),
      active_value,
      actor_id,
      actor_id
    ) RETURNING * INTO stakeholder_row;
  ELSE
    SELECT * INTO stakeholder_row
    FROM public.venue_stakeholders
    WHERE id = _stakeholder_id AND org_id = _org_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_STAKEHOLDER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF _expected_version IS NULL OR stakeholder_row.version <> _expected_version THEN
      RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF (NOT active_value OR relationship_value NOT IN ('patrocinador', 'parceiro'))
      AND EXISTS (
        SELECT 1
        FROM public.venue_counterpart_agreements agreement
        WHERE agreement.org_id = _org_id
          AND agreement.stakeholder_id = stakeholder_row.id
          AND agreement.status <> 'encerrado'
      ) THEN
      RAISE EXCEPTION 'VENUE_STAKEHOLDER_ACTIVE_AGREEMENTS' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.venue_events event
      WHERE event.org_id = _org_id
        AND event.status NOT IN ('concluido', 'cancelado', 'recusado')
        AND (
          (
            NOT active_value
            AND (
              event.sponsor_id = stakeholder_row.id
              OR event.responsible_organization_id = stakeholder_row.id
            )
          )
          OR (
            relationship_value NOT IN ('patrocinador', 'parceiro')
            AND event.sponsor_id = stakeholder_row.id
          )
        )
    ) THEN
      RAISE EXCEPTION 'VENUE_STAKEHOLDER_ACTIVE_EVENTS' USING ERRCODE = '23514';
    END IF;
    before_row := to_jsonb(stakeholder_row);

    UPDATE public.venue_stakeholders
    SET
      legal_name = legal_name_value,
      trade_name = trade_name_value,
      document_identifier = document_value,
      contact_name = nullif(trim(coalesce(_payload->>'contact_name', '')), ''),
      email = nullif(lower(trim(coalesce(_payload->>'email', ''))), ''),
      phone = nullif(trim(coalesce(_payload->>'phone', '')), ''),
      relationship_type = relationship_value,
      contract_reference = nullif(trim(coalesce(_payload->>'contract_reference', '')), ''),
      sponsor_category = nullif(trim(coalesce(_payload->>'sponsor_category', '')), ''),
      active_from = active_from_value,
      active_until = active_until_value,
      notes = nullif(trim(coalesce(_payload->>'notes', '')), ''),
      active = active_value,
      updated_by = actor_id,
      version = version + 1
    WHERE id = _stakeholder_id
    RETURNING * INTO stakeholder_row;
  END IF;

  PERFORM public.venue_log_audit(
    _org_id,
    'venue_stakeholder',
    stakeholder_row.id,
    CASE WHEN _stakeholder_id IS NULL THEN 'create'::public.audit_action ELSE 'update'::public.audit_action END,
    before_row,
    to_jsonb(stakeholder_row),
    CASE WHEN _stakeholder_id IS NULL THEN 'stakeholder_created' ELSE 'stakeholder_updated' END,
    nullif(trim(coalesce(_payload->>'change_reason', '')), ''),
    _idempotency_key
  );

  result := jsonb_build_object(
    'stakeholder_id', stakeholder_row.id,
    'version', stakeholder_row.version,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_upsert_agreement(
  _org_id uuid,
  _agreement_id uuid,
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
  operation_name text := CASE
    WHEN _agreement_id IS NULL THEN 'venue_create_agreement'
    ELSE 'venue_update_agreement'
  END;
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'agreement_id', _agreement_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  agreement_row public.venue_counterpart_agreements%ROWTYPE;
  before_row jsonb;
  stakeholder_value uuid := nullif(_payload->>'stakeholder_id', '')::uuid;
  space_value uuid := nullif(_payload->>'space_id', '')::uuid;
  contract_value text := trim(coalesce(_payload->>'contract_reference', ''));
  valid_from_value date := nullif(_payload->>'valid_from', '')::date;
  valid_until_value date := nullif(_payload->>'valid_until', '')::date;
  unit_value text := _payload->>'unit_type';
  granted_value numeric := nullif(_payload->>'granted_quantity', '')::numeric;
  status_value text := coalesce(nullif(_payload->>'status', ''), 'ativo');
  no_show_consumes_value boolean := coalesce(
    (_payload->>'no_show_consumes_allowance')::boolean,
    false
  );
  allowed_types_value text[] := ARRAY(
    SELECT jsonb_array_elements_text(coalesce(_payload->'allowed_event_types', '[]'::jsonb))
  );
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_counterparts_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  IF stakeholder_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.venue_stakeholders
    WHERE id = stakeholder_value AND org_id = _org_id AND active
      AND relationship_type IN ('patrocinador', 'parceiro')
  ) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_STAKEHOLDER_INVALID' USING ERRCODE = '23514';
  END IF;
  IF space_value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_spaces WHERE id = space_value AND org_id = _org_id AND active
  ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF length(contract_value) < 2 OR valid_from_value IS NULL OR valid_until_value IS NULL
    OR valid_until_value < valid_from_value THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_PERIOD_INVALID' USING ERRCODE = '22007';
  END IF;
  IF unit_value NOT IN ('evento', 'dia', 'hora', 'turno', 'data_exclusiva', 'capacidade', 'monetario', 'outro')
    OR granted_value IS NULL OR granted_value <= 0 THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_QUANTITY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF status_value NOT IN ('rascunho', 'ativo', 'suspenso', 'encerrado') THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(allowed_types_value) AS allowed(event_type)
    WHERE allowed.event_type NOT IN (
      'institucional', 'patrocinador', 'comissao', 'corporativo', 'cultural', 'comercial',
      'cerimonial', 'reuniao', 'jantar', 'lancamento', 'show', 'externo', 'interno', 'outro'
    )
  ) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_EVENT_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF _agreement_id IS NULL THEN
    INSERT INTO public.venue_counterpart_agreements (
      org_id, stakeholder_id, space_id, contract_reference, valid_from, valid_until,
      benefit_type, unit_type, granted_quantity, value_per_excess_unit, requires_approval,
      no_show_consumes_allowance,
      allowed_event_types, restrictions, responsible_approver_id, document_path, notes,
      status, created_by, updated_by
    ) VALUES (
      _org_id,
      stakeholder_value,
      space_value,
      contract_value,
      valid_from_value,
      valid_until_value,
      trim(coalesce(_payload->>'benefit_type', '')),
      unit_value,
      granted_value,
      nullif(_payload->>'value_per_excess_unit', '')::numeric,
      coalesce((_payload->>'requires_approval')::boolean, true),
      no_show_consumes_value,
      allowed_types_value,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(_payload->'restrictions', '[]'::jsonb))),
      nullif(_payload->>'responsible_approver_id', '')::uuid,
      nullif(trim(coalesce(_payload->>'document_path', '')), ''),
      nullif(trim(coalesce(_payload->>'notes', '')), ''),
      status_value,
      actor_id,
      actor_id
    ) RETURNING * INTO agreement_row;
  ELSE
    SELECT * INTO agreement_row
    FROM public.venue_counterpart_agreements
    WHERE id = _agreement_id AND org_id = _org_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_COUNTERPART_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF _expected_version IS NULL OR agreement_row.version <> _expected_version THEN
      RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF (agreement_row.stakeholder_id IS DISTINCT FROM stakeholder_value
      OR agreement_row.unit_type IS DISTINCT FROM unit_value)
      AND EXISTS (
        SELECT 1 FROM public.venue_counterpart_usage usage
        WHERE usage.agreement_id = agreement_row.id AND usage.superseded_at IS NULL
      ) THEN
      RAISE EXCEPTION 'VENUE_COUNTERPART_LEDGER_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF agreement_row.no_show_consumes_allowance IS DISTINCT FROM no_show_consumes_value
      AND EXISTS (
        SELECT 1
        FROM public.venue_counterpart_usage usage
        WHERE usage.agreement_id = agreement_row.id
          AND usage.usage_state = 'no_show'
      ) THEN
      RAISE EXCEPTION 'VENUE_COUNTERPART_NO_SHOW_POLICY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF status_value <> 'ativo' AND EXISTS (
      SELECT 1 FROM public.venue_counterpart_usage usage
      WHERE usage.agreement_id = agreement_row.id
        AND usage.superseded_at IS NULL
        AND usage.usage_state IN ('pendente', 'reservado')
    ) THEN
      RAISE EXCEPTION 'VENUE_COUNTERPART_ACTIVE_USAGE_EXISTS' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.venue_counterpart_usage usage
      JOIN public.venue_events linked_event ON linked_event.id = usage.event_id
      WHERE usage.agreement_id = agreement_row.id
        AND usage.superseded_at IS NULL
        AND usage.usage_state IN ('reservado', 'consumido', 'no_show')
        AND (
          (linked_event.start_at AT TIME ZONE 'America/Sao_Paulo')::date < valid_from_value
          OR (linked_event.end_at AT TIME ZONE 'America/Sao_Paulo')::date > valid_until_value
          OR (cardinality(allowed_types_value) > 0 AND NOT linked_event.event_type = ANY(allowed_types_value))
          OR (
            space_value IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.venue_event_spaces allocation
              WHERE allocation.event_id = linked_event.id AND allocation.space_id = space_value
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'VENUE_COUNTERPART_CHANGE_INVALIDATES_ACTIVE_USAGE' USING ERRCODE = '23514';
    END IF;
    before_row := to_jsonb(agreement_row);

    UPDATE public.venue_counterpart_agreements
    SET
      stakeholder_id = stakeholder_value,
      space_id = space_value,
      contract_reference = contract_value,
      valid_from = valid_from_value,
      valid_until = valid_until_value,
      benefit_type = trim(coalesce(_payload->>'benefit_type', '')),
      unit_type = unit_value,
      granted_quantity = granted_value,
      value_per_excess_unit = nullif(_payload->>'value_per_excess_unit', '')::numeric,
      requires_approval = coalesce((_payload->>'requires_approval')::boolean, true),
      no_show_consumes_allowance = no_show_consumes_value,
      allowed_event_types = allowed_types_value,
      restrictions = ARRAY(SELECT jsonb_array_elements_text(coalesce(_payload->'restrictions', '[]'::jsonb))),
      responsible_approver_id = nullif(_payload->>'responsible_approver_id', '')::uuid,
      document_path = nullif(trim(coalesce(_payload->>'document_path', '')), ''),
      notes = nullif(trim(coalesce(_payload->>'notes', '')), ''),
      status = status_value,
      updated_by = actor_id,
      version = version + 1
    WHERE id = _agreement_id
    RETURNING * INTO agreement_row;
  END IF;

  IF length(trim(agreement_row.benefit_type)) < 2 THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_BENEFIT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF agreement_row.value_per_excess_unit IS NOT NULL AND agreement_row.value_per_excess_unit < 0 THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_EXCESS_VALUE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF agreement_row.responsible_approver_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.org_members member
      WHERE member.org_id = _org_id
        AND member.user_id = agreement_row.responsible_approver_id
        AND member.is_active
        AND (
          member.role::text = 'admin'
          OR (
            EXISTS (
              SELECT 1
              FROM public.user_capabilities capability
              WHERE capability.org_id = _org_id
                AND capability.user_id = agreement_row.responsible_approver_id
                AND capability.capability IN ('venue_events_approve', 'venue_events_full_access')
            )
            AND EXISTS (
              SELECT 1
              FROM public.user_capabilities capability
              WHERE capability.org_id = _org_id
                AND capability.user_id = agreement_row.responsible_approver_id
                AND capability.capability IN ('venue_excess_approve', 'venue_events_full_access')
            )
          )
        )
    ) THEN
    RAISE EXCEPTION 'VENUE_RESPONSIBLE_APPROVER_INVALID' USING ERRCODE = '23514';
  END IF;

  PERFORM public.venue_recalculate_agreement_excess(
    agreement_row.id,
    _idempotency_key,
    nullif(trim(coalesce(_payload->>'change_reason', '')), '')
  );
  IF _agreement_id IS NOT NULL
    AND agreement_row.requires_approval
    AND granted_value < (before_row->>'granted_quantity')::numeric
    AND EXISTS (
      SELECT 1
      FROM public.venue_counterpart_usage usage
      WHERE usage.agreement_id = agreement_row.id
        AND usage.superseded_at IS NULL
        AND (
          usage.usage_state IN ('reservado', 'consumido')
          OR (
            usage.usage_state = 'no_show'
            AND agreement_row.no_show_consumes_allowance
          )
        )
        AND usage.excess_quantity > 0
        AND (
          usage.excess_approval_status NOT IN ('aprovado', 'cobranca_adicional')
          OR usage.approved_excess_quantity <> usage.excess_quantity
        )
    ) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_BELOW_COMMITTED_USAGE' USING ERRCODE = '23514';
  END IF;
  PERFORM public.venue_log_audit(
    _org_id,
    'venue_counterpart_agreement',
    agreement_row.id,
    CASE WHEN _agreement_id IS NULL THEN 'create'::public.audit_action ELSE 'update'::public.audit_action END,
    before_row,
    to_jsonb(agreement_row),
    CASE WHEN _agreement_id IS NULL THEN 'agreement_created' ELSE 'agreement_updated' END,
    nullif(trim(coalesce(_payload->>'change_reason', '')), ''),
    _idempotency_key
  );

  result := jsonb_build_object(
    'agreement_id', agreement_row.id,
    'version', agreement_row.version,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'VENUE_DUPLICATE_AGREEMENT' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_upsert_space(
  _org_id uuid,
  _space_id uuid,
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
  operation_name text := CASE
    WHEN _space_id IS NULL THEN 'venue_create_space'
    ELSE 'venue_update_space'
  END;
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'space_id', _space_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  space_row public.venue_spaces%ROWTYPE;
  before_row jsonb;
  before_booking_units jsonb;
  after_booking_units jsonb;
  previous_parent_id uuid;
  previous_slug text;
  booking_unit_id uuid;
  canonical_booking_unit_id uuid;
  parent_value uuid := nullif(_payload->>'parent_space_id', '')::uuid;
  slug_value text := lower(trim(coalesce(_payload->>'slug', '')));
  name_value text := trim(coalesce(_payload->>'name', ''));
  type_value text := lower(trim(coalesce(_payload->>'type', '')));
  capacity_value integer := nullif(_payload->>'capacity', '')::integer;
  opening_hours_value jsonb := coalesce(
    _payload->'standard_opening_hours',
    '{"timezone":"America/Sao_Paulo","daily_start":"08:00","daily_end":"22:00"}'::jsonb
  );
  timezone_value text;
  daily_start_value text;
  daily_end_value text;
  setup_minutes_value integer := coalesce(
    nullif(_payload->>'required_setup_minutes', '')::integer,
    60
  );
  teardown_minutes_value integer := coalesce(
    nullif(_payload->>'required_teardown_minutes', '')::integer,
    60
  );
  active_value boolean := coalesce((_payload->>'active')::boolean, true);
  change_reason text := nullif(trim(coalesce(_payload->>'change_reason', '')), '');
  available_areas_value text[];
  restrictions_value text[];
  allowed_event_types_value text[];
  available_resources_value text[];
  material_changed boolean := false;
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_venues_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(
    _org_id,
    operation_name,
    _idempotency_key,
    request_payload
  );
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  IF jsonb_typeof(coalesce(_payload->'available_areas', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(coalesce(_payload->'restrictions', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(coalesce(_payload->'allowed_event_types', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(coalesce(_payload->'available_resources', '[]'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'VENUE_SPACE_ARRAY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        coalesce(_payload->'available_areas', '[]'::jsonb)
      ) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'string'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        coalesce(_payload->'restrictions', '[]'::jsonb)
      ) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'string'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        coalesce(_payload->'allowed_event_types', '[]'::jsonb)
      ) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'string'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        coalesce(_payload->'available_resources', '[]'::jsonb)
      ) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'string'
    )
  THEN
    RAISE EXCEPTION 'VENUE_SPACE_ARRAY_INVALID' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(trim(item.value) ORDER BY item.ordinality), '{}')
  INTO available_areas_value
  FROM jsonb_array_elements_text(
    coalesce(_payload->'available_areas', '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality);
  SELECT coalesce(array_agg(trim(item.value) ORDER BY item.ordinality), '{}')
  INTO restrictions_value
  FROM jsonb_array_elements_text(
    coalesce(_payload->'restrictions', '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality);
  SELECT coalesce(array_agg(trim(item.value) ORDER BY item.ordinality), '{}')
  INTO allowed_event_types_value
  FROM jsonb_array_elements_text(
    coalesce(_payload->'allowed_event_types', '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality);
  SELECT coalesce(array_agg(trim(item.value) ORDER BY item.ordinality), '{}')
  INTO available_resources_value
  FROM jsonb_array_elements_text(
    coalesce(_payload->'available_resources', '[]'::jsonb)
  ) WITH ORDINALITY AS item(value, ordinality);

  IF slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(slug_value) < 2 OR length(slug_value) > 80 THEN
    RAISE EXCEPTION 'VENUE_SPACE_SLUG_INVALID' USING ERRCODE = '23514';
  END IF;
  IF length(name_value) < 2 OR length(name_value) > 160
    OR type_value !~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
    OR length(type_value) < 2 OR length(type_value) > 60 THEN
    RAISE EXCEPTION 'VENUE_SPACE_IDENTITY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF capacity_value IS NOT NULL AND (capacity_value <= 0 OR capacity_value > 1000000) THEN
    RAISE EXCEPTION 'VENUE_SPACE_CAPACITY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF length(coalesce(_payload->>'description', '')) > 4000
    OR length(coalesce(_payload->>'location', '')) > 240
    OR length(coalesce(_payload->>'default_responsible_team', '')) > 160
    OR length(coalesce(_payload->>'internal_notes', '')) > 8000 THEN
    RAISE EXCEPTION 'VENUE_SPACE_TEXT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF setup_minutes_value < 0 OR setup_minutes_value > 10080
    OR teardown_minutes_value < 0 OR teardown_minutes_value > 10080 THEN
    RAISE EXCEPTION 'VENUE_SPACE_OPERATION_TIME_INVALID' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(opening_hours_value) <> 'object' THEN
    RAISE EXCEPTION 'VENUE_SPACE_OPENING_HOURS_INVALID' USING ERRCODE = '23514';
  END IF;

  timezone_value := coalesce(
    nullif(trim(opening_hours_value->>'timezone'), ''),
    'America/Sao_Paulo'
  );
  daily_start_value := coalesce(
    nullif(trim(opening_hours_value->>'daily_start'), ''),
    '08:00'
  );
  daily_end_value := coalesce(
    nullif(trim(opening_hours_value->>'daily_end'), ''),
    '22:00'
  );
  IF daily_start_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR daily_end_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR daily_start_value::time >= daily_end_value::time
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_timezone_names timezone
      WHERE timezone.name = timezone_value
    ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_OPENING_HOURS_INVALID' USING ERRCODE = '23514';
  END IF;
  opening_hours_value := jsonb_build_object(
    'timezone', timezone_value,
    'daily_start', daily_start_value,
    'daily_end', daily_end_value
  );

  IF cardinality(available_areas_value) > 50
    OR cardinality(restrictions_value) > 50
    OR cardinality(allowed_event_types_value) > 30
    OR cardinality(available_resources_value) > 50
    OR EXISTS (
      SELECT 1 FROM unnest(available_areas_value) AS entry(value)
      WHERE entry.value = '' OR length(entry.value) > 160
    )
    OR EXISTS (
      SELECT 1 FROM unnest(restrictions_value) AS entry(value)
      WHERE entry.value = '' OR length(entry.value) > 500
    )
    OR EXISTS (
      SELECT 1 FROM unnest(available_resources_value) AS entry(value)
      WHERE entry.value = '' OR length(entry.value) > 80
    )
    OR cardinality(available_areas_value) <> (
      SELECT count(DISTINCT lower(entry.value))
      FROM unnest(available_areas_value) AS entry(value)
    )
    OR cardinality(restrictions_value) <> (
      SELECT count(DISTINCT lower(entry.value))
      FROM unnest(restrictions_value) AS entry(value)
    )
    OR cardinality(allowed_event_types_value) <> (
      SELECT count(DISTINCT entry.value)
      FROM unnest(allowed_event_types_value) AS entry(value)
    )
    OR cardinality(available_resources_value) <> (
      SELECT count(DISTINCT lower(entry.value))
      FROM unnest(available_resources_value) AS entry(value)
    ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_ARRAY_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(allowed_event_types_value) AS entry(value)
    WHERE entry.value NOT IN (
      'institucional', 'patrocinador', 'comissao', 'corporativo', 'cultural', 'comercial',
      'cerimonial', 'reuniao', 'jantar', 'lancamento', 'show', 'externo', 'interno', 'outro'
    )
  ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_EVENT_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(available_resources_value) AS entry(value)
    WHERE entry.value NOT IN (
      'mesas', 'cadeiras', 'palco', 'som', 'iluminacao', 'energia', 'limpeza',
      'seguranca', 'recepcao', 'catering', 'cozinha', 'audiovisual',
      'estacionamento', 'acessibilidade', 'sinalizacao', 'equipe_tecnica'
    )
  ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_RESOURCE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.venue_spaces existing
    WHERE existing.org_id = _org_id
      AND existing.slug = slug_value
      AND existing.id IS DISTINCT FROM _space_id
  ) THEN
    RAISE EXCEPTION 'VENUE_DUPLICATE_SPACE' USING ERRCODE = '23505';
  END IF;
  IF parent_value IS NOT NULL AND (
    parent_value = _space_id
    OR NOT EXISTS (
      SELECT 1
      FROM public.venue_spaces parent
      WHERE parent.org_id = _org_id
        AND parent.id = parent_value
        AND parent.active
    )
  ) THEN
    RAISE EXCEPTION 'VENUE_PARENT_SPACE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF parent_value IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.venue_space_booking_units mapping
    JOIN public.venue_booking_units unit
      ON unit.org_id = mapping.org_id
     AND unit.id = mapping.booking_unit_id
     AND unit.active
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = parent_value
  ) THEN
    RAISE EXCEPTION 'VENUE_PARENT_BOOKING_UNIT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF _space_id IS NOT NULL AND parent_value IS NOT NULL AND EXISTS (
    WITH RECURSIVE descendants AS (
      SELECT child.id
      FROM public.venue_spaces child
      WHERE child.org_id = _org_id
        AND child.parent_space_id = _space_id
      UNION
      SELECT child.id
      FROM public.venue_spaces child
      JOIN descendants ancestor ON child.parent_space_id = ancestor.id
      WHERE child.org_id = _org_id
    )
    SELECT 1 FROM descendants WHERE id = parent_value
  ) THEN
    RAISE EXCEPTION 'VENUE_SPACE_HIERARCHY_CYCLE' USING ERRCODE = '23514';
  END IF;

  IF _space_id IS NULL THEN
    INSERT INTO public.venue_spaces (
      org_id, parent_space_id, slug, name, type, description, capacity, location,
      available_areas, restrictions, allowed_event_types, standard_opening_hours,
      required_setup_minutes, required_teardown_minutes, default_responsible_team,
      available_resources, internal_notes, active, created_by, updated_by
    ) VALUES (
      _org_id,
      parent_value,
      slug_value,
      name_value,
      type_value,
      nullif(trim(coalesce(_payload->>'description', '')), ''),
      capacity_value,
      nullif(trim(coalesce(_payload->>'location', '')), ''),
      available_areas_value,
      restrictions_value,
      allowed_event_types_value,
      opening_hours_value,
      setup_minutes_value,
      teardown_minutes_value,
      nullif(trim(coalesce(_payload->>'default_responsible_team', '')), ''),
      available_resources_value,
      nullif(trim(coalesce(_payload->>'internal_notes', '')), ''),
      active_value,
      actor_id,
      actor_id
    )
    RETURNING * INTO space_row;
  ELSE
    SELECT * INTO space_row
    FROM public.venue_spaces
    WHERE id = _space_id AND org_id = _org_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VENUE_SPACE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF _expected_version IS NULL OR space_row.version <> _expected_version THEN
      RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF length(coalesce(change_reason, '')) < 8 THEN
      RAISE EXCEPTION 'VENUE_SPACE_CHANGE_REASON_REQUIRED' USING ERRCODE = '23514';
    END IF;

    previous_parent_id := space_row.parent_space_id;
    previous_slug := space_row.slug;
    before_row := to_jsonb(space_row);
    material_changed := previous_parent_id IS DISTINCT FROM parent_value
      OR space_row.type IS DISTINCT FROM type_value
      OR space_row.capacity IS DISTINCT FROM capacity_value
      OR space_row.location IS DISTINCT FROM nullif(trim(coalesce(_payload->>'location', '')), '')
      OR space_row.available_areas IS DISTINCT FROM available_areas_value
      OR space_row.restrictions IS DISTINCT FROM restrictions_value
      OR space_row.allowed_event_types IS DISTINCT FROM allowed_event_types_value
      OR space_row.standard_opening_hours IS DISTINCT FROM opening_hours_value
      OR space_row.required_setup_minutes IS DISTINCT FROM setup_minutes_value
      OR space_row.required_teardown_minutes IS DISTINCT FROM teardown_minutes_value
      OR space_row.default_responsible_team IS DISTINCT FROM nullif(
        trim(coalesce(_payload->>'default_responsible_team', '')),
        ''
      )
      OR space_row.available_resources IS DISTINCT FROM available_resources_value
      OR space_row.active IS DISTINCT FROM active_value;
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'booking_unit_id', unit.id,
          'slug', unit.slug,
          'name', unit.name,
          'active', unit.active
        )
        ORDER BY unit.slug, unit.id
      ),
      '[]'::jsonb
    )
    INTO before_booking_units
    FROM public.venue_space_booking_units mapping
    JOIN public.venue_booking_units unit
      ON unit.org_id = mapping.org_id
     AND unit.id = mapping.booking_unit_id
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = space_row.id;
    SELECT unit.id
    INTO canonical_booking_unit_id
    FROM public.venue_space_booking_units mapping
    JOIN public.venue_booking_units unit
      ON unit.org_id = mapping.org_id
     AND unit.id = mapping.booking_unit_id
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = space_row.id
      AND unit.slug = previous_slug || '-integral'
    LIMIT 1;

    IF material_changed AND EXISTS (
      SELECT 1
      FROM public.venue_event_spaces allocation
      JOIN public.venue_events event
        ON event.org_id = allocation.org_id
       AND event.id = allocation.event_id
      WHERE allocation.org_id = _org_id
        AND event.status NOT IN ('concluido', 'cancelado', 'recusado')
        AND (
          allocation.space_id = space_row.id
          OR EXISTS (
            SELECT 1
            FROM public.venue_space_booking_units target_mapping
            JOIN public.venue_space_booking_units allocated_mapping
              ON allocated_mapping.org_id = target_mapping.org_id
             AND allocated_mapping.booking_unit_id = target_mapping.booking_unit_id
            WHERE target_mapping.org_id = _org_id
              AND target_mapping.space_id = space_row.id
              AND allocated_mapping.space_id = allocation.space_id
          )
        )
    ) THEN
      RAISE EXCEPTION 'VENUE_SPACE_ACTIVE_RESERVATIONS' USING ERRCODE = '23514';
    END IF;
    IF (NOT active_value OR previous_parent_id IS DISTINCT FROM parent_value)
      AND EXISTS (
      SELECT 1
      FROM public.venue_spaces child
      WHERE child.org_id = _org_id
        AND child.parent_space_id = space_row.id
        AND child.active
    ) THEN
      RAISE EXCEPTION 'VENUE_SPACE_ACTIVE_CHILDREN' USING ERRCODE = '23514';
    END IF;
    IF previous_slug IS DISTINCT FROM slug_value
      AND canonical_booking_unit_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.venue_booking_units unit
        WHERE unit.org_id = _org_id
          AND unit.slug = slug_value || '-integral'
          AND unit.id <> canonical_booking_unit_id
      ) THEN
      RAISE EXCEPTION 'VENUE_DUPLICATE_BOOKING_UNIT' USING ERRCODE = '23505';
    END IF;

    UPDATE public.venue_spaces
    SET
      parent_space_id = parent_value,
      slug = slug_value,
      name = name_value,
      type = type_value,
      description = nullif(trim(coalesce(_payload->>'description', '')), ''),
      capacity = capacity_value,
      location = nullif(trim(coalesce(_payload->>'location', '')), ''),
      available_areas = available_areas_value,
      restrictions = restrictions_value,
      allowed_event_types = allowed_event_types_value,
      standard_opening_hours = opening_hours_value,
      required_setup_minutes = setup_minutes_value,
      required_teardown_minutes = teardown_minutes_value,
      default_responsible_team = nullif(
        trim(coalesce(_payload->>'default_responsible_team', '')),
        ''
      ),
      available_resources = available_resources_value,
      internal_notes = nullif(trim(coalesce(_payload->>'internal_notes', '')), ''),
      active = active_value,
      updated_by = actor_id,
      version = version + 1
    WHERE id = space_row.id
    RETURNING * INTO space_row;

    IF previous_parent_id IS DISTINCT FROM parent_value THEN
      DELETE FROM public.venue_space_booking_units
      WHERE org_id = _org_id AND space_id = space_row.id;
    ELSIF canonical_booking_unit_id IS NOT NULL THEN
      UPDATE public.venue_booking_units unit
      SET
        slug = slug_value || '-integral',
        name = name_value || ' — ocupação integral'
      WHERE unit.id = canonical_booking_unit_id
        AND unit.org_id = _org_id;
    END IF;
  END IF;

  IF space_row.active AND parent_value IS NOT NULL THEN
    INSERT INTO public.venue_space_booking_units (
      org_id,
      space_id,
      booking_unit_id
    )
    SELECT
      _org_id,
      space_row.id,
      parent_mapping.booking_unit_id
    FROM public.venue_space_booking_units parent_mapping
    JOIN public.venue_booking_units parent_unit
      ON parent_unit.org_id = parent_mapping.org_id
     AND parent_unit.id = parent_mapping.booking_unit_id
     AND parent_unit.active
    WHERE parent_mapping.org_id = _org_id
      AND parent_mapping.space_id = parent_value
    ON CONFLICT (space_id, booking_unit_id) DO NOTHING;
  END IF;

  IF space_row.active AND NOT EXISTS (
    SELECT 1
    FROM public.venue_space_booking_units mapping
    JOIN public.venue_booking_units unit
      ON unit.org_id = mapping.org_id
     AND unit.id = mapping.booking_unit_id
     AND unit.active
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = space_row.id
  ) THEN
    INSERT INTO public.venue_booking_units (
      org_id,
      slug,
      name,
      active
    ) VALUES (
      _org_id,
      space_row.slug || '-integral',
      space_row.name || ' — ocupação integral',
      true
    )
    ON CONFLICT (org_id, slug) DO UPDATE SET
      name = EXCLUDED.name,
      active = true
    RETURNING id INTO booking_unit_id;

    INSERT INTO public.venue_space_booking_units (
      org_id,
      space_id,
      booking_unit_id
    ) VALUES (
      _org_id,
      space_row.id,
      booking_unit_id
    )
    ON CONFLICT (space_id, booking_unit_id) DO NOTHING;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_unit_id', unit.id,
        'slug', unit.slug,
        'name', unit.name,
        'active', unit.active
      )
      ORDER BY unit.slug, unit.id
    ),
    '[]'::jsonb
  )
  INTO after_booking_units
  FROM public.venue_space_booking_units mapping
  JOIN public.venue_booking_units unit
    ON unit.org_id = mapping.org_id
   AND unit.id = mapping.booking_unit_id
  WHERE mapping.org_id = _org_id
    AND mapping.space_id = space_row.id;

  PERFORM public.venue_log_audit(
    _org_id,
    'venue_space',
    space_row.id,
    CASE
      WHEN _space_id IS NULL THEN 'create'::public.audit_action
      ELSE 'update'::public.audit_action
    END,
    CASE
      WHEN _space_id IS NULL THEN NULL
      ELSE before_row || jsonb_build_object('booking_units', before_booking_units)
    END,
    to_jsonb(space_row) || jsonb_build_object('booking_units', after_booking_units),
    CASE
      WHEN _space_id IS NULL THEN 'space_created'
      ELSE 'space_updated'
    END,
    change_reason,
    _idempotency_key
  );

  result := jsonb_build_object(
    'space_id', space_row.id,
    'version', space_row.version,
    'active', space_row.active,
    'booking_units', after_booking_units,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(
    _org_id,
    operation_name,
    _idempotency_key,
    result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_upsert_space_block(
  _org_id uuid,
  _block_id uuid,
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
  operation_name text := CASE WHEN _block_id IS NULL THEN 'venue_create_block' ELSE 'venue_update_block' END;
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'block_id', _block_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  block_row public.venue_space_blocks%ROWTYPE;
  before_row jsonb;
  space_value uuid := nullif(_payload->>'space_id', '')::uuid;
  starts_value timestamptz := nullif(_payload->>'starts_at', '')::timestamptz;
  ends_value timestamptz := nullif(_payload->>'ends_at', '')::timestamptz;
  type_value text := _payload->>'block_type';
  reason_value text := trim(coalesce(_payload->>'reason', ''));
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_venues_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venue_spaces WHERE id = space_value AND org_id = _org_id AND active
  ) THEN RAISE EXCEPTION 'VENUE_SPACE_INVALID' USING ERRCODE = '23514'; END IF;
  IF type_value NOT IN ('manutencao', 'indisponibilidade', 'data_exclusiva', 'bloqueio_operacional') THEN
    RAISE EXCEPTION 'VENUE_BLOCK_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF starts_value IS NULL OR ends_value IS NULL OR starts_value >= ends_value OR length(reason_value) < 8 THEN
    RAISE EXCEPTION 'VENUE_BLOCK_PERIOD_INVALID' USING ERRCODE = '22007';
  END IF;
  IF coalesce((_payload->>'active')::boolean, true) AND EXISTS (
    SELECT 1
    FROM public.venue_space_booking_units mapping
    JOIN public.venue_occupancies occupancy
      ON occupancy.org_id = mapping.org_id
     AND occupancy.booking_unit_id = mapping.booking_unit_id
     AND occupancy.active
    WHERE mapping.org_id = _org_id
      AND mapping.space_id = space_value
      AND occupancy.setup_start_at < ends_value
      AND starts_value < occupancy.teardown_end_at
  ) THEN
    RAISE EXCEPTION 'VENUE_BLOCK_CONFLICT' USING ERRCODE = '23P01';
  END IF;

  IF _block_id IS NULL THEN
    INSERT INTO public.venue_space_blocks (
      org_id, space_id, block_type, title, starts_at, ends_at, stakeholder_id,
      reason, active, created_by, updated_by
    ) VALUES (
      _org_id,
      space_value,
      type_value,
      trim(coalesce(_payload->>'title', '')),
      starts_value,
      ends_value,
      nullif(_payload->>'stakeholder_id', '')::uuid,
      reason_value,
      coalesce((_payload->>'active')::boolean, true),
      actor_id,
      actor_id
    ) RETURNING * INTO block_row;
  ELSE
    SELECT * INTO block_row
    FROM public.venue_space_blocks
    WHERE id = _block_id AND org_id = _org_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_BLOCK_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF _expected_version IS NULL OR block_row.version <> _expected_version THEN
      RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    before_row := to_jsonb(block_row);
    UPDATE public.venue_space_blocks
    SET
      space_id = space_value,
      block_type = type_value,
      title = trim(coalesce(_payload->>'title', '')),
      starts_at = starts_value,
      ends_at = ends_value,
      stakeholder_id = nullif(_payload->>'stakeholder_id', '')::uuid,
      reason = reason_value,
      active = coalesce((_payload->>'active')::boolean, true),
      updated_by = actor_id,
      version = version + 1
    WHERE id = _block_id
    RETURNING * INTO block_row;
  END IF;

  IF length(block_row.title) < 3 THEN
    RAISE EXCEPTION 'VENUE_BLOCK_TITLE_INVALID' USING ERRCODE = '23514';
  END IF;
  PERFORM public.venue_log_audit(
    _org_id,
    'venue_space_block',
    block_row.id,
    CASE WHEN _block_id IS NULL THEN 'create'::public.audit_action ELSE 'update'::public.audit_action END,
    before_row,
    to_jsonb(block_row),
    CASE WHEN _block_id IS NULL THEN 'block_created' ELSE 'block_updated' END,
    reason_value,
    _idempotency_key
  );
  result := jsonb_build_object('block_id', block_row.id, 'version', block_row.version, 'replayed', false);
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_update_checklist_item(
  _org_id uuid,
  _item_id uuid,
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
  operation_name constant text := 'venue_update_checklist_item';
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'item_id', _item_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  item_row public.venue_event_checklist_items%ROWTYPE;
  before_row jsonb;
  event_id_value uuid;
  event_state text;
  event_version integer;
  status_value text := _payload->>'status';
  note_value text := nullif(trim(coalesce(_payload->>'note', '')), '');
  responsible_value uuid := nullif(_payload->>'responsible_user_id', '')::uuid;
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_operations_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  SELECT event_id INTO event_id_value
  FROM public.venue_event_checklist_items
  WHERE id = _item_id AND org_id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_CHECKLIST_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT status INTO event_state
  FROM public.venue_events
  WHERE id = event_id_value AND org_id = _org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO item_row
  FROM public.venue_event_checklist_items
  WHERE id = _item_id AND org_id = _org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_CHECKLIST_ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _expected_version IS NULL OR item_row.version <> _expected_version THEN
    RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF event_state IN ('cancelado', 'recusado', 'bloqueado')
    OR (event_state = 'concluido' AND item_row.phase <> 'pos_evento') THEN
    RAISE EXCEPTION 'VENUE_EVENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF status_value NOT IN ('pendente', 'em_andamento', 'concluido', 'dispensado') THEN
    RAISE EXCEPTION 'VENUE_CHECKLIST_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF status_value = 'dispensado' AND length(coalesce(note_value, '')) < 8 THEN
    RAISE EXCEPTION 'VENUE_CHECKLIST_WAIVER_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF responsible_value IS NOT NULL AND NOT public.is_org_member(responsible_value, _org_id) THEN
    RAISE EXCEPTION 'VENUE_RESPONSIBLE_USER_INVALID' USING ERRCODE = '23514';
  END IF;

  before_row := to_jsonb(item_row);
  UPDATE public.venue_event_checklist_items
  SET
    status = status_value,
    note = note_value,
    responsible_user_id = responsible_value,
    deadline = nullif(_payload->>'deadline', '')::timestamptz,
    completed_at = CASE WHEN status_value IN ('concluido', 'dispensado') THEN now() ELSE NULL END,
    completed_by = CASE WHEN status_value IN ('concluido', 'dispensado') THEN actor_id ELSE NULL END,
    updated_by = actor_id,
    version = version + 1
  WHERE id = item_row.id
  RETURNING * INTO item_row;

  UPDATE public.venue_events
  SET updated_by = actor_id, version = version + 1
  WHERE id = item_row.event_id
  RETURNING version INTO event_version;

  PERFORM public.venue_log_audit(
    _org_id, 'venue_checklist_item', item_row.id, 'status_change'::public.audit_action,
    before_row, to_jsonb(item_row), 'checklist_status_changed', note_value, _idempotency_key
  );
  result := jsonb_build_object(
    'item_id', item_row.id,
    'event_id', item_row.event_id,
    'version', item_row.version,
    'event_version', event_version,
    'status', item_row.status,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_update_resource(
  _org_id uuid,
  _resource_id uuid,
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
  operation_name constant text := 'venue_update_resource';
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object(
    'resource_id', _resource_id,
    'expected_version', _expected_version
  );
  replay jsonb;
  result jsonb;
  resource_row public.venue_event_resources%ROWTYPE;
  before_row jsonb;
  event_id_value uuid;
  event_state text;
  event_version integer;
  confirmation_value text := _payload->>'confirmation_status';
  completion_value text := _payload->>'completion_status';
  notes_value text := nullif(trim(coalesce(_payload->>'notes', '')), '');
  responsible_value uuid := nullif(_payload->>'responsible_user_id', '')::uuid;
BEGIN
  actor_id := public.venue_assert_capability(_org_id, 'venue_operations_manage');
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text, 28701));
  replay := public.venue_begin_mutation(_org_id, operation_name, _idempotency_key, request_payload);
  IF (replay->>'replayed')::boolean THEN RETURN replay->'result'; END IF;

  SELECT event_id INTO event_id_value
  FROM public.venue_event_resources
  WHERE id = _resource_id AND org_id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_RESOURCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT status INTO event_state
  FROM public.venue_events
  WHERE id = event_id_value AND org_id = _org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO resource_row
  FROM public.venue_event_resources
  WHERE id = _resource_id AND org_id = _org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_RESOURCE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _expected_version IS NULL OR resource_row.version <> _expected_version THEN
    RAISE EXCEPTION 'VENUE_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF event_state IN ('concluido', 'cancelado', 'recusado', 'bloqueado') THEN
    RAISE EXCEPTION 'VENUE_EVENT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF confirmation_value NOT IN ('solicitado', 'confirmado', 'indisponivel', 'dispensado')
    OR completion_value NOT IN ('pendente', 'em_andamento', 'concluido', 'nao_aplicavel') THEN
    RAISE EXCEPTION 'VENUE_RESOURCE_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF confirmation_value IN ('indisponivel', 'dispensado')
    AND length(coalesce(notes_value, '')) < 8 THEN
    RAISE EXCEPTION 'VENUE_RESOURCE_UNAVAILABLE_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF
    (confirmation_value = 'confirmado' AND completion_value = 'nao_aplicavel')
    OR (confirmation_value = 'dispensado' AND completion_value <> 'nao_aplicavel')
    OR (confirmation_value IN ('solicitado', 'indisponivel') AND completion_value <> 'pendente')
  THEN
    RAISE EXCEPTION 'VENUE_RESOURCE_STATUS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF responsible_value IS NOT NULL AND NOT public.is_org_member(responsible_value, _org_id) THEN
    RAISE EXCEPTION 'VENUE_RESPONSIBLE_USER_INVALID' USING ERRCODE = '23514';
  END IF;

  before_row := to_jsonb(resource_row);
  UPDATE public.venue_event_resources
  SET
    confirmation_status = confirmation_value,
    completion_status = completion_value,
    responsible_team = nullif(trim(coalesce(_payload->>'responsible_team', '')), ''),
    responsible_user_id = responsible_value,
    notes = notes_value,
    updated_by = actor_id,
    version = version + 1
  WHERE id = resource_row.id
  RETURNING * INTO resource_row;

  UPDATE public.venue_events
  SET updated_by = actor_id, version = version + 1
  WHERE id = resource_row.event_id
  RETURNING version INTO event_version;

  PERFORM public.venue_log_audit(
    _org_id, 'venue_event_resource', resource_row.id, 'status_change'::public.audit_action,
    before_row, to_jsonb(resource_row), 'resource_status_changed', notes_value, _idempotency_key
  );
  result := jsonb_build_object(
    'resource_id', resource_row.id,
    'event_id', resource_row.event_id,
    'version', resource_row.version,
    'event_version', event_version,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_register_document(
  _org_id uuid,
  _event_id uuid,
  _idempotency_key uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  actor_id uuid;
  operation_name constant text := 'venue_register_document';
  request_payload jsonb := coalesce(_payload, '{}'::jsonb) || jsonb_build_object('event_id', _event_id);
  replay jsonb;
  result jsonb;
  event_row public.venue_events%ROWTYPE;
  document_row public.venue_event_documents%ROWTYPE;
  storage_path_value text := trim(coalesce(_payload->>'storage_path', ''));
  file_name_value text := trim(coalesce(_payload->>'file_name', ''));
  mime_value text := lower(trim(coalesce(_payload->>'mime_type', '')));
  size_value bigint := nullif(_payload->>'size_bytes', '')::bigint;
  sensitive_value boolean := coalesce((_payload->>'sensitive')::boolean, false);
  stored_size bigint;
  stored_mime text;
  document_created boolean := false;
  event_version integer;
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
  IF event_row.created_by <> actor_id
    AND NOT public.venue_has_capability(_org_id, 'venue_documents_manage')
    AND NOT public.venue_has_capability(_org_id, 'venue_events_manage') THEN
    RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF sensitive_value AND NOT public.venue_has_capability(_org_id, 'venue_documents_sensitive') THEN
    RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF strpos(storage_path_value, _org_id::text || '/' || _event_id::text || '/') <> 1
    OR length(file_name_value) < 1 OR length(file_name_value) > 240
    OR size_value IS NULL OR size_value <= 0 OR size_value > 20971520
    OR mime_value NOT IN (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) THEN
    RAISE EXCEPTION 'VENUE_DOCUMENT_INVALID' USING ERRCODE = '23514';
  END IF;
  SELECT
    nullif(object.metadata->>'size', '')::bigint,
    lower(nullif(object.metadata->>'mimetype', ''))
  INTO stored_size, stored_mime
  FROM storage.objects object
  WHERE object.bucket_id = 'venue-event-documents' AND object.name = storage_path_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENUE_DOCUMENT_UPLOAD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF stored_size IS NULL OR stored_mime IS NULL
    OR stored_size <> size_value OR stored_mime <> mime_value THEN
    RAISE EXCEPTION 'VENUE_DOCUMENT_METADATA_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO document_row
  FROM public.venue_event_documents
  WHERE storage_path = storage_path_value;
  IF NOT FOUND THEN
    INSERT INTO public.venue_event_documents (
      org_id, event_id, storage_path, file_name, mime_type, size_bytes,
      document_type, sensitive, uploaded_by
    ) VALUES (
      _org_id,
      _event_id,
      storage_path_value,
      file_name_value,
      mime_value,
      size_value,
      trim(coalesce(_payload->>'document_type', 'outro')),
      sensitive_value,
      actor_id
    ) RETURNING * INTO document_row;
    document_created := true;

    PERFORM public.venue_log_audit(
      _org_id, 'venue_event_document', document_row.id, 'create'::public.audit_action,
      NULL, to_jsonb(document_row), 'document_registered', NULL, _idempotency_key
    );
  ELSIF document_row.org_id <> _org_id OR document_row.event_id <> _event_id THEN
    RAISE EXCEPTION 'VENUE_DOCUMENT_PATH_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  IF document_created THEN
    UPDATE public.venue_events
    SET updated_by = actor_id, version = version + 1
    WHERE id = event_row.id
    RETURNING version INTO event_version;
  ELSE
    event_version := event_row.version;
  END IF;

  result := jsonb_build_object(
    'document_id', document_row.id,
    'event_id', document_row.event_id,
    'event_version', event_version,
    'replayed', false
  );
  RETURN public.venue_finish_mutation(_org_id, operation_name, _idempotency_key, result);
END;
$$;

REVOKE ALL ON FUNCTION public.venue_upsert_stakeholder(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_upsert_agreement(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_upsert_space(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_upsert_space_block(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_update_checklist_item(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_update_resource(uuid, uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.venue_register_document(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_upsert_stakeholder(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_upsert_agreement(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_upsert_space(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_upsert_space_block(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_update_checklist_item(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_update_resource(uuid, uuid, integer, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_register_document(uuid, uuid, uuid, jsonb) TO authenticated;

DO $$
DECLARE
  relation_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH relation_name IN ARRAY ARRAY[
      'venue_spaces',
      'venue_stakeholders',
      'venue_counterpart_agreements',
      'venue_events',
      'venue_event_spaces',
      'venue_event_responsibles',
      'venue_space_blocks',
      'venue_counterpart_usage',
      'venue_event_resources',
      'venue_event_checklist_items',
      'venue_event_documents',
      'venue_event_approvals'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = relation_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', relation_name);
      END IF;
    END LOOP;
  END IF;
END;
$$;