BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('finance.manage'), ('finance.view');

CREATE TABLE soja_store_private.finance_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2200),
  category text NOT NULL CHECK (length(category) BETWEEN 2 AND 100),
  approved_cents bigint NOT NULL CHECK (approved_cents BETWEEN 0 AND 999999999999999),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 600),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  recorded_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id)
);

CREATE UNIQUE INDEX soja_store_finance_budget_category
ON soja_store_private.finance_budgets (org_id, commission_id, year, lower(category));

CREATE TABLE soja_store_private.finance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('payable', 'receivable')),
  category text NOT NULL CHECK (length(category) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 160),
  occurred_on date NOT NULL,
  due_on date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 999999999999999),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 600),
  purchase_id uuid,
  operation_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id) REFERENCES soja_store_private.scopes(org_id, commission_id),
  FOREIGN KEY (org_id, commission_id, purchase_id)
    REFERENCES soja_store_private.purchases(org_id, commission_id, id),
  CHECK (occurred_on >= DATE '2000-01-01' AND occurred_on < DATE '2201-01-01' AND due_on >= occurred_on),
  CHECK (num_nonnulls(purchase_id, operation_id) <= 1),
  CHECK (purchase_id IS NULL OR (kind = 'payable' AND category = 'Compras')),
  CHECK (operation_id IS NULL OR kind = 'receivable')
);

CREATE UNIQUE INDEX soja_store_finance_obligation_purchase
ON soja_store_private.finance_obligations (org_id, commission_id, purchase_id) WHERE purchase_id IS NOT NULL;
CREATE UNIQUE INDEX soja_store_finance_obligation_operation
ON soja_store_private.finance_obligations (org_id, commission_id, operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX soja_store_finance_obligations_date
ON soja_store_private.finance_obligations (org_id, commission_id, occurred_on, due_on, id);

CREATE TABLE soja_store_private.finance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  occurred_on date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0 AND amount_cents BETWEEN -999999999999999 AND 999999999999999),
  method text NOT NULL CHECK (length(method) BETWEEN 1 AND 40),
  reference text NOT NULL CHECK (length(reference) BETWEEN 4 AND 600),
  reverses_id uuid UNIQUE,
  operation_payment_id uuid,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, commission_id, obligation_id, id),
  FOREIGN KEY (org_id, commission_id, obligation_id)
    REFERENCES soja_store_private.finance_obligations(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, obligation_id, reverses_id)
    REFERENCES soja_store_private.finance_settlements(org_id, commission_id, obligation_id, id),
  CHECK (reverses_id IS NULL OR (amount_cents < 0 AND operation_payment_id IS NULL)),
  CHECK (amount_cents > 0 OR reverses_id IS NOT NULL OR operation_payment_id IS NOT NULL)
);

CREATE UNIQUE INDEX soja_store_finance_settlement_operation_payment
ON soja_store_private.finance_settlements (org_id, commission_id, operation_payment_id) WHERE operation_payment_id IS NOT NULL;
CREATE INDEX soja_store_finance_settlements_date
ON soja_store_private.finance_settlements (org_id, commission_id, occurred_on, obligation_id);
CREATE INDEX soja_store_finance_settlements_obligation
ON soja_store_private.finance_settlements (obligation_id, occurred_on DESC, recorded_at DESC, id);

CREATE TABLE soja_store_private.finance_obligation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN -999999999999999 AND -1),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, commission_id, obligation_id)
    REFERENCES soja_store_private.finance_obligations(org_id, commission_id, id)
);
CREATE INDEX soja_store_finance_obligation_adjustments_entry
ON soja_store_private.finance_obligation_adjustments (obligation_id);
ALTER TABLE soja_store_private.finance_obligation_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.finance_obligation_adjustments FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soja_store_private.reject_finance_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SOJA_STORE_FINANCE_HISTORY_IMMUTABLE';
END;
$$;

CREATE TRIGGER soja_store_finance_obligation_adjustments_immutable
BEFORE UPDATE OR DELETE ON soja_store_private.finance_obligation_adjustments
FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_finance_history_change();

