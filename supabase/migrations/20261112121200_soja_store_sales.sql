BEGIN;

INSERT INTO soja_store_private.operational_capability_registry (capability)
VALUES ('sales.checkout') ON CONFLICT DO NOTHING;

CREATE TABLE soja_store_private.sale_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents BETWEEN 1 AND 999999999999999),
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  FOREIGN KEY (org_id, commission_id, variant_id) REFERENCES soja_store_private.variants(org_id, commission_id, id),
  UNIQUE (org_id, commission_id, variant_id, effective_on)
);

CREATE TABLE soja_store_private.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  session_id uuid NOT NULL,
  location_id uuid NOT NULL,
  customer_id uuid,
  rule_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','returned_partially','returned','cancelled')),
  version integer NOT NULL DEFAULT 1,
  total_cents bigint NOT NULL CHECK (total_cents BETWEEN 1 AND 999999999999999),
  occurred_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  fiscal_reference text CHECK (length(fiscal_reference) BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE (org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, session_id, location_id) REFERENCES soja_store_private.cash_sessions(org_id, commission_id, id, location_id),
  FOREIGN KEY (org_id, commission_id, rule_id) REFERENCES soja_store_private.pos_rules(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, customer_id) REFERENCES soja_store_private.customers(org_id, commission_id, id)
);
CREATE INDEX soja_store_sales_scope_date ON soja_store_private.sales(org_id, commission_id, occurred_on DESC, id);

CREATE TABLE soja_store_private.sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_name text NOT NULL,
  sku text NOT NULL,
  unit text NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  price_cents bigint NOT NULL CHECK (price_cents > 0),
  line_cents bigint NOT NULL CHECK (line_cents > 0),
  returned_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK (returned_quantity BETWEEN 0 AND quantity),
  returned_cents bigint NOT NULL DEFAULT 0 CHECK (returned_cents BETWEEN 0 AND line_cents),
  UNIQUE (org_id, commission_id, sale_id, variant_id),
  UNIQUE (org_id, commission_id, sale_id, id),
  FOREIGN KEY (org_id, commission_id, sale_id) REFERENCES soja_store_private.sales(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, variant_id) REFERENCES soja_store_private.variants(org_id, commission_id, id)
);

CREATE TABLE soja_store_private.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','pix','card')),
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  tendered_cents bigint,
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  reference text CHECK (length(reference) BETWEEN 1 AND 600),
  original_payment_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  CHECK (tendered_cents IS NULL OR (method = 'cash' AND amount_cents > 0 AND tendered_cents >= amount_cents)),
  CHECK (fee_cents = 0 OR (method = 'card' AND amount_cents > 0 AND fee_cents <= amount_cents)),
  CHECK ((amount_cents < 0) = (original_payment_id IS NOT NULL)),
  UNIQUE (org_id, commission_id, id),
  UNIQUE (org_id, commission_id, sale_id, id),
  FOREIGN KEY (org_id, commission_id, sale_id) REFERENCES soja_store_private.sales(org_id, commission_id, id),
  FOREIGN KEY (org_id, commission_id, sale_id, original_payment_id) REFERENCES soja_store_private.sale_payments(org_id, commission_id, sale_id, id)
);
CREATE INDEX soja_store_sale_payments_sale ON soja_store_private.sale_payments(org_id, commission_id, sale_id);

CREATE TABLE soja_store_private.sale_stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  line_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale_fulfillment','sale_return')),
  quantity numeric(18,6) NOT NULL CHECK (quantity <> 0),
  CHECK ((kind = 'sale_fulfillment') = (quantity < 0)),
  UNIQUE (org_id, commission_id, id, variant_id, location_id, kind, quantity),
  FOREIGN KEY (org_id, commission_id, sale_id, line_id) REFERENCES soja_store_private.sale_lines(org_id, commission_id, sale_id, id)
);

CREATE TABLE soja_store_private.sale_receipts (
  number bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL,
  commission_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale','return')),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (org_id, commission_id, sale_id) REFERENCES soja_store_private.sales(org_id, commission_id, id)
);

ALTER TABLE soja_store_private.stock_movements
  DROP CONSTRAINT soja_store_movement_type,
  ADD COLUMN sale_event_id uuid UNIQUE,
  ADD CONSTRAINT soja_store_movement_type CHECK (movement_type IN (
    'purchase_receipt','opening_count','inventory_adjustment','transfer_dispatch','transfer_receipt','sale_fulfillment','sale_return'
  )),
  ADD CONSTRAINT soja_store_movement_sale_link CHECK ((movement_type IN ('sale_fulfillment','sale_return')) = (sale_event_id IS NOT NULL)),
  ADD CONSTRAINT soja_store_movement_sale_origin
    FOREIGN KEY (org_id, commission_id, sale_event_id, variant_id, location_id, movement_type, quantity)
    REFERENCES soja_store_private.sale_stock_events(org_id, commission_id, id, variant_id, location_id, kind, quantity);

