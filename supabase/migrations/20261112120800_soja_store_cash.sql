BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('cash.view'), ('cash.manage'), ('sales.view'), ('sales.manage') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.pos_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  approval_reference text NOT NULL CHECK (length(approval_reference) BETWEEN 3 AND 600),
  active boolean NOT NULL,
  methods text[] NOT NULL CHECK (cardinality(methods) BETWEEN 1 AND 3 AND methods <@ ARRAY['cash','pix','card']::text[]),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, version),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE TABLE soja_store_private.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  location_id uuid NOT NULL,
  location_name text NOT NULL,
  operator_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  version integer NOT NULL DEFAULT 1,
  opening_cents bigint NOT NULL CHECK (opening_cents BETWEEN 0 AND 999999999999999),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  expected_at_close_cents bigint,
  counted_cents bigint CHECK (counted_cents BETWEEN 0 AND 999999999999999),
  difference_cents bigint GENERATED ALWAYS AS (counted_cents - expected_at_close_cents) STORED,
  close_reason text CHECK (length(close_reason) BETWEEN 1 AND 600),
  CHECK ((status = 'open' AND closed_at IS NULL AND counted_cents IS NULL AND expected_at_close_cents IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND counted_cents IS NOT NULL AND expected_at_close_cents IS NOT NULL
      AND (counted_cents = expected_at_close_cents OR close_reason IS NOT NULL))),
  UNIQUE (org_id, commission_id, id),
  UNIQUE (org_id, commission_id, id, location_id),
  FOREIGN KEY (org_id, commission_id, location_id) REFERENCES soja_store_private.locations(org_id, commission_id, id)
);

CREATE UNIQUE INDEX soja_store_cash_open_point ON soja_store_private.cash_sessions(org_id, commission_id, location_id) WHERE status = 'open';
CREATE UNIQUE INDEX soja_store_cash_open_operator ON soja_store_private.cash_sessions(org_id, commission_id, operator_id) WHERE status = 'open';
CREATE INDEX soja_store_cash_scope_recent ON soja_store_private.cash_sessions(org_id, commission_id, opened_at DESC, id);

CREATE TABLE soja_store_private.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  session_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supply','withdrawal','receipt','refund')),
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 999999999999999),
  reason text CHECK (length(reason) BETWEEN 1 AND 600),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind NOT IN ('supply','withdrawal') OR reason IS NOT NULL),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, session_id) REFERENCES soja_store_private.cash_sessions(org_id, commission_id, id)
);
CREATE INDEX soja_store_cash_movements_session ON soja_store_private.cash_movements(org_id, commission_id, session_id, recorded_at DESC, id);

ALTER TABLE soja_store_private.pos_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.pos_rules, soja_store_private.cash_sessions, soja_store_private.cash_movements FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_pos_rules_immutable BEFORE UPDATE OR DELETE ON soja_store_private.pos_rules
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_cash_movements_immutable BEFORE UPDATE OR DELETE ON soja_store_private.cash_movements
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

CREATE FUNCTION soja_store_private.current_pos_rule(_org_id uuid, _commission_id uuid)
RETURNS soja_store_private.pos_rules LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r FROM soja_store_private.pos_rules r WHERE r.org_id = _org_id AND r.commission_id = _commission_id
  ORDER BY r.version DESC LIMIT 1;
$$;

CREATE FUNCTION soja_store_private.cash_expected(_session soja_store_private.cash_sessions)
RETURNS bigint LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(_session.expected_at_close_cents,
    _session.opening_cents + coalesce(sum(CASE WHEN m.kind IN ('supply','receipt') THEN m.amount_cents ELSE -m.amount_cents END), 0)::bigint)
  FROM soja_store_private.cash_movements m
  WHERE m.org_id = _session.org_id AND m.commission_id = _session.commission_id AND m.session_id = _session.id;
$$;

CREATE FUNCTION soja_store_private.cash_json(_session soja_store_private.cash_sessions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (to_jsonb(_session) - ARRAY['org_id','commission_id','expected_at_close_cents'])
    || jsonb_build_object('expected_cents', soja_store_private.cash_expected(_session));
$$;

CREATE FUNCTION public.soja_store_pos_config(_org_id uuid, _commission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rule soja_store_private.pos_rules;
BEGIN
  IF NOT (soja_store_private.capabilities(_org_id, _commission_id) && ARRAY['cash.view','sales.view']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FORBIDDEN';
  END IF;
  v_rule := soja_store_private.current_pos_rule(_org_id, _commission_id);
  RETURN jsonb_build_object(
    'rule', CASE WHEN v_rule.id IS NOT NULL THEN to_jsonb(v_rule) - ARRAY['org_id','commission_id'] END,
    'points', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) ORDER BY lower(l.name), l.id)
      FROM soja_store_private.locations l WHERE l.org_id = _org_id AND l.commission_id = _commission_id
        AND l.kind = 'point' AND l.status = 'active'), '[]'::jsonb)
  );
