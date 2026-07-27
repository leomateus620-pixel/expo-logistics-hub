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
    -- ON CONFLICT waits for a concurrent owner of the same key. Once that
    -- transaction commits, lock and replay its durable result instead of
    -- surfacing a unique-key race or executing the mutation twice.
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
