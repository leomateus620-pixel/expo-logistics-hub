BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('sales.fulfillment') ON CONFLICT DO NOTHING;

ALTER TABLE soja_store_private.sales
  ADD COLUMN reservation_expires_at timestamptz,
  ADD COLUMN delivered_at timestamptz;

-- Existing open reservations receive a full current confirmation window.
UPDATE soja_store_private.sales
SET reservation_expires_at = now() + interval '24 hours'
WHERE status = 'pending';

CREATE INDEX soja_store_reservation_expiry ON soja_store_private.sales (reservation_expires_at, id) WHERE status = 'pending';

CREATE FUNCTION soja_store_private.set_reservation_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'pending' THEN NEW.reservation_expires_at := now() + interval '24 hours';
  ELSIF NEW.status = 'completed' THEN NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER soja_store_sale_reservation_expiry BEFORE INSERT ON soja_store_private.sales
FOR EACH ROW EXECUTE FUNCTION soja_store_private.set_reservation_expiry();

ALTER TABLE soja_store_private.sale_receipts DROP CONSTRAINT sale_receipts_kind_check,
  ADD CONSTRAINT sale_receipts_kind_check CHECK (kind IN ('sale','return','payment'));

ALTER TABLE soja_store_private.sale_payments ADD COLUMN session_id uuid,
  ADD CONSTRAINT soja_store_sale_payment_cash_session
  FOREIGN KEY (org_id, commission_id, session_id) REFERENCES soja_store_private.cash_sessions(org_id, commission_id, id);

CREATE TABLE soja_store_private.sale_reservation_releases (
  sale_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  cause text NOT NULL CHECK (cause IN ('cancelled','expired')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 600),
  released_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  FOREIGN KEY (org_id, commission_id, sale_id) REFERENCES soja_store_private.sales(org_id, commission_id, id),
  CHECK (cause <> 'cancelled' OR released_by IS NOT NULL)
);

ALTER TABLE soja_store_private.sale_reservation_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.sale_reservation_releases FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER soja_store_sale_releases_immutable BEFORE UPDATE OR DELETE ON soja_store_private.sale_reservation_releases
FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

CREATE FUNCTION soja_store_private.sale_paid_cents(_sale soja_store_private.sales)
RETURNS bigint LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(p.amount_cents), 0)::bigint FROM soja_store_private.sale_payments p
  WHERE p.org_id = _sale.org_id AND p.commission_id = _sale.commission_id AND p.sale_id = _sale.id;
$$;