END;
$$;

CREATE FUNCTION public.soja_store_save_pos_rule(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_current soja_store_private.pos_rules;
  v_rule soja_store_private.pos_rules;
  v_methods text[];
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['approval_reference','methods','active']);
  v_hash := soja_store_private.request_hash('save_pos_rule', _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  PERFORM 1 FROM soja_store_private.scopes WHERE org_id = _org_id AND commission_id = _commission_id FOR UPDATE;
  v_current := soja_store_private.current_pos_rule(_org_id, _commission_id);
  IF _expected_version IS DISTINCT FROM v_current.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  IF jsonb_typeof(_payload->'methods') IS DISTINCT FROM 'array' OR jsonb_typeof(_payload->'active') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_POS_RULE';
  END IF;
  SELECT array_agg(DISTINCT method ORDER BY method) INTO v_methods
  FROM jsonb_array_elements_text(_payload->'methods') AS x(method);
  INSERT INTO soja_store_private.pos_rules (org_id, commission_id, version, approval_reference, active, methods, approved_by)
  VALUES (_org_id, _commission_id, coalesce(v_current.version, 0) + 1, btrim(_payload->>'approval_reference'),
    (_payload->>'active')::boolean, v_methods, auth.uid()) RETURNING * INTO v_rule;
  v_result := jsonb_build_object('id', v_rule.id, 'version', v_rule.version, 'status', CASE WHEN v_rule.active THEN 'active' ELSE 'inactive' END);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, 'save_pos_rule', 'sales.manage',
    v_hash, v_rule.id, CASE WHEN v_current.id IS NOT NULL THEN to_jsonb(v_current) END, to_jsonb(v_rule), v_result);
EXCEPTION WHEN check_violation OR not_null_violation THEN
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_POS_RULE';
END;
$$;