ALTER TABLE soja_store_private.finance_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.finance_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.finance_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.finance_budgets, soja_store_private.finance_obligations, soja_store_private.finance_settlements
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_finance_settlements_immutable
BEFORE UPDATE OR DELETE ON soja_store_private.finance_settlements
FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_finance_history_change();

CREATE FUNCTION soja_store_private.finance_net(_obligation_id uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(amount_cents), 0)::bigint FROM soja_store_private.finance_settlements WHERE obligation_id = _obligation_id;
$$;

CREATE FUNCTION soja_store_private.finance_principal(_obligation_id uuid, _original bigint)
RETURNS bigint LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (_original + coalesce(sum(amount_cents), 0))::bigint
  FROM soja_store_private.finance_obligation_adjustments WHERE obligation_id = _obligation_id;
$$;

CREATE FUNCTION soja_store_private.finance_status(_amount bigint, _net bigint, _due date)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN _amount = 0 THEN 'cancelled'
    WHEN _net = _amount THEN 'settled'
    WHEN _due < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
    WHEN _net > 0 THEN 'partial'
    ELSE 'open'
  END;
$$;

CREATE FUNCTION soja_store_private.finance_year(_year integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _year IS NULL OR _year NOT BETWEEN 2000 AND 2200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_YEAR';
  END IF;
  RETURN make_date(_year, 1, 1);
END;
$$;

CREATE FUNCTION public.soja_store_save_budget(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'save_budget';
  v_capability constant text := 'finance.manage';
  v_hash bytea;
  v_result jsonb;
  v_budget soja_store_private.finance_budgets;
  v_previous jsonb;
  v_id uuid;
  v_year integer;
  v_category text;
  v_amount bigint;
  v_reference text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['id','year','category','approved_cents','reference']);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_id := nullif(_payload->>'id', '')::uuid;
  v_year := (_payload->>'year')::integer;
  PERFORM soja_store_private.finance_year(v_year);
  v_category := btrim(_payload->>'category');
  v_amount := soja_store_private.purchase_cents(_payload->>'approved_cents');
  v_reference := btrim(_payload->>'reference');
  IF _payload->>'approved_cents' IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_AMOUNT';
  END IF;

  IF v_id IS NULL THEN
    IF _expected_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    INSERT INTO soja_store_private.finance_budgets (org_id, commission_id, year, category, approved_cents, reference, recorded_by)
    VALUES (_org_id, _commission_id, v_year, v_category, v_amount, v_reference, auth.uid())
    RETURNING * INTO v_budget;
  ELSE
    SELECT * INTO v_budget FROM soja_store_private.finance_budgets
    WHERE id = v_id AND org_id = _org_id AND commission_id = _commission_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_FINANCE_NOT_FOUND'; END IF;
    IF _expected_version IS DISTINCT FROM v_budget.version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
    END IF;
    IF v_year IS DISTINCT FROM v_budget.year OR v_category IS DISTINCT FROM v_budget.category THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_BUDGET_SCOPE_IMMUTABLE';
    END IF;
    v_previous := to_jsonb(v_budget);
    UPDATE soja_store_private.finance_budgets
    SET approved_cents = v_amount, reference = v_reference, version = version + 1, updated_at = now(), recorded_by = auth.uid()
    WHERE id = v_id RETURNING * INTO v_budget;
  END IF;

  v_result := jsonb_build_object('id', v_budget.id, 'version', v_budget.version, 'status', 'approved');
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_budget.id, v_previous, to_jsonb(v_budget), v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_DUPLICATE_BUDGET';
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_BUDGET';
END;
$$;

CREATE FUNCTION public.soja_store_recognize_obligation(_org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_command constant text := 'recognize_obligation';
  v_capability constant text := 'finance.manage';
  v_hash bytea;
  v_result jsonb;
  v_obligation soja_store_private.finance_obligations;
  v_purchase soja_store_private.purchases;
  v_purchase_id uuid;
  v_kind text;
  v_category text;
  v_description text;
  v_amount bigint;
  v_occurred date;
  v_due date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(
    _payload, ARRAY['kind','category','description','occurred_on','due_on','amount_cents','reference','purchase_id']
  );
  v_hash := soja_store_private.request_hash(v_command, NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_purchase_id := nullif(_payload->>'purchase_id', '')::uuid;
  v_occurred := soja_store_private.purchase_date(_payload->>'occurred_on');
  v_due := soja_store_private.purchase_date(_payload->>'due_on');
  IF v_occurred > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_DATE';
  END IF;

  IF v_purchase_id IS NULL THEN
    v_kind := _payload->>'kind';
    v_category := btrim(_payload->>'category');
    v_description := btrim(_payload->>'description');
    v_amount := soja_store_private.purchase_cents(_payload->>'amount_cents');
  ELSE
    SELECT * INTO v_purchase FROM soja_store_private.purchases
    WHERE org_id = _org_id AND commission_id = _commission_id AND id = v_purchase_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_FINANCE_NOT_FOUND'; END IF;
    IF v_occurred < v_purchase.ordered_on THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_PURCHASE_PERIOD';
    END IF;
    v_kind := 'payable';
    v_category := 'Compras';
    v_description := left('Pedido · ' || v_purchase.supplier_name, 160);
    v_amount := v_purchase.total_cents;
  END IF;

  INSERT INTO soja_store_private.finance_obligations
    (org_id, commission_id, kind, category, description, occurred_on, due_on, amount_cents, reference, purchase_id, recorded_by)
  VALUES (_org_id, _commission_id, v_kind, v_category, v_description, v_occurred, v_due, v_amount,
    btrim(_payload->>'reference'), v_purchase_id, auth.uid())
  RETURNING * INTO v_obligation;

  v_result := jsonb_build_object('id', v_obligation.id, 'version', 1,
    'status', soja_store_private.finance_status(v_obligation.amount_cents, 0, v_due), 'amount_cents', v_amount);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_obligation.id, NULL, to_jsonb(v_obligation), v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_PURCHASE_RECOGNIZED';
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_OBLIGATION';
END;
$$;

CREATE FUNCTION soja_store_private.recognize_sale_obligation(
  _org_id uuid, _commission_id uuid, _operation_id uuid, _description text,
  _occurred_on date, _due_on date, _amount_cents bigint, _reference text
)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF _operation_id IS NULL THEN RAISE EXCEPTION 'SOJA_STORE_FINANCE_SALE_SOURCE_REQUIRED'; END IF;
  INSERT INTO soja_store_private.finance_obligations
    (org_id, commission_id, kind, category, description, occurred_on, due_on, amount_cents, reference, operation_id, recorded_by)
  VALUES (_org_id, _commission_id, 'receivable', 'Vendas', _description,
    _occurred_on, _due_on, _amount_cents, _reference, _operation_id, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION soja_store_private.record_sale_payment(
  _org_id uuid, _commission_id uuid, _operation_id uuid, _payment_id uuid,
  _occurred_on date, _amount_cents bigint, _method text, _reference text
)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_obligation soja_store_private.finance_obligations;
  v_net bigint;
  v_id uuid;
BEGIN
  IF _operation_id IS NULL OR _payment_id IS NULL THEN RAISE EXCEPTION 'SOJA_STORE_FINANCE_SALE_SOURCE_REQUIRED'; END IF;
  SELECT * INTO STRICT v_obligation FROM soja_store_private.finance_obligations
  WHERE org_id = _org_id AND commission_id = _commission_id AND operation_id = _operation_id FOR UPDATE;
  v_net := soja_store_private.finance_net(v_obligation.id) + _amount_cents;
  IF v_net NOT BETWEEN 0 AND soja_store_private.finance_principal(v_obligation.id, v_obligation.amount_cents)
    OR _occurred_on < v_obligation.occurred_on OR _occurred_on > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_SETTLEMENT_LIMIT';
  END IF;
  INSERT INTO soja_store_private.finance_settlements
    (org_id, commission_id, obligation_id, occurred_on, amount_cents, method, reference, operation_payment_id, recorded_by)
  VALUES (_org_id, _commission_id, v_obligation.id, _occurred_on, _amount_cents, _method, _reference, _payment_id, auth.uid())
  RETURNING id INTO v_id;
  UPDATE soja_store_private.finance_obligations SET version = version + 1 WHERE id = v_obligation.id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION soja_store_private.adjust_sale_obligation(
  _org_id uuid, _commission_id uuid, _operation_id uuid, _amount_cents bigint
)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_obligation soja_store_private.finance_obligations;
  v_principal bigint;
  v_id uuid;
BEGIN
  IF _operation_id IS NULL OR _amount_cents IS NULL OR _amount_cents NOT BETWEEN -999999999999999 AND -1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_ADJUSTMENT';
  END IF;
  SELECT * INTO STRICT v_obligation FROM soja_store_private.finance_obligations
  WHERE org_id = _org_id AND commission_id = _commission_id AND operation_id = _operation_id FOR UPDATE;
  v_principal := soja_store_private.finance_principal(v_obligation.id, v_obligation.amount_cents) + _amount_cents;
  IF v_principal < soja_store_private.finance_net(v_obligation.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_SETTLEMENT_LIMIT';
  END IF;
  INSERT INTO soja_store_private.finance_obligation_adjustments (org_id, commission_id, obligation_id, amount_cents, recorded_by)
  VALUES (_org_id, _commission_id, v_obligation.id, _amount_cents, auth.uid()) RETURNING id INTO v_id;
  UPDATE soja_store_private.finance_obligations SET version = version + 1 WHERE id = v_obligation.id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION soja_store_private.finance_manual_settlement(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb, _reverse boolean
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_command text := CASE WHEN _reverse THEN 'reverse_settlement' ELSE 'settle_obligation' END;
  v_capability constant text := 'finance.manage';
  v_hash bytea;
  v_result jsonb;
  v_obligation soja_store_private.finance_obligations;
  v_original soja_store_private.finance_settlements;
  v_settlement soja_store_private.finance_settlements;
  v_amount bigint;
  v_net bigint;
  v_occurred date;
  v_method text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, v_capability);
  PERFORM soja_store_private.assert_purchase_payload(_payload,
    CASE WHEN _reverse THEN ARRAY['obligation_id','settlement_id','occurred_on','reference']
      ELSE ARRAY['obligation_id','occurred_on','amount_cents','method','reference'] END);
  v_hash := soja_store_private.request_hash(v_command, _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT * INTO v_obligation FROM soja_store_private.finance_obligations
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'obligation_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_FINANCE_NOT_FOUND'; END IF;
  IF v_obligation.operation_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SOJA_STORE_FINANCE_USE_SALE_ORIGIN';
  END IF;
  IF _expected_version IS DISTINCT FROM v_obligation.version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION';
  END IF;
  v_occurred := soja_store_private.purchase_date(_payload->>'occurred_on');
  IF v_occurred < v_obligation.occurred_on OR v_occurred > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_DATE';
  END IF;
  IF _reverse THEN
    SELECT * INTO v_original FROM soja_store_private.finance_settlements
    WHERE org_id = _org_id AND commission_id = _commission_id AND obligation_id = v_obligation.id
      AND id = (_payload->>'settlement_id')::uuid AND amount_cents > 0 AND operation_payment_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_FINANCE_NOT_FOUND'; END IF;
    IF v_occurred < v_original.occurred_on THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_DATE';
    END IF;
    v_amount := -v_original.amount_cents;
    v_method := v_original.method;
  ELSE
    v_amount := soja_store_private.purchase_cents(_payload->>'amount_cents');
    v_method := _payload->>'method';
    IF v_amount = 0 OR v_method IS NULL OR v_method NOT IN ('cash','pix','card','transfer','other') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_SETTLEMENT';
    END IF;
  END IF;

  v_net := soja_store_private.finance_net(v_obligation.id) + v_amount;
  IF v_net NOT BETWEEN 0 AND v_obligation.amount_cents THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_SETTLEMENT_LIMIT';
  END IF;
  INSERT INTO soja_store_private.finance_settlements
    (org_id, commission_id, obligation_id, occurred_on, amount_cents, method, reference, reverses_id, recorded_by)
  VALUES (_org_id, _commission_id, v_obligation.id, v_occurred, v_amount, v_method,
    btrim(_payload->>'reference'), v_original.id, auth.uid())
  RETURNING * INTO v_settlement;
  UPDATE soja_store_private.finance_obligations SET version = version + 1
  WHERE id = v_obligation.id RETURNING * INTO v_obligation;
  v_result := jsonb_build_object('id', v_obligation.id, 'settlement_id', v_settlement.id, 'version', v_obligation.version,
    'status', soja_store_private.finance_status(v_obligation.amount_cents, v_net, v_obligation.due_on),
    'settled_cents', v_net, 'remaining_cents', v_obligation.amount_cents - v_net);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, v_command, v_capability, v_hash,
    v_obligation.id, NULL, to_jsonb(v_settlement), v_result);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_FINANCE_ALREADY_REVERSED';
  WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_FINANCE_INVALID_SETTLEMENT';
END;
$$;

CREATE FUNCTION public.soja_store_settle_obligation(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.finance_manual_settlement(_org_id, _commission_id, _request_id, _expected_version, _payload, false);
$$;

CREATE FUNCTION public.soja_store_reverse_settlement(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT soja_store_private.finance_manual_settlement(_org_id, _commission_id, _request_id, _expected_version, _payload, true);
$$;

CREATE FUNCTION public.soja_store_finance_summary(_org_id uuid, _commission_id uuid, _year integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_first date;
  v_last date;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'finance.view');
  v_first := soja_store_private.finance_year(_year);
  v_last := make_date(_year + 1, 1, 1);

  RETURN (
    WITH budgets AS MATERIALIZED (
      SELECT id, category, approved_cents, reference, version, updated_at
      FROM soja_store_private.finance_budgets WHERE org_id = _org_id AND commission_id = _commission_id AND year = _year
    ), amounts AS MATERIALIZED (
      SELECT o.id, o.kind, o.category, soja_store_private.finance_principal(o.id, o.amount_cents) AS amount_cents,
        o.due_on, coalesce(n.net, 0)::bigint AS net
      FROM soja_store_private.finance_obligations o
      LEFT JOIN LATERAL (
        SELECT sum(amount_cents) AS net FROM soja_store_private.finance_settlements s WHERE s.obligation_id = o.id
      ) n ON true
      WHERE o.org_id = _org_id AND o.commission_id = _commission_id AND o.occurred_on >= v_first AND o.occurred_on < v_last
    ), recognized AS MATERIALIZED (
      SELECT lower(category) AS category, sum(amount_cents) AS total FROM amounts WHERE kind = 'payable' GROUP BY lower(category)
    ), committed AS MATERIALIZED (
      SELECT coalesce(sum(p.total_cents), 0) AS total
      FROM soja_store_private.purchases p
      WHERE p.org_id = _org_id AND p.commission_id = _commission_id AND p.ordered_on >= v_first AND p.ordered_on < v_last
        AND NOT EXISTS (
          SELECT 1 FROM soja_store_private.finance_obligations o
          WHERE o.org_id = p.org_id AND o.commission_id = p.commission_id AND o.purchase_id = p.id
            AND o.occurred_on < v_last
        )
    ), movements AS MATERIALIZED (
      SELECT coalesce(sum(s.amount_cents) FILTER (WHERE o.kind = 'payable'), 0) AS paid,
        coalesce(sum(s.amount_cents) FILTER (WHERE o.kind = 'receivable'), 0) AS received
      FROM soja_store_private.finance_settlements s
      JOIN soja_store_private.finance_obligations o ON o.id = s.obligation_id AND o.org_id = s.org_id AND o.commission_id = s.commission_id
      WHERE s.org_id = _org_id AND s.commission_id = _commission_id AND s.occurred_on >= v_first AND s.occurred_on < v_last
    ), totals AS (
      SELECT (SELECT count(*) FROM budgets) AS budget_count,
        (SELECT coalesce(sum(approved_cents), 0) FROM budgets) AS approved,
        (SELECT coalesce(sum(total), 0) FROM recognized) AS realized,
        coalesce(sum(amount_cents) FILTER (WHERE kind = 'receivable'), 0) AS recognized_receivable,
        coalesce(sum(amount_cents - net) FILTER (WHERE kind = 'payable'), 0) AS payable_remaining,
        coalesce(sum(amount_cents - net) FILTER (WHERE kind = 'receivable'), 0) AS receivable_remaining,
        count(*) FILTER (WHERE due_on < v_today AND amount_cents > net) AS overdue_count
      FROM amounts
    )
    SELECT jsonb_build_object(
      'year', _year, 'today', v_today,
      'approved_cents', CASE WHEN t.budget_count > 0 THEN t.approved::text END,
      'realized_cents', t.realized::text, 'committed_cents', c.total::text,
      'available_cents', CASE WHEN t.budget_count > 0 THEN (t.approved - t.realized - c.total)::text END,
      'recognized_receivable_cents', t.recognized_receivable::text,
      'payable_remaining_cents', t.payable_remaining::text, 'receivable_remaining_cents', t.receivable_remaining::text,
      'paid_cents', m.paid::text, 'received_cents', m.received::text, 'overdue_count', t.overdue_count,
      'budgets', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', b.id, 'category', b.category, 'approved_cents', b.approved_cents::text, 'version', b.version,
          'reference', b.reference, 'updated_at', b.updated_at,
          'realized_cents', coalesce(r.total, 0)::text,
          'committed_cents', (CASE WHEN lower(b.category) = 'compras' THEN c.total ELSE 0 END)::text,
          'available_cents', (b.approved_cents - coalesce(r.total, 0) -
            CASE WHEN lower(b.category) = 'compras' THEN c.total ELSE 0 END)::text
        ) ORDER BY lower(b.category), b.id)
        FROM budgets b LEFT JOIN recognized r ON r.category = lower(b.category)
      ), '[]'::jsonb),
      'generated_at', statement_timestamp()
    )
    FROM totals t CROSS JOIN committed c CROSS JOIN movements m
  );
END;
$$;

CREATE FUNCTION public.soja_store_finance_entries(
  _org_id uuid, _commission_id uuid, _year integer, _kind text DEFAULT NULL, _status text DEFAULT NULL,
  _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_first date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'finance.view');
  v_first := soja_store_private.finance_year(_year);
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0
    OR (_kind IS NOT NULL AND _kind NOT IN ('payable', 'receivable'))
    OR (_status IS NOT NULL AND _status NOT IN ('open', 'partial', 'overdue', 'settled', 'cancelled')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    WITH relevant AS MATERIALIZED (
      SELECT o.id, o.kind, o.category, o.description, o.occurred_on, o.due_on, o.amount_cents::text AS original_cents, o.reference,
        o.purchase_id, o.operation_id, o.version, coalesce(n.net, 0)::bigint AS net, principal.amount_cents,
        soja_store_private.finance_status(principal.amount_cents, coalesce(n.net, 0)::bigint, o.due_on) AS status
      FROM soja_store_private.finance_obligations o
      LEFT JOIN LATERAL (
        SELECT sum(amount_cents) AS net FROM soja_store_private.finance_settlements s WHERE s.obligation_id = o.id
      ) n ON true
      CROSS JOIN LATERAL (SELECT soja_store_private.finance_principal(o.id, o.amount_cents) AS amount_cents) principal
      WHERE o.org_id = _org_id AND o.commission_id = _commission_id
        AND o.occurred_on >= v_first AND o.occurred_on < make_date(_year + 1, 1, 1)
        AND (_kind IS NULL OR o.kind = _kind)
    ), matched AS MATERIALIZED (
      SELECT * FROM relevant WHERE _status IS NULL OR status = _status
    ), page AS (
      SELECT * FROM matched ORDER BY due_on, id LIMIT _limit OFFSET _offset
    )
    SELECT jsonb_build_object('total', (SELECT count(*) FROM matched), 'items', coalesce((
      SELECT jsonb_agg((to_jsonb(page) - ARRAY['net', 'amount_cents']) || jsonb_build_object(
        'amount_cents', page.amount_cents::text, 'settled_cents', page.net::text,
        'remaining_cents', (page.amount_cents - page.net)::text
      ) ORDER BY due_on, id) FROM page
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_finance_settlements(
  _org_id uuid, _commission_id uuid, _obligation_id uuid, _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'finance.view');
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR _offset IS NULL OR _offset < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM soja_store_private.finance_obligations WHERE org_id = _org_id AND commission_id = _commission_id AND id = _obligation_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_FINANCE_NOT_FOUND';
  END IF;
  RETURN (
    SELECT jsonb_build_object('total', (
      SELECT count(*) FROM soja_store_private.finance_settlements WHERE obligation_id = _obligation_id
    ), 'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'occurred_on', s.occurred_on, 'amount_cents', s.amount_cents::text, 'method', s.method,
        'reference', s.reference, 'reverses_id', s.reverses_id,
        'can_reverse', s.amount_cents > 0 AND s.operation_payment_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM soja_store_private.finance_settlements r WHERE r.reverses_id = s.id
        )
      ) ORDER BY s.occurred_on DESC, s.recorded_at DESC, s.id)
      FROM (
        SELECT * FROM soja_store_private.finance_settlements WHERE obligation_id = _obligation_id
        ORDER BY occurred_on DESC, recorded_at DESC, id LIMIT _limit OFFSET _offset
      ) s
    ), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION public.soja_store_finance_purchase_options(
  _org_id uuid, _commission_id uuid, _year integer, _search text DEFAULT NULL, _limit integer DEFAULT 25
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'finance.manage');
  PERFORM soja_store_private.finance_year(_year);
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 OR length(v_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'supplier_name', p.supplier_name, 'ordered_on', p.ordered_on, 'reference', p.reference,
      'total_cents', p.total_cents::text
    ) ORDER BY p.ordered_on DESC, p.id), '[]'::jsonb)
    FROM (
      SELECT id, supplier_name, ordered_on, reference, total_cents FROM soja_store_private.purchases p
      WHERE p.org_id = _org_id AND p.commission_id = _commission_id
        AND p.ordered_on < make_date(_year + 1, 1, 1) AND p.total_cents > 0
        AND (v_search IS NULL OR strpos(lower(p.supplier_name), v_search) > 0 OR strpos(lower(p.reference), v_search) > 0)
        AND NOT EXISTS (
          SELECT 1 FROM soja_store_private.finance_obligations o
          WHERE o.org_id = p.org_id AND o.commission_id = p.commission_id AND o.purchase_id = p.id
        )
      ORDER BY p.ordered_on DESC, p.id LIMIT _limit
    ) p
  );
END;
$$;

REVOKE ALL ON FUNCTION
  soja_store_private.reject_finance_history_change(),
  soja_store_private.finance_net(uuid),
  soja_store_private.finance_principal(uuid, bigint),
  soja_store_private.adjust_sale_obligation(uuid, uuid, uuid, bigint),
  soja_store_private.finance_status(bigint, bigint, date),
  soja_store_private.finance_year(integer),
  soja_store_private.recognize_sale_obligation(uuid, uuid, uuid, text, date, date, bigint, text),
  soja_store_private.record_sale_payment(uuid, uuid, uuid, uuid, date, bigint, text, text),
  soja_store_private.finance_manual_settlement(uuid, uuid, uuid, integer, jsonb, boolean),
  public.soja_store_save_budget(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_recognize_obligation(uuid, uuid, uuid, jsonb),
  public.soja_store_settle_obligation(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_reverse_settlement(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_finance_summary(uuid, uuid, integer),
  public.soja_store_finance_entries(uuid, uuid, integer, text, text, integer, integer),
  public.soja_store_finance_settlements(uuid, uuid, uuid, integer, integer),
  public.soja_store_finance_purchase_options(uuid, uuid, integer, text, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.soja_store_save_budget(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_recognize_obligation(uuid, uuid, uuid, jsonb),
  public.soja_store_settle_obligation(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_reverse_settlement(uuid, uuid, uuid, integer, jsonb),
  public.soja_store_finance_summary(uuid, uuid, integer),
  public.soja_store_finance_entries(uuid, uuid, integer, text, text, integer, integer),
  public.soja_store_finance_settlements(uuid, uuid, uuid, integer, integer),
  public.soja_store_finance_purchase_options(uuid, uuid, integer, text, integer)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