ALTER TABLE soja_store_private.finance_obligations ADD CONSTRAINT soja_store_finance_sale_fk
  FOREIGN KEY (org_id, commission_id, operation_id) REFERENCES soja_store_private.sales(org_id, commission_id, id);
ALTER TABLE soja_store_private.finance_settlements ADD CONSTRAINT soja_store_finance_sale_payment_fk
  FOREIGN KEY (org_id, commission_id, operation_payment_id) REFERENCES soja_store_private.sale_payments(org_id, commission_id, id);

ALTER TABLE soja_store_private.sale_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.sale_stock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE soja_store_private.sale_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soja_store_private.sale_prices, soja_store_private.sales, soja_store_private.sale_lines, soja_store_private.sale_payments,
  soja_store_private.sale_stock_events, soja_store_private.sale_receipts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE soja_store_private.sale_receipts_number_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soja_store_sale_payments_immutable BEFORE UPDATE OR DELETE ON soja_store_private.sale_payments
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_sale_stock_immutable BEFORE UPDATE OR DELETE ON soja_store_private.sale_stock_events
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_sale_receipts_immutable BEFORE UPDATE OR DELETE ON soja_store_private.sale_receipts
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();
CREATE TRIGGER soja_store_sale_prices_immutable BEFORE UPDATE OR DELETE ON soja_store_private.sale_prices
  FOR EACH ROW EXECUTE FUNCTION soja_store_private.reject_stock_history_change();

