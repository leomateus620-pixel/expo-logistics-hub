-- Transactional API for Eventos Restaurante e Arena.
-- The functions below are the only supported write path for this domain.

CREATE OR REPLACE FUNCTION public.venue_assert_capability(_org_id uuid, _capability text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL OR NOT public.venue_has_capability(_org_id, _capability) THEN
    RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN actor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_log_audit(
  _org_id uuid,
  _entity text,
  _entity_id uuid,
  _action public.audit_action,
  _before jsonb,
  _after jsonb,
  _venue_action text,
  _reason text,
  _request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    org_id,
    actor_user_id,
    entity,
    entity_id,
    action,
    before_data,
    after_data
  ) VALUES (
    _org_id,
    auth.uid(),
    _entity,
    _entity_id,
    _action,
    _before,
    coalesce(_after, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'venue_action', _venue_action,
      'reason', nullif(trim(coalesce(_reason, '')), ''),
      'request_id', _request_id
    ))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_redact_stakeholder_snapshot(_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _snapshot IS NULL THEN NULL
    ELSE (
      _snapshot - ARRAY[
        'document_identifier',
        'contact_name',
        'email',
        'phone',
        'contract_reference',
        'notes',
        'reason'
      ]
    ) || jsonb_build_object(
      'document_identifier_present',
        nullif(trim(coalesce(_snapshot->>'document_identifier', '')), '') IS NOT NULL,
      'contact_name_present',
        nullif(trim(coalesce(_snapshot->>'contact_name', '')), '') IS NOT NULL,
      'email_present',
        nullif(trim(coalesce(_snapshot->>'email', '')), '') IS NOT NULL,
      'phone_present',
        nullif(trim(coalesce(_snapshot->>'phone', '')), '') IS NOT NULL,
      'contract_reference_present',
        nullif(trim(coalesce(_snapshot->>'contract_reference', '')), '') IS NOT NULL,
      'notes_present',
        nullif(trim(coalesce(_snapshot->>'notes', '')), '') IS NOT NULL,
      'reason_present',
        nullif(trim(coalesce(_snapshot->>'reason', '')), '') IS NOT NULL
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.venue_redact_document_snapshot(_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _snapshot IS NULL THEN NULL
    ELSE (
      _snapshot - ARRAY[
        'storage_path',
        'file_name',
        'mime_type',
        'size_bytes',
        'document_type'
      ]
    ) || jsonb_build_object('protected_document', true)
  END;
$$;

CREATE OR REPLACE FUNCTION public.venue_begin_mutation(
  _org_id uuid,
  _operation text,
  _idempotency_key uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  payload_hash text := md5(coalesce(_payload, '{}'::jsonb)::text);
  receipt public.venue_mutation_receipts%ROWTYPE;
  inserted_count integer := 0;
BEGIN
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'VENUE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.venue_mutation_receipts (
    org_id,
    actor_user_id,
    operation,
    idempotency_key,
    request_hash
  ) VALUES (
    _org_id,
    actor_id,
    _operation,
    _idempotency_key,
    payload_hash
  )
  ON CONFLICT (org_id, actor_user_id, operation, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT * INTO receipt
    FROM public.venue_mutation_receipts
    WHERE org_id = _org_id
      AND actor_user_id = actor_id
      AND operation = _operation
      AND idempotency_key = _idempotency_key
    FOR UPDATE;

    IF receipt.request_hash <> payload_hash THEN
      RAISE EXCEPTION 'VENUE_IDEMPOTENCY_MISMATCH' USING ERRCODE = '22000';
    END IF;
    IF receipt.result IS NULL THEN
      RAISE EXCEPTION 'VENUE_MUTATION_IN_PROGRESS' USING ERRCODE = '40001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'result', receipt.result || jsonb_build_object('replayed', true)
    );
  END IF;

  RETURN jsonb_build_object('replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_finish_mutation(
  _org_id uuid,
  _operation text,
  _idempotency_key uuid,
  _result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venue_mutation_receipts
  SET result = _result
  WHERE org_id = _org_id
    AND actor_user_id = auth.uid()
    AND operation = _operation
    AND idempotency_key = _idempotency_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENUE_IDEMPOTENCY_RECEIPT_MISSING' USING ERRCODE = 'P0001';
  END IF;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_get_permissions(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  capability_names constant text[] := ARRAY[
    'venue_events_access',
    'venue_events_create',
    'venue_events_manage',
    'venue_events_approve',
    'venue_events_cancel',
    'venue_events_conflict_override',
    'venue_events_restricted_view',
    'venue_counterparts_manage',
    'venue_excess_approve',
    'venue_sponsors_manage',
    'venue_venues_manage',
    'venue_operations_manage',
    'venue_documents_manage',
    'venue_documents_sensitive',
    'venue_reports_view',
    'venue_events_audit_view'
  ];
  capability_name text;
  permissions jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'VENUE_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  FOREACH capability_name IN ARRAY capability_names
  LOOP
    permissions := permissions || jsonb_build_object(
      capability_name,
      public.venue_has_capability(_org_id, capability_name)
    );
  END LOOP;
  RETURN permissions;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_get_audit_history(
  _org_id uuid,
  _event_id uuid DEFAULT NULL,
  _limit integer DEFAULT 100,
  _before timestamptz DEFAULT NULL,
  _before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  org_id uuid,
  actor_user_id uuid,
  entity text,
  entity_id uuid,
  action public.audit_action,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.venue_assert_capability(_org_id, 'venue_events_audit_view');

  IF _event_id IS NOT NULL
    AND NOT public.venue_can_view_event(_org_id, _event_id) THEN
    RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 500 THEN
    RAISE EXCEPTION 'VENUE_AUDIT_LIMIT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (_before IS NULL) IS DISTINCT FROM (_before_id IS NULL) THEN
    RAISE EXCEPTION 'VENUE_AUDIT_CURSOR_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    audit.id,
    audit.org_id,
    audit.actor_user_id,
    audit.entity,
    audit.entity_id,
    audit.action,
    CASE
      WHEN audit.entity = 'venue_stakeholder'
        THEN public.venue_redact_stakeholder_snapshot(audit.before_data)
      WHEN audit.entity = 'venue_event_document'
        AND audit.before_data->>'sensitive' = 'true'
        AND NOT public.venue_has_capability(_org_id, 'venue_documents_sensitive')
        THEN public.venue_redact_document_snapshot(audit.before_data)
      ELSE audit.before_data
    END,
    CASE
      WHEN audit.entity = 'venue_stakeholder'
        THEN public.venue_redact_stakeholder_snapshot(audit.after_data)
      WHEN audit.entity = 'venue_event_document'
        AND audit.after_data->>'sensitive' = 'true'
        AND NOT public.venue_has_capability(_org_id, 'venue_documents_sensitive')
        THEN public.venue_redact_document_snapshot(audit.after_data)
      ELSE audit.after_data
    END,
    audit.created_at
  FROM public.audit_log audit
  WHERE audit.org_id = _org_id
    AND audit.entity LIKE 'venue_%'
    AND (
      audit.entity NOT IN (
        'venue_event',
        'venue_counterpart_usage',
        'venue_checklist_item',
        'venue_event_resource',
        'venue_event_document',
        'venue_event_approval',
        'venue_event_responsible',
        'venue_event_space'
      )
      OR (
        audit.entity = 'venue_event'
        AND public.venue_can_view_event(_org_id, audit.entity_id)
      )
      OR (
        audit.entity <> 'venue_event'
        AND coalesce(
          audit.after_data->>'event_id',
          audit.before_data->>'event_id',
          ''
        ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND public.venue_can_view_event(
          _org_id,
          coalesce(
            audit.after_data->>'event_id',
            audit.before_data->>'event_id'
          )::uuid
        )
      )
    )
    AND (
      _before IS NULL
      OR (audit.created_at, audit.id) < (_before, _before_id)
    )
    AND (
      _event_id IS NULL
      OR (audit.entity = 'venue_event' AND audit.entity_id = _event_id)
      OR audit.before_data->>'event_id' = _event_id::text
      OR audit.after_data->>'event_id' = _event_id::text
    )
  ORDER BY audit.created_at DESC, audit.id DESC
  LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_calculate_usage_quantity(
  _unit_type text,
  _start_at timestamptz,
  _end_at timestamptz,
  _audience integer,
  _explicit_quantity numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  duration_hours numeric;
BEGIN
  CASE _unit_type
    WHEN 'evento', 'data_exclusiva' THEN
      RETURN 1;
    WHEN 'capacidade' THEN
      RETURN greatest(coalesce(_audience, 0), 0);
    WHEN 'monetario', 'outro' THEN
      RETURN greatest(coalesce(_explicit_quantity, 0), 0);
    WHEN 'dia' THEN
      IF _start_at IS NULL OR _end_at IS NULL THEN RETURN 1; END IF;
      RETURN greatest(
        1,
        ((_end_at AT TIME ZONE 'America/Sao_Paulo')::date
          - (_start_at AT TIME ZONE 'America/Sao_Paulo')::date) + 1
      );
    WHEN 'hora', 'turno' THEN
      IF _start_at IS NULL OR _end_at IS NULL THEN RETURN 0; END IF;
      duration_hours := greatest(extract(epoch FROM (_end_at - _start_at)) / 3600.0, 0);
      IF _unit_type = 'turno' THEN RETURN ceil(duration_hours / 4.0); END IF;
      RETURN round(duration_hours, 2);
    ELSE
      RAISE EXCEPTION 'VENUE_COUNTERPART_UNIT_INVALID' USING ERRCODE = '22023';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_check_availability(
  _org_id uuid,
  _space_ids uuid[],
  _setup_start_at timestamptz,
  _teardown_end_at timestamptz,
  _exclude_event_id uuid DEFAULT NULL,
  _audience integer DEFAULT NULL,
  _event_start_at timestamptz DEFAULT NULL,
  _event_end_at timestamptz DEFAULT NULL,
  _event_type text DEFAULT NULL
)
RETURNS TABLE (
  conflict_kind text,
  conflict_id uuid,
  space_id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  detail text,
  evidence_token text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND _setup_start_at < block.ends_at

  UNION ALL

  SELECT
    'capacity'::text,
    capacity.primary_space_id,
    capacity.primary_space_id,
    CASE
      WHEN capacity.space_count = 1 THEN 'Capacidade de ' || capacity.space_names || ' excedida'
      ELSE 'Capacidade combinada dos espaços excedida'
    END,
    _setup_start_at,
    _teardown_end_at,
    'Público informado de ' || _audience || ' pessoas para capacidade cadastrada de '
      || capacity.total_capacity || ' em ' || capacity.space_names || '.',
    md5('capacity:' || capacity.primary_space_id::text)
  FROM (
    SELECT
      (array_agg(space.id ORDER BY space.id))[1] AS primary_space_id,
      string_agg(space.name, ' + ' ORDER BY space.name) AS space_names,
      count(*) AS space_count,
      sum(space.capacity) AS total_capacity
    FROM public.venue_spaces space
    WHERE space.org_id = _org_id
      AND space.id = ANY(_space_ids)
      AND space.capacity IS NOT NULL
  ) capacity
  WHERE capacity.primary_space_id IS NOT NULL
    AND _audience IS NOT NULL
    AND _audience > capacity.total_capacity

  UNION ALL

  SELECT
    'policy'::text,
    space.id,
    space.id,
    'Tipo de evento não permitido em ' || space.name,
    _setup_start_at,
    _teardown_end_at,
    'O tipo ' || coalesce(_event_type, 'não informado') || ' não consta entre os usos permitidos do espaço.',
    md5('policy:event_type:' || space.id::text)
  FROM public.venue_spaces space
  WHERE space.org_id = _org_id
    AND space.id = ANY(_space_ids)
    AND _event_type IS NOT NULL
    AND cardinality(space.allowed_event_types) > 0
    AND NOT _event_type = ANY(space.allowed_event_types)

  UNION ALL

  SELECT
    'policy'::text,
    space.id,
    space.id,
    'Montagem insuficiente em ' || space.name,
    _setup_start_at,
    _event_start_at,
    'O espaço exige ao menos ' || space.required_setup_minutes || ' minutos de montagem.',
    md5('policy:setup:' || space.id::text)
  FROM public.venue_spaces space
  WHERE space.org_id = _org_id
    AND space.id = ANY(_space_ids)
    AND _event_start_at IS NOT NULL
    AND extract(epoch FROM (_event_start_at - _setup_start_at)) / 60 < space.required_setup_minutes

  UNION ALL

  SELECT
    'policy'::text,
    space.id,
    space.id,
    'Desmontagem insuficiente em ' || space.name,
    _event_end_at,
    _teardown_end_at,
    'O espaço exige ao menos ' || space.required_teardown_minutes || ' minutos de desmontagem.',
    md5('policy:teardown:' || space.id::text)
  FROM public.venue_spaces space
  WHERE space.org_id = _org_id
    AND space.id = ANY(_space_ids)
    AND _event_end_at IS NOT NULL
    AND extract(epoch FROM (_teardown_end_at - _event_end_at)) / 60 < space.required_teardown_minutes

  UNION ALL

  SELECT
    'policy'::text,
    space.id,
    space.id,
    'Horário fora da operação padrão de ' || space.name,
    _event_start_at,
    _event_end_at,
    'Faixa padrão cadastrada: '
      || coalesce(space.standard_opening_hours->>'daily_start', '08:00')
      || '–' || coalesce(space.standard_opening_hours->>'daily_end', '22:00') || '.',
    md5('policy:opening_hours:' || space.id::text)
  FROM public.venue_spaces space
  WHERE space.org_id = _org_id
    AND space.id = ANY(_space_ids)
    AND _event_start_at IS NOT NULL
    AND _event_end_at IS NOT NULL
    AND (
      (_event_start_at AT TIME ZONE coalesce(space.standard_opening_hours->>'timezone', 'America/Sao_Paulo'))::date
        IS DISTINCT FROM
      (_event_end_at AT TIME ZONE coalesce(space.standard_opening_hours->>'timezone', 'America/Sao_Paulo'))::date
      OR
      (_event_start_at AT TIME ZONE coalesce(space.standard_opening_hours->>'timezone', 'America/Sao_Paulo'))::time
        < coalesce(space.standard_opening_hours->>'daily_start', '08:00')::time
      OR (_event_end_at AT TIME ZONE coalesce(space.standard_opening_hours->>'timezone', 'America/Sao_Paulo'))::time
        > coalesce(space.standard_opening_hours->>'daily_end', '22:00')::time
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_clear_usage_excess_approval(
  _usage_id uuid,
  _request_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usage_row public.venue_counterpart_usage%ROWTYPE;
  updated_usage public.venue_counterpart_usage%ROWTYPE;
  before_usage jsonb;
BEGIN
  SELECT * INTO usage_row
  FROM public.venue_counterpart_usage
  WHERE id = _usage_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF usage_row.approved_excess_quantity = 0
    AND usage_row.excess_approval_status NOT IN ('aprovado', 'cobranca_adicional') THEN
    RETURN;
  END IF;

  before_usage := to_jsonb(usage_row);
  IF usage_row.approved_excess_quantity <> 0 THEN
    INSERT INTO public.venue_counterpart_ledger (
      org_id, agreement_id, event_id, usage_id, movement_type,
      reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
    ) VALUES (
      usage_row.org_id,
      usage_row.agreement_id,
      usage_row.event_id,
      usage_row.id,
      'revisao_contrato',
      0,
      0,
      -usage_row.approved_excess_quantity,
      coalesce(nullif(trim(_reason), ''), 'Autorização de excesso invalidada'),
      _request_id,
      auth.uid()
    );
  END IF;

  UPDATE public.venue_counterpart_usage
  SET
    approved_excess_quantity = 0,
    excess_approval_status = CASE
      WHEN excess_quantity > 0 THEN 'pendente'
      ELSE 'nao_necessario'
    END,
    approved_by = NULL,
    approved_at = NULL
  WHERE id = usage_row.id
  RETURNING * INTO updated_usage;

  PERFORM public.venue_log_audit(
    updated_usage.org_id,
    'venue_counterpart_usage',
    updated_usage.id,
    'update'::public.audit_action,
    before_usage,
    to_jsonb(updated_usage),
    'excess_approval_reversed',
    _reason,
    _request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_recalculate_agreement_excess(
  _agreement_id uuid,
  _request_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  granted numeric;
  no_show_consumes boolean := false;
  approval_required boolean := true;
  running_total numeric := 0;
  previous_excess numeric := 0;
  total_excess numeric;
  event_excess numeric;
  usage_row record;
  updated_usage public.venue_counterpart_usage%ROWTYPE;
  before_usage jsonb;
BEGIN
  SELECT granted_quantity, no_show_consumes_allowance, requires_approval
  INTO granted, no_show_consumes, approval_required
  FROM public.venue_counterpart_agreements
  WHERE id = _agreement_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  FOR usage_row IN
    SELECT usage.*
    FROM public.venue_counterpart_usage usage
    LEFT JOIN LATERAL (
      WITH running_commitment AS (
        SELECT
          ledger.id,
          ledger.created_at,
          sum(ledger.reserved_delta + ledger.consumed_delta) OVER (
            ORDER BY ledger.created_at, ledger.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS committed_total
        FROM public.venue_counterpart_ledger ledger
        WHERE ledger.usage_id = usage.id
      ),
      last_zero AS (
        SELECT commitment.id, commitment.created_at
        FROM running_commitment commitment
        WHERE commitment.committed_total = 0
        ORDER BY commitment.created_at DESC, commitment.id DESC
        LIMIT 1
      )
      SELECT commitment.id, commitment.created_at
      FROM running_commitment commitment
      LEFT JOIN last_zero zero ON true
      WHERE commitment.committed_total > 0
        AND (
          zero.id IS NULL
          OR (commitment.created_at, commitment.id) > (zero.created_at, zero.id)
        )
      ORDER BY commitment.created_at, commitment.id
      LIMIT 1
    ) commitment_anchor ON true
    WHERE usage.agreement_id = _agreement_id
      AND usage.superseded_at IS NULL
    ORDER BY
      CASE
        WHEN usage.usage_state IN ('reservado', 'consumido')
          OR (usage.usage_state = 'no_show' AND no_show_consumes)
          THEN 0
        WHEN usage.usage_state = 'pendente' THEN 1
        ELSE 2
      END,
      commitment_anchor.created_at NULLS LAST,
      commitment_anchor.id NULLS LAST,
      usage.created_at,
      usage.id
    FOR UPDATE OF usage
  LOOP
    before_usage := to_jsonb(usage_row);
    IF usage_row.usage_state = 'cancelado'
      OR (usage_row.usage_state = 'no_show' AND NOT no_show_consumes) THEN
      event_excess := 0;
    ELSE
      running_total := running_total + usage_row.requested_quantity;
      total_excess := greatest(running_total - granted, 0);
      event_excess := greatest(total_excess - previous_excess, 0);
      previous_excess := total_excess;
    END IF;

    UPDATE public.venue_counterpart_usage
    SET
      excess_quantity = event_excess,
      excess_approval_status = CASE
        WHEN event_excess = 0 THEN 'nao_necessario'
        WHEN NOT approval_required THEN 'nao_necessario'
        WHEN approved_excess_quantity = event_excess
          AND excess_approval_status IN ('aprovado', 'cobranca_adicional')
          THEN excess_approval_status
        ELSE 'pendente'
      END,
      approved_excess_quantity = CASE
        WHEN NOT approval_required THEN 0
        WHEN event_excess > 0
          AND approved_excess_quantity = event_excess
          AND excess_approval_status IN ('aprovado', 'cobranca_adicional')
          THEN approved_excess_quantity
        ELSE 0
      END,
      approved_by = CASE
        WHEN approval_required
          AND event_excess > 0
          AND approved_excess_quantity = event_excess
          THEN approved_by
        ELSE NULL
      END,
      approved_at = CASE
        WHEN approval_required
          AND event_excess > 0
          AND approved_excess_quantity = event_excess
          THEN approved_at
        ELSE NULL
      END
    WHERE id = usage_row.id
    RETURNING * INTO updated_usage;

    IF updated_usage.approved_excess_quantity
      IS DISTINCT FROM usage_row.approved_excess_quantity
      AND updated_usage.approved_excess_quantity - usage_row.approved_excess_quantity <> 0 THEN
      INSERT INTO public.venue_counterpart_ledger (
        org_id, agreement_id, event_id, usage_id, movement_type,
        reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
      ) VALUES (
        updated_usage.org_id,
        updated_usage.agreement_id,
        updated_usage.event_id,
        updated_usage.id,
        'revisao_contrato',
        0,
        0,
        updated_usage.approved_excess_quantity - usage_row.approved_excess_quantity,
        coalesce(nullif(trim(_reason), ''), 'Recalculo da distribuição da franquia'),
        _request_id,
        auth.uid()
      );
    END IF;

    IF to_jsonb(updated_usage) IS DISTINCT FROM before_usage THEN
      PERFORM public.venue_log_audit(
        updated_usage.org_id,
        'venue_counterpart_usage',
        updated_usage.id,
        'update'::public.audit_action,
        before_usage,
        to_jsonb(updated_usage),
        'agreement_allowance_recalculated',
        _reason,
        _request_id
      );
    END IF;
  END LOOP;

  IF approval_required AND EXISTS (
    SELECT 1
    FROM public.venue_counterpart_usage usage
    WHERE usage.agreement_id = _agreement_id
      AND usage.superseded_at IS NULL
      AND (
        usage.usage_state IN ('reservado', 'consumido')
        OR (usage.usage_state = 'no_show' AND no_show_consumes)
      )
      AND usage.excess_quantity > 0
      AND (
        usage.excess_approval_status NOT IN ('aprovado', 'cobranca_adicional')
        OR usage.approved_excess_quantity <> usage.excess_quantity
      )
  ) THEN
    RAISE EXCEPTION 'VENUE_COMMITTED_EXCESS_UNAPPROVED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_sync_event_counterpart(
  _event_id uuid,
  _request_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.venue_events%ROWTYPE;
  agreement_row public.venue_counterpart_agreements%ROWTYPE;
  usage_row public.venue_counterpart_usage%ROWTYPE;
  old_usage public.venue_counterpart_usage%ROWTYPE;
  desired_state text;
  desired_reserved numeric := 0;
  desired_consumed numeric := 0;
  current_reserved numeric := 0;
  current_consumed numeric := 0;
  usage_quantity numeric;
  usage_id uuid;
BEGIN
  SELECT * INTO event_row FROM public.venue_events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO old_usage
  FROM public.venue_counterpart_usage
  WHERE event_id = event_row.id
    AND superseded_at IS NULL
  FOR UPDATE;

  IF event_row.counterpart_agreement_id IS NULL THEN
    IF FOUND THEN
      SELECT coalesce(sum(reserved_delta), 0), coalesce(sum(consumed_delta), 0)
      INTO current_reserved, current_consumed
      FROM public.venue_counterpart_ledger ledger WHERE ledger.usage_id = old_usage.id;
      IF current_consumed <> 0 THEN
        RAISE EXCEPTION 'VENUE_COMPLETED_COUNTERPART_IMMUTABLE' USING ERRCODE = '23514';
      END IF;
      IF current_reserved <> 0 THEN
        INSERT INTO public.venue_counterpart_ledger (
          org_id, agreement_id, event_id, usage_id, movement_type,
          reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
        ) VALUES (
          event_row.org_id, old_usage.agreement_id, event_row.id, old_usage.id, 'liberacao',
          -current_reserved, 0, 0, coalesce(_reason, 'Contrapartida removida do evento'), _request_id, auth.uid()
        );
      END IF;
      PERFORM public.venue_clear_usage_excess_approval(
        old_usage.id,
        _request_id,
        coalesce(_reason, 'Contrapartida removida do evento')
      );
      UPDATE public.venue_counterpart_usage
      SET
        usage_state = 'cancelado',
        excess_quantity = 0,
        approved_excess_quantity = 0,
        excess_approval_status = 'nao_necessario',
        approved_by = NULL,
        approved_at = NULL,
        superseded_at = now()
      WHERE id = old_usage.id;
      PERFORM public.venue_recalculate_agreement_excess(old_usage.agreement_id, _request_id, _reason);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO agreement_row
  FROM public.venue_counterpart_agreements
  WHERE id = event_row.counterpart_agreement_id
    AND org_id = event_row.org_id
  FOR UPDATE;
  IF NOT FOUND OR agreement_row.status <> 'ativo' THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_NOT_ACTIVE' USING ERRCODE = '23514';
  END IF;
  IF event_row.sponsor_id IS DISTINCT FROM agreement_row.stakeholder_id THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_SPONSOR_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF agreement_row.space_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_event_spaces
    WHERE event_id = event_row.id AND space_id = agreement_row.space_id
  ) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_SPACE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF event_row.start_at IS NOT NULL AND (
    (event_row.start_at AT TIME ZONE 'America/Sao_Paulo')::date < agreement_row.valid_from
    OR (event_row.end_at AT TIME ZONE 'America/Sao_Paulo')::date > agreement_row.valid_until
  ) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_OUTSIDE_PERIOD' USING ERRCODE = '23514';
  END IF;
  IF cardinality(agreement_row.allowed_event_types) > 0
    AND NOT event_row.event_type = ANY(agreement_row.allowed_event_types) THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_EVENT_TYPE_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  usage_quantity := public.venue_calculate_usage_quantity(
    agreement_row.unit_type,
    event_row.start_at,
    event_row.end_at,
    coalesce(event_row.confirmed_audience, event_row.estimated_audience),
    event_row.counterpart_requested_quantity
  );
  IF usage_quantity <= 0 THEN
    RAISE EXCEPTION 'VENUE_COUNTERPART_QUANTITY_INVALID' USING ERRCODE = '23514';
  END IF;

  desired_state := CASE
    WHEN event_row.status IN ('cancelado', 'recusado') THEN 'cancelado'
    WHEN event_row.status = 'concluido' THEN 'consumido'
    WHEN event_row.status IN ('aprovado', 'confirmado', 'em_preparacao', 'em_andamento') THEN 'reservado'
    ELSE 'pendente'
  END;
  IF desired_state = 'reservado' THEN desired_reserved := usage_quantity; END IF;
  IF desired_state = 'consumido' THEN desired_consumed := usage_quantity; END IF;

  IF old_usage.id IS NOT NULL AND old_usage.agreement_id <> agreement_row.id THEN
    SELECT coalesce(sum(reserved_delta), 0), coalesce(sum(consumed_delta), 0)
    INTO current_reserved, current_consumed
    FROM public.venue_counterpart_ledger ledger WHERE ledger.usage_id = old_usage.id;
    IF current_consumed <> 0 THEN
      RAISE EXCEPTION 'VENUE_COMPLETED_COUNTERPART_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF current_reserved <> 0 THEN
      INSERT INTO public.venue_counterpart_ledger (
        org_id, agreement_id, event_id, usage_id, movement_type,
        reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
      ) VALUES (
        event_row.org_id, old_usage.agreement_id, event_row.id, old_usage.id, 'liberacao',
        -current_reserved, 0, 0, coalesce(_reason, 'Acordo de contrapartida alterado'), _request_id, auth.uid()
      );
    END IF;
    PERFORM public.venue_clear_usage_excess_approval(
      old_usage.id,
      _request_id,
      coalesce(_reason, 'Acordo de contrapartida alterado')
    );
    UPDATE public.venue_counterpart_usage
    SET
      usage_state = 'cancelado',
      excess_quantity = 0,
      approved_excess_quantity = 0,
      excess_approval_status = 'nao_necessario',
      approved_by = NULL,
      approved_at = NULL,
      observation = coalesce(_reason, 'Acordo de contrapartida substituído'),
      superseded_at = now()
    WHERE id = old_usage.id;
    PERFORM public.venue_recalculate_agreement_excess(old_usage.agreement_id, _request_id, _reason);
    old_usage.id := NULL;
    current_reserved := 0;
    current_consumed := 0;
  END IF;

  IF old_usage.id IS NULL THEN
    INSERT INTO public.venue_counterpart_usage (
      org_id, agreement_id, event_id, usage_state, requested_quantity
    ) VALUES (
      event_row.org_id, agreement_row.id, event_row.id, desired_state, usage_quantity
    ) RETURNING id INTO usage_id;
  ELSE
    usage_id := old_usage.id;
    SELECT coalesce(sum(reserved_delta), 0), coalesce(sum(consumed_delta), 0)
    INTO current_reserved, current_consumed
    FROM public.venue_counterpart_ledger ledger WHERE ledger.usage_id = old_usage.id;
    UPDATE public.venue_counterpart_usage
    SET agreement_id = agreement_row.id, usage_state = desired_state, requested_quantity = usage_quantity
    WHERE id = old_usage.id;
  END IF;

  IF desired_consumed > current_consumed THEN
    INSERT INTO public.venue_counterpart_ledger (
      org_id, agreement_id, event_id, usage_id, movement_type,
      reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
    ) VALUES (
      event_row.org_id, agreement_row.id, event_row.id, usage_id, 'consumo',
      -current_reserved, desired_consumed - current_consumed, 0,
      coalesce(_reason, 'Evento concluído; reserva convertida em consumo'), _request_id, auth.uid()
    );
  ELSIF desired_reserved > current_reserved THEN
    INSERT INTO public.venue_counterpart_ledger (
      org_id, agreement_id, event_id, usage_id, movement_type,
      reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
    ) VALUES (
      event_row.org_id, agreement_row.id, event_row.id, usage_id, 'reserva',
      desired_reserved - current_reserved, 0, 0,
      coalesce(_reason, 'Uso confirmado e reservado'), _request_id, auth.uid()
    );
  ELSIF desired_reserved < current_reserved THEN
    INSERT INTO public.venue_counterpart_ledger (
      org_id, agreement_id, event_id, usage_id, movement_type,
      reserved_delta, consumed_delta, excess_delta, reason, request_id, actor_user_id
    ) VALUES (
      event_row.org_id, agreement_row.id, event_row.id, usage_id, 'liberacao',
      desired_reserved - current_reserved, 0, 0,
      coalesce(_reason, 'Reserva liberada ou recalculada'), _request_id, auth.uid()
    );
  END IF;

  PERFORM public.venue_recalculate_agreement_excess(agreement_row.id, _request_id, _reason);
END;
$$;