CREATE FUNCTION soja_store_private.release_sale_reservation(_sale soja_store_private.sales, _deliver boolean)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_line soja_store_private.sale_lines;
BEGIN
  PERFORM soja_store_private.lock_stock_location(_sale.org_id, _sale.commission_id, _sale.location_id);
  FOR v_line IN SELECT l.* FROM soja_store_private.sale_lines l
    WHERE l.org_id = _sale.org_id AND l.commission_id = _sale.commission_id AND l.sale_id = _sale.id
    ORDER BY l.variant_id
  LOOP
    UPDATE soja_store_private.stock_positions SET reserved_quantity = reserved_quantity - v_line.quantity, version = version + 1
    WHERE org_id = _sale.org_id AND commission_id = _sale.commission_id AND location_id = _sale.location_id
      AND variant_id = v_line.variant_id AND ownership = 'own' AND owner_supplier_id IS NULL
      AND destination = 'store' AND reserved_quantity >= v_line.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_RESERVATION_NOT_FOUND'; END IF;
    IF _deliver THEN
      PERFORM soja_store_private.write_sale_stock(_sale, v_line, 'sale_fulfillment', -v_line.quantity);
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION soja_store_private.close_unpaid_reservation(_sale soja_store_private.sales, _cause text, _reason text)
RETURNS soja_store_private.sales LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_sale soja_store_private.sales;
BEGIN
  IF EXISTS (SELECT 1 FROM soja_store_private.sale_payments p
    WHERE p.org_id = _sale.org_id AND p.commission_id = _sale.commission_id AND p.sale_id = _sale.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_RESERVATION_HAS_PAYMENT';
  END IF;
  PERFORM soja_store_private.release_sale_reservation(_sale, false);
  INSERT INTO soja_store_private.sale_reservation_releases (sale_id, org_id, commission_id, cause, reason, released_by)
  VALUES (_sale.id, _sale.org_id, _sale.commission_id, _cause, _reason, auth.uid());
  UPDATE soja_store_private.sales SET status = 'cancelled', version = version + 1
  WHERE id = _sale.id RETURNING * INTO v_sale;
  RETURN v_sale;
END;
$$;

CREATE FUNCTION soja_store_private.expire_unpaid_reservation()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale soja_store_private.sales;
BEGIN
  -- One sale and one location per transaction. Lock the sale before the stock location.
  SELECT s.* INTO v_sale FROM soja_store_private.sales s
  JOIN soja_store_private.scopes scope ON scope.org_id = s.org_id AND scope.commission_id = s.commission_id
  WHERE scope.enabled AND s.status = 'pending' AND s.reservation_expires_at <= now()
    AND NOT EXISTS (SELECT 1 FROM soja_store_private.sale_payments p WHERE p.sale_id = s.id)
  ORDER BY s.reservation_expires_at, s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Recheck after the lock in case a payment committed while the worker selected a row.
  IF EXISTS (SELECT 1 FROM soja_store_private.sale_payments p WHERE p.sale_id = v_sale.id) THEN RETURN 0; END IF;
  PERFORM soja_store_private.close_unpaid_reservation(v_sale, 'expired', 'Prazo de reserva encerrado sem pagamento confirmado.');
  RETURN 1;
END;
$$;

CREATE FUNCTION soja_store_private.write_reservation_payments(
  _sale soja_store_private.sales, _session_id uuid, _payments jsonb, _already_paid bigint
)
RETURNS bigint LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_rule soja_store_private.pos_rules;
  v_item jsonb;
  v_method text;
  v_amount bigint;
  v_tender bigint;
  v_fee bigint;
  v_reference text;
  v_new_total numeric := _already_paid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO STRICT v_rule FROM soja_store_private.pos_rules WHERE id = _sale.rule_id;
  IF jsonb_typeof(_payments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_PAYMENT_REQUIRED';
  END IF;
  IF jsonb_array_length(_payments) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_PAYMENT_REQUIRED';
  END IF;
  IF _already_paid = 0 THEN
    PERFORM soja_store_private.recognize_sale_obligation(_sale.org_id, _sale.commission_id, _sale.id,
      'Venda própria Soja Store', v_today, v_today, _sale.total_cents,
      CASE WHEN length(_sale.fiscal_reference) >= 4 THEN _sale.fiscal_reference ELSE 'Venda ' || _sale.id END);
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_payments) LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_item, ARRAY['method','amount_cents','tendered_cents','fee_cents','reference']);
    v_method := v_item->>'method';
    v_amount := soja_store_private.purchase_cents(v_item->>'amount_cents');
    v_tender := CASE WHEN v_item->>'tendered_cents' IS NOT NULL THEN soja_store_private.purchase_cents(v_item->>'tendered_cents') END;
    v_fee := soja_store_private.purchase_cents(v_item->>'fee_cents');
    v_reference := nullif(btrim(v_item->>'reference'), '');
    IF NOT coalesce(v_method = ANY(v_rule.methods), false) OR v_amount <= 0
      OR (v_method <> 'cash' AND (v_reference IS NULL OR v_tender IS NOT NULL))
      OR (v_tender IS NOT NULL AND v_tender < v_amount)
      OR (v_fee > 0 AND (v_method <> 'card' OR v_fee > v_amount))
      OR length(v_reference) > 600 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_PAYMENT_INVALID';
    END IF;
    v_new_total := v_new_total + v_amount;
    IF v_new_total > _sale.total_cents THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_PAYMENT_LIMIT';
    END IF;
    PERFORM soja_store_private.write_sale_payment(_sale, _session_id, v_method, v_amount, v_tender, v_fee, v_reference, NULL);
  END LOOP;
  RETURN v_new_total::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION soja_store_private.write_sale_payment(
  _sale soja_store_private.sales,_session_id uuid,_method text,_amount bigint,_tendered bigint,_fee bigint,_reference text,_original uuid
)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_payment uuid;
BEGIN
  INSERT INTO soja_store_private.sale_payments(org_id,commission_id,sale_id,method,amount_cents,tendered_cents,fee_cents,reference,
    original_payment_id,session_id,recorded_by)
  VALUES (_sale.org_id,_sale.commission_id,_sale.id,_method,_amount,_tendered,_fee,_reference,_original,_session_id,auth.uid()) RETURNING id INTO v_payment;
  PERFORM soja_store_private.record_sale_payment(_sale.org_id,_sale.commission_id,_sale.id,v_payment,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,_amount,_method,
    CASE WHEN length(_reference)>=4 THEN _reference ELSE 'Pagamento '||v_payment END);
  IF _method='cash' THEN
    INSERT INTO soja_store_private.cash_movements(org_id,commission_id,session_id,kind,amount_cents,reason,recorded_by)
    VALUES (_sale.org_id,_sale.commission_id,_session_id,CASE WHEN _amount>0 THEN 'receipt' ELSE 'refund' END,
      abs(_amount),_reference,auth.uid());
    UPDATE soja_store_private.cash_sessions SET version=version+1 WHERE id=_session_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION soja_store_private.sale_json(_sale soja_store_private.sales)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (to_jsonb(_sale)-ARRAY['org_id','commission_id']) || jsonb_build_object(
    'paid_cents', soja_store_private.sale_paid_cents(_sale),
    'payment_methods', (SELECT r.methods FROM soja_store_private.pos_rules r WHERE r.id = _sale.rule_id),
    'reservation_release', (SELECT r.cause FROM soja_store_private.sale_reservation_releases r WHERE r.sale_id = _sale.id),
    'lines', coalesce((SELECT jsonb_agg((to_jsonb(l)-ARRAY['org_id','commission_id']) ||
      jsonb_build_object('quantity',l.quantity::text,'returned_quantity',l.returned_quantity::text) ORDER BY l.sku,l.id)
      FROM soja_store_private.sale_lines l WHERE l.sale_id=_sale.id), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(p)-ARRAY['org_id','commission_id'] ORDER BY p.recorded_at,p.id)
      FROM soja_store_private.sale_payments p WHERE p.sale_id=_sale.id), '[]'::jsonb),
    'receipts', coalesce((SELECT jsonb_agg(jsonb_build_object('number',r.number,'kind',r.kind,'snapshot',r.snapshot) ORDER BY r.number)
      FROM soja_store_private.sale_receipts r WHERE r.sale_id=_sale.id), '[]'::jsonb));