CREATE FUNCTION public.soja_store_sale_prices(_org_id uuid, _commission_id uuid, _variant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'catalog.view');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'price_cents',p.price_cents,'effective_on',p.effective_on)
    ORDER BY p.effective_on DESC) FROM soja_store_private.sale_prices p
    WHERE p.org_id=_org_id AND p.commission_id=_commission_id AND p.variant_id=_variant_id), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.soja_store_save_sale_price(_org_id uuid, _commission_id uuid, _request_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hash bytea; v_result jsonb; v_price soja_store_private.sale_prices; v_day date;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'catalog.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload, ARRAY['variant_id','price_cents','effective_on']);
  v_hash := soja_store_private.request_hash('save_sale_price', NULL, _payload);
  v_result := soja_store_private.begin_request(_org_id,_commission_id,_request_id,v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_day := soja_store_private.purchase_date(_payload->>'effective_on');
  IF v_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOJA_STORE_PRICE_PAST_DATE';
  END IF;
  INSERT INTO soja_store_private.sale_prices(org_id,commission_id,variant_id,price_cents,effective_on,recorded_by)
  VALUES (_org_id,_commission_id,(_payload->>'variant_id')::uuid,
    soja_store_private.purchase_cents(_payload->>'price_cents'),v_day,auth.uid()) RETURNING * INTO v_price;
  v_result := jsonb_build_object('id',v_price.id,'version',1,'status','recorded');
  RETURN soja_store_private.finish_request(_org_id,_commission_id,_request_id,'save_sale_price','catalog.manage',
    v_hash,v_price.id,NULL,to_jsonb(v_price),v_result);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'SOJA_STORE_PRICE_DATE_EXISTS';
END;
$$;

CREATE FUNCTION public.soja_store_sale_options(_org_id uuid, _commission_id uuid, _location_id uuid, _search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_search text := lower(nullif(btrim(_search),''));
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.view');
  IF length(v_search)>160 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_INVALID_FILTER'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY lower(x.product_name), x.sku, x.id) FROM (
      SELECT v.id, p.name AS product_name, v.sku, v.label, p.unit, price.id AS price_id, price.price_cents,
        (s.quantity-s.reserved_quantity)::text AS available
      FROM soja_store_private.stock_positions s
      JOIN soja_store_private.variants v ON v.id=s.variant_id
      JOIN soja_store_private.products p ON p.id=v.product_id
      JOIN LATERAL (SELECT pp.id,pp.price_cents FROM soja_store_private.sale_prices pp
        WHERE pp.org_id=s.org_id AND pp.commission_id=s.commission_id AND pp.variant_id=v.id
          AND pp.effective_on <= (now() AT TIME ZONE 'America/Sao_Paulo')::date ORDER BY pp.effective_on DESC LIMIT 1) price ON true
      WHERE s.org_id=_org_id AND s.commission_id=_commission_id AND s.location_id=_location_id
        AND s.ownership='own' AND s.destination='store' AND s.quantity>s.reserved_quantity AND v.active AND p.status='active'
        AND (v_search IS NULL OR strpos(lower(p.name),v_search)>0 OR strpos(lower(v.sku),v_search)>0)
      ORDER BY lower(p.name),v.sku,v.id LIMIT 40
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE FUNCTION soja_store_private.sale_json(_sale soja_store_private.sales)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (to_jsonb(_sale)-ARRAY['org_id','commission_id']) || jsonb_build_object(
    'lines', coalesce((SELECT jsonb_agg((to_jsonb(l)-ARRAY['org_id','commission_id']) ||
      jsonb_build_object('quantity',l.quantity::text,'returned_quantity',l.returned_quantity::text) ORDER BY l.sku,l.id)
      FROM soja_store_private.sale_lines l WHERE l.sale_id=_sale.id), '[]'::jsonb),
    'payments', coalesce((SELECT jsonb_agg(to_jsonb(p)-ARRAY['org_id','commission_id'] ORDER BY p.recorded_at,p.id)
      FROM soja_store_private.sale_payments p WHERE p.sale_id=_sale.id), '[]'::jsonb),
    'receipts', coalesce((SELECT jsonb_agg(jsonb_build_object('number',r.number,'kind',r.kind,'snapshot',r.snapshot) ORDER BY r.number)
      FROM soja_store_private.sale_receipts r WHERE r.sale_id=_sale.id), '[]'::jsonb));
$$;

CREATE FUNCTION public.soja_store_sales(_org_id uuid, _commission_id uuid, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.view');
  PERFORM soja_store_private.assert_purchase_page(_limit,_offset);
  RETURN (
    WITH matching AS MATERIALIZED (SELECT s AS sale,s.id,s.created_at FROM soja_store_private.sales s
      WHERE s.org_id=_org_id AND s.commission_id=_commission_id),
    page AS (SELECT * FROM matching ORDER BY created_at DESC,id LIMIT _limit OFFSET _offset)
    SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',coalesce((
      SELECT jsonb_agg(soja_store_private.sale_json(p.sale) ORDER BY p.created_at DESC,p.id) FROM page p
    ),'[]'::jsonb)));
END;
$$;

CREATE FUNCTION public.soja_store_sale(_org_id uuid,_commission_id uuid,_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale soja_store_private.sales;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.view');
  SELECT * INTO v_sale FROM soja_store_private.sales WHERE org_id=_org_id AND commission_id=_commission_id AND id=_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='SOJA_STORE_SALE_NOT_FOUND'; END IF;
  RETURN soja_store_private.sale_json(v_sale);
END;
$$;

CREATE FUNCTION soja_store_private.write_sale_stock(_sale soja_store_private.sales,_line soja_store_private.sale_lines,_kind text,_quantity numeric)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_event uuid;
BEGIN
  INSERT INTO soja_store_private.sale_stock_events(org_id,commission_id,sale_id,line_id,variant_id,location_id,kind,quantity)
  VALUES (_sale.org_id,_sale.commission_id,_sale.id,_line.id,_line.variant_id,_sale.location_id,_kind,_quantity) RETURNING id INTO v_event;
  INSERT INTO soja_store_private.stock_movements(org_id,commission_id,variant_id,location_id,ownership,destination,movement_type,
    sale_event_id,quantity,occurred_on,recorded_by)
  VALUES (_sale.org_id,_sale.commission_id,_line.variant_id,_sale.location_id,'own','store',_kind,
    v_event,_quantity,(now() AT TIME ZONE 'America/Sao_Paulo')::date,auth.uid());
END;
$$;

CREATE FUNCTION soja_store_private.write_sale_payment(
  _sale soja_store_private.sales,_session_id uuid,_method text,_amount bigint,_tendered bigint,_fee bigint,_reference text,_original uuid
)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_payment uuid;
BEGIN
  INSERT INTO soja_store_private.sale_payments(org_id,commission_id,sale_id,method,amount_cents,tendered_cents,fee_cents,reference,
    original_payment_id,recorded_by)
  VALUES (_sale.org_id,_sale.commission_id,_sale.id,_method,_amount,_tendered,_fee,_reference,_original,auth.uid()) RETURNING id INTO v_payment;
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

CREATE FUNCTION soja_store_private.complete_sale(_sale soja_store_private.sales, _payments jsonb, _change_reserved boolean)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_rule soja_store_private.pos_rules;
  v_item jsonb;
  v_line soja_store_private.sale_lines;
  v_method text;
  v_amount bigint;
  v_tender bigint;
  v_fee bigint;
  v_reference text;
  v_paid numeric := 0;
BEGIN
  SELECT * INTO STRICT v_rule FROM soja_store_private.pos_rules WHERE id=_sale.rule_id;
  IF jsonb_typeof(_payments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_PAYMENT_REQUIRED';
  END IF;
  IF jsonb_array_length(_payments) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_PAYMENT_REQUIRED';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_payments) LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_item,ARRAY['method','amount_cents','tendered_cents','fee_cents','reference']);
    v_method := v_item->>'method';
    v_amount := soja_store_private.purchase_cents(v_item->>'amount_cents');
    v_tender := CASE WHEN v_item->>'tendered_cents' IS NOT NULL THEN soja_store_private.purchase_cents(v_item->>'tendered_cents') END;
    v_fee := soja_store_private.purchase_cents(v_item->>'fee_cents');
    v_reference := nullif(btrim(v_item->>'reference'),'');
    IF NOT coalesce(v_method=ANY(v_rule.methods),false) OR v_amount<=0
      OR (v_method<>'cash' AND v_reference IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_PAYMENT_INVALID';
    END IF;
    v_paid := v_paid+v_amount;
  END LOOP;
  IF v_paid<>_sale.total_cents THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_PAYMENT_TOTAL'; END IF;
  PERFORM soja_store_private.recognize_sale_obligation(_sale.org_id,_sale.commission_id,_sale.id,'Venda própria Soja Store',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,(now() AT TIME ZONE 'America/Sao_Paulo')::date,_sale.total_cents,
    CASE WHEN length(_sale.fiscal_reference)>=4 THEN _sale.fiscal_reference ELSE 'Venda '||_sale.id END);
  FOR v_item IN SELECT value FROM jsonb_array_elements(_payments) LOOP
    PERFORM soja_store_private.write_sale_payment(_sale,_sale.session_id,v_item->>'method',
      soja_store_private.purchase_cents(v_item->>'amount_cents'),
      CASE WHEN v_item->>'tendered_cents' IS NOT NULL THEN soja_store_private.purchase_cents(v_item->>'tendered_cents') END,
      soja_store_private.purchase_cents(v_item->>'fee_cents'),nullif(btrim(v_item->>'reference'),''),NULL);
  END LOOP;
  FOR v_line IN SELECT l.* FROM soja_store_private.sale_lines l WHERE l.sale_id=_sale.id ORDER BY l.variant_id LOOP
    IF _change_reserved THEN
      UPDATE soja_store_private.stock_positions SET reserved_quantity=reserved_quantity-v_line.quantity,version=version+1
      WHERE org_id=_sale.org_id AND commission_id=_sale.commission_id AND location_id=_sale.location_id
        AND variant_id=v_line.variant_id AND ownership='own' AND destination='store' AND reserved_quantity>=v_line.quantity;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_RESERVATION_NOT_FOUND'; END IF;
    END IF;
    PERFORM soja_store_private.write_sale_stock(_sale,v_line,'sale_fulfillment',-v_line.quantity);
  END LOOP;
  INSERT INTO soja_store_private.sale_receipts(org_id,commission_id,sale_id,kind,snapshot)
  VALUES (_sale.org_id,_sale.commission_id,_sale.id,'sale',soja_store_private.sale_json(_sale)-'receipts');
END;
$$;

CREATE FUNCTION public.soja_store_create_sale(_org_id uuid,_commission_id uuid,_request_id uuid,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_session soja_store_private.cash_sessions;
  v_rule soja_store_private.pos_rules;
  v_sale soja_store_private.sales;
  v_item jsonb;
  v_variant record;
  v_price soja_store_private.sale_prices;
  v_quantity numeric;
  v_amount numeric;
  v_total numeric := 0;
  v_available numeric;
  v_pending boolean;
  v_customer uuid;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload,ARRAY['session_id','customer_id','lines','payments','pending','fiscal_reference']);
  v_hash := soja_store_private.request_hash('create_sale',NULL,_payload);
  v_result := soja_store_private.begin_request(_org_id,_commission_id,_request_id,v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_pending := coalesce((_payload->>'pending')::boolean,false);
  v_customer := (_payload->>'customer_id')::uuid;
  IF v_customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM soja_store_private.customers c
    WHERE c.org_id=_org_id AND c.commission_id=_commission_id AND c.id=v_customer AND c.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_CUSTOMER_NOT_FOUND';
  END IF;
  IF jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_LINES_REQUIRED'; END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_LINES_REQUIRED'; END IF;
  PERFORM 1 FROM soja_store_private.scopes WHERE org_id=_org_id AND commission_id=_commission_id FOR SHARE;
  v_rule := soja_store_private.current_pos_rule(_org_id,_commission_id);
  IF v_rule.active IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_RULE_REQUIRED'; END IF;
  v_session := soja_store_private.lock_open_cash(_org_id,_commission_id,(_payload->>'session_id')::uuid);
  PERFORM 1 FROM soja_store_private.locations WHERE id=v_session.location_id AND status='active' AND kind='point' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_CASH_POINT_NOT_FOUND'; END IF;
  PERFORM soja_store_private.lock_stock_location(_org_id,_commission_id,v_session.location_id);
  INSERT INTO soja_store_private.sales(org_id,commission_id,session_id,location_id,customer_id,rule_id,status,total_cents,
    fiscal_reference,created_by)
  VALUES (_org_id,_commission_id,v_session.id,v_session.location_id,v_customer,v_rule.id,
    CASE WHEN v_pending THEN 'pending' ELSE 'completed' END,1,nullif(btrim(_payload->>'fiscal_reference'),''),auth.uid())
  RETURNING * INTO v_sale;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_payload->'lines') AS j(value) ORDER BY value->>'variant_id' LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_item,ARRAY['variant_id','quantity','price_id']);
    v_quantity := soja_store_private.purchase_decimal(v_item->>'quantity',false);
    SELECT v.id,v.sku,p.name,p.unit INTO v_variant FROM soja_store_private.variants v JOIN soja_store_private.products p ON p.id=v.product_id
    WHERE v.org_id=_org_id AND v.commission_id=_commission_id AND v.id=(v_item->>'variant_id')::uuid AND v.active AND p.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_VARIANT_UNAVAILABLE'; END IF;
    SELECT * INTO v_price FROM soja_store_private.sale_prices p
    WHERE p.org_id=_org_id AND p.commission_id=_commission_id AND p.variant_id=v_variant.id AND p.effective_on<=v_sale.occurred_on
    ORDER BY p.effective_on DESC LIMIT 1;
    IF NOT FOUND OR v_price.id IS DISTINCT FROM (v_item->>'price_id')::uuid THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_PRICE_CHANGED';
    END IF;
    SELECT s.quantity-s.reserved_quantity INTO v_available FROM soja_store_private.stock_positions s
    WHERE s.org_id=_org_id AND s.commission_id=_commission_id AND s.location_id=v_sale.location_id
      AND s.variant_id=v_variant.id AND s.ownership='own' AND s.destination='store' FOR UPDATE;
    IF coalesce(v_available,0)<v_quantity THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_STOCK_INSUFFICIENT'; END IF;
    v_amount := round(v_quantity*v_price.price_cents);
    v_total := v_total+v_amount;
    IF v_amount<=0 OR v_total>999999999999999 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_INVALID_PURCHASE_AMOUNT'; END IF;
    INSERT INTO soja_store_private.sale_lines(org_id,commission_id,sale_id,variant_id,product_name,sku,unit,quantity,price_cents,line_cents)
    VALUES (_org_id,_commission_id,v_sale.id,v_variant.id,v_variant.name,v_variant.sku,v_variant.unit,v_quantity,v_price.price_cents,v_amount);
    IF v_pending THEN
      UPDATE soja_store_private.stock_positions SET reserved_quantity=reserved_quantity+v_quantity,version=version+1
      WHERE org_id=_org_id AND commission_id=_commission_id AND location_id=v_sale.location_id AND variant_id=v_variant.id
        AND ownership='own' AND destination='store';
    END IF;
  END LOOP;
  UPDATE soja_store_private.sales SET total_cents=v_total WHERE id=v_sale.id RETURNING * INTO v_sale;
  IF NOT v_pending THEN PERFORM soja_store_private.complete_sale(v_sale,_payload->'payments',false); END IF;
  v_result := jsonb_build_object('id',v_sale.id,'version',v_sale.version,'status',v_sale.status,'total_cents',v_sale.total_cents);
  RETURN soja_store_private.finish_request(_org_id,_commission_id,_request_id,'create_sale','sales.manage',v_hash,
    v_sale.id,NULL,soja_store_private.sale_json(v_sale),v_result);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_DUPLICATE_ITEM';
END;
$$;

CREATE FUNCTION public.soja_store_finish_sale(
  _org_id uuid,_commission_id uuid,_request_id uuid,_expected_version integer,_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_sale soja_store_private.sales;
  v_session soja_store_private.cash_sessions;
  v_line soja_store_private.sale_lines;
  v_action text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload,ARRAY['sale_id','action','payments','reason','session_id']);
  v_hash := soja_store_private.request_hash('finish_sale',_expected_version,_payload);
  v_result := soja_store_private.begin_request(_org_id,_commission_id,_request_id,v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_sale FROM soja_store_private.sales WHERE org_id=_org_id AND commission_id=_commission_id
    AND id=(_payload->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='SOJA_STORE_SALE_NOT_FOUND'; END IF;
  IF v_sale.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_STALE_VERSION'; END IF;
  IF v_sale.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_NOT_PENDING'; END IF;
  v_previous := soja_store_private.sale_json(v_sale);
  v_action := _payload->>'action';
  IF v_action='confirm' THEN
    PERFORM 1 FROM soja_store_private.scopes WHERE org_id=_org_id AND commission_id=_commission_id FOR SHARE;
    IF (soja_store_private.current_pos_rule(_org_id,_commission_id)).active IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_RULE_REQUIRED';
    END IF;
    v_session := soja_store_private.lock_open_cash(_org_id,_commission_id,coalesce((_payload->>'session_id')::uuid,v_sale.session_id));
    IF v_session.location_id IS DISTINCT FROM v_sale.location_id THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_CASH_POINT_NOT_FOUND'; END IF;
    PERFORM soja_store_private.lock_stock_location(_org_id,_commission_id,v_sale.location_id);
    UPDATE soja_store_private.sales SET status='completed',version=version+1,session_id=v_session.id
      WHERE id=v_sale.id RETURNING * INTO v_sale;
    PERFORM soja_store_private.complete_sale(v_sale,_payload->'payments',true);
  ELSIF v_action='cancel' AND nullif(btrim(_payload->>'reason'),'') IS NOT NULL THEN
    PERFORM soja_store_private.lock_stock_location(_org_id,_commission_id,v_sale.location_id);
    FOR v_line IN SELECT l.* FROM soja_store_private.sale_lines l WHERE l.sale_id=v_sale.id ORDER BY l.variant_id LOOP
      UPDATE soja_store_private.stock_positions SET reserved_quantity=reserved_quantity-v_line.quantity,version=version+1
      WHERE org_id=_org_id AND commission_id=_commission_id AND location_id=v_sale.location_id AND variant_id=v_line.variant_id
        AND ownership='own' AND destination='store';
    END LOOP;
    UPDATE soja_store_private.sales SET status='cancelled',version=version+1 WHERE id=v_sale.id RETURNING * INTO v_sale;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_ACTION_INVALID';
  END IF;
  v_result := jsonb_build_object('id',v_sale.id,'version',v_sale.version,'status',v_sale.status);
  RETURN soja_store_private.finish_request(_org_id,_commission_id,_request_id,'finish_sale','sales.manage',v_hash,
    v_sale.id,v_previous,soja_store_private.sale_json(v_sale)||jsonb_build_object('reason',_payload->>'reason'),v_result);
END;
$$;

CREATE FUNCTION public.soja_store_return_sale(
  _org_id uuid,_commission_id uuid,_request_id uuid,_expected_version integer,_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash bytea;
  v_result jsonb;
  v_previous jsonb;
  v_sale soja_store_private.sales;
  v_session soja_store_private.cash_sessions;
  v_line soja_store_private.sale_lines;
  v_payment soja_store_private.sale_payments;
  v_item jsonb;
  v_quantity numeric;
  v_return_total bigint := 0;
  v_refund_total bigint := 0;
  v_line_return bigint;
  v_amount bigint;
  v_reason text;
  v_prior bigint;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload,ARRAY['sale_id','session_id','lines','refunds','reason']);
  v_hash := soja_store_private.request_hash('return_sale',_expected_version,_payload);
  v_result := soja_store_private.begin_request(_org_id,_commission_id,_request_id,v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  v_reason := nullif(btrim(_payload->>'reason'),'');
  IF v_reason IS NULL OR length(v_reason)>600 OR jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array'
    OR jsonb_typeof(_payload->'refunds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_RETURN_INVALID'; END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 50 OR jsonb_array_length(_payload->'refunds')>8 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_RETURN_INVALID';
  END IF;
  SELECT * INTO v_sale FROM soja_store_private.sales WHERE org_id=_org_id AND commission_id=_commission_id
    AND id=(_payload->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='SOJA_STORE_SALE_NOT_FOUND'; END IF;
  IF v_sale.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_STALE_VERSION'; END IF;
  IF v_sale.status NOT IN ('completed','returned_partially') THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_RETURN_INVALID'; END IF;
  v_previous := soja_store_private.sale_json(v_sale);
  v_session := soja_store_private.lock_open_cash(_org_id,_commission_id,(_payload->>'session_id')::uuid);
  IF v_session.location_id IS DISTINCT FROM v_sale.location_id THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_CASH_POINT_NOT_FOUND'; END IF;
  PERFORM soja_store_private.lock_stock_location(_org_id,_commission_id,v_sale.location_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_item,ARRAY['line_id','quantity']);
    v_quantity := soja_store_private.purchase_decimal(v_item->>'quantity',false);
    SELECT * INTO v_line FROM soja_store_private.sale_lines WHERE sale_id=v_sale.id AND id=(v_item->>'line_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_quantity>v_line.quantity-v_line.returned_quantity THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_RETURN_LIMIT'; END IF;
    v_line_return := round(v_line.line_cents*(v_line.returned_quantity+v_quantity)/v_line.quantity)::bigint-v_line.returned_cents;
    UPDATE soja_store_private.sale_lines SET returned_quantity=returned_quantity+v_quantity,returned_cents=returned_cents+v_line_return WHERE id=v_line.id;
    v_return_total := v_return_total+v_line_return;
    PERFORM soja_store_private.write_sale_stock(v_sale,v_line,'sale_return',v_quantity);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_payload->'refunds') LOOP
    PERFORM soja_store_private.assert_purchase_payload(v_item,ARRAY['payment_id','amount_cents']);
    v_amount := soja_store_private.purchase_cents(v_item->>'amount_cents');
    SELECT * INTO v_payment FROM soja_store_private.sale_payments WHERE sale_id=v_sale.id AND id=(v_item->>'payment_id')::uuid AND amount_cents>0;
    IF NOT FOUND OR v_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_REFUND_LIMIT'; END IF;
    SELECT coalesce(-sum(p.amount_cents),0) INTO v_prior FROM soja_store_private.sale_payments p WHERE p.original_payment_id=v_payment.id;
    IF v_prior+v_amount>v_payment.amount_cents OR
      (v_payment.method='cash' AND v_amount>soja_store_private.cash_expected(v_session)) THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_SALE_REFUND_LIMIT';
    END IF;
    v_refund_total := v_refund_total+v_amount;
    PERFORM soja_store_private.write_sale_payment(v_sale,v_session.id,v_payment.method,-v_amount,NULL,0,v_reason,v_payment.id);
  END LOOP;
  IF v_return_total<>v_refund_total THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_SALE_REFUND_TOTAL'; END IF;
  IF v_return_total>0 THEN PERFORM soja_store_private.adjust_sale_obligation(_org_id,_commission_id,v_sale.id,-v_return_total); END IF;
  UPDATE soja_store_private.sales SET version=version+1,status=CASE WHEN EXISTS(
    SELECT 1 FROM soja_store_private.sale_lines l WHERE l.sale_id=v_sale.id AND l.returned_quantity<l.quantity
  ) THEN 'returned_partially' ELSE 'returned' END WHERE id=v_sale.id RETURNING * INTO v_sale;
  INSERT INTO soja_store_private.sale_receipts(org_id,commission_id,sale_id,kind,snapshot)
  VALUES (_org_id,_commission_id,v_sale.id,'return',jsonb_build_object('return_cents',v_return_total,'reason',v_reason,
    'lines',_payload->'lines','refunds',_payload->'refunds','sale_id',v_sale.id));
  v_result := jsonb_build_object('id',v_sale.id,'version',v_sale.version,'status',v_sale.status,'returned_cents',v_return_total);
  RETURN soja_store_private.finish_request(_org_id,_commission_id,_request_id,'return_sale','sales.manage',v_hash,
    v_sale.id,v_previous,soja_store_private.sale_json(v_sale),v_result);
END;
$$;

CREATE FUNCTION public.soja_store_record_sale_fiscal(
  _org_id uuid,_commission_id uuid,_request_id uuid,_expected_version integer,_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sale soja_store_private.sales; v_hash bytea; v_result jsonb; v_before jsonb; v_reference text;
BEGIN
  PERFORM soja_store_private.require_capability(_org_id,_commission_id,'sales.manage');
  PERFORM soja_store_private.assert_purchase_payload(_payload,ARRAY['sale_id','reference']);
  v_hash:=soja_store_private.request_hash('record_sale_fiscal',_expected_version,_payload);
  v_result:=soja_store_private.begin_request(_org_id,_commission_id,_request_id,v_hash);
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT * INTO v_sale FROM soja_store_private.sales WHERE org_id=_org_id AND commission_id=_commission_id
    AND id=(_payload->>'sale_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404', MESSAGE='SOJA_STORE_SALE_NOT_FOUND'; END IF;
  IF v_sale.version IS DISTINCT FROM _expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='SOJA_STORE_STALE_VERSION'; END IF;
  v_reference:=nullif(btrim(_payload->>'reference'),'');
  IF v_reference IS NULL OR length(v_reference)>600 OR v_sale.status IN ('pending','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='SOJA_STORE_FISCAL_REFERENCE_INVALID';
  END IF;
  v_before:=to_jsonb(v_sale);
  UPDATE soja_store_private.sales SET fiscal_reference=v_reference,version=version+1 WHERE id=v_sale.id RETURNING * INTO v_sale;
  v_result:=jsonb_build_object('id',v_sale.id,'version',v_sale.version,'status',v_sale.status);
  RETURN soja_store_private.finish_request(_org_id,_commission_id,_request_id,'record_sale_fiscal','sales.manage',v_hash,
    v_sale.id,v_before,to_jsonb(v_sale),v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.soja_store_stock_movements(
  _org_id uuid, _commission_id uuid, _location_id uuid DEFAULT NULL, _variant_id uuid DEFAULT NULL,
  _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM soja_store_private.require_capability(_org_id, _commission_id, 'stock.view');
  PERFORM soja_store_private.assert_purchase_page(_limit, _offset);
  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT m.* FROM soja_store_private.stock_movements m
      WHERE m.org_id=_org_id AND m.commission_id=_commission_id
        AND (_location_id IS NULL OR m.location_id=_location_id)
        AND (_variant_id IS NULL OR m.variant_id=_variant_id)
    ), page AS (
      SELECT m.id,m.variant_id,m.location_id,m.ownership,m.owner_supplier_id,m.destination,m.movement_type,
        m.purchase_id,m.receipt_id,m.inventory_count_id,t.id AS transfer_id,se.sale_id,m.quantity::text,m.occurred_on,m.recorded_at,
        v.product_id,coalesce(c.product_name,p.product_name,t.product_name,sl.product_name) AS product_name,
        coalesce(c.sku,p.sku,t.sku,sl.sku) AS sku,
        CASE WHEN c.id IS NOT NULL THEN c.variant_label WHEN t.id IS NOT NULL THEN t.variant_label ELSE p.variant_label END AS variant_label,
        coalesce(c.unit,p.unit,t.unit,sl.unit) AS unit,coalesce(c.location_name,o.location_name,
          CASE WHEN e.movement_type='transfer_dispatch' THEN t.origin_name ELSE t.destination_name END,cs.location_name) AS location_name,
        s.name AS owner_supplier_name,coalesce(c.reason,t.reason) AS reason,coalesce(c.reference,e.reference) AS reference,
        c.previous_quantity::text,c.counted_quantity::text
      FROM (SELECT * FROM matched ORDER BY occurred_on DESC,recorded_at DESC,id LIMIT _limit OFFSET _offset) m
      JOIN soja_store_private.variants v ON v.id=m.variant_id
      LEFT JOIN soja_store_private.purchases o ON o.id=m.purchase_id
      LEFT JOIN soja_store_private.purchase_receipt_lines r ON r.id=m.receipt_line_id
      LEFT JOIN soja_store_private.purchase_lines p ON p.id=r.purchase_line_id
      LEFT JOIN soja_store_private.inventory_counts c ON c.id=m.inventory_count_id
      LEFT JOIN soja_store_private.stock_transfer_events e ON e.id=m.transfer_event_id
      LEFT JOIN soja_store_private.stock_transfers t ON t.id=e.transfer_id
      LEFT JOIN soja_store_private.sale_stock_events se ON se.id=m.sale_event_id
      LEFT JOIN soja_store_private.sale_lines sl ON sl.id=se.line_id
      LEFT JOIN soja_store_private.sales sa ON sa.id=se.sale_id
      LEFT JOIN soja_store_private.cash_sessions cs ON cs.id=sa.session_id
      LEFT JOIN soja_store_private.suppliers s ON s.id=m.owner_supplier_id
    )
    SELECT jsonb_build_object('total',(SELECT count(*) FROM matched),'items',coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.occurred_on DESC,p.recorded_at DESC,p.id) FROM page p
    ),'[]'::jsonb))
  );
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA soja_store_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.soja_store_sale_prices(uuid,uuid,uuid),
  public.soja_store_save_sale_price(uuid,uuid,uuid,jsonb), public.soja_store_sale_options(uuid,uuid,uuid,text),
  public.soja_store_sales(uuid,uuid,integer,integer), public.soja_store_sale(uuid,uuid,uuid), public.soja_store_create_sale(uuid,uuid,uuid,jsonb),
  public.soja_store_finish_sale(uuid,uuid,uuid,integer,jsonb), public.soja_store_return_sale(uuid,uuid,uuid,integer,jsonb),
  public.soja_store_record_sale_fiscal(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soja_store_sale_prices(uuid,uuid,uuid),
  public.soja_store_save_sale_price(uuid,uuid,uuid,jsonb), public.soja_store_sale_options(uuid,uuid,uuid,text),
  public.soja_store_sales(uuid,uuid,integer,integer), public.soja_store_sale(uuid,uuid,uuid), public.soja_store_create_sale(uuid,uuid,uuid,jsonb),
  public.soja_store_finish_sale(uuid,uuid,uuid,integer,jsonb), public.soja_store_return_sale(uuid,uuid,uuid,integer,jsonb),
  public.soja_store_record_sale_fiscal(uuid,uuid,uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