CREATE FUNCTION public.soja_store_cash_sessions(_org_id uuid, _commission_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'cash.view');
  RETURN jsonb_build_object('items', coalesce((SELECT jsonb_agg(
    soja_store_private.cash_json(q.session) ORDER BY q.opened_at DESC, q.id)
    FROM (
      SELECT s AS session, s.opened_at, s.id FROM soja_store_private.cash_sessions s
      WHERE s.org_id = _org_id AND s.commission_id = _commission_id
      ORDER BY (s.status = 'open') DESC, s.opened_at DESC, s.id LIMIT 100
    ) q), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.soja_store_cash_movements(_org_id uuid, _commission_id uuid, _session_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'cash.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH matching AS MATERIALIZED (
      SELECT m.id, m.kind, m.amount_cents, m.reason, m.recorded_at FROM soja_store_private.cash_movements m
      WHERE m.org_id = _org_id AND m.commission_id = _commission_id AND m.session_id = _session_id
    ), page AS (SELECT * FROM matching ORDER BY recorded_at DESC, id LIMIT _limit OFFSET _offset)
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matching),
      'items', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.recorded_at DESC, p.id) FROM page p), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_open_cash(_org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_point soja_store_private.locations;
  v_session soja_store_private.cash_sessions;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'cash.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['location_id','opening_cents']);
  v_hash := soja_store_private.request_hash('open_cash', NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  IF _payload->>'opening_cents' IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_CASH_AMOUNT_REQUIRED'; END IF;
  SELECT * INTO v_point FROM soja_store_private.locations l
  WHERE l.org_id = _org_id AND l.commission_id = _commission_id AND l.id = (_payload->>'location_id')::uuid
    AND l.kind = 'point' AND l.status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_CASH_POINT_NOT_FOUND'; END IF;
  INSERT INTO soja_store_private.cash_sessions (org_id, commission_id, location_id, location_name, operator_id, opening_cents)
  VALUES (_org_id, _commission_id, v_point.id, v_point.name, auth.uid(), soja_store_private.purchase_cents(_payload->>'opening_cents'))
  RETURNING * INTO v_session;
  v_result := jsonb_build_object('id', v_session.id, 'version', v_session.version, 'status', v_session.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, 'open_cash', 'cash.manage',
    v_hash, v_session.id, NULL, soja_store_private.cash_json(v_session), v_result);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CASH_ALREADY_OPEN';
END;
$$;

CREATE FUNCTION soja_store_private.lock_open_cash(_org_id uuid, _commission_id uuid, _id uuid)
RETURNS soja_store_private.cash_sessions LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_session soja_store_private.cash_sessions;
BEGIN
  SELECT * INTO v_session FROM soja_store_private.cash_sessions
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = _id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'open' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CASH_NOT_OPEN';
  END IF;
  RETURN v_session;
END;
$$;

CREATE FUNCTION soja_store_private.change_cash(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb, _close boolean
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_command text := CASE WHEN _close THEN 'close_cash' ELSE 'adjust_cash' END;
  v_hash bytea;
  v_result jsonb;
  v_session soja_store_private.cash_sessions;
  v_previous jsonb;
  v_amount bigint;
  v_expected bigint;
  v_reason text;
  v_kind text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'cash.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    CASE WHEN _close THEN ARRAY['session_id','counted_cents','reason'] ELSE ARRAY['session_id','kind','amount_cents','reason'] END);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_session := soja_store_private.lock_open_cash(_org_id, _commission_id, (_payload->>'session_id')::uuid);
  IF _expected_version IS DISTINCT FROM v_session.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  v_previous := soja_store_private.cash_json(v_session);
  v_expected := soja_store_private.cash_expected(v_session);
  v_reason := nullif(btrim(_payload->>'reason'), '');
  IF _close THEN
    IF _payload->>'counted_cents' IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_CASH_AMOUNT_REQUIRED'; END IF;
    v_amount := soja_store_private.purchase_cents(_payload->>'counted_cents');
    IF (v_amount <> v_expected OR v_session.operator_id IS DISTINCT FROM auth.uid()) AND v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_CASH_DIFFERENCE_REASON_REQUIRED';
    END IF;
    UPDATE soja_store_private.cash_sessions SET status = 'closed', closed_at = now(), expected_at_close_cents = v_expected,
      counted_cents = v_amount, close_reason = v_reason, version = version + 1 WHERE id = v_session.id RETURNING * INTO v_session;
  ELSE
    v_kind := _payload->>'kind';
    v_amount := soja_store_private.purchase_cents(_payload->>'amount_cents');
    IF v_kind NOT IN ('supply','withdrawal') OR v_amount <= 0 OR v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_CASH_MOVEMENT';
    END IF;
    IF v_kind = 'withdrawal' AND v_amount > v_expected THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CASH_INSUFFICIENT';
    END IF;
    INSERT INTO soja_store_private.cash_movements (org_id, commission_id, session_id, kind, amount_cents, reason, recorded_by)
    VALUES (_org_id, _commission_id, v_session.id, v_kind, v_amount, v_reason, auth.uid());
    UPDATE soja_store_private.cash_sessions SET version = version + 1 WHERE id = v_session.id RETURNING * INTO v_session;
  END IF;
  v_result := jsonb_build_object('id', v_session.id, 'version', v_session.version, 'status', v_session.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, 'cash.manage',
    v_hash, v_session.id, v_previous, soja_store_private.cash_json(v_session), v_result);
END;
$$;

CREATE FUNCTION public.soja_store_adjust_cash(_org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.change_cash(_org_id, _commission_id, _request_id, _expected_version, _payload, false);
$$;
CREATE FUNCTION public.soja_store_close_cash(_org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.change_cash(_org_id, _commission_id, _request_id, _expected_version, _payload, true);
$$;

CREATE FUNCTION soja_store_private.protect_open_cash_location()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.status <> 'active' OR NEW.kind <> 'point') AND EXISTS (
    SELECT 1 FROM soja_store_private.cash_sessions s WHERE s.org_id = OLD.org_id AND s.commission_id = OLD.commission_id
      AND s.location_id = OLD.id AND s.status = 'open'
  ) THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_LOCATION_HAS_OPEN_CASH'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_open_cash_location BEFORE UPDATE OF status, kind ON soja_store_private.locations
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.protect_open_cash_location();

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.soja_store_pos_config(uuid, uuid),
  public.soja_store_save_pos_rule(uuid, uuid, uuid, integer, jsonb), public.soja_store_cash_sessions(uuid, uuid),
  public.soja_store_cash_movements(uuid, uuid, uuid, integer, integer), public.soja_store_open_cash(uuid, uuid, uuid, jsonb),
  public.soja_store_adjust_cash(uuid, uuid, uuid, integer, jsonb), public.soja_store_close_cash(uuid, uuid, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_pos_config(uuid, uuid),
  public.soja_store_save_pos_rule(uuid, uuid, uuid, integer, jsonb), public.soja_store_cash_sessions(uuid, uuid),
  public.soja_store_cash_movements(uuid, uuid, uuid, integer, integer), public.soja_store_open_cash(uuid, uuid, uuid, jsonb),
  public.soja_store_adjust_cash(uuid, uuid, uuid, integer, jsonb), public.soja_store_close_cash(uuid, uuid, uuid, integer, jsonb)
TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