$$;


CREATE OR REPLACE FUNCTION public.soja_store_finish_sale(
  _org_id uuid, _commission_id uuid, _request_id uuid, _expected_version integer, _payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_sale soja_store_private.sales;
  v_session soja_store_private.cash_sessions;
  v_action text;
  v_paid bigint;
  v_new_paid bigint;
  v_reason text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['sale_id','action','payments','reason','session_id']);
  v_hash := soja_store_private.request_hash('finish_sale', _expected_version, _payload);
  v_result := soja_store_private.begin_request(_org_id, _commission_id, _request_id, v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  SELECT * INTO v_sale FROM soja_store_private.sales
  WHERE org_id = _org_id AND commission_id = _commission_id AND id = (_payload->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'SOJA_STORE_SALE_NOT_FOUND'; END IF;
  IF v_sale.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_STALE_VERSION'; END IF;
  IF v_sale.status <> 'pending' THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SALE_NOT_PENDING'; END IF;
  v_action := _payload->>'action';
  v_previous := soja_store_private.sale_json(v_sale);
  v_paid := soja_store_private.sale_paid_cents(v_sale);
  v_new_paid := v_paid;
  v_reason := nullif(btrim(_payload->>'reason'), '');

  IF v_action IN ('confirm','payment') THEN
    IF v_paid = 0 AND v_sale.reservation_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_RESERVATION_EXPIRED';
    END IF;
    PERFORM 1 FROM soja_store_private.scopes WHERE org_id = _org_id AND commission_id = _commission_id FOR SHARE;
    IF (soja_store_private.current_pos_rule(_org_id, _commission_id)).active IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SALE_RULE_REQUIRED';
    END IF;
    v_session := soja_store_private.lock_open_cash(_org_id, _commission_id,
      coalesce((_payload->>'session_id')::uuid, v_sale.session_id));
    IF v_session.location_id IS DISTINCT FROM v_sale.location_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CASH_POINT_NOT_FOUND';
    END IF;

    -- Cash is recorded before delivery and stays associated with the session that received it.
    v_new_paid := soja_store_private.write_reservation_payments(v_sale, v_session.id, _payload->'payments', v_paid);
    IF v_action = 'confirm' AND v_new_paid <> v_sale.total_cents THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_PAYMENT_TOTAL';
    END IF;
    UPDATE soja_store_private.sales SET version = version + 1
    WHERE id = v_sale.id RETURNING * INTO v_sale;
    IF v_action = 'payment' THEN
      INSERT INTO soja_store_private.sale_receipts (org_id, commission_id, sale_id, kind, snapshot)
      VALUES (_org_id, _commission_id, v_sale.id, 'payment', jsonb_build_object(
        'sale_id', v_sale.id, 'received_cents', v_new_paid - v_paid, 'paid_cents', v_new_paid,
        'remaining_cents', v_sale.total_cents - v_new_paid, 'payments', _payload->'payments'));
    END IF;
  ELSIF v_action = 'expire' THEN
    IF v_sale.reservation_expires_at IS NULL OR v_sale.reservation_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_RESERVATION_NOT_EXPIRED';
    END IF;
    v_sale := soja_store_private.close_unpaid_reservation(v_sale, 'expired', 'Prazo de reserva encerrado sem pagamento confirmado.');
  ELSIF v_action = 'cancel' THEN
    IF v_reason IS NULL OR length(v_reason) > 600 OR jsonb_typeof(_payload->'reason') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_ACTION_INVALID';
    END IF;
    v_sale := soja_store_private.close_unpaid_reservation(v_sale, 'cancelled', v_reason);
  ELSIF v_action IS DISTINCT FROM 'deliver' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_SALE_ACTION_INVALID';
  END IF;

  IF v_action IN ('confirm','deliver') THEN
    IF v_new_paid <> v_sale.total_cents THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_SALE_NOT_PAID';
    END IF;
    PERFORM 1 FROM soja_store_private.locations WHERE org_id = _org_id AND commission_id = _commission_id
      AND id = v_sale.location_id AND status = 'active' AND kind = 'point' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_CASH_POINT_NOT_FOUND'; END IF;
    PERFORM soja_store_private.release_sale_reservation(v_sale, true);
    UPDATE soja_store_private.sales SET status = 'completed', delivered_at = clock_timestamp(),
      version = version + CASE WHEN v_action = 'deliver' THEN 1 ELSE 0 END,
      session_id = CASE WHEN v_action = 'confirm' THEN v_session.id ELSE session_id END
    WHERE id = v_sale.id RETURNING * INTO v_sale;
    INSERT INTO soja_store_private.sale_receipts (org_id, commission_id, sale_id, kind, snapshot)
    VALUES (_org_id, _commission_id, v_sale.id, 'sale', soja_store_private.sale_json(v_sale) - 'receipts');
  END IF;

  v_result := jsonb_build_object('id', v_sale.id, 'version', v_sale.version, 'status', v_sale.status);
  RETURN soja_store_private.finish_request(_org_id, _commission_id, _request_id, 'finish_sale', 'sales.manage', v_hash,
    v_sale.id, v_previous, soja_store_private.sale_json(v_sale) || jsonb_build_object('reason', v_reason), v_result);
END;
$$;

CREATE FUNCTION public.soja_store_sale_customers(
  _org_id uuid, _commission_id uuid, _search text DEFAULT NULL, _limit integer DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search), ''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'sales.manage');
  PERFORM soja_store_private.assert_purchase_page(_limit, 0);
  IF length(v_search) > 160 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY lower(c.name), c.id)
    FROM (
      SELECT c.id, c.name, c.city FROM soja_store_private.customers c
      WHERE c.org_id = _org_id AND c.commission_id = _commission_id AND c.status = 'active'
        AND (v_search IS NULL OR strpos(lower(c.name), v_search) > 0 OR strpos(lower(c.city), v_search) > 0)
      ORDER BY lower(c.name), c.id LIMIT _limit
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soja_store_sale_customers(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_sale_customers(uuid, uuid, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION soja_store_private.set_reservation_expiry(),
  soja_store_private.sale_paid_cents(soja_store_private.sales),
  soja_store_private.release_sale_reservation(soja_store_private.sales, boolean),
  soja_store_private.close_unpaid_reservation(soja_store_private.sales, text, text),
  soja_store_private.expire_unpaid_reservation(),
  soja_store_private.write_reservation_payments(soja_store_private.sales, uuid, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

-- pg_cron is available on the project's hosted database. Local fixtures can invoke the worker directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('soja-store-reservation-expiry', '* * * * *', 'SELECT soja_store_private.expire_unpaid_reservation()');
  END IF;
END;
$$;

COMMIT;